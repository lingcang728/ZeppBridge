/**
 * 分享图上的年轮：和页面上同一份几何（tree.ts）和同一块木头（wood.ts），用 Path2D 直接画 SVG 那几条路径。
 * 木头本来就不分主题；下面的投影按分享图的深色底画。
 */
import { edgeSegments, bandPath, loopPath, ringTicks, treeLayout } from './tree';
import { bandWood, barkOf, grainPaths, raysOf, slicePath, WOOD } from './wood';
import type { RingYear } from '../../types/rings';

/** 一张 `size` 见方的透明画布：所有年份的年轮，`selected` 那年提亮、画细纹。 */
export function snapshotTree(years: RingYear[], selected: number, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx || !years.length) return canvas;
  const radius = size * 0.34;
  const k = radius / 290;
  const layout = treeLayout(years, radius);
  const bark = barkOf(layout, 16 * k);
  // 上面给标题留地方：圆心比正中略低。
  ctx.translate(size / 2, size * 0.56);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, .55)';
  ctx.shadowBlur = 40 * k;
  ctx.shadowOffsetY = 18 * k;
  ctx.fillStyle = WOOD.barkSide;
  ctx.translate(0, 6 * k);
  ctx.fill(new Path2D(bark.outer));
  ctx.restore();
  ctx.fillStyle = WOOD.bark;
  ctx.fill(new Path2D(bark.ring), 'evenodd');
  ctx.strokeStyle = WOOD.barkCrack;
  ctx.lineWidth = 1.4 * k;
  ctx.stroke(new Path2D(bark.cracks));
  ctx.strokeStyle = WOOD.fleck;
  ctx.lineWidth = 2 * k;
  ctx.stroke(new Path2D(bark.flecks));
  ctx.strokeStyle = WOOD.cambium;
  ctx.lineWidth = 2.4 * k;
  ctx.stroke(new Path2D(bark.cambium));
  for (const band of layout.bands) {
    const on = band.year === selected;
    const fill = new Path2D(bandPath(band));
    ctx.fillStyle = bandWood(band, radius);
    ctx.fill(fill, 'evenodd');
    ctx.fillStyle = WOOD.late;
    ctx.fill(new Path2D(slicePath(band, 0.66, 1)), 'evenodd');
    const grain = grainPaths(band);
    ctx.lineWidth = 0.8 * k;
    ctx.strokeStyle = WOOD.grain;
    ctx.stroke(new Path2D(grain.light));
    ctx.strokeStyle = WOOD.grainDark;
    ctx.stroke(new Path2D(grain.dark));
    if (on) { ctx.fillStyle = WOOD.selected; ctx.fill(fill, 'evenodd'); }
    for (const seg of edgeSegments(band)) {
      ctx.setLineDash(seg.present ? [] : [2 * k, 5 * k]);
      if (on) { ctx.strokeStyle = WOOD.halo; ctx.lineWidth = 6 * k; ctx.stroke(new Path2D(seg.d)); }
      ctx.strokeStyle = on ? WOOD.mark : WOOD.line;
      ctx.lineWidth = (on ? 2.2 : 1.3) * k;
      ctx.stroke(new Path2D(seg.d));
    }
    ctx.setLineDash([]);
    if (on && band.index > 0) { ctx.strokeStyle = WOOD.mark; ctx.lineWidth = 2.2 * k; ctx.stroke(new Path2D(loopPath(band.inner))); }
  }
  ctx.strokeStyle = WOOD.ray;
  ctx.lineWidth = 1.2 * k;
  ctx.stroke(new Path2D(raysOf(layout)));
  const band = layout.bands.find(b => b.year === selected);
  const year = years.find(y => y.year === selected);
  if (band && year) {
    ctx.strokeStyle = WOOD.tick;
    ctx.lineWidth = 1.2 * k;
    for (const tick of ringTicks(band, year.stars)) {
      ctx.beginPath();
      ctx.moveTo(tick.x1, tick.y1);
      ctx.lineTo(tick.x2, tick.y2);
      ctx.stroke();
    }
  }
  ctx.fillStyle = WOOD.pith;
  ctx.beginPath();
  ctx.arc(0, 0, 4 * k, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

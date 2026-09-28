import { describe, expect, it } from 'vitest';
import { cardPageFrame, openPageFrame, visiblePart } from '../pageMorph';
import { trendColumns } from '../trendGrid';

/** 按帧里的 transform-origin / transform 把元素局部坐标里的一点换到屏幕上。 */
const project = (frame: { transformOrigin: string; transform: string }, page: { left: number; top: number }, local: { x: number; y: number }) => {
  const [ox, oy] = frame.transformOrigin.split(' ').map((v) => Number.parseFloat(v));
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(frame.transform)!;
  const [tx, ty, s] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return { x: page.left + ox + tx + s * (local.x - ox), y: page.top + oy + ty + s * (local.y - oy) };
};

describe('pageMorph', () => {
  const viewport = { left: 0, top: 60, width: 1600, height: 900 };

  it('缩回时，画面上看得见的那一段的左上角正好落在卡的左上角、宽度等于卡宽', () => {
    // 详情页滚到了 400px：页面顶边在视口上方。
    const page = { left: 0, top: 60 - 400, width: 1600, height: 3000 };
    const view = visiblePart(page, viewport)!;
    const card = { left: 820, top: 640, width: 720, height: 170 };
    const frame = cardPageFrame(page, view, card, 26);
    const topLeft = project(frame, page, { x: view.left - page.left, y: view.top - page.top });
    const topRight = project(frame, page, { x: view.left - page.left + view.width, y: view.top - page.top });
    expect(topLeft.x).toBeCloseTo(card.left, 1);
    expect(topLeft.y).toBeCloseTo(card.top, 1);
    expect(topRight.x - topLeft.x).toBeCloseTo(card.width, 1);
  });

  it('完全展开的那一帧不缩放，只裁掉视口外的部分', () => {
    const page = { left: 0, top: 60, width: 1600, height: 2400 };
    const view = visiblePart(page, viewport)!;
    const frame = openPageFrame(page, view);
    expect(frame.transform).toBe('translate(0px, 0px) scale(1)');
    expect(frame.clipPath).toBe('inset(0px 0px 1500px 0px round 0px)');
  });

  it('页面完全不在视口里时没有可对的那一段', () => {
    expect(visiblePart({ left: 0, top: 2000, width: 100, height: 100 }, viewport)).toBeNull();
  });
});

describe('trendColumns', () => {
  it('按张数挑列数，让最后一行尽量是满的', () => {
    expect(trendColumns(1)).toBe(2);
    expect(trendColumns(3)).toBe(3);
    expect(trendColumns(4)).toBe(4);
    expect(trendColumns(6)).toBe(3);
    expect(trendColumns(7)).toBe(4);
    expect(trendColumns(8)).toBe(4);
    expect(trendColumns(10)).toBe(5);
  });
});

/**
 * 年轮的粒子目标形状——照搬 Lumina（MyProject/Solid/Lumina/src/shapes.ts、utils/textGen.ts），常量、分布、配色一个不改。
 *
 * 唯一换掉的是「造型」那一幕：Lumina 是蛋糕 / 灯笼，这里是一截树的横截面——
 * 所有年份从里往外一圈一圈（宽窄看那年练了多少，木纹线跟着每周运动量起伏，没数据的周留白），
 * 选中的那一年发金光，那一年的每次运动是一颗焦点星（Lumina 的蜡烛火焰那一池）。
 */
import { angleOfDay, dayOfYear, daysInYear, treeRings, weekShape } from '../geometry';
import type { RingYear } from '../../../types/rings';

export const GALAXY_COUNT = 6000; // ambient star / finale starfield pool
export const TEXT_COUNT = 9000; // main pool: year digits / rings / finale text
export const BG_COUNT = 2600; // static deep-space background stars

export type PC = { pos: Float32Array; col: Float32Array };
export type RGB = [number, number, number];

/** Lumina 新年那一套：数字暖金、终幕字金色。 */
export const PALETTE = {
  digit: [1.0, 0.85, 0.4] as RGB,
  finaleText: [1.32, 1.11, 0.42] as RGB,
  focal: [1.6, 1.1, 0.5] as RGB,
};

const setCol = (a: Float32Array, i: number, r: number, g: number, b: number) => {
  a[i * 3] = r; a[i * 3 + 1] = g; a[i * 3 + 2] = b;
};

export const newPC = (count: number): PC => ({
  pos: new Float32Array(count * 3),
  col: new Float32Array(count * 3),
});

// ===== textGen.ts =====
export const generateTextParticles = (text: string, count: number, width = 640, height = 240) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return new Float32Array(count * 3);

  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Shrink font size until the text fits within 86% of canvas width and 78% of height.
  let fontSize = 200;
  const maxTextWidth = width * 0.86;
  const maxTextHeight = height * 0.78;
  do {
    ctx.font = `900 ${fontSize}px "Microsoft YaHei", "Heiti SC", "MiSans", sans-serif`;
    const m = ctx.measureText(text);
    const w = m.width;
    const h = (m.actualBoundingBoxAscent || fontSize * 0.5) + (m.actualBoundingBoxDescent || fontSize * 0.2);
    if (w <= maxTextWidth && h <= maxTextHeight) break;
    fontSize -= 4;
  } while (fontSize > 10);

  ctx.fillStyle = 'white';
  ctx.fillText(text, width / 2, height / 2);

  const data = ctx.getImageData(0, 0, width, height).data;
  const validPoints: number[] = [];
  const scale = 36 / width; // map canvas pixels to ~36 world units wide
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (data[(y * width + x) * 4] > 128) validPoints.push((x - width / 2) * scale, -(y - height / 2) * scale);
    }
  }

  const positions = new Float32Array(count * 3);
  const pointCount = validPoints.length / 2;
  if (pointCount === 0) return positions;

  // Fisher-Yates shuffle so all glyph regions are sampled uniformly before wrapping around.
  const order = new Int32Array(pointCount);
  for (let i = 0; i < pointCount; i++) order[i] = i;
  for (let i = pointCount - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = order[i]; order[i] = order[j]; order[j] = t;
  }
  for (let i = 0; i < count; i++) {
    const p = order[i % pointCount];
    positions[i * 3] = validPoints[p * 2] + (Math.random() - 0.5) * 0.08;
    positions[i * 3 + 1] = validPoints[p * 2 + 1] + (Math.random() - 0.5) * 0.08;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
  }
  return positions;
};

// Idle starfield: a wide, slightly flattened sphere (r 6–56) that surrounds the camera during the intro fly-in.
export function fillIdle({ pos, col }: PC, count: number) {
  for (let i = 0; i < count; i++) {
    const r = 6 + Math.random() * 50;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(p) * Math.cos(t);
    pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
    pos[i * 3 + 2] = r * Math.cos(p) * 0.7;
    const b = 0.45 + Math.random() * 0.5;
    const roll = Math.random();
    if (roll > 0.9) setCol(col, i, b * 1.0, b * 0.85, b * 0.55);
    else if (roll > 0.55) setCol(col, i, b * 0.6, b * 0.75, b * 1.0);
    else setCol(col, i, b * 0.85, b * 0.92, b * 1.0);
  }
}

// Ambient star shell surrounding the main shape during year / rings phases.
export function fillAmbient({ pos, col }: PC, count: number) {
  for (let i = 0; i < count; i++) {
    const r = 18 + Math.pow(Math.random(), 0.7) * 12;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(p) * Math.cos(t);
    pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
    pos[i * 3 + 2] = r * Math.cos(p);
    const roll = Math.random();
    const b = 0.35 + Math.random() * 0.4;
    if (roll > 0.93) setCol(col, i, b * 1.0, b * 0.85, b * 0.5);
    else if (roll > 0.6) setCol(col, i, b * 0.7, b * 0.8, b * 1.0);
    else setCol(col, i, b * 0.85, b * 0.9, b * 1.0);
  }
}

// Year digits — flat, camera-facing (Lumina's countdown digits; four glyphs, so the canvas is twice as wide).
export function fillDigit(text: string, { pos, col }: PC, count: number) {
  const tp = generateTextParticles(text, count, 640, 320);
  const dc = PALETTE.digit;
  for (let i = 0; i < count; i++) {
    pos[i * 3] = tp[i * 3];
    pos[i * 3 + 1] = tp[i * 3 + 1];
    pos[i * 3 + 2] = tp[i * 3 + 2];
    setCol(col, i, dc[0], dc[1], dc[2]);
  }
}

// Finale starfield: a dense spherical shell (r 16–34) enclosing the text.
export function fillStarfield({ pos, col }: PC, count: number) {
  for (let i = 0; i < count; i++) {
    const r = 16 + Math.pow(Math.random(), 0.7) * 18;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(p) * Math.cos(t);
    pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
    pos[i * 3 + 2] = r * Math.cos(p);
    const b = 0.40 + Math.random() * 0.6;
    const roll = Math.random();
    if (roll > 0.92) setCol(col, i, b * 1.0, b * 0.86, b * 0.55);
    else if (roll > 0.58) setCol(col, i, b * 0.60, b * 0.78, b * 1.0);
    else setCol(col, i, b * 0.88, b * 0.94, b * 1.0);
  }
}

// Finale text: extruded along Z for genuine 3D volume, biased toward the front and back faces.
export function fillText(text: string, { pos, col }: PC, count: number) {
  const tp = generateTextParticles(text, count, 768, 260);
  const THICK = 1.4;
  const base = PALETTE.finaleText;
  for (let i = 0; i < count; i++) {
    pos[i * 3] = tp[i * 3];
    pos[i * 3 + 1] = tp[i * 3 + 1];
    const face = (i & 1) === 0 ? 1 : -1;
    pos[i * 3 + 2] = face * THICK * (0.7 + Math.random() * 0.3);
    const m = 1.0 + Math.random() * 0.14;
    setCol(col, i, base[0] * m, base[1] * m, base[2] * m);
  }
}

// Static deep-space background: generated once, never updated per-frame.
export function generateBackgroundStars(): PC {
  const pc = newPC(BG_COUNT);
  const { pos, col } = pc;
  for (let i = 0; i < BG_COUNT; i++) {
    const r = 45 + Math.random() * 45;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(p) * Math.cos(t);
    pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
    pos[i * 3 + 2] = r * Math.cos(p);
    const b = 0.25 + Math.random() * 0.45;
    if (Math.random() > 0.9) setCol(col, i, b, b * 0.9, b * 0.7);
    else setCol(col, i, b * 0.8, b * 0.9, b);
  }
  return pc;
}

// ===== 年轮造型（替代 Lumina 的蛋糕 / 灯笼） =====

const RADIUS = 13; // 树的横截面半径（Lumina 蛋糕最宽 9.6，灯笼 5；镜头 34 看得全）
const PITH = 1.0;
const THICK = 1.1; // 切片半厚
const TILT = -0.5; // 往后仰一点，看得见切面和树皮
const FOCAL_MAX = 1400;

/** 焦点星那一池的粒子：每颗星的下标范围和基准颜色（引擎逐帧按它闪烁）。 */
export interface FocalInfo { count: number; base: Float32Array }

const pickWeighted = (pool: { w: number; rgb: RGB }[]) => {
  let r = Math.random();
  for (const c of pool) { r -= c.w; if (r <= 0) return c.rgb; }
  return pool[pool.length - 1].rgb;
};

const WOOD_LINE = [{ w: 0.6, rgb: [0.62, 0.42, 0.22] as RGB }, { w: 0.4, rgb: [0.74, 0.52, 0.28] as RGB }];
const WOOD_FILL = [{ w: 0.7, rgb: [0.26, 0.17, 0.09] as RGB }, { w: 0.3, rgb: [0.36, 0.24, 0.12] as RGB }];
const GOLD_LINE = [{ w: 0.55, rgb: [1.0, 0.82, 0.38] as RGB }, { w: 0.45, rgb: [1.25, 0.95, 0.45] as RGB }];
const GOLD_FILL = [{ w: 1, rgb: [0.55, 0.38, 0.15] as RGB }];
const BARK = [{ w: 0.7, rgb: [0.30, 0.19, 0.10] as RGB }, { w: 0.3, rgb: [0.45, 0.30, 0.16] as RGB }];

/** 有数据的周里随机挑一周、周里随机一天的角度；整年没数据是 null（留白）。 */
const angleIn = (weeks: (number | null)[], year: number): number | null => {
  const present = weeks.map((w, i) => (w === null ? -1 : i)).filter(i => i >= 0);
  if (!present.length) return null;
  const days = daysInYear(year);
  const w = present[(Math.random() * present.length) | 0];
  const span = Math.min(7, days - w * 7);
  return angleOfDay(w * 7 + Math.random() * span, days);
};

/** 屏幕角度（y 向下）→ 世界坐标（y 向上），顺时针不变。 */
const put = (pos: Float32Array, i: number, r: number, angle: number, z: number) => {
  pos[i * 3] = r * Math.cos(angle);
  pos[i * 3 + 1] = -r * Math.sin(angle);
  pos[i * 3 + 2] = z;
};

const face = (i: number) => ((i & 1) === 0 ? 1 : -1) * THICK * (0.7 + Math.random() * 0.3);

export function fillRings({ pos, col }: PC, count: number, years: RingYear[], selected: number | null): FocalInfo {
  const rings = treeRings(years, RADIUS, PITH);
  const sel = years.find(y => y.year === selected) ?? null;
  const selRing = rings.find(r => r.year === selected) ?? null;
  const stars = sel?.stars ?? [];
  const focal = stars.length && selRing ? Math.min(FOCAL_MAX, Math.max(260, stars.length * 8)) : 0;
  const base = new Float32Array(focal * 3);

  // 焦点星：选中那一年的每次运动，角度 = 日期，半径按时长排名铺在那一圈里，浮在切面前方。
  if (focal && sel && selRing) {
    const durations = stars.map(s => s.duration_s).filter((d): d is number => !!d).sort((a, b) => a - b);
    const rank = (d: number | null) => (d && durations.length > 1 ? durations.indexOf(d) / (durations.length - 1) : 0.5);
    const maxRun = Math.max(0, ...stars.filter(s => s.is_run).map(s => s.distance_m ?? 0));
    const per = Math.max(1, Math.floor(focal / stars.length));
    const days = daysInYear(sel.year);
    for (let i = 0; i < focal; i++) {
      const star = stars[Math.min(stars.length - 1, Math.floor(i / per))];
      const width = selRing.outer - selRing.inner;
      const r0 = selRing.inner + width * (0.15 + 0.7 * rank(star.duration_s));
      const a0 = angleOfDay(dayOfYear(star.date) + 0.5, days);
      const size = star.is_run ? 0.1 + 0.28 * (star.distance_m && maxRun ? Math.sqrt(star.distance_m / maxRun) : 0.3) : 0.07;
      // 火焰那样的一小团：越往外越稀。
      const s = size * Math.sqrt(Math.random());
      const t = Math.random() * Math.PI * 2;
      const x0 = r0 * Math.cos(a0) + s * Math.cos(t);
      const y0 = -r0 * Math.sin(a0) + s * Math.sin(t);
      pos[i * 3] = x0; pos[i * 3 + 1] = y0; pos[i * 3 + 2] = THICK + 0.25 + Math.random() * 0.3;
      const f = star.is_run ? PALETTE.focal : ([0.6, 0.78, 1.1] as RGB);
      const h = Math.random();
      setCol(base, i, f[0], f[1] * (0.7 + h * 0.5), f[2] * (0.6 + h * 0.6));
      setCol(col, i, base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
    }
  }

  // 其余：年轮（木纹线 + 环带）、髓心、树皮。
  const barkCount = Math.round((count - focal) * 0.08);
  const ringCount = count - focal - barkCount;
  const live = rings.filter(r => !r.blank && r.weeks.some(w => w !== null));
  const weight = (r: typeof rings[number]) => (r.outer * r.outer - r.inner * r.inner) * (r.year === selected ? 1.6 : 1);
  const total = live.reduce((s, r) => s + weight(r), 0) || 1;
  const shapes = new Map(live.map(r => [r.year, weekShape(r.weeks)]));
  // 留 3% 给髓心和留白的虚点。
  const ringBudget = live.length ? Math.round(ringCount * 0.97) : 0;
  let i = focal;
  for (const ring of live) {
    const n = ring === live[live.length - 1] ? focal + ringBudget - i : Math.round((ringBudget * weight(ring)) / total);
    const on = ring.year === selected;
    const width = ring.outer - ring.inner;
    const amp = Math.min(width * 0.45, 0.55);
    const shape = shapes.get(ring.year)!;
    const days = daysInYear(ring.year);
    for (let k = 0; k < n && i < focal + ringBudget; k++, i++) {
      const angle = angleIn(ring.weeks, ring.year)!;
      const week = Math.min(shape.length - 1, Math.floor(((angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * days / 7));
      if (Math.random() < 0.55) {
        // 木纹线：圈边按每周运动量起伏。
        const r = ring.outer + amp * ((shape[week] ?? 0.5) - 0.5) + (Math.random() - 0.5) * 0.06;
        put(pos, i, r, angle, face(i));
        const c = pickWeighted(on ? GOLD_LINE : WOOD_LINE);
        const b = 0.85 + Math.random() * 0.3;
        setCol(col, i, c[0] * b, c[1] * b, c[2] * b);
      } else {
        put(pos, i, ring.inner + Math.random() * width, angle, face(i));
        const c = pickWeighted(on ? GOLD_FILL : WOOD_FILL);
        const b = 0.7 + Math.random() * 0.6;
        setCol(col, i, c[0] * b, c[1] * b, c[2] * b);
      }
    }
  }
  // 整年没数据的圈：只撒一道很淡的虚点（留白）；髓心一小团。
  const blank = rings.filter(r => r.blank);
  for (; i < focal + ringCount; i++) {
    if (blank.length && Math.random() < 0.5) {
      const ring = blank[(Math.random() * blank.length) | 0];
      const a = Math.round(Math.random() * 72) / 72 * Math.PI * 2;
      put(pos, i, ring.outer, a, face(i));
      setCol(col, i, 0.18, 0.15, 0.12);
    } else {
      put(pos, i, PITH * Math.sqrt(Math.random()), Math.random() * Math.PI * 2, face(i));
      setCol(col, i, 0.9, 0.62, 0.3);
    }
  }
  // 树皮：一圈圆柱侧面。
  for (; i < count; i++) {
    put(pos, i, RADIUS + 0.2 + Math.random() * 0.45, Math.random() * Math.PI * 2, (Math.random() * 2 - 1) * THICK);
    const c = pickWeighted(BARK);
    const b = 0.7 + Math.random() * 0.5;
    setCol(col, i, c[0] * b, c[1] * b, c[2] * b);
  }

  // 往后仰：绕 X 轴转，看得见切面与树皮的厚度。
  const cos = Math.cos(TILT), sin = Math.sin(TILT);
  for (let k = 0; k < count; k++) {
    const y = pos[k * 3 + 1], z = pos[k * 3 + 2];
    pos[k * 3 + 1] = y * cos - z * sin;
    pos[k * 3 + 2] = y * sin + z * cos;
  }
  return { count: focal, base };
}

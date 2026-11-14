/*
 * 运动详情折线图的纵轴：按真实数据自适应，取整到好读的刻度。纯函数。
 *
 * 2026-11-14 用户截图：骑行海拔 1–12 米，纵轴画成 -14..26（旧做法围绕数据中点硬撑 40 米），
 * 「我是骑车不是潜水」。Zepp 同类数据（6–17 米）画的是 0–20。
 */

export interface AxisRange { min: number; max: number; interval: number }

/** 把一个粗略步长取整到 1 / 2 / 2.5 / 5 × 10ⁿ。 */
export const niceStep = (raw: number): number => {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const f = raw / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * base;
};

/** 刻度落在步长的整数倍上（避开 0.1 + 0.2 这类浮点尾巴）。 */
const snap = (value: number, step: number, dir: 'down' | 'up'): number => {
  const n = value / step;
  const k = dir === 'down' ? Math.floor(n + 1e-9) : Math.ceil(n - 1e-9);
  return Math.round(k * step * 1e6) / 1e6;
};

const extent = (values: readonly number[]): [number, number] | null => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo <= hi ? [lo, hi] : null;
};

/**
 * 海拔纵轴：跨度至少 `minSpan`（平路就画成平的，和爬升卡「没有明显爬升」对得上——2026-10-28 的初衷），
 * 否则是实际落差的 1.3 倍；数据全在 0 以上时下界不低于 0（真在海平面以下的数据照样画负数）；
 * 上下界取整到约四格的整刻度。
 */
export const elevationAxis = (values: readonly number[], minSpan: number): AxisRange | null => {
  const range = extent(values);
  if (!range) return null;
  const [lo, hi] = range;
  const span = Math.max((hi - lo) * 1.3, minSpan, 1e-6);
  const step = niceStep(span / 4);
  let min = lo - (span - (hi - lo)) / 2;
  if (lo >= 0 && min < 0) min = 0;
  min = snap(min, step, 'down');
  const max = snap(Math.max(hi, min + span), step, 'up');
  return { min, max, interval: step };
};

/** 配速轴（秒）可用的步长：5 秒到 10 分钟。 */
const PACE_STEPS = [5, 10, 15, 20, 30, 60, 120, 180, 300, 600];

/**
 * 配速纵轴（每公里 / 每英里秒数）：只按主体范围 [lo, hi]（剔除停顿和飘点之后的分位数）留白取整，
 * 范围外的点贴着轴边裁掉——不让一次红灯把整张图压扁成一条线（旧图轴画到 58:20）。
 */
export const paceAxis = (lo: number, hi: number): AxisRange | null => {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return null;
  const pad = Math.max((hi - lo) * 0.15, 10);
  const span = hi - lo + pad * 2;
  const step = PACE_STEPS.find((s) => span / s <= 5) ?? 600;
  const min = Math.max(0, snap(lo - pad, step, 'down'));
  const max = snap(hi + pad, step, 'up');
  return { min, max: max > min ? max : min + step, interval: step };
};

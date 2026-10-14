/**
 * 演示数据用的确定性随机数：同一个种子永远给同一串数，落地页每次打开、每个访客看到的演示都一样，
 * 截图也能复现。不是密码学随机，只管「看起来像一个真人的生活」。
 */
export interface Rng {
  /** [0, 1) */
  next(): number;
  between(min: number, max: number): number;
  int(min: number, max: number): number;
  chance(probability: number): boolean;
}

/** mulberry32：32 位种子，够快、分布够匀。 */
export const makeRng = (seed: number): Rng => {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    between: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    chance: (probability) => next() < probability,
  };
};

const pad = (value: number) => String(value).padStart(2, '0');

/** 本地日历日 `YYYY-MM-DD`。 */
export const dayKey = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** 从 `base` 所在那天往前/往后 `days` 天、本地 `hour:minute` 的时刻。 */
export const at = (base: Date, days: number, hour = 0, minute = 0): Date =>
  new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, hour, minute, 0, 0);

/** 带时区偏移的 ISO 串（`2026-10-02T08:30:00+08:00`）——后端的时间戳也是这个口径。 */
export const iso = (date: Date): string => date.toISOString();

export const round = (value: number, digits = 0): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

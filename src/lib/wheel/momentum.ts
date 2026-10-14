/**
 * 滚轮日期选择的「惯性加速」：鼠标滚轮慢慢拨，一格走一项；拨得快，一格走好几项。
 *
 * Windows 的普通滚轮每一格发一个 deltaY≈100 的事件；快速连拨时相邻事件只隔十几到
 * 几十毫秒。按「连拨了多少下」逐级放大每一格走的项数（1 → 2 → 3 → 5 → 8），停下来
 * 超过 GAP_MS 就归零。触控板发的是细碎的像素增量，按像素累计，不加速——它自己就有惯性。
 *
 * 纯函数：状态由调用方保存，便于测试。
 */

export interface WheelAccelState {
  /** 上一个滚轮事件的时间戳（ms）。 */
  lastTs: number;
  /** 连拨了多少下（相邻间隔都小于 GAP_MS）。 */
  streak: number;
  /** 触控板累计的像素，满一格才走。 */
  pixels: number;
  /** 上一格的方向：换方向立刻归零，不带着加速往回冲。 */
  sign: number;
}

export const newWheelAccel = (): WheelAccelState => ({ lastTs: 0, streak: 0, pixels: 0, sign: 0 });

/** 两格之间超过这么久就当成重新开始慢拨。 */
export const GAP_MS = 90;
/** 触控板多少像素算一格。 */
export const PIXELS_PER_STEP = 28;
/** 连拨次数 → 每格走几项。 */
const LADDER = [1, 1, 2, 2, 3, 3, 5, 5, 8];

/** DOM_DELTA_LINE / DOM_DELTA_PAGE 都当作「一格」；像素模式下 ≥ 50 的也是鼠标滚轮的一格。 */
const isNotch = (delta: number, mode: number) => mode !== 0 || Math.abs(delta) >= 50;

/**
 * 一个滚轮事件要走多少项（带符号）。会改写 state。
 * 返回 0 表示还没攒够一格（触控板）。
 */
export const wheelSteps = (state: WheelAccelState, delta: number, mode: number, ts: number): number => {
  if (!delta) return 0;
  const sign = Math.sign(delta);
  const gap = state.lastTs ? ts - state.lastTs : Infinity;
  state.lastTs = ts;
  if (sign !== state.sign || gap > GAP_MS) {
    state.streak = 0;
    state.pixels = 0;
  }
  state.sign = sign;

  if (!isNotch(delta, mode)) {
    state.pixels += delta;
    const whole = Math.trunc(state.pixels / PIXELS_PER_STEP);
    state.pixels -= whole * PIXELS_PER_STEP;
    return whole;
  }
  const notches = mode === 0 ? Math.max(1, Math.round(Math.abs(delta) / 100)) : Math.max(1, Math.round(Math.abs(delta)));
  const multiplier = LADDER[Math.min(state.streak, LADDER.length - 1)]!;
  state.streak += 1;
  return sign * notches * multiplier;
};

/** 某年某月有几天（month 1–12）。 */
export const daysInMonth = (year: number, month: number): number => new Date(year, month, 0).getDate();

/** 把年月日钳进 [min, max]（YYYY-MM-DD），日子钳进当月天数。 */
export const clampDate = (year: number, month: number, day: number, min?: string | null, max?: string | null): string => {
  const d = Math.min(Math.max(1, day), daysInMonth(year, month));
  const pad = (n: number) => String(n).padStart(2, '0');
  let iso = `${year}-${pad(month)}-${pad(d)}`;
  if (min && iso < min) iso = min;
  if (max && iso > max) iso = max;
  return iso;
};

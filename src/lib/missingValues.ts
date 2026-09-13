import { isFiniteNumber } from './format';

/**
 * 缺失不是 0。
 *
 * 有限数（包括合法的 0）原样返回；null / undefined / NaN / Infinity
 * 一律是 null。界面看到 0 只能表示「测到了，是 0」，不能表示「没给」。
 */
export const finiteOrNull = (value: unknown): number | null =>
  isFiniteNumber(value) ? value : null;

/**
 * 色条、堆叠柱只画有数的阶段。
 *
 * 0 分钟是设备说这一阶段为零，会画（可能是一条很窄的缝）；
 * 未提供是 null，不占 flex、不进堆叠。
 */
export const stageMinutesForBar = (minutes: unknown): number | null =>
  finiteOrNull(minutes);

/** 分钟 → 一位小数的小时。未提供保持 null，不写成 0.0 小时。 */
export const minutesToHours = (minutes?: number | null): number | null => {
  const value = finiteOrNull(minutes);
  return value === null ? null : Math.round((value / 60) * 10) / 10;
};

/**
 * 窗口里没有任何实测日时，聚合值（即使是 0.0）也不能拿去画线。
 */
export const coveredWindowValue = (
  value: number,
  daysWithData: number,
): number | null => (daysWithData > 0 ? finiteOrNull(value) : null);

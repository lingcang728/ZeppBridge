/**
 * 列波纹（履历页「全年活动记录」翻年，用户 2026-10-28 拍板）：旧网格一列一列淡出、新网格一列一列淡入，
 * 像一道波纹扫过去。往后翻（年份变大）从左扫到右，往前翻从右扫到左，和年份滑块的方向一致。
 *
 * 列间隔约 6ms，整段约 400ms：列太多放不下时缩短间隔，每列至少留 `minDuration` 让淡入看得出来。
 */

export type SweepDirection = 1 | -1;

/** 年份变大从左往右（1），变小从右往左（-1）。 */
export const sweepDirection = (from: number, to: number): SweepDirection => (to >= from ? 1 : -1);

export interface SweepOptions { total?: number; step?: number; minDuration?: number }
export interface SweepTiming { duration: number; delays: number[] }

/** `count` 列各自的延迟（ms）和每列的时长：最后一列正好在 `total` 放完。 */
export function columnSweep(count: number, direction: SweepDirection, { total = 400, step = 6, minDuration = 120 }: SweepOptions = {}): SweepTiming {
  if (count <= 0) return { duration: total, delays: [] };
  const span = count - 1;
  const gap = span ? Math.min(step, Math.max(0, (total - minDuration) / span)) : 0;
  const duration = total - gap * span;
  const delays = Array.from({ length: count }, (_, i) => Math.round((direction === 1 ? i : span - i) * gap * 10) / 10);
  return { duration, delays };
}

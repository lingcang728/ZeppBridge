/* 小睡阶段片 → 一段一段的小睡（官方 `napStage`，3.1.2 起入库）。
 *
 * 官方给的是一串带阶段的片，不分组；同一段小睡里的片首尾相接（前一片的结束就是
 * 后一片的开始），两段小睡之间隔着醒着的时间。间隔超过 GAP_MS 就算新的一段。 */
import type { SleepStageSlice } from '../types';

export interface NapGroup {
  start: string;
  end: string;
  slices: SleepStageSlice[];
  /** 每个阶段的分钟数；没有这个阶段的片就是 null（不写 0，阶段条据此显示「—」）。 */
  minutes: Record<'deep' | 'light' | 'rem' | 'awake', number | null>;
  /** 睡着的分钟数（不含清醒片）。 */
  asleepMinutes: number;
}

const GAP_MS = 5 * 60_000;

const ms = (value: string) => new Date(value).getTime();

export const groupNaps = (slices: readonly SleepStageSlice[]): NapGroup[] => {
  const sorted = slices
    .filter((slice) => Number.isFinite(ms(slice.start_time)) && ms(slice.end_time) > ms(slice.start_time))
    .slice()
    .sort((a, b) => ms(a.start_time) - ms(b.start_time));
  const groups: SleepStageSlice[][] = [];
  for (const slice of sorted) {
    const current = groups[groups.length - 1];
    const last = current?.[current.length - 1];
    if (last && ms(slice.start_time) - ms(last.end_time) <= GAP_MS) current.push(slice);
    else groups.push([slice]);
  }
  return groups.map((group) => {
    const minutes: NapGroup['minutes'] = { deep: null, light: null, rem: null, awake: null };
    for (const slice of group) {
      const key = slice.stage as keyof NapGroup['minutes'];
      if (!(key in minutes)) continue;
      minutes[key] = (minutes[key] ?? 0) + Math.round((ms(slice.end_time) - ms(slice.start_time)) / 60_000);
    }
    const asleepMinutes = (minutes.deep ?? 0) + (minutes.light ?? 0) + (minutes.rem ?? 0);
    return {
      start: group[0].start_time,
      end: group.reduce((latest, slice) => (ms(slice.end_time) > ms(latest) ? slice.end_time : latest), group[0].end_time),
      slices: group,
      minutes,
      asleepMinutes,
    };
  });
};

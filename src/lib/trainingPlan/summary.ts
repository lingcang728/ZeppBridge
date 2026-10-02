/**
 * 审阅卡顶上的一周小结，以及「训练形状」的高度怎么算。纯函数，不出文案。
 *
 * 训练形状（周历格子里的缩略图、详情里的强度走势）：横向是时间，竖向是强度——
 * 有心率目标的步骤按目标心率中点在**整周共用的心率坐标**里摆高度，所以周三的间歇
 * 一眼就比周六的轻松跑高；没有心率目标的步骤只按强度类别给一个示意高度（并在界面上
 * 画成浅色、不画心率带），不假装知道它的心率。
 */
import type { PlanIntensity } from '../../types/trainingPlan';
import type { DayRow } from './week';
import { workoutProfile, type ProfileSegment, type WorkoutProfile } from './profile';

/** 没有心率目标时按强度类别给的示意高度（0..1）。 */
export const INTENSITY_LEVEL: Record<PlanIntensity, number> = {
  rest: 0.14,
  cooldown: 0.3,
  recovery: 0.3,
  warmup: 0.38,
  active: 0.6,
  interval: 0.92,
};

export interface HrDomain { min: number; max: number }

/** 一组训练共用的心率坐标：框住所有心率目标，两头留余量；一个心率目标都没有时为 null。 */
export const sharedHrDomain = (profiles: WorkoutProfile[]): HrDomain | null => {
  const lows: number[] = [];
  const highs: number[] = [];
  for (const profile of profiles) {
    for (const segment of profile.segments) {
      if (segment.low !== null && segment.high !== null) { lows.push(segment.low); highs.push(segment.high); }
    }
  }
  if (!lows.length) return null;
  const min = Math.max(40, Math.floor((Math.min(...lows) - 25) / 10) * 10);
  const max = Math.ceil((Math.max(...highs) + 5) / 10) * 10;
  return { min, max: Math.max(min + 40, max) };
};

/** 一步的高度（0..1）：有心率目标按目标中点在坐标里的位置，否则按强度类别。 */
export const segmentLevel = (segment: ProfileSegment, domain: HrDomain | null): number => {
  if (domain && segment.low !== null && segment.high !== null) {
    const mid = (segment.low + segment.high) / 2;
    return Math.min(1, Math.max(0.12, (mid - domain.min) / (domain.max - domain.min)));
  }
  return INTENSITY_LEVEL[segment.intensity];
};

export interface WeekStats {
  /** 窗口里有训练的天数里的训练条数。 */
  sessions: number;
  seconds: number;
  /** 总时长里有按距离摆的（只是示意）。 */
  approx: boolean;
  /** 含间歇步骤的训练条数。 */
  hard: number;
  /** 窗口里没有训练的天数。 */
  restDays: number;
}

/** 只数这次要发的 7 天窗口里的（窗口外的这次不发）。 */
export const weekStats = (rows: DayRow[]): WeekStats => {
  const stats: WeekStats = { sessions: 0, seconds: 0, approx: false, hard: 0, restDays: 0 };
  for (const row of rows) {
    if (!row.inWindow) continue;
    if (!row.after.length) { stats.restDays += 1; continue; }
    for (const workout of row.after) {
      const profile = workoutProfile(workout);
      stats.sessions += 1;
      stats.seconds += profile.seconds;
      stats.approx = stats.approx || profile.approx;
      if (profile.segments.some((segment) => segment.intensity === 'interval')) stats.hard += 1;
    }
  }
  return stats;
};

export interface RepeatSpan {
  /** 这一组在 segments 里的起止下标（含首不含尾）。 */
  from: number;
  to: number;
  times: number;
}

/** 区间图下面的「×5」括号：连续的、带组号的步骤是一个重复组。 */
export const repeatSpans = (segments: ProfileSegment[]): RepeatSpan[] => {
  const spans: RepeatSpan[] = [];
  let index = 0;
  while (index < segments.length) {
    if (segments[index].round === null) { index += 1; continue; }
    const from = index;
    let times = 0;
    // 组号回到 0 而前一步不是 null，说明紧挨着开始了另一组。
    while (index < segments.length && segments[index].round !== null && !(index > from && segments[index].round === 0 && segments[index - 1].round !== 0)) {
      times = Math.max(times, (segments[index].round as number) + 1);
      index += 1;
    }
    spans.push({ from, to: index, times });
  }
  return spans;
};

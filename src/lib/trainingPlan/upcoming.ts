/**
 * 「这一周」卡底下「接下来」那三天：账本上上次发到手表的计划里，明天起三天各是什么。
 *
 * 纯函数，不碰 Vue、不出文案。只吃 `TrainingPlanState.sent`（账本：上次发到手表的），
 * 不看草稿——没发出去的排课不算数，出现在概览上会让人以为已经排好了。
 *
 * 三天从**明天**起算：今天要么已经在练要么已经定了，概览上「接下来」要回答的是
 * 从明天开始的安排。
 */
import { addDays, dayKey } from '../aiTask/bridgeScale';
import { workoutProfile } from './profile';
import type { PlanWorkout } from '../../types/trainingPlan';

export const UPCOMING_DAYS = 3;

export interface UpcomingDay {
  /** 本地日历日（YYYY-MM-DD）。 */
  date: string;
  /** 这天没有训练（休息）。 */
  rest: boolean;
  /** 训练名；休息日为 null。这天排了多条时取第一条，不拼长串。 */
  name: string | null;
  /** 总分钟（取整）。按距离写的步骤时长取决于配速，不能当真时长，所以为 null。 */
  minutes: number | null;
  /** 有间歇步 = 高强度（三角）；没有 = 有氧 / 轻松（实心圆）。 */
  interval: boolean;
}

const dayEntry = (workouts: readonly PlanWorkout[], date: string): UpcomingDay => {
  const first = workouts.find((workout) => workout.date === date);
  if (!first) return { date, rest: true, name: null, minutes: null, interval: false };
  const profile = workoutProfile(first);
  return {
    date,
    rest: false,
    name: first.name,
    minutes: profile.approx ? null : Math.round(profile.seconds / 60),
    interval: profile.segments.some((segment) => segment.intensity === 'interval'),
  };
};

/**
 * 接下来三天。三天里一条训练都没有时返回 `null`：分不清「排了休息」和「根本没排」，
 * 画三个空圈会像在替计划说话——整行不画，卡片就是原样。
 */
export const upcomingDays = (sent: readonly PlanWorkout[], today: string | Date, count = UPCOMING_DAYS): UpcomingDay[] | null => {
  const base = typeof today === 'string' ? today : dayKey(today);
  const days = Array.from({ length: count }, (_, index) => addDays(base, index + 1));
  const entries = days.map((date) => dayEntry(sent, date));
  return entries.some((entry) => !entry.rest) ? entries : null;
};

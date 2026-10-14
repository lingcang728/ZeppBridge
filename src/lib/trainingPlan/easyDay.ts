/**
 * 早上恢复差：一键把今天的间歇换成轻松跑（骑、游同理）。
 *
 * 纯函数，不碰 Vue、不出界面文案。两件事分开判断：
 *
 * 1. **恢复差**只和你自己比：今天手表给的准备度，比你此前 28 天的中位数低 {@link READINESS_DROP}
 *    分及以上。今天还没有读数（还没同步、手表没算）、或此前有数的日子不到
 *    {@link READINESS_MIN_DAYS} 天，就不下结论——不拿别人的分数线套你。
 * 2. **今天有间歇**：看要改的那一份（手上有草稿看草稿，没有看账本上发到手表的），有一步是
 *    `interval` / `work` 才算。轻松跑、长距离不提示。
 *
 * 换的时候只动今天有间歇的那几条，运动大类和子类型不变，一步「主体」走完：
 * - 时长：原训练按时间写的，取原总时长，凑整到 5 分钟，夹在 20–40 分钟；按距离写的（时长取决于配速，
 *   我们不知道）用 30 分钟。
 * - 目标：沿用原训练热身那一步的目标（没有就用放松、再没有用组间恢复的）——那本来就是你给自己定的
 *   轻松强度；都没写就不设目标，不替你编一个心率区间。
 *
 * 改完照常进草稿、由后端重新校验，发不发由用户长按确认，这里不绕过任何检查。
 */
import type { MetricSeriesPoint } from '../../types';
import type { PlanDocument, PlanStepInput, PlanWorkout, PlanWorkoutInput } from '../../types/trainingPlan';

/** 比自己的中位数低多少分算「恢复差」。 */
export const READINESS_DROP = 10;
/** 往前看几天当作「平时」。 */
export const READINESS_BASELINE_DAYS = 28;
/** 「平时」至少要有几天读数才敢比。 */
export const READINESS_MIN_DAYS = 7;

export const EASY_MIN_MINUTES = 20;
export const EASY_MAX_MINUTES = 40;
/** 原训练按距离写、算不出时长时用的轻松时长。 */
export const EASY_DEFAULT_MINUTES = 30;

export interface LowRecovery {
  /** 今天的准备度。 */
  today: number;
  /** 此前 28 天的中位数（取整）。 */
  usual: number;
}

const shift = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** 今天的准备度明显低于你自己的平时：给出两边的数；不够下结论时为 null。 */
export const lowRecovery = (points: readonly MetricSeriesPoint[], today: string): LowRecovery | null => {
  const now = points.find((point) => point.date === today && Number.isFinite(point.value));
  if (!now) return null;
  const since = shift(today, -READINESS_BASELINE_DAYS);
  const before = points
    .filter((point) => point.date >= since && point.date < today && Number.isFinite(point.value))
    .map((point) => point.value);
  if (before.length < READINESS_MIN_DAYS) return null;
  const usual = median(before);
  return now.value <= usual - READINESS_DROP ? { today: Math.round(now.value), usual: Math.round(usual) } : null;
};

type Single = Extract<PlanStepInput, { kind: string }>;

const leaves = (steps: readonly PlanStepInput[]): Single[] =>
  steps.flatMap((step) => ('repeat' in step ? leaves(step.steps) : [step]));

const isInterval = (kind: string) => ['interval', 'work'].includes(kind.trim().toLowerCase());

/** 书写格式的一条训练里有没有间歇步。 */
export const hasIntervalInput = (workout: PlanWorkoutInput): boolean => leaves(workout.steps).some((step) => isInterval(step.kind));

/** 校验过的一条训练里有没有间歇步（账本上发到手表的）。 */
export const hasIntervalStep = (workout: PlanWorkout): boolean =>
  workout.steps.some((node) => (node.type === 'repeat' ? node.steps.some((step) => step.intensity === 'interval') : node.intensity === 'interval'));

/** 这一份里，某一天有间歇的训练。 */
export const intervalsOn = (document: PlanDocument, date: string): PlanWorkoutInput[] =>
  document.workouts.filter((workout) => workout.date === date && hasIntervalInput(workout));

const SECONDS: Record<string, number> = { s: 1, sec: 1, min: 60, h: 3600, hr: 3600 };

/**
 * 一步的秒数；按距离写的或读不懂的为 null（整条就按算不出时长处理，用默认时长）。认后端
 * `parse_duration` 的英文单位——界面改过的、发出去再拿回来的草稿都写成这几种；AI 写的中文单位
 * 读不懂只是用默认时长，不会写错东西。
 */
const stepSeconds = (duration: string): number | null => {
  const match = /^(\d+(?:\.\d+)?)\s*(\S+)$/.exec(duration.trim().toLowerCase());
  const scale = match ? SECONDS[match[2]!] : undefined;
  return match && scale ? Number(match[1]) * scale : null;
};

/** 整条训练的秒数（重复组按轮数乘）；有一步按距离写就为 null。 */
export const inputSeconds = (steps: readonly PlanStepInput[]): number | null => {
  let total = 0;
  for (const step of steps) {
    const part = 'repeat' in step
      ? (() => { const inner = inputSeconds(step.steps); return inner === null ? null : inner * step.repeat; })()
      : stepSeconds(step.duration);
    if (part === null) return null;
    total += part;
  }
  return total;
};

export const easyMinutes = (workout: PlanWorkoutInput): number => {
  const seconds = inputSeconds(workout.steps);
  if (seconds === null) return EASY_DEFAULT_MINUTES;
  const rounded = Math.round(seconds / 300) * 5;
  return Math.min(EASY_MAX_MINUTES, Math.max(EASY_MIN_MINUTES, rounded));
};

/** 轻松强度沿用原训练里本来就轻的那一步的目标：热身 → 放松 → 组间恢复。 */
export const easyTarget = (workout: PlanWorkoutInput): string | undefined => {
  const all = leaves(workout.steps);
  for (const kind of [['warmup', 'warm_up'], ['cooldown', 'cool_down'], ['recovery']]) {
    const found = all.find((step) => kind.includes(step.kind.trim().toLowerCase()) && step.target?.trim() && step.target.trim().toLowerCase() !== 'open');
    if (found) return found.target!.trim();
  }
  return undefined;
};

/** 换上去的那条训练用到的字（按当时的界面语言，写进计划后就是用户自己的内容）。 */
export interface EasyWords {
  name: string;
  focus: string;
  /** 拿原训练名写一句说明，例如「准备度偏低，原计划「4×1km」改成轻松跑」。 */
  description: (original: string) => string;
}

/** 一条有间歇的训练 → 同运动、同子类型的一条轻松训练。 */
export const easyVersion = (workout: PlanWorkoutInput, words: EasyWords): PlanWorkoutInput => {
  const step: Single = { kind: 'active', duration: `${easyMinutes(workout)}min` };
  const target = easyTarget(workout);
  if (target) step.target = target;
  const next: PlanWorkoutInput = {
    date: workout.date, sport: workout.sport, name: words.name, focus: words.focus,
    description: words.description(workout.name), steps: [step],
  };
  if (workout.variant) next.variant = workout.variant;
  return next;
};

/** 把这一天有间歇的训练换成轻松的；同一天别的训练、休息建议、其他日子都不动。 */
export const easyDay = (document: PlanDocument, date: string, words: (workout: PlanWorkoutInput) => EasyWords): PlanDocument => ({
  ...document,
  workouts: document.workouts.map((workout) => (workout.date === date && hasIntervalInput(workout) ? easyVersion(workout, words(workout)) : workout)),
});

/**
 * 一条校验过的训练 → 界面能画的东西：一串按时间排开的色块（强度 + 目标心率范围），
 * 以及按「单步 / 重复组」分组的步骤清单。
 *
 * 纯函数，不碰 Vue、不出文案——数字原样给，怎么写成「12 分钟」「心率 110–130」归界面。
 *
 * 不编造：
 *   - 步骤按**距离**写的（`5km`），时长其实取决于配速，我们不知道。画图时按每公里 6 分钟
 *     摆个宽度，并标 `approx`，界面据此画成斜纹、写「宽度仅示意」，不把它当真时长；
 *   - 没有心率目标的步骤（配速 / 功率 / 不设目标）没有心率范围（`low`/`high` 为 null），
 *     图上只画一道细条，不假装它有心率区间。
 */
import type {
  PlanIntensity,
  PlanStep,
  PlanStepNode,
  PlanWorkout,
} from '../../types/trainingPlan';

/** 距离步骤在图上摆宽度用的假设配速（秒 / 公里）。只影响色块宽度，不进任何数据。 */
export const APPROX_SECONDS_PER_KM = 360;

export interface ProfileSegment {
  intensity: PlanIntensity;
  seconds: number;
  /** 宽度是按假设配速摆的（距离步骤）。 */
  approx: boolean;
  target: 'heart_rate' | 'pace' | 'power' | 'open';
  /** 心率目标的两端；其他目标为 null。 */
  low: number | null;
  high: number | null;
  /** 所在重复组的第几组（0 起）；单步为 null。 */
  round: number | null;
  /** 原文里的步骤路径：`[i]` 或重复组里的 `[i, j]`。拖强度图改的就是这一步（重复组每一轮跟着变）。 */
  path: number[];
}

export interface StepRow {
  intensity: PlanIntensity;
  length: PlanStep['length'];
  target: PlanStep['target'];
  /** AI / 用户给这一步写的备注（用户内容，不是后端文案）。 */
  remark?: string;
}

export type StepGroup =
  | { kind: 'step'; row: StepRow }
  | { kind: 'repeat'; times: number; rows: StepRow[] };

export interface WorkoutProfile {
  segments: ProfileSegment[];
  /** 画出来的总秒数（含按假设配速摆的距离步骤）。 */
  seconds: number;
  /** 其中至少有一步是按距离摆的宽度。 */
  approx: boolean;
  /** 至少有一步有心率目标。 */
  hasHeartRate: boolean;
  groups: StepGroup[];
}

const segmentOf = (step: PlanStep, round: number | null, path: number[]): ProfileSegment => {
  const approx = step.length.type === 'distance';
  const seconds = step.length.type === 'time'
    ? step.length.seconds
    : Math.round((step.length.meters / 1000) * APPROX_SECONDS_PER_KM);
  const hr = step.target.type === 'heart_rate' ? step.target : null;
  return {
    intensity: step.intensity,
    seconds,
    approx,
    target: step.target.type,
    low: hr ? hr.low : null,
    high: hr ? hr.high : null,
    round,
    path,
  };
};

const rowOf = (step: PlanStep): StepRow => {
  const { note: remark } = step;
  return { intensity: step.intensity, length: step.length, target: step.target, remark };
};

export const workoutProfile = (workout: PlanWorkout): WorkoutProfile => {
  const segments: ProfileSegment[] = [];
  const groups: StepGroup[] = [];
  const walk = (node: PlanStepNode, index: number) => {
    if (node.type === 'step') {
      segments.push(segmentOf(node, null, [index]));
      groups.push({ kind: 'step', row: rowOf(node) });
      return;
    }
    for (let round = 0; round < node.times; round += 1) {
      node.steps.forEach((step, inner) => segments.push(segmentOf(step, round, [index, inner])));
    }
    groups.push({ kind: 'repeat', times: node.times, rows: node.steps.map(rowOf) });
  };
  workout.steps.forEach(walk);
  return {
    segments,
    seconds: segments.reduce((sum, segment) => sum + segment.seconds, 0),
    approx: segments.some((segment) => segment.approx),
    hasHeartRate: segments.some((segment) => segment.low !== null),
    groups,
  };
};

/** 心率坐标的范围：框住所有目标，两头留出整十的余量；没有任何心率目标时给一个常用区间。 */
export const heartRateDomain = (profile: WorkoutProfile): { min: number; max: number } => {
  const lows = profile.segments.flatMap((segment) => (segment.low === null ? [] : [segment.low]));
  const highs = profile.segments.flatMap((segment) => (segment.high === null ? [] : [segment.high]));
  if (!lows.length || !highs.length) return { min: 90, max: 180 };
  const min = Math.floor((Math.min(...lows) - 8) / 10) * 10;
  const max = Math.ceil((Math.max(...highs) + 8) / 10) * 10;
  return { min: Math.max(40, min), max: Math.max(min + 40, max) };
};

/** 一条训练的总时长（分钟，取整）；有按距离摆的步骤就只是示意。 */
export const profileMinutes = (profile: WorkoutProfile): number => Math.round(profile.seconds / 60);

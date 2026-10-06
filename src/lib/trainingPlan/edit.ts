/**
 * 计划的结构化修改：界面上拖强度图、拨滚轮、点玻璃分段，改的都是这里的纯函数。
 *
 * 改完写回 **PlanDocument 的书写格式**（`"3min"`、`"90s"`、`"5km"`、`"hr 128-138"`、`"pace 5:00-5:30"`），
 * 走 `plan.reshape`，由后端重新校验——界面不自己判断对错，也不绕过校验直接改解析结果。
 *
 * 定位一步用「草稿原文里第几条训练」+ 步骤路径 `[i]` / `[i, j]`（第 i 节，重复组里的第 j 步）。重复组里改一步，
 * 每一轮都跟着变：它在原文里本来就只写了一次（「3 轮 × 4 分钟」改成「3 轮 × 3 分钟」）。
 */
import type {
  PlanDocument, PlanStepInput, PlanStepLength, PlanStepNode, PlanTarget, PlanWorkout, PlanWorkoutInput,
} from '../../types/trainingPlan';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const pad = (value: number) => String(value).padStart(2, '0');

/** 时长 → 书写格式：整分钟写 `min`，否则写秒；距离整公里写 `km`，否则写米。 */
export const lengthText = (length: PlanStepLength): string => {
  if (length.type === 'time') return length.seconds % 60 === 0 ? `${length.seconds / 60}min` : `${length.seconds}s`;
  return length.meters % 1000 === 0 ? `${length.meters / 1000}km` : `${length.meters}m`;
};

const paceText = (seconds: number) => `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;

/** 目标 → 书写格式；不设目标返回 undefined（原文里不写 target）。 */
export const targetText = (target: PlanTarget): string | undefined => {
  switch (target.type) {
    case 'heart_rate': return `hr ${target.low}-${target.high}`;
    case 'pace': return `pace ${paceText(target.fast)}-${paceText(target.slow)}`;
    case 'power': return `power ${target.low}-${target.high}`;
    default: return undefined;
  }
};

/** 校验过的一条训练 → 书写格式（把已经发出去的计划拿回来改时用）。 */
export const workoutToInput = (workout: PlanWorkout): PlanWorkoutInput => {
  const single = (step: { intensity: string; length: PlanStepLength; target: PlanTarget; note?: string }): PlanStepInput => {
    const out: PlanStepInput = { kind: step.intensity, duration: lengthText(step.length) };
    const target = targetText(step.target);
    if (target) out.target = target;
    if (step.note) out.note = step.note;
    return out;
  };
  const node = (n: PlanStepNode): PlanStepInput => (n.type === 'repeat'
    ? { repeat: n.times, steps: n.steps.map(single) }
    : single(n));
  const input: PlanWorkoutInput = { date: workout.date, sport: workout.sport, name: workout.name, steps: workout.steps.map(node) };
  if (workout.variant) input.variant = workout.variant;
  if (workout.focus) input.focus = workout.focus;
  if (workout.description) input.description = workout.description;
  return input;
};

/** 某一天第 k 条**校验通过的**训练在草稿原文里是第几条（被挡住的训练不进校验结果，所以按原文顺序跳过它们）。 */
export const documentIndexOf = (document: PlanDocument, date: string, k: number, blocked: Set<number>): number | null => {
  let seen = 0;
  for (let index = 0; index < document.workouts.length; index += 1) {
    const workout = document.workouts[index]!;
    if (workout.date !== date || blocked.has(index)) continue;
    if (seen === k) return index;
    seen += 1;
  }
  return null;
};

type Single = Extract<PlanStepInput, { kind: string }>;

/** 在原文里找到这一步（`[i]` 或 `[i, j]`），交给 `change` 就地改。路径不对就原样返回。 */
const withStep = (document: PlanDocument, workout: number, path: number[], change: (step: Single) => void): PlanDocument => {
  const next = clone(document);
  const steps = next.workouts[workout]?.steps;
  if (!steps) return next;
  const node = steps[path[0]!];
  if (!node) return next;
  if ('repeat' in node) {
    const inner = path.length > 1 ? node.steps[path[1]!] : undefined;
    if (inner && 'kind' in inner) change(inner);
    return next;
  }
  if (path.length === 1) change(node);
  return next;
};

export const setStepLength = (document: PlanDocument, workout: number, path: number[], length: PlanStepLength): PlanDocument =>
  withStep(document, workout, path, (step) => { step.duration = lengthText(length); });

export const setStepTarget = (document: PlanDocument, workout: number, path: number[], target: PlanTarget): PlanDocument =>
  withStep(document, workout, path, (step) => {
    const text = targetText(target);
    if (text) step.target = text;
    else delete step.target;
  });

/** 重复组的轮数，1–50（和后端校验一致）。 */
export const setRepeat = (document: PlanDocument, workout: number, index: number, times: number): PlanDocument => {
  const next = clone(document);
  const node = next.workouts[workout]?.steps[index];
  if (node && 'repeat' in node) node.repeat = Math.min(50, Math.max(1, Math.round(times)));
  return next;
};

/** 目的、要点：空字符串就去掉这个字段（后端会报「缺目的 / 缺描述」，界面红框提示）。 */
export const setText = (document: PlanDocument, workout: number, field: 'focus' | 'description' | 'name', value: string): PlanDocument => {
  const next = clone(document);
  const target = next.workouts[workout];
  if (!target) return next;
  const trimmed = value.trim();
  if (field === 'name') target.name = trimmed;
  else if (trimmed) target[field] = trimmed;
  else delete target[field];
  return next;
};

/* ── 拖强度图时的吸附 ─────────────────── */

/** 时长吸附：短步骤（不到 3 分钟）吸附到 30 秒，长的吸附到整分钟；最短 30 秒、最长 6 小时。 */
export const snapSeconds = (seconds: number): number => {
  const unit = seconds < 180 ? 30 : 60;
  return Math.min(6 * 3600, Math.max(30, Math.round(seconds / unit) * unit));
};

/** 心率吸附到 5 bpm，整体平移、区间宽度不变；不低于 40、不高于上限。 */
export const shiftHeartRate = (target: Extract<PlanTarget, { type: 'heart_rate' }>, delta: number, max = 220): PlanTarget => {
  const width = target.high - target.low;
  const low = Math.min(max - width, Math.max(40, Math.round((target.low + delta) / 5) * 5));
  return { type: 'heart_rate', low, high: low + width };
};

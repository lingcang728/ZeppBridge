/**
 * 计划的结构化修改：界面上拨滚轮、点玻璃分段、加删步骤，改的都是这里的纯函数。
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

/* ── 加一步 / 删一步（2026-10-12 第 3 批，单天页底部的四个按钮和展开态里的「删掉这一步」）──── */

export type AddKind = 'warmup' | 'step' | 'repeat' | 'cooldown';

/**
 * 四个按钮的默认值：热身 / 放松 / 一步都是按时间 10 分钟、不设目标（一步是主体）；
 * 间歇组是 ×4，每组主体 3 分钟加恢复 2 分钟。
 */
export const addTemplate = (kind: AddKind): PlanStepInput => {
  switch (kind) {
    case 'warmup': return { kind: 'warmup', duration: '10min' };
    case 'cooldown': return { kind: 'cooldown', duration: '10min' };
    case 'repeat': return { repeat: 4, steps: [{ kind: 'active', duration: '3min' }, { kind: 'recovery', duration: '2min' }] };
    default: return { kind: 'active', duration: '10min' };
  }
};

const isKind = (node: PlanStepInput | undefined, kind: string) => !!node && 'kind' in node && node.kind === kind;

/**
 * 加一步：热身放最前面，放松放最后面；一步和间歇组放在结尾的放松之前（没有放松就放最后）。
 * 返回新文档和新那一节的下标（界面据此展开它）。
 */
export const addStep = (document: PlanDocument, workout: number, kind: AddKind): { document: PlanDocument; index: number } => {
  const next = clone(document);
  const steps = next.workouts[workout]?.steps;
  if (!steps) return { document: next, index: -1 };
  let at = steps.length;
  if (kind === 'warmup') at = 0;
  else if (kind !== 'cooldown') while (at > 0 && isKind(steps[at - 1], 'cooldown')) at -= 1;
  steps.splice(at, 0, addTemplate(kind));
  return { document: next, index: at };
};

/** 删掉一步（`[i]` 或重复组里的 `[i, j]`）；重复组删空了就连组一起删。路径不对就原样返回。 */
export const removeStep = (document: PlanDocument, workout: number, path: number[]): PlanDocument => {
  const next = clone(document);
  const steps = next.workouts[workout]?.steps;
  const node = steps?.[path[0]!];
  if (!steps || !node) return next;
  if (path.length === 1) {
    steps.splice(path[0]!, 1);
    return next;
  }
  if ('repeat' in node && node.steps[path[1]!]) {
    node.steps.splice(path[1]!, 1);
    if (!node.steps.length) steps.splice(path[0]!, 1);
  }
  return next;
};

/**
 * 跑后打了「太难」：把下一次同类训练减 10%，不靠 AI 也能闭环。
 *
 * 纯函数，不碰 Vue、不出界面文案。规则：
 *
 * - **改哪一条**：要改的那一份里（手上有草稿看草稿，没有就看生效计划拿回来的草稿），日期在
 *   打分那天之后、运动大类相同的最早一条。没有就不改——不替用户新排一条训练。
 * - **改什么**：只缩主体（`active` / `interval` / `work`）每一步的时长或距离，乘 0.9；热身、放松、
 *   组间恢复不动，重复次数不动，目标强度不动。结构还是用户 / AI 原来写的那个样子，只是短一点。
 * - **凑整**：按秒的凑到 5 秒、按分钟的能整就写分钟、按米的凑到 10 米、按公里的凑到 0.1 公里；
 *   写法读不懂（AI 写的中文单位等）的那一步原样留着。一步都没缩成就当没改。
 *
 * 改完照常进草稿、由后端重新校验，发不发由用户长按确认。
 */
import type { PlanDocument, PlanStepInput, PlanWorkoutInput } from '../../types/trainingPlan';

export const LIGHTER_FACTOR = 0.9;

const FAMILY: Record<string, string> = {
  running: 'running', run: 'running', trail_running: 'running', trail_run: 'running',
  cycling: 'cycling', ride: 'cycling', bike: 'cycling', mountain_biking: 'cycling', mountain_bike: 'cycling', mtb: 'cycling',
  pool_swim: 'pool_swim', lap_swimming: 'pool_swim', pool_swimming: 'pool_swim',
  open_water_swim: 'open_water_swim', open_water_swimming: 'open_water_swim',
};

/** 写法里的运动 → 四个大类之一；手表收不下的活动返回原文（不会和大类撞上）。 */
export const sportFamily = (sport: string): string => {
  const key = sport.trim().toLowerCase();
  return FAMILY[key] ?? key;
};

const MAIN = ['active', 'main', 'interval', 'work'];

/** 一步的长度乘上系数；读不懂就返回 null。 */
export const scaleDuration = (duration: string, factor: number): string | null => {
  const match = /^(\d+(?:\.\d+)?)\s*(s|sec|min|h|hr|m|km)$/.exec(duration.trim().toLowerCase());
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2]!;
  if (!(value > 0)) return null;
  if (unit === 'm' || unit === 'km') {
    const meters = value * (unit === 'km' ? 1000 : 1) * factor;
    if (unit === 'km') return `${Math.max(0.1, Math.round(meters / 100) / 10)}km`;
    return `${Math.max(10, Math.round(meters / 10) * 10)}m`;
  }
  const seconds = value * (unit === 'h' || unit === 'hr' ? 3600 : unit === 'min' ? 60 : 1) * factor;
  const rounded = Math.max(5, Math.round(seconds / 5) * 5);
  return rounded % 60 === 0 ? `${rounded / 60}min` : `${rounded}s`;
};

const scaleSteps = (steps: readonly PlanStepInput[], factor: number): { steps: PlanStepInput[]; changed: boolean } => {
  let changed = false;
  const next = steps.map((step): PlanStepInput => {
    if ('repeat' in step) {
      const inner = scaleSteps(step.steps, factor);
      changed ||= inner.changed;
      return { ...step, steps: inner.steps };
    }
    if (!MAIN.includes(step.kind.trim().toLowerCase())) return step;
    const duration = scaleDuration(step.duration, factor);
    if (!duration || duration === step.duration) return step;
    changed = true;
    return { ...step, duration };
  });
  return { steps: next, changed };
};

/** 打分那天之后、同大类最早的一条在原文里是第几条；没有为 null。 */
export const nextSameSport = (document: PlanDocument, sport: string, after: string): number | null => {
  const family = sportFamily(sport);
  let best: number | null = null;
  document.workouts.forEach((workout, index) => {
    if (workout.date <= after || sportFamily(workout.sport) !== family) return;
    if (best === null || workout.date < document.workouts[best]!.date) best = index;
  });
  return best;
};

/** 写进手表描述的那一句（按当时界面语言，写进计划后就是用户自己的内容）。 */
export type LighterNote = (original: string | undefined) => string;

/**
 * 把下一次同类训练减 10%。返回改好的整份和改的是哪一条；没有可改的（没有下一次，或一步都缩不了）
 * 为 null。
 */
export const lighterNext = (
  document: PlanDocument,
  sport: string,
  after: string,
  note: LighterNote,
  factor = LIGHTER_FACTOR,
): { document: PlanDocument; workout: PlanWorkoutInput } | null => {
  const index = nextSameSport(document, sport, after);
  if (index === null) return null;
  const original = document.workouts[index]!;
  const scaled = scaleSteps(original.steps, factor);
  if (!scaled.changed) return null;
  const workout: PlanWorkoutInput = { ...original, steps: scaled.steps, description: note(original.description) };
  return { document: { ...document, workouts: document.workouts.map((w, i) => (i === index ? workout : w)) }, workout };
};

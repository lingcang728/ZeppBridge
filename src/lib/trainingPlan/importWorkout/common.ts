/**
 * 导入别处的结构化训练（.zwo、workout .fit）：共用的结果类型和书写格式小工具。
 *
 * 导入只做「翻译」，不做猜测：
 *   - 读出来的是一条训练的书写格式（和 AI 回复、界面微调写的是同一种），落到某一天以后照常由后端校验；
 *   - 文件按 %FTP / 阈值配速写的强度，要用户给出 FTP / 阈值配速才换算成瓦数 / 配速，不替用户假设；
 *   - 按心率区间、功率区间编号写的目标换算不了（区间边界在原平台），整份拒绝并说明，不悄悄丢掉；
 *   - 手表收不下的目标（踏频、坡度、阻力、泳姿）改成不设目标，并在结果里列出来让界面说一声。
 * 训练目的、要点文件里通常没有：留空，单天页红框提示用户补上（发不了就不会被当成写好的）。
 */
import type { PlanSport, PlanStepInput, PlanVariant, PlanWorkoutInput } from '../../../types/trainingPlan';

/** 一条导入的训练，还没定在哪一天。 */
export type ImportedWorkout = Omit<PlanWorkoutInput, 'date'>;

export type ImportFailure =
  /** 读不出来：不是这两种格式，或文件坏了。 */
  | 'unreadable'
  /** 是 FIT，但不是训练（是一次运动记录、课程……）。 */
  | 'not_a_workout'
  /** 手表收不下的运动（力量、走路……）。 */
  | 'unsupported_sport'
  /** 目标按区间编号或最大心率百分比写，区间边界在原平台，换算不了。 */
  | 'zone_targets'
  /** 时长按心率 / 功率 / 卡路里条件结束、或者重复组套重复组，手表的计划格式写不出来。 */
  | 'unsupported_step'
  /** 一步都没有。 */
  | 'empty';

/** 换算还缺的数：文件按 %FTP 或阈值配速写，用户给出以后再读一次。 */
export type ImportNeed = 'ftp' | 'threshold_pace';

/** 导入成功但界面该说一声的地方。 */
export type ImportNote =
  /** 文件里只给了一个功率 / 配速值，手表要一个区间：按上下 3% 写成了区间。 */
  | 'single_value_band'
  /** 手表收不下的目标（踏频、坡度、阻力、泳姿）改成了不设目标。 */
  | 'targets_dropped'
  /** 单步时长不足 10 秒的按 10 秒写（手表计划的下限）。 */
  | 'short_steps_padded';

export interface ImportOptions {
  /** 功率阈值（瓦）。 */
  ftp?: number | null;
  /** 阈值配速（秒 / 公里）。 */
  thresholdPace?: number | null;
}

export type ImportResult =
  | { ok: true; workout: ImportedWorkout; notes: ImportNote[] }
  | { ok: false; failure: ImportFailure }
  | { ok: false; need: ImportNeed };

/** 解析过程中「缺一个数」时抛出，由入口统一转成 `{ ok: false, need }`。 */
export class NeedValue extends Error {
  constructor(readonly need: ImportNeed) { super(need); }
}
/** 解析过程中遇到换算不了的写法时抛出。 */
export class Unsupported extends Error {
  constructor(readonly failure: ImportFailure) { super(failure); }
}

/** 手表计划的单步下限（和后端 MIN_STEP_SECONDS 一致）。 */
export const MIN_STEP_SECONDS = 10;
const BAND = 0.03;
const NAME_MAX = 60;
const DESCRIPTION_MAX = 1000;

export class Notes {
  private readonly set = new Set<ImportNote>();
  add(note: ImportNote) { this.set.add(note); }
  list(): ImportNote[] { return [...this.set]; }
}

export const durationText = (seconds: number, notes: Notes): string => {
  let s = Math.round(seconds);
  if (s < MIN_STEP_SECONDS) { s = MIN_STEP_SECONDS; notes.add('short_steps_padded'); }
  return s % 60 === 0 ? `${s / 60}min` : `${s}s`;
};
export const distanceText = (meters: number): string => {
  const m = Math.round(meters);
  return m % 1000 === 0 ? `${m / 1000}km` : `${m}m`;
};

const pad = (n: number) => String(n).padStart(2, '0');
const paceText = (secondsPerKm: number) => {
  const s = Math.round(secondsPerKm);
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
};

/** 功率区间（瓦）。只给一个值时按 ±3% 写成区间。 */
export const powerTarget = (low: number, high: number, notes: Notes): string => {
  let lo = Math.round(Math.min(low, high));
  let hi = Math.round(Math.max(low, high));
  if (lo === hi) { notes.add('single_value_band'); lo = Math.round(lo * (1 - BAND)); hi = Math.round(hi * (1 + BAND)); }
  return `power ${Math.max(1, lo)}-${hi}`;
};

/** 配速区间（秒 / 公里，快的在前）。只给一个值时按 ±3% 写成区间。 */
export const paceTarget = (fast: number, slow: number, notes: Notes): string => {
  let f = Math.min(fast, slow);
  let s = Math.max(fast, slow);
  if (Math.round(f) === Math.round(s)) { notes.add('single_value_band'); f *= 1 - BAND; s *= 1 + BAND; }
  return `pace ${paceText(f)}-${paceText(s)}`;
};

export const hrTarget = (low: number, high: number): string =>
  `hr ${Math.round(Math.min(low, high))}-${Math.round(Math.max(low, high))}`;

export const step = (kind: string, duration: string, target?: string, note?: string): PlanStepInput => {
  const out: Extract<PlanStepInput, { kind: string }> = { kind, duration };
  if (target) out.target = target;
  const text = note?.trim();
  if (text) out.note = text.slice(0, 120);
  return out;
};

export const workoutOf = (
  sport: PlanSport, variant: PlanVariant | undefined, name: string, description: string, steps: PlanStepInput[],
): ImportedWorkout => {
  const out: ImportedWorkout = { sport, name: name.trim().slice(0, NAME_MAX) || 'Workout', steps };
  if (variant) out.variant = variant;
  const text = description.trim();
  if (text) out.description = text.slice(0, DESCRIPTION_MAX);
  return out;
};

export const run = (parse: (notes: Notes) => ImportedWorkout): ImportResult => {
  const notes = new Notes();
  try {
    const workout = parse(notes);
    if (!workout.steps.length) return { ok: false, failure: 'empty' };
    return { ok: true, workout, notes: notes.list() };
  } catch (error) {
    if (error instanceof NeedValue) return { ok: false, need: error.need };
    if (error instanceof Unsupported) return { ok: false, failure: error.failure };
    return { ok: false, failure: 'unreadable' };
  }
};

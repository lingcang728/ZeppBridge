/**
 * 训练模板：「把这次训练存成模板再练一次」。
 *
 * 存的是一条训练的书写格式（去掉日期），和 AI 回复、界面微调、文件导入写的是同一种；放到某一天时
 * 照常进草稿、由后端校验，模板本身不绕过任何检查。另外记着导入训练时用户给的 FTP / 阈值配速，下次不用再问。
 *
 * 记在本机 localStorage（和「我的指标」一样是本机的偏好，不进库、不进导出、MCP 也看不到）；
 * 新手引导的示例沙盒里 localStorage 换成了内存的一份，演示时存的模板不会留下来。
 */
import type { PlanWorkoutInput } from '../../types/trainingPlan';

export type TemplateWorkout = Omit<PlanWorkoutInput, 'date'>;
export interface PlanTemplate { id: string; savedAt: string; workout: TemplateWorkout }

const KEY = 'zeppbridge.plan.templates.v1';
const THRESHOLDS_KEY = 'zeppbridge.plan.thresholds.v1';
/** 模板多了就不是「再练一次」而是题库了；超过时挤掉最早存的。 */
export const MAX_TEMPLATES = 30;

const isTemplate = (value: unknown): value is PlanTemplate => {
  const row = value as PlanTemplate | null;
  return !!row && typeof row.id === 'string' && typeof row.savedAt === 'string'
    && !!row.workout && typeof row.workout.name === 'string' && typeof row.workout.sport === 'string' && Array.isArray(row.workout.steps);
};

/** 存储里的原文 → 模板列表；坏的条目跳过，不让一条坏数据弄丢全部。最新的在前。 */
export const templatesFrom = (stored: string | null): PlanTemplate[] => {
  try {
    const parsed: unknown = JSON.parse(stored ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isTemplate) : [];
  } catch {
    return [];
  }
};

/** 同名同内容的不重复存：再存一次只是把它挪到最前面。 */
export const withTemplate = (list: PlanTemplate[], workout: PlanWorkoutInput | TemplateWorkout, now: Date): PlanTemplate[] => {
  const { date: _date, ...body } = workout as PlanWorkoutInput;
  const same = JSON.stringify(body);
  const rest = list.filter((row) => JSON.stringify(row.workout) !== same);
  const entry: PlanTemplate = { id: `t-${now.getTime().toString(36)}-${rest.length}`, savedAt: now.toISOString(), workout: body };
  return [entry, ...rest].slice(0, MAX_TEMPLATES);
};

export const withoutTemplate = (list: PlanTemplate[], id: string) => list.filter((row) => row.id !== id);

export const readTemplates = (): PlanTemplate[] => {
  try { return templatesFrom(window.localStorage.getItem(KEY)); } catch { return []; }
};
export const writeTemplates = (list: PlanTemplate[]): boolean => {
  try { window.localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
};

export interface Thresholds { ftp: number | null; thresholdPace: number | null }
export const readThresholds = (): Thresholds => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(THRESHOLDS_KEY) ?? '{}') as Partial<Thresholds>;
    const ok = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);
    return { ftp: ok(raw.ftp), thresholdPace: ok(raw.thresholdPace) };
  } catch {
    return { ftp: null, thresholdPace: null };
  }
};
export const writeThresholds = (value: Thresholds) => {
  try { window.localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(value)); } catch { /* 记不住下次再问 */ }
};

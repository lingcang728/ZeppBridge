/**
 * 草稿预览 → 一天一行的列表。
 *
 * 后端给的 `days` 是从今天到 `max(窗口末日, 草稿末日)` 的逐日对比；窗口是 7 天整块替换，
 * 窗口外的日子这次不发，等同步后滚动进窗口再发——界面把它们标成「窗口外」，不说成已发。
 * 纯函数，不出文案。
 */
import type { PlanDayChange, PlanDayPreview, PlanDraftPreview, PlanIssue, PlanWorkout } from '../../types/trainingPlan';

export const WINDOW_DAYS = 7;

export interface DayRow {
  rest?: import("../../types/trainingPlan").PlanRestDay | null;
  date: string;
  change: PlanDayChange;
  before: PlanWorkout[];
  after: PlanWorkout[];
  /** 这天在这次要发的 7 天窗口里。 */
  inWindow: boolean;
  isToday: boolean;
}

const addDays = (date: string, days: number): string => {
  const [year, month, day] = date.split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return moved.toISOString().slice(0, 10);
};

/** 窗口最后一天（含）。 */
export const windowEnd = (start: string): string => addDays(start, WINDOW_DAYS - 1);

export const dayRows = (preview: PlanDraftPreview, today: string): DayRow[] => {
  const end = windowEnd(preview.window.start);
  return preview.days.map((day: PlanDayPreview) => ({
    date: day.date,
    rest: day.rest,
    change: day.change,
    before: day.before,
    after: day.after,
    inWindow: day.date >= preview.window.start && day.date <= end,
    isToday: day.date === today,
  }));
};

export interface ChangeCounts { added: number; replaced: number; removed: number }

/** 只数窗口里的：窗口外的这次不会发。 */
export const changeCounts = (rows: DayRow[]): ChangeCounts => {
  const counts: ChangeCounts = { added: 0, replaced: 0, removed: 0 };
  for (const row of rows) {
    if (!row.inWindow) continue;
    if (row.change === 'added') counts.added += 1;
    else if (row.change === 'replaced') counts.replaced += 1;
    else if (row.change === 'removed') counts.removed += 1;
  }
  return counts;
};

/**
 * 这条问题挂在哪一天：问题带的是**草稿原文**里第几条训练（校验没通过的训练不会进 `check.workouts`，
 * 用后者数会错位），换成那条训练写的日期。日期格式不对的就没有日期，调用方放进「整份计划」那一栏。
 */
export const issueDate = (issue: PlanIssue, written: { date: string }[]): string | null => {
  if (issue.workout === undefined) return null;
  const date = written[issue.workout]?.date ?? null;
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
};

/** 问题里的步骤路径（`2` 或 `2.1`）→ 给人看的「第 2 步」「第 2 步 · 第 1 小步」的数字部分。 */
export const issueStepPath = (issue: PlanIssue): number[] =>
  issue.step ? issue.step.split('.').map(Number).filter((n) => Number.isFinite(n)) : [];

import { describe, expect, it } from 'vitest';
import { changeCounts, dayRows, issueDate, issueStepPath, windowEnd } from '../week';
import type { PlanDayPreview, PlanDraftPreview, PlanIssue, PlanWorkout } from '../../../types/trainingPlan';

const workout = (date: string): PlanWorkout => ({ date, sport: 'running', name: 'w', steps: [] });
const day = (date: string, change: PlanDayPreview['change'], after: PlanWorkout[] = [], before: PlanWorkout[] = []): PlanDayPreview =>
  ({ date, change, after, before });

const preview = (days: PlanDayPreview[]): PlanDraftPreview => ({
  check: { from: null, to: null, workouts: [], issues: [] },
  window: { start: '2026-10-02' },
  days,
});

describe('windowEnd', () => {
  it('窗口含首尾共 7 天：起点 + 6', () => {
    expect(windowEnd('2026-10-02')).toBe('2026-10-08');
    expect(windowEnd('2026-12-29')).toBe('2027-01-04');
  });
});

describe('dayRows', () => {
  const rows = dayRows(preview([
    day('2026-10-02', 'unchanged', [workout('2026-10-02')]),
    day('2026-10-08', 'added', [workout('2026-10-08')]),
    day('2026-10-09', 'added', [workout('2026-10-09')]),
  ]), '2026-10-02');

  it('标出哪天在窗口里、哪天是今天；窗口外的这次不会发', () => {
    expect(rows.map((row) => row.inWindow)).toEqual([true, true, false]);
    expect(rows.map((row) => row.isToday)).toEqual([true, false, false]);
  });

  it('改动只数窗口里的：窗口外那天的「新增」不算', () => {
    expect(changeCounts(rows)).toEqual({ added: 1, replaced: 0, removed: 0 });
  });
});

describe('changeCounts', () => {
  it('新增 / 替换 / 删除分开数，休息和不变不算', () => {
    const rows = dayRows(preview([
      day('2026-10-02', 'rest'),
      day('2026-10-03', 'unchanged', [workout('2026-10-03')], [workout('2026-10-03')]),
      day('2026-10-04', 'added', [workout('2026-10-04')]),
      day('2026-10-05', 'replaced', [workout('2026-10-05')], [workout('2026-10-05')]),
      day('2026-10-06', 'removed', [], [workout('2026-10-06')]),
      day('2026-10-07', 'added', [workout('2026-10-07')]),
    ]), '2026-10-02');
    expect(changeCounts(rows)).toEqual({ added: 2, replaced: 1, removed: 1 });
  });
});

describe('issue 定位', () => {
  const issue = (patch: Partial<PlanIssue>): PlanIssue => ({ severity: 'error', message: '', message_code: 'x', params: {}, ...patch });

  it('issueDate：问题挂的是草稿里第几条训练，换成它的日期；没挂训练就没有日期', () => {
    const workouts = [workout('2026-10-03'), workout('2026-10-04')];
    expect(issueDate(issue({ workout: 1 }), workouts)).toBe('2026-10-04');
    expect(issueDate(issue({ workout: 5 }), workouts)).toBeNull();
    expect(issueDate(issue({}), workouts)).toBeNull();
    // 草稿原文里日期写坏了的，也不当日期。
    expect(issueDate(issue({ workout: 0 }), [{ date: '10月3日' }])).toBeNull();
  });

  it('issueStepPath：2 → [2]，2.1 → [2, 1]，没有步骤 → []', () => {
    expect(issueStepPath(issue({ step: '2' }))).toEqual([2]);
    expect(issueStepPath(issue({ step: '2.1' }))).toEqual([2, 1]);
    expect(issueStepPath(issue({}))).toEqual([]);
  });
});

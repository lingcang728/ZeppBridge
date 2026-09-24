/**
 * 任务名自动生成（`title.ts`）的契约：`<方向或运动> · <日期>`。
 *   - 恰好一条运动：运动名 · 该次运动的开始日；
 *   - 多条运动：最早一条的头部 + 「等 N 次」尾巴，日期仍取最早那条；
 *   - 没选运动：「最近 N 天」· 今天，N = 启用窗口类别里最长的回溯（兜底 14）；
 *   - 模板在时整个头部换成模板名。
 * 测试跑在 node 环境：`detectLocale` 没有 window 可用，界面语言固定 zh，
 * 所以「最近 N 天」「等 N 次」这类中文文案可以直接断言。
 */
import { describe, expect, it } from 'vitest';
import type { Workout } from '../../../types';
import type { AiTask, AiTaskCategory } from '../../bridge/types';
import { newTaskDraft } from '../draft';
import { formatDate } from '../../format';
import { workoutDisplayLabel } from '../../workouts';
import { autoTaskTitle, recentWindowDays } from '../title';

const workout = (patch: Partial<Workout> = {}): Workout => ({
  workout_id: 'w-1',
  workout_type: 'run',
  normalized_type: 'run',
  type_source: 'numeric_mapped',
  effective_type: 'run',
  start_time: '2026-03-10T08:00:00+08:00',
  end_time: '2026-03-10T09:00:00+08:00',
  distance_meters: 10000,
  source_scope: 'device',
  ...patch,
});

const setRange = (
  task: AiTask,
  category: AiTaskCategory,
  patch: Partial<AiTask['categories'][number]>,
): AiTask => ({
  ...task,
  categories: task.categories.map((range) =>
    range.category === category ? { ...range, ...patch } : range),
});

describe('recentWindowDays', () => {
  it('默认草稿窗口全开且都是 14 天 → 14', () => {
    expect(recentWindowDays(newTaskDraft())).toBe(14);
  });

  it('取启用窗口类别里最长的回溯；禁用类别与无窗口类别不算', () => {
    let task = newTaskDraft();
    task = setRange(task, 'sleep', { days_before: 30 });
    // 禁用的窗口类别不参与取 max。
    task = setRange(task, 'heart_rate', { enabled: false, days_before: 60 });
    // 内容类别没有窗口概念，启用了也不算。
    task = setRange(task, 'personal_note', { enabled: true, days_before: 99 });
    expect(recentWindowDays(task)).toBe(30);
  });

  it('窗口类别全关 → 兜底 14', () => {
    let task = newTaskDraft();
    for (const range of task.categories) {
      task = setRange(task, range.category, { enabled: false });
    }
    expect(recentWindowDays(task)).toBe(14);
  });
});

describe('autoTaskTitle', () => {
  it('恰好一条运动：`运动名 · 开始日`', () => {
    const run = workout();
    expect(autoTaskTitle(newTaskDraft(), [run], null)).toBe(
      `${workoutDisplayLabel(run)} · ${formatDate(run.start_time)}`,
    );
  });

  it('多条运动：头部是最早那条 + 「等 N 次」，日期取最早开始日', () => {
    const early = workout({ workout_id: 'w-early', start_time: '2026-03-08T07:00:00+08:00' });
    const mid = workout({ workout_id: 'w-mid' });
    const late = workout({ workout_id: 'w-late', start_time: '2026-03-12T08:00:00+08:00' });
    // 传入顺序打乱，标题仍按 start_time 挑最早那条。
    const title = autoTaskTitle(newTaskDraft(), [mid, late, early], null);
    expect(title.startsWith(workoutDisplayLabel(early))).toBe(true);
    expect(title.endsWith(`· ${formatDate(early.start_time)}`)).toBe(true);
    expect(title).toContain('等 3 次');
    // 不是光秃秃的单条格式——「等 N 次」尾巴必须在。
    expect(title).not.toBe(`${workoutDisplayLabel(early)} · ${formatDate(early.start_time)}`);
  });

  it('没选运动：「最近 N 天 · 今天」，N 跟启用窗口走', () => {
    const now = new Date('2026-09-24T12:00:00+08:00');
    expect(autoTaskTitle(newTaskDraft(), [], null, now)).toBe(
      `最近 14 天 · ${formatDate(now.toISOString())}`,
    );
    const task = setRange(newTaskDraft(), 'sleep', { days_before: 30 });
    const title = autoTaskTitle(task, [], null, now);
    expect(title.startsWith('最近 30 天')).toBe(true);
    expect(title.endsWith(`· ${formatDate(now.toISOString())}`)).toBe(true);
  });

  it('选了模板：整个头部换成模板名，日期规则不变', () => {
    const run = workout();
    expect(autoTaskTitle(newTaskDraft(), [run], '恢复跑')).toBe(
      `恢复跑 · ${formatDate(run.start_time)}`,
    );
    const now = new Date('2026-09-24T12:00:00+08:00');
    const title = autoTaskTitle(newTaskDraft(), [], '恢复跑', now);
    expect(title.startsWith('恢复跑')).toBe(true);
    expect(title.endsWith(`· ${formatDate(now.toISOString())}`)).toBe(true);
  });
});

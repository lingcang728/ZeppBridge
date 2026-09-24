import { describe, expect, it } from 'vitest';
import {
  categoryCoverage,
  categoryWindowForWorkout,
  categoryWindows,
  coverageRows,
  formatBytes,
} from '../coverage';
import { localDateString } from '../../format';
import type { AiTaskCoverage, AiTaskWorkoutBrief } from '../../bridge/types';

const brief = (id: string, title: string): AiTaskWorkoutBrief => ({
  workout_id: id, workout_type: title, start_time: '2026-03-10T08:00:00+08:00',
  end_time: '2026-03-10T09:00:00+08:00', start_date: '2026-03-10',
  distance_meters: 10000, calories: 600, avg_hr: 140, max_hr: 165,
});

const coverage = (patch: Partial<AiTaskCoverage> = {}): AiTaskCoverage => ({
  category: 'sleep',
  workout_id: 'w-1',
  start_date: '2026-03-01',
  end_date: '2026-03-10',
  days_in_range: 10,
  days_with_data: 7,
  sources: ['zepp'],
  units: { score: 'pt', score2: 'pt' },
  missing: false,
  ...patch,
});

describe('categoryWindowForWorkout', () => {
  // 用本地日期断言：窗口以运动开始日的本地日期为锚（A7 P4）。
  it('含运动当天：起点 = 本地开始日 − days_before，终点 = 开始日', () => {
    const start = '2026-03-10T08:00:00+08:00';
    const day = localDateString(new Date(start));
    const win = categoryWindowForWorkout(start, { days_before: 14, include_workout_day: true });
    const expectedStart = new Date(start);
    expectedStart.setDate(expectedStart.getDate() - 14);
    expect(win).toEqual({ start: localDateString(expectedStart), end: day });
  });

  it('不含运动当天：终点收到开始日的前一天', () => {
    const start = '2026-03-10T08:00:00+08:00';
    const win = categoryWindowForWorkout(start, { days_before: 7, include_workout_day: false });
    const expectedEnd = new Date(start);
    expectedEnd.setDate(expectedEnd.getDate() - 1);
    const expectedStart = new Date(start);
    expectedStart.setDate(expectedStart.getDate() - 7);
    expect(win?.end).toBe(localDateString(expectedEnd));
    expect(win?.start).toBe(localDateString(expectedStart));
  });

  it('无效时间不编窗口', () => {
    expect(categoryWindowForWorkout('not-a-date', { days_before: 7, include_workout_day: true })).toBeNull();
  });
});

describe('categoryWindows', () => {
  it('多条运动各自有窗口，按开始日排序；找不到的运动跳过', () => {
    const workouts = [
      { id: 'w-late', start_time: '2026-03-20T08:00:00+08:00' },
      { id: 'w-early', start_time: '2026-03-01T08:00:00+08:00' },
    ];
    const wins = categoryWindows(
      ['w-late', 'w-early', 'w-gone'],
      workouts,
      { days_before: 7, include_workout_day: true },
    );
    expect(wins.map((win) => win.workoutId)).toEqual(['w-early', 'w-late']);
  });
});

describe('coverageRows', () => {
  it('每条 coverage 一行：类别名、运动名、窗口、覆盖计数、去重来源/单位', () => {
    const rows = coverageRows(
      [coverage(), coverage({ category: 'heart_rate', workout_id: null, missing: true })],
      [brief('w-1', '晨跑')],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].workoutTitle).toBe('晨跑');
    expect(rows[0].units).toEqual(['pt']);
    expect(rows[1].workoutTitle).toBeNull();
    expect(rows[1].missing).toBe(true);
  });

  it('运动名对不上时给 null，界面自己兜底', () => {
    const rows = coverageRows([coverage({ workout_id: 'w-x' })], []);
    expect(rows[0].workoutTitle).toBeNull();
  });
});

describe('categoryCoverage', () => {
  const preview = (rows: AiTaskCoverage[]) => ({
    task_id: 'draft', workouts: [], coverage: rows, attachments: [], estimated_bytes: 0, warnings: [],
  });

  it('多窗口取合并行（workout_id=null），单窗口取唯一行；没有就 null', () => {
    expect(categoryCoverage(null, 'sleep')).toBeNull();
    expect(categoryCoverage(preview([]), 'sleep')).toBeNull();
    const merged = categoryCoverage(preview([
      coverage({ days_with_data: 3 }),
      coverage({ workout_id: null, days_with_data: 9, metric_days: { score: 9 } }),
    ]), 'sleep');
    expect(merged?.daysWithData).toBe(9);
    expect(merged?.metricDays).toEqual({ score: 9 });
    expect(merged?.metrics).toEqual(['score', 'score2']);
  });

  it('来源范围和单位按界面语言显示，不露内部码', () => {
    const [row] = coverageRows([coverage({ sources: ['user_fused'], units: { a: 'count' } })], []);
    expect(row.sources[0]).not.toBe('user_fused');
    expect(row.units[0]).not.toBe('count');
  });
});

describe('formatBytes', () => {
  it('分级格式化；null/非法值给占位符', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.00 MB');
  });
});

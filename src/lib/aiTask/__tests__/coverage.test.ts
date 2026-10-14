import { describe, expect, it } from 'vitest';
import {
  categoryCoverage,
  coverageRows,
} from '../coverage';
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

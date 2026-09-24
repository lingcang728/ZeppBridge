/**
 * CoverageDetails 的 SSR 契约：一行 = 一个覆盖窗口（类别 × 窗口），
 * 缺失行打 is-missing；类别名/来源/单位在 coverageRows 里就本地化好了。
 * 组件只依赖纯函数层（coverage.ts → labels/metrics/i18n），无需 mock。
 */
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import CoverageDetails from '../CoverageDetails.vue';
import type { AiTaskCoverage, AiTaskPreview, AiTaskWorkoutBrief } from '../../../lib/bridge/types';

const coverage = (patch: Partial<AiTaskCoverage> = {}): AiTaskCoverage => ({
  category: 'sleep',
  workout_id: null,
  start_date: '2026-09-01',
  end_date: '2026-09-14',
  days_in_range: 14,
  days_with_data: 13,
  sources: ['user_fused'],
  units: { duration_minutes: 'min', score: 'score' },
  missing: false,
  ...patch,
});

const brief: AiTaskWorkoutBrief = {
  workout_id: 'w-1',
  workout_type: 'running',
  start_time: '2026-09-20T07:30:00Z',
  end_time: '2026-09-20T08:30:00Z',
  start_date: '2026-09-20',
  distance_meters: 5000,
  calories: 300,
  avg_hr: 140,
  max_hr: 160,
};

const preview = (rows: AiTaskCoverage[]): AiTaskPreview => ({
  task_id: 't-1',
  workouts: [brief],
  coverage: rows,
  attachments: [],
  estimated_bytes: 2048,
  warnings: [],
});

const count = (html: string, re: RegExp): number => (html.match(re) ?? []).length;

describe('CoverageDetails', () => {
  const rows = [
    coverage(),
    coverage({
      category: 'recovery',
      days_with_data: 0,
      sources: [],
      units: { resting_hr: 'count' },
      missing: true,
    }),
    coverage({
      category: 'workout',
      workout_id: 'w-1',
      start_date: '2026-09-06',
      end_date: '2026-09-20',
      days_in_range: 15,
      days_with_data: 15,
      sources: ['device'],
      units: { distance_meters: 'm' },
    }),
  ];

  it('默认收起的 details + summary，表里 每行覆盖 + 1 行表头', async () => {
    const html = await renderToString(createSSRApp(CoverageDetails, { preview: preview(rows) }));
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    // 2048 B → 2.0 KB 写进摘要。
    expect(html).toContain('2.0 KB');
    expect(count(html, /<tr[\s>]/g)).toBe(rows.length + 1);
  });

  it('缺失行打 is-missing；类别名、天数、来源、单位如实渲染', async () => {
    const html = await renderToString(createSSRApp(CoverageDetails, { preview: preview(rows) }));
    expect(count(html, /class="is-missing"/g)).toBe(1);
    // 本地化类别名（默认 zh）。
    expect(html).toContain('睡眠');
    expect(html).toContain('恢复状态');
    // 天数列 have/total。
    expect(html).toContain('13/14');
    expect(html).toContain('0/14');
    // 来源与单位已被本地化；空来源给占位符。
    expect(html).toContain('用户融合');
    expect(html).toContain('单设备');
    expect(html).toContain('分钟');
    expect(html).toContain('—');
  });

  it('运动窗口行带运动名（workouts brief 提供 workout_type）', async () => {
    const html = await renderToString(createSSRApp(CoverageDetails, { preview: preview(rows) }));
    // workoutLabel('running') → 目录无此 key，回落「跑步」。
    expect(html).toContain('跑步');
  });

  it('空覆盖：只有表头', async () => {
    const html = await renderToString(createSSRApp(CoverageDetails, { preview: preview([]) }));
    expect(count(html, /<tr[\s>]/g)).toBe(1);
  });
});

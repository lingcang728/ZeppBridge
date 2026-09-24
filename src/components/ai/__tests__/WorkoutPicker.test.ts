/**
 * WorkoutPicker 的 SSR 契约：空库提示、未选提示、行选中态、按天分组。
 * 组件不碰 backend（只依赖 format/workouts/i18n 纯函数层），无需 mock。
 */
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import WorkoutPicker from '../WorkoutPicker.vue';
import type { Workout } from '../../../types';
import { formatDistance } from '../../../lib/format';
import { workoutDisplayLabel } from '../../../lib/workouts';

const workout = (patch: Partial<Workout> = {}): Workout => ({
  workout_id: 'w-1',
  workout_type: 'running',
  normalized_type: 'running',
  type_source: 'numeric_mapped',
  effective_type: 'running',
  start_time: '2026-09-20T07:30:00+08:00',
  end_time: '2026-09-20T08:30:00+08:00',
  distance_meters: 5000,
  avg_hr: 140,
  source_scope: 'user_fused',
  ...patch,
});

const render = (props: { workouts: Workout[]; selectedIds: string[]; recentDays: number }) =>
  renderToString(createSSRApp(WorkoutPicker, props));

const count = (html: string, re: RegExp): number => (html.match(re) ?? []).length;

describe('WorkoutPicker', () => {
  it('空运动库：提示没有记录，不渲染 listbox 和任何行', async () => {
    const html = await render({ workouts: [], selectedIds: [], recentDays: 14 });
    expect(html).toContain('本机还没有运动记录');
    expect(html).not.toContain('role="listbox"');
    expect(html).not.toContain('role="option"');
    // 「未选运动按最近 N 天」与「库里没有记录」两条 ai-note 同时在场。
    expect(count(html, /class="ai-note"/g)).toBe(2);
  });

  it('没选运动：ai-note 说明按最近 N 天分析，所有行未选中', async () => {
    const html = await render({ workouts: [workout()], selectedIds: [], recentDays: 7 });
    expect(html).toContain('class="ai-note"');
    expect(html).toContain('没选运动');
    expect(html).toContain('最近 7 天');
    expect(html).toContain('role="listbox"');
    expect(count(html, /role="option"/g)).toBe(1);
    expect(html).not.toContain('aria-selected="true"');
    expect(html).not.toContain('class="row is-on"');
    expect(html).not.toContain('class="chosen"');
  });

  it('选中行：aria-selected + is-on，同时出现在已选 chip 区', async () => {
    const w1 = workout();
    const w2 = workout({
      workout_id: 'w-2',
      start_time: '2026-09-20T18:00:00+08:00',
      end_time: '2026-09-20T19:00:00+08:00',
    });
    const html = await render({ workouts: [w1, w2], selectedIds: ['w-1'], recentDays: 14 });
    expect(count(html, /role="option"/g)).toBe(2);
    expect(count(html, /aria-selected="true"/g)).toBe(1);
    expect(count(html, /aria-selected="false"/g)).toBe(1);
    expect(html).toContain('class="row is-on"');
    // 行内显示名与事实串；数值用组件同一个格式化函数核对，不抄字面量。
    expect(html).toContain(workoutDisplayLabel(w1));
    expect(html).toContain('row-facts');
    expect(html).toContain(formatDistance(5000));
    // 已选 chip 区。
    expect(html).toContain('class="chosen"');
    expect(html).toContain('已选 1 次');
  });

  it('同一天的运动归进一个日期头；不同的天各自分组', async () => {
    const day1a = workout({ workout_id: 'a1', start_time: '2026-09-18T07:00:00+08:00', end_time: '2026-09-18T08:00:00+08:00' });
    const day1b = workout({ workout_id: 'a2', start_time: '2026-09-18T18:00:00+08:00', end_time: '2026-09-18T19:00:00+08:00' });
    const day2 = workout({ workout_id: 'b1', start_time: '2026-09-20T07:00:00+08:00', end_time: '2026-09-20T08:00:00+08:00' });
    const html = await render({ workouts: [day1a, day1b, day2], selectedIds: [], recentDays: 14 });
    expect(count(html, /class="day"/g)).toBe(2);
    expect(count(html, /role="option"/g)).toBe(3);
  });
});

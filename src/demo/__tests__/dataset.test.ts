import { describe, expect, it } from 'vitest';
import { buildDemoData, metricSeries, sleepStageSlices } from '../dataset';
import { demoPreview, demoTemplates } from '../ai';
import { createDemoPlan } from '../plan';
import { dayKey, at } from '../rng';
import { newTaskDraft } from '../../lib/aiTask/draft';

const NOW = new Date(2026, 9, 2, 12, 0, 0);

describe('演示数据集', () => {
  const data = buildDemoData(NOW);

  it('同一个"今天"永远生成同一份数据（落地页每次打开、每次截图都一样）', () => {
    const again = buildDemoData(NOW);
    expect(again.sleeps.map((s) => s.sleep_id)).toEqual(data.sleeps.map((s) => s.sleep_id));
    expect(again.workouts[0].workout_id).toBe(data.workouts[0].workout_id);
    expect(again.heart.length).toBe(data.heart.length);
  });

  it('睡眠：几晚没戴表如实缺着；各期之和等于总时长；最新一晚在今天醒来', () => {
    expect(data.sleeps.length).toBeLessThan(90);
    expect(data.sleepDays.has(dayKey(at(NOW, -3)))).toBe(false);
    for (const s of data.sleeps) {
      const sum = (s.deep_minutes ?? 0) + (s.light_minutes ?? 0) + (s.rem_minutes ?? 0) + (s.awake_minutes ?? 0);
      expect(sum).toBe(s.duration_minutes);
      expect(s.score).toBeGreaterThanOrEqual(61);
      expect(s.score).toBeLessThanOrEqual(94);
    }
    expect(dayKey(new Date(data.sleeps[0].end_time))).toBe(dayKey(NOW));
  });

  it('分期序列首尾相接，从入睡那一刻开始', () => {
    const slices = sleepStageSlices(data.sleeps[1]);
    expect(slices.length).toBeGreaterThan(4);
    for (let i = 1; i < slices.length; i += 1) expect(slices[i].start_time).toBe(slices[i - 1].end_time);
    expect(slices[0].start_time).toBe(data.sleeps[1].start_time);
    expect(new Date(slices[slices.length - 1].end_time).getTime()).toBeLessThanOrEqual(new Date(data.sleeps[1].end_time).getTime());
  });

  it('运动：没有未来的，最新在前，没有 GPS（所以不会画地图）', () => {
    expect(data.workouts.length).toBeGreaterThan(20);
    for (const w of data.workouts) {
      expect(new Date(w.end_time).getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(w.gps_available).toBe(false);
    }
    const starts = data.workouts.map((w) => w.start_time);
    expect([...starts].sort().reverse()).toEqual(starts);
  });

  it('心率：昨天下午有一段没戴表（缺口不补）', () => {
    const gap = data.heart.filter((p) => {
      const t = new Date(p.timestamp);
      return dayKey(t) === dayKey(at(NOW, -1)) && t.getHours() === 15;
    });
    expect(gap).toHaveLength(0);
    expect(data.heart.length).toBeGreaterThan(1000);
  });

  it('日指标：只返回要的指标，窗口里缺的天少一个点，不补 0；没有体重这一项', () => {
    const series = metricSeries(data, 30, ['sleep_score', 'weight']);
    expect(series.map((s) => s.metric)).toEqual(['sleep_score']);
    const [score] = series;
    expect(score.days_with_data).toBe(score.points.length);
    expect(score.days_with_data).toBeLessThanOrEqual(30);
    expect(score.points.every((p) => p.value > 0)).toBe(true);
  });

  it('概览「我的指标」预置的四项都有数据可取', () => {
    const names = metricSeries(data, 30, ['resting_hr', 'hrv_rmssd', 'sleep_score', 'steps']).map((s) => s.metric);
    expect(names.sort()).toEqual(['hrv_rmssd', 'resting_hr', 'sleep_score', 'steps']);
  });
});

describe('演示的 AI 预览', () => {
  const data = buildDemoData(NOW);

  it('覆盖是真数出来的：关掉一类，它的数据包就不在了；身体状态一天都没有', () => {
    const task = newTaskDraft();
    const full = demoPreview(data, task);
    const body = full.coverage.find((row) => row.category === 'body');
    expect(body?.days_with_data).toBe(0);
    expect(body?.covered_dates).toEqual([]);
    const sleepRow = full.coverage.find((row) => row.category === 'sleep');
    expect(sleepRow?.covered_dates?.length).toBe(sleepRow?.days_with_data);
    const off = demoPreview(data, { ...task, categories: task.categories.map((c) => (c.category === 'sleep' ? { ...c, enabled: false } : c)) });
    expect(off.coverage.some((row) => row.category === 'sleep')).toBe(false);
    expect(off.estimated_bytes).toBeLessThan(full.estimated_bytes);
  });

  it('内置方向齐全，ID 与界面分组一致', () => {
    expect(demoTemplates().map((t) => t.id)).toEqual(
      expect.arrayContaining(['sleep_review', 'recovery_trend', 'week_review', 'recovery_run', 'long_run_compare', 'hr_drift']),
    );
  });
});

describe('演示的训练计划', () => {
  it('草稿预览里有新增 / 替换 / 删除 / 不变，窗口外还有一天；发出去以后草稿关闭、账本更新', () => {
    const plan = createDemoPlan(NOW);
    const kinds = new Set(plan.preview().days.map((d) => d.change));
    expect(kinds).toEqual(new Set(['rest', 'unchanged', 'added', 'replaced', 'removed']));
    expect(plan.state().drafts).toHaveLength(1);
    const result = plan.publish({ kind: 'draft', id: 'demo-draft' }, false);
    expect(result.record?.state).toBe('sent');
    expect(plan.state().drafts).toHaveLength(0);
    expect(plan.state().sent.length).toBeGreaterThan(3);
  });
});

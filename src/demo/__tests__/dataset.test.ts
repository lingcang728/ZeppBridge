import { describe, expect, it } from 'vitest';
import { buildDemoData, DAYS, metricSeries, sleepStageSlices } from '../dataset';
import { demoWorkoutSeries, demoTrainingBalance } from '../details';
import { demoCapabilities, demoLedger } from '../facts';
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
    expect(data.sleeps.length).toBe(DAYS - 6);
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
    expect(slices[slices.length - 1].end_time).toBe(data.sleeps[1].end_time);
    for (const stage of ['deep', 'light', 'rem', 'awake'] as const) {
      const minutes = slices.filter(s => s.stage === stage).reduce((sum, s) => sum + (Date.parse(s.end_time) - Date.parse(s.start_time)) / 60000, 0);
      expect(minutes).toBe(data.sleeps[1][`${stage}_minutes`]);
    }
  });

  it('运动：没有未来的，最新在前，既有合成轨迹也有真实的缺测示例', () => {
    expect(data.workouts.length).toBeGreaterThan(20);
    for (const w of data.workouts) {
      expect(new Date(w.end_time).getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
    const starts = data.workouts.map((w) => w.start_time);
    expect([...starts].sort().reverse()).toEqual(starts);
    expect(data.workouts.some(w => w.gps_available)).toBe(true);
    expect(data.workouts.some(w => !w.gps_available)).toBe(true);
  });

  it('心率：昨天下午有一段没戴表（缺口不补）', () => {
    const gap = data.heart.filter((p) => {
      const t = new Date(p.timestamp);
      return dayKey(t) === dayKey(at(NOW, -1)) && t.getHours() === 15;
    });
    expect(gap).toHaveLength(0);
    expect(data.heart.length).toBeGreaterThan(1000);
  });

  it('日指标：身体记录有数据，缺测日不补 0', () => {
    const series = metricSeries(data, 30, ['sleep_score', 'weight']);
    expect(series.map((s) => s.metric)).toEqual(['sleep_score', 'weight']);
    const [score] = series;
    expect(score.days_with_data).toBe(score.points.length);
    expect(score.days_with_data).toBeLessThanOrEqual(30);
    expect(score.points.every((p) => p.value > 0)).toBe(true);
  });

  it('运动详情分段累计与总距离和总时长相符，步幅对应总步数', () => {
    for (const workout of data.workouts.slice(0, 12)) {
      const series = demoWorkoutSeries(workout);
      expect(series.splits.reduce((s, split) => s + split.distance_m, 0)).toBe(workout.distance_meters);
      expect(series.splits.reduce((s, split) => s + split.duration_seconds, 0)).toBeCloseTo(workout.moving_seconds!, 0);
      if (workout.total_steps) expect(workout.avg_stride_cm! * workout.total_steps / 100).toBeCloseTo(workout.distance_meters!, -1);
      expect(series.samples.length).toBe(workout.sample_count);
      expect(series.route.length > 0).toBe(workout.gps_available);
    }
  });

  it('训练负荷的日值为七天滚动和，平衡报告从运动记录计算且不重复累计', () => {
    const report = demoTrainingBalance(data, 7);
    for (const day of report) {
      const expected = data.workouts.filter(w => { const diff = (new Date(day.date + 'T12:00:00').getTime() - new Date(dayKey(new Date(w.start_time)) + 'T12:00:00').getTime()) / 86400000; return diff >= 0 && diff < 7; }).reduce((s,w) => s + w.training_load!, 0);
      expect(day.acute_7d).toBe(expected);
      expect(data.metrics.training_load.find(p => p.date === day.date)?.value).toBe(expected);
    }
  });

  it('概览「我的指标」预置的四项都有数据可取', () => {
    const names = metricSeries(data, 30, ['resting_hr', 'hrv_rmssd', 'sleep_score', 'steps']).map((s) => s.metric);
    expect(names.sort()).toEqual(['hrv_rmssd', 'resting_hr', 'sleep_score', 'steps']);
  });

  it('数据能力与同步账本从同一份记录计算，保持数量一致', () => {
    const sleep = demoCapabilities(data).items.find(item => item.stream === 'sleep')!;
    expect(sleep.records).toBe(data.sleeps.filter(s => dayKey(new Date(s.end_time)) >= dayKey(at(NOW, -29))).length);
    const ledger = demoLedger(data);
    expect(ledger.requested_from).toBe(dayKey(at(NOW, 1 - DAYS)));
    expect(ledger.streams.find(s => s.stream === 'heart_rate')?.records).toBe(data.heart.length);
    expect(ledger.streams.find(s => s.stream === 'workouts')?.records).toBe(data.workouts.length);
  });
});

describe('演示的 AI 预览', () => {
  const data = buildDemoData(NOW);

  it('覆盖是真数出来的：关掉一类，它的数据包就不在了；身体状态有部分采样', () => {
    const task = newTaskDraft();
    const full = demoPreview(data, task);
    const body = full.coverage.find((row) => row.category === 'body');
    expect(body?.days_with_data).toBeGreaterThan(0);
    expect(body?.covered_dates?.length).toBe(body?.days_with_data);
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
  it('修改后的计划能够保存、发布、撤回，清空前需要确认', () => {
    const plan = createDemoPlan(NOW), original = structuredClone(plan.state().sent);
    const document = structuredClone(plan.state().drafts[0].document);
    document.workouts[0].name = 'Edited workout';
    document.workouts[0].steps = [{ kind: 'active', duration: '20min', target: 'hr 120-140' }];
    plan.updateDraft(document);
    expect(plan.preview().check.workouts[0].steps[0]).toMatchObject({ length: { type: 'time', seconds: 1200 } });
    plan.publish({ kind: 'draft', id: 'demo-draft' }, false);
    expect(plan.state().sent[0].name).toBe('Edited workout');
    plan.publish({ kind: 'undo' }, false);
    expect(plan.state().sent).toEqual(original);
    expect(plan.publish({ kind: 'clear' }, false).outcome.outcome).toBe('needs_clear_confirmation');
    expect(plan.state().sent).toEqual(original);
    plan.publish({ kind: 'clear' }, true);
    expect(plan.state().sent).toEqual([]);
    expect(createDemoPlan(NOW).state().sent).toEqual(original);
  });
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

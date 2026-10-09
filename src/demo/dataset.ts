/**
 * 演示数据集：同一位虚构用户一整年的睡眠、运动、身体指标和心率。
 *
 * 全部合成：种子固定，日期由「今天」往回推，所以任何时候打开都像刚同步过一样新，
 * 也绝不会用到任何真人的健康数据。刻意留了几处缺口——有几晚没戴表、一个下午没测到心率——
 * 因为 ZeppBridge 的特点之一就是「没测到就是没测到」，演示里也要看得见。
 */
import { at, clamp, dayKey, iso, makeRng, round, type Rng } from './rng';
import type { MetricSeries, MetricSeriesPoint, SleepSession, SleepStageSlice, Workout } from '../types';

export const DEMO_DEVICE_ID = 'DEMO0000BAND01';
export const DAYS = 365;
export const DEMO_SEED = 20261002;

export interface HeartPoint { timestamp: string; value: number }

export interface DemoData {
  now: Date;
  sleeps: SleepSession[];
  workouts: Workout[];
  metrics: Record<string, MetricSeriesPoint[]>;
  heart: HeartPoint[];
  stress: HeartPoint[];
  /** 有睡眠记录的那一天（醒来的日期）。 */
  sleepDays: Set<string>;
  workoutDays: Set<string>;
}

/** 这几晚没戴表：下标 0 是昨晚。 */
const MISSED_NIGHTS = new Set([3, 9, 31, 47, 62, 80]);

const METRIC_UNITS: Record<string, string> = {
  readiness: 'score', stress: 'score', spo2: '%', vo2max: 'ml/kg/min', training_load: 'load', resting_hr: 'bpm',
  hrv: 'ms', hrv_rmssd: 'ms', steps: '步', sleep_score: 'score', respiratory_rate: '次/分',
  weight: 'kg', bmi: 'kg/m²', body_fat_rate: '%', body_water_rate: '%', muscle_mass: 'kg',
  bone_mass: 'kg', visceral_fat: 'level', bmr: 'kcal', height: 'cm', protein_rate: '%',
  active_calories: 'kcal', active_minutes: 'min', pai_daily: 'score', pai_total: 'score',
  lactate_threshold_hr: 'bpm', lactate_threshold_pace: '秒/公里', sleep_hrv: 'ms',
};

/* —— 睡眠 —— */
const buildSleeps = (now: Date, rng: Rng): SleepSession[] => {
  const sleeps: SleepSession[] = [];
  for (let night = 0; night < DAYS; night += 1) {
    if (MISSED_NIGHTS.has(night)) continue;
    const wake = at(now, -night, 6, 0);
    wake.setMinutes(30 + rng.int(-28, 38));
    const weekend = [0, 6].includes(wake.getDay());
    const duration = Math.round(clamp(rng.between(6.6, 7.9) * 60 + (weekend ? 24 : 0), 365, 540));
    const start = new Date(wake.getTime() - duration * 60_000);
    const deep = Math.round(duration * rng.between(0.16, 0.22));
    const rem = Math.round(duration * rng.between(0.19, 0.25));
    const awake = rng.int(3, 20);
    const light = duration - deep - rem - awake;
    const score = Math.round(clamp(60 + (duration - 360) / 6 + (deep / duration - 0.17) * 140 + rng.between(-4, 4), 61, 94));
    const startSec = Math.floor(start.getTime() / 1000);
    const endSec = Math.floor(wake.getTime() / 1000);
    sleeps.push({
      sleep_id: `band:${DEMO_DEVICE_ID}:${startSec}:${endSec}`,
      start_time: iso(start),
      end_time: iso(wake),
      score,
      duration_minutes: duration,
      deep_minutes: deep,
      light_minutes: light,
      rem_minutes: rem,
      awake_minutes: awake,
      wake_count: rng.int(0, 4),
      source_scope: 'device',
      device_id: DEMO_DEVICE_ID,
      synced_at: iso(night === 0 ? new Date(now.getTime() - 8 * 60_000) : new Date(wake.getTime() + 25 * 60_000)),
      time_in_bed_minutes: null,
      stages: [],
    });
  }
  return sleeps;
};

/** 一晚的分期序列：浅睡 → 深睡 → 浅睡 → REM 的循环，总长正好等于这一晚的各期之和。 */
export const sleepStageSlices = (session: SleepSession): SleepStageSlice[] => {
  const rng = makeRng(Number(session.sleep_id.split(':')[2]) % 100_000);
  let remaining = {
    deep: session.deep_minutes ?? 0,
    rem: session.rem_minutes ?? 0,
    light: session.light_minutes ?? 0,
    awake: session.awake_minutes ?? 0,
  };
  const order = ['light', 'deep', 'light', 'rem', 'light', 'awake'] as const;
  const slices: SleepStageSlice[] = [];
  let cursor = new Date(session.start_time).getTime();
  const end = new Date(session.end_time).getTime();
  for (let index = 0; cursor < end - 30_000 && Object.values(remaining).some(value => value > 0); index += 1) {
    const stage = order[index % order.length];
    const left = remaining[stage];
    const share = stage === 'awake' ? 1 : (index < 12 ? 0.34 : 1) * rng.between(0.8, 1.1);
    if (left <= 0) continue;
    const minutes = Math.min(left, Math.max(stage === 'awake' ? 1 : 4, Math.round(left * share * 0.5)));
    const length = Math.min(minutes * 60_000, end - cursor);
    slices.push({ stage, start_time: new Date(cursor).toISOString(), end_time: new Date(cursor + length).toISOString() });
    remaining = { ...remaining, [stage]: Math.max(0, left - Math.round(length / 60_000)) };
    cursor += length;
  }
  return slices;
};

/* —— 运动 —— */
interface Plan { kind: 'running' | 'cycling' | 'walking'; km: [number, number]; pace: [number, number]; hr: [number, number]; load: number; zepp: number }
const WEEK: Record<number, Plan | null> = {
  0: { kind: 'running', km: [10, 14], pace: [345, 375], hr: [143, 152], load: 12, zepp: 1 },
  1: { kind: 'running', km: [5, 7], pace: [350, 380], hr: [136, 146], load: 8, zepp: 1 },
  2: null,
  3: { kind: 'running', km: [6, 8], pace: [300, 325], hr: [152, 162], load: 14, zepp: 1 },
  4: { kind: 'running', km: [5, 6], pace: [355, 385], hr: [134, 144], load: 7, zepp: 1 },
  5: { kind: 'cycling', km: [22, 34], pace: [125, 150], hr: [128, 140], load: 6, zepp: 6 },
  6: { kind: 'walking', km: [3, 5], pace: [650, 720], hr: [96, 108], load: 2, zepp: 52 },
};

const buildWorkouts = (now: Date, rng: Rng): Workout[] => {
  const workouts: Workout[] = [];
  for (let back = 0; back < DAYS; back += 1) {
    const day = at(now, -back);
    const plan = WEEK[day.getDay()];
    if (!plan || rng.chance(0.13)) continue;
    const evening = plan.kind === 'running' && day.getDay() === 3;
    const start = at(now, -back, evening ? 18 : 7, 0);
    start.setMinutes(evening ? 20 + rng.int(-15, 25) : 5 + rng.int(-5, 40));
    const km = round(rng.between(plan.km[0], plan.km[1]), 2);
    const seconds = Math.round(km * rng.between(plan.pace[0], plan.pace[1]));
    const end = new Date(start.getTime() + seconds * 1000);
    if (end > now) continue;
    const avg = Math.round(rng.between(plan.hr[0], plan.hr[1]));
    const running = plan.kind === 'running';
    const cadence = running ? Math.round(rng.between(168, 177)) : null;
    const steps = cadence ? Math.round(seconds * cadence / 60) : null;
    workouts.push({
      workout_id: String(Math.floor(start.getTime() / 1000)),
      workout_type: plan.kind,
      normalized_type: plan.kind,
      type_source: 'numeric_mapped',
      user_override: null,
      effective_type: plan.kind,
      custom_label: null,
      zepp_type: plan.zepp,
      zepp_source: null,
      start_time: iso(start),
      end_time: iso(end),
      distance_meters: Math.round(km * 1000),
      moving_seconds: seconds,
      calories: Math.round(km * (running ? 64 : plan.kind === 'cycling' ? 26 : 48)),
      avg_hr: avg,
      max_hr: avg + Math.round(rng.between(18, 30)),
      min_hr: avg - 28,
      elevation_gain_m: Math.round(km * 6),
      elevation_loss_m: Math.round(km * 6),
      max_altitude_m: 52,
      min_altitude_m: 24,
      training_load: Math.round(km * plan.load * rng.between(0.9, 1.1)),
      training_effect: running ? round(rng.between(2.4, 4.1), 1) : null,
      anaerobic_training_effect: running ? round(rng.between(0.2, 1.6), 1) : null,
      rpe: running ? 6 : 3,
      avg_cadence_spm: cadence,
      max_cadence_spm: running ? Math.round(rng.between(182, 192)) : null,
      avg_stride_cm: steps ? round(km * 100000 / steps, 2) : null,
      total_steps: steps,
      gps_available: back % 17 !== 3,
      sample_count: Math.floor(seconds / 10) + 1,
      source_scope: 'device',
      device_id: DEMO_DEVICE_ID,
      synced_at: iso(new Date(end.getTime() + 15 * 60_000)),
      hr_zones: [],
    });
  }
  return workouts.sort((a, b) => b.start_time.localeCompare(a.start_time));
};

/* —— 日指标 —— */
const buildMetrics = (now: Date, rng: Rng, sleeps: SleepSession[], workouts: Workout[]): Record<string, MetricSeriesPoint[]> => {
  const sleepScore = new Map(sleeps.map((s) => [dayKey(new Date(s.end_time)), s.score ?? 0]));
  const loadByDay = new Map<string, number>();
  for (const w of workouts) loadByDay.set(dayKey(new Date(w.start_time)), (loadByDay.get(dayKey(new Date(w.start_time))) ?? 0) + (w.training_load ?? 0));
  const out: Record<string, MetricSeriesPoint[]> = Object.fromEntries(Object.keys(METRIC_UNITS).map((name) => [name, []]));
  for (let back = DAYS - 1; back >= 0; back -= 1) {
    const date = dayKey(at(now, -back));
    const week = Math.sin((back / 7) * Math.PI * 2);
    const ran = loadByDay.has(date);
    const push = (name: string, point: Omit<MetricSeriesPoint, 'date'>) => out[name].push({ date, ...point });
    if (!rng.chance(0.04)) push('readiness', { value: Math.round(clamp(76 + 8 * week + rng.between(-6, 6), 54, 95)) });
    push('stress', { value: Math.round(rng.between(29, 46)), min: rng.int(3, 14), max: rng.int(62, 84) });
    if (!rng.chance(0.08)) push('spo2', { value: Math.round(rng.between(95, 98)) });
    push('vo2max', { value: round(46.2 + (DAYS - back) * 0.009 + rng.between(-0.2, 0.2), 1) });
    // 日指标是过去七日滚动负荷；没有运动的完整日期才是 0，绝不随机补负荷。
    push('training_load', { value: Array.from({ length: 7 }, (_, i) => loadByDay.get(dayKey(at(now, -back - i))) ?? 0).reduce((a, b) => a + b, 0) });
    if (!rng.chance(0.05)) {
      const hrv = Math.round(clamp(60 - 8 * week + rng.between(-6, 6), 42, 78));
      push('hrv', { value: hrv });
      push('hrv_rmssd', { value: hrv });
      if (sleepScore.has(date)) push('sleep_hrv', { value: hrv });
    }
    push('resting_hr', { value: Math.round(clamp(55 + 1.6 * week + rng.between(-1.6, 1.6), 51, 60)) });
    const steps = Math.round((ran ? rng.between(10500, 15200) : rng.between(4200, 9300)) * (back === 0 ? Math.min(1, now.getHours() / 20) : 1));
    push('steps', { value: steps });
    push('active_calories', { value: Math.round(steps * 0.038) });
    push('active_minutes', { value: Math.round(steps / 150) });
    push('pai_daily', { value: ran ? rng.int(12, 28) : rng.int(2, 6) });
    push('pai_total', { value: rng.int(92, 132) });
    if (back % 14 === 0) {
      push('lactate_threshold_hr', { value: 168 });
      push('lactate_threshold_pace', { value: 298 });
    }
    if (back % 3 === 0 || back < 3) {
      const weight = round(69.8 - (DAYS - back) * 0.003 + rng.between(-.5, .5), 1);
      push('weight', { value: weight }); push('bmi', { value: round(weight / 1.74 ** 2, 1) });
      push('body_fat_rate', { value: round(rng.between(17.5, 19.4), 1) });
      push('body_water_rate', { value: round(rng.between(55.8, 57.3), 1) });
      push('muscle_mass', { value: round(weight * .77, 1) }); push('bone_mass', { value: 2.9 });
      push('visceral_fat', { value: 7 }); push('bmr', { value: Math.round(weight * 23.6) });
      push('height', { value: 174 }); push('protein_rate', { value: 18.4 });
    }
    const slept = sleepScore.get(date);
    if (slept) push('sleep_score', { value: slept });
    push('respiratory_rate', { value: round(rng.between(14.1, 15.7), 1) });
  }
  return out;
};

/* —— 心率：最近 24 小时每分钟一点，夜里低、白天缓缓起伏、运动那段抬高，昨天下午有一段没戴表 —— */
const buildHeart = (now: Date, rng: Rng, workouts: Workout[]): HeartPoint[] => {
  const points: HeartPoint[] = [];
  const gapStart = at(now, -1, 14, 10).getTime();
  const gapEnd = at(now, -1, 16, 25).getTime();
  const byDay = new Map<string, Workout[]>();
  for (const w of workouts) { const key = dayKey(new Date(w.start_time)); byDay.set(key, [...(byDay.get(key) ?? []), w]); }
  let drift = 0;
  const first = at(now, -(DAYS - 1)).getTime();
  for (let t = first; t <= now.getTime(); t += t < now.getTime() - 24 * 3_600_000 ? 300_000 : 60_000) {
    if (t >= gapStart && t <= gapEnd) continue;
    const date = new Date(t);
    const hour = date.getHours() + date.getMinutes() / 60;
    const night = hour >= 23 || hour < 6.6;
    drift = clamp(drift * 0.96 + rng.between(-2.2, 2.2), -9, 11);
    let value = night ? 54 + 2.5 * Math.sin(t / 2_400_000) + drift * 0.25 : 67 + 4 * Math.sin(t / 5_400_000) + drift;
    for (const w of byDay.get(dayKey(date)) ?? []) {
      const s = new Date(w.start_time).getTime();
      const e = new Date(w.end_time).getTime();
      const avg = w.avg_hr ?? 140;
      if (t >= s && t <= e) {
        // 前三分钟爬升，之后围着平均心率上下起伏。
        const ramp = clamp((t - s) / 180_000, 0, 1);
        value += (avg + 7 * Math.sin((t - s) / 120_000) + rng.between(-4, 4) - value) * ramp;
      } else if (t > e) {
        // 停下以后按指数回落，约九分钟掉一大半。
        value = Math.max(value, value + (avg - 6 - value) * Math.exp(-(t - e) / (9 * 60_000)));
      }
    }
    points.push({ timestamp: iso(date), value: Math.round(clamp(value, 44, 188)) });
  }
  return points;
};

const buildStress = (now: Date, rng: Rng): HeartPoint[] => {
  const points: HeartPoint[] = [];
  for (let t = Math.floor((now.getTime() - 20 * 3_600_000) / 300_000) * 300_000; t <= now.getTime(); t += 300_000) {
    const hour = new Date(t).getHours();
    if (hour < 7 || hour >= 23) continue;
    points.push({ timestamp: iso(new Date(t)), value: Math.round(clamp(38 + 16 * Math.sin(t / 3_000_000) + rng.between(-12, 12), 8, 88)) });
  }
  return points;
};

export const buildDemoData = (now: Date = new Date()): DemoData => {
  const rng = makeRng(DEMO_SEED);
  const sleeps = buildSleeps(now, rng);
  const workouts = buildWorkouts(now, rng);
  return {
    now,
    sleeps,
    workouts,
    metrics: buildMetrics(now, rng, sleeps, workouts),
    heart: buildHeart(now, rng, workouts),
    stress: buildStress(now, rng),
    sleepDays: new Set(sleeps.map((s) => dayKey(new Date(s.end_time)))),
    workoutDays: new Set(workouts.map((w) => dayKey(new Date(w.start_time)))),
  };
};

/** 取最近 `days` 天的某些指标，附上平均 / 最低 / 最高 / 最新，缺的天如实少一个点。 */
export const metricSeries = (data: DemoData, days: number, names?: string[] | null): MetricSeries[] => {
  const from = dayKey(at(data.now, -(days - 1)));
  return Object.keys(METRIC_UNITS)
    .filter((name) => !names?.length || names.includes(name))
    .map((name) => {
      const points = data.metrics[name].filter((point) => point.date >= from);
      const values = points.map((point) => point.value);
      return {
        metric: name,
        unit: METRIC_UNITS[name],
        source: 'daily_metrics',
        points,
        latest: points.length ? points[points.length - 1] : null,
        average: values.length ? round(values.reduce((sum, v) => sum + v, 0) / values.length, 1) : null,
        minimum: values.length ? Math.min(...values) : null,
        maximum: values.length ? Math.max(...values) : null,
        days_with_data: points.length,
        window_days: days,
      };
    });
};

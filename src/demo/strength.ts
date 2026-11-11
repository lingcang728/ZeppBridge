import { at, iso } from './rng';
import type { StrengthSetRow, StrengthWorkoutDetail, Workout } from '../types';

/* 演示里的力量训练（Zepp type 52）：每周二晚上一练，推 / 拉腿两套轮换。
 * 不碰数据集的随机序列——跑步、睡眠、心率等既有演示数据逐字不变（落地页截图依赖这一点）。
 * 动作编号与 Rust decoder/strength.rs 的标准字典一致；再放一组表外编号，演示「#编号」兜底。 */

interface Move { code: number; key: string | null; muscle: string | null; sets: Array<[reps: number, kg: number | null, sec: number]> }

const PUSH: Move[] = [
  { code: 6, key: 'bench_press', muscle: 'chest', sets: [[10, 50, 38], [8, 57.5, 34], [6, 62.5, 30], [6, 62.5, 31]] },
  { code: 63, key: 'shoulder_press', muscle: 'shoulders', sets: [[10, 30, 36], [8, 35, 33], [8, 35, 34]] },
  { code: 40, key: 'dumbbell_lateral_raise', muscle: 'shoulders', sets: [[15, 8, 40], [12, 10, 37]] },
  { code: 38, key: 'rope_triceps_pushdowns', muscle: 'triceps', sets: [[12, 25, 35], [12, 25, 34]] },
  { code: 97, key: 'plank', muscle: 'core', sets: [[1, null, 60], [1, null, 50]] },
];

const PULL_LEGS: Move[] = [
  { code: 3, key: 'barbell_squats', muscle: 'legs', sets: [[10, 60, 42], [8, 70, 38], [6, 80, 34], [6, 80, 35]] },
  { code: 61, key: 'deadlift', muscle: 'legs', sets: [[8, 80, 36], [5, 100, 30]] },
  { code: 60, key: 'lat_pulldowns', muscle: 'back', sets: [[12, 45, 38], [10, 50, 35], [10, 50, 36]] },
  { code: 5, key: 'bent_over_row', muscle: 'back', sets: [[10, 40, 34], [10, 40, 35]] },
  { code: 65, key: 'biceps_curl', muscle: 'biceps', sets: [[12, 12, 32], [10, 14, 30]] },
  { code: 213, key: null, muscle: null, sets: [[15, null, 45]] },
];

const REST_SECONDS = 90;

const routineOf = (workout: Workout): Move[] => (Math.floor(Date.parse(workout.start_time) / 604_800_000) % 2 === 0 ? PUSH : PULL_LEGS);

/** 某一场演示力量训练的逐组明细（和 WorkoutSeries.strength 同形）。 */
export const demoStrengthDetail = (workout: Workout): StrengthWorkoutDetail => {
  const moves = routineOf(workout);
  const base = workout.avg_hr ?? 118;
  const sets: StrengthSetRow[] = [];
  for (const move of moves) {
    for (const [reps, kg, sec] of move.sets) {
      const index = sets.length + 1;
      sets.push({
        set_index: index, action_code: move.code, exercise_key: move.key, muscle_group: move.muscle, reps,
        weight_value: kg, weight_unit: 'kg', weight_kg: kg, duration_ms: sec * 1000,
        avg_hr: Math.round(base + (kg ?? 20) / 8 + (index % 3) * 3), calories_kcal: Math.round(sec * 0.16 + (kg ?? 0) * reps * 0.004),
      });
    }
  }
  const volume = sets.reduce((sum, s) => sum + (s.weight_kg ?? 0) * s.reps, 0);
  return {
    total_sets: sets.length,
    total_reps: sets.reduce((sum, s) => sum + s.reps, 0),
    total_volume_kg: Math.round(volume * 10) / 10,
    rest_seconds: REST_SECONDS * (sets.length - 1),
    sets,
    exercise_groups: moves.map(m => ({ action_code: m.code, exercise_key: m.key, muscle_group: m.muscle, sets: m.sets.length, total_reps: m.sets.reduce((sum, [r]) => sum + r, 0) })),
  };
};

/** 过去 `days` 天里每个周二 19:10 的一场力量训练；每四周空一次（如实缺练），还没练完的不算。 */
export const buildStrengthWorkouts = (now: Date, days: number, deviceId: string): Workout[] => {
  const out: Workout[] = [];
  for (let back = 0; back < days; back += 1) {
    const day = at(now, -back);
    if (day.getDay() !== 2 || Math.floor(back / 7) % 4 === 3) continue;
    const start = at(now, -back, 19, 10);
    const draft = { start_time: iso(start), avg_hr: 112 + (back % 5) * 2 } as Workout;
    const detail = demoStrengthDetail(draft);
    const work = detail.sets.reduce((sum, s) => sum + (s.duration_ms ?? 0) / 1000, 0);
    const seconds = Math.round(work + (detail.rest_seconds ?? 0));
    const end = new Date(start.getTime() + seconds * 1000);
    if (end > now) continue;
    out.push({
      workout_id: String(Math.floor(start.getTime() / 1000)),
      workout_type: 'strength', normalized_type: 'strength', type_source: 'numeric_mapped', user_override: null,
      effective_type: 'strength', custom_label: null, zepp_type: 52, zepp_source: null,
      start_time: draft.start_time, end_time: iso(end),
      distance_meters: undefined, moving_seconds: seconds, calories: Math.round(seconds / 60 * 6.2),
      avg_hr: draft.avg_hr, max_hr: (draft.avg_hr ?? 112) + 36, min_hr: (draft.avg_hr ?? 112) - 30,
      elevation_gain_m: null, elevation_loss_m: null, max_altitude_m: undefined, min_altitude_m: undefined,
      training_load: Math.round(seconds / 60 * 0.9), training_effect: 2.1, anaerobic_training_effect: 1.8, rpe: 7,
      avg_cadence_spm: null, max_cadence_spm: null, avg_stride_cm: null, total_steps: null,
      gps_available: false, sample_count: Math.floor(seconds / 10) + 1,
      source_scope: 'device', device_id: deviceId, synced_at: iso(new Date(end.getTime() + 15 * 60_000)), hr_zones: [],
    });
  }
  return out;
};

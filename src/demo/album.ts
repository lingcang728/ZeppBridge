/* 演示里的相册命令：按月汇总、轨迹轮廓、分期条。和后端 storage/record_album.rs 同一套算法（缩成轮廓、按本地月份分组）。 */
import type { DemoData } from './dataset';
import { sleepStageSlices } from './dataset';
import { demoWorkoutSeries } from './details';
import type { RouteShape, SleepMonth, SleepStrip, WorkoutMonth } from '../types/album';
import type { SleepSession, Workout } from '../types';

const SHAPE_POINTS = 40;
const r3 = (value: number) => Math.round(value * 1000) / 1000;

/** 轨迹 → 轮廓（长边为 1、北在上、最多 40 个点）。 */
export const shapeOf = (workoutId: string, points: { latitude: number; longitude: number }[]): RouteShape | null => {
  if (points.length < 2) return null;
  const lat0 = points.reduce((sum, p) => sum + p.latitude, 0) / points.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => p.longitude * k), ys = points.map((p) => p.latitude);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY);
  if (span < 0.0001) return null;
  const step = Math.max(1, (points.length - 1) / (SHAPE_POINTS - 1));
  const picked: [number, number][] = [];
  for (let i = 0; i < SHAPE_POINTS; i += 1) {
    const index = Math.min(points.length - 1, Math.round(i * step));
    picked.push([r3((xs[index] - minX) / span), r3((maxY - ys[index]) / span)]);
    if (index === points.length - 1) break;
  }
  return { workout_id: workoutId, width: r3((maxX - minX) / span), height: r3((maxY - minY) / span), points: picked };
};

const monthOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const seconds = (w: Workout) => Math.max(0, (Date.parse(w.end_time ?? w.start_time) - Date.parse(w.start_time)) / 1000);
const afterNoon = (iso: string) => {
  const d = new Date(iso);
  return (d.getHours() * 60 + d.getMinutes() - 720 + 1440) % 1440;
};

export const createDemoAlbum = (data: DemoData) => {
  const shapes = new Map<string, RouteShape | null>();
  const shape = (w: Workout) => {
    if (!shapes.has(w.workout_id)) shapes.set(w.workout_id, w.gps_available ? shapeOf(w.workout_id, demoWorkoutSeries(w).route) : null);
    return shapes.get(w.workout_id) ?? null;
  };
  const workoutMonths = (): WorkoutMonth[] => {
    const groups = new Map<string, Workout[]>();
    for (const w of data.workouts) groups.set(monthOf(w.start_time), [...(groups.get(monthOf(w.start_time)) ?? []), w]);
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([month, list]) => {
      const longest = list.filter((w) => w.gps_available).sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0))[0];
      return {
        month, count: list.length,
        distance_m: list.reduce((sum, w) => sum + (w.distance_meters ?? 0), 0),
        duration_s: Math.round(list.reduce((sum, w) => sum + seconds(w), 0)),
        cover: longest ? shape(longest) : null,
        cover_distance_m: longest?.distance_meters ?? null,
      };
    });
  };
  const sleepMonths = (): SleepMonth[] => {
    const groups = new Map<string, SleepSession[]>();
    for (const s of data.sleeps) groups.set(monthOf(s.start_time), [...(groups.get(monthOf(s.start_time)) ?? []), s]);
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([month, list]) => {
      const onsets = list.map((s) => afterNoon(s.start_time));
      const mean = onsets.reduce((sum, v) => sum + v, 0) / list.length;
      const scored = list.filter((s) => typeof s.score === 'number' && s.score > 0);
      return {
      month, nights: list.length,
      avg_duration_min: list.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0) / list.length,
      avg_onset_min: mean,
      onset_nights: list.length,
      onset_sd_min: Math.sqrt(onsets.reduce((sum, v) => sum + (v - mean) ** 2, 0) / list.length),
      avg_score: scored.length ? scored.reduce((sum, s) => sum + (s.score ?? 0), 0) / scored.length : null,
      score_nights: scored.length,
      deep_min: list.reduce((sum, s) => sum + (s.deep_minutes ?? 0), 0),
      light_min: list.reduce((sum, s) => sum + (s.light_minutes ?? 0), 0),
      rem_min: list.reduce((sum, s) => sum + (s.rem_minutes ?? 0), 0),
      awake_min: list.reduce((sum, s) => sum + (s.awake_minutes ?? 0), 0),
      };
    });
  };
  const strips = (ids: string[]): SleepStrip[] => ids.flatMap((id) => {
    const session = data.sleeps.find((s) => s.sleep_id === id);
    if (!session) return [];
    const start = Date.parse(session.start_time);
    return [{ sleep_id: id, spans: sleepStageSlices(session).map((slice) => ({
      stage: slice.stage,
      from_min: (Date.parse(slice.start_time) - start) / 60_000,
      to_min: (Date.parse(slice.end_time) - start) / 60_000,
    })) }];
  });
  const ids = (args: Record<string, unknown>, key: string) => (Array.isArray(args[key]) ? (args[key] as string[]) : []).slice(0, 500);
  return {
    get_workout_months: () => workoutMonths(),
    get_sleep_months: () => sleepMonths(),
    get_workout_route_shapes: (args: Record<string, unknown>) => ids(args, 'workoutIds').flatMap((id) => {
      const w = data.workouts.find((each) => each.workout_id === id);
      const s = w ? shape(w) : null;
      return s ? [s] : [];
    }),
    get_sleep_stage_strips: (args: Record<string, unknown>) => strips(ids(args, 'sleepIds')),
  };
};

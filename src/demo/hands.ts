/**
 * 演示里的首页建议卡和发牌事实（`suggestion_cards` / `card_hand_facts` / `card_hand_lines`）。
 *
 * 只从已经生成好的演示数据推出来，不碰随机序列。跑步都在一条虚构的环线上（坐标是编出来的），
 * 每次的轨迹按运动 id 抖一点；心率小线是一条按 id 起伏的曲线。演示里总给两张建议卡
 * （最近一次跑步的复盘、最近一晚），好让首页看得到这块长什么样。
 */
import type { DemoData } from './dataset';
import type { DemoHandler } from './operations';
import { dayKey } from './rng';
import type { HandFacts, HandLines, HandNight, HandWorkout, Suggestion } from '../types/hands';

/** 虚构的环线起点（不是任何人的真实位置）。 */
const LOOP: [number, number] = [10.5, 20.5];
const KM_DEG = 1 / 111;

const seedOf = (id: string) => [...id].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 9973, 7);
const durationOf = (start: string, end: string, moving: number | null | undefined) => moving ?? Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000));

const loopPoint = (t: number, km: number, wobble: number): [number, number] => {
  const r = (km / (2 * Math.PI)) * KM_DEG;
  const a = t * Math.PI * 2;
  return [LOOP[0] + r * Math.sin(a) * (1 + wobble * Math.sin(a * 3)), LOOP[1] + r * (1 - Math.cos(a)) * 1.4];
};

export const createDemoHands = (data: DemoData): Record<string, DemoHandler> => {
  const workouts = (): HandWorkout[] => [...data.workouts]
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((w) => {
      const running = (w.effective_type ?? w.workout_type) === 'running';
      const km = (w.distance_meters ?? 0) / 1000;
      const routed = running && w.gps_available && km > 0;
      const wobble = (seedOf(w.workout_id) % 7) / 200;
      return {
        workout_id: w.workout_id, workout_type: w.effective_type ?? w.workout_type, start_time: w.start_time, date: dayKey(new Date(w.start_time)),
        distance_m: w.distance_meters ?? null, duration_s: durationOf(w.start_time, w.end_time, w.moving_seconds), avg_hr: w.avg_hr ?? null,
        training_load: w.training_load ?? null, race: false,
        start: routed ? loopPoint(0, km, wobble) : null, end: routed ? loopPoint(0.995, km, wobble) : null,
      };
    });
  const nights = (): HandNight[] => {
    const hrv = new Map((data.metrics.sleep_hrv ?? []).map((p) => [p.date, p.value]));
    const rhr = new Map((data.metrics.resting_hr ?? []).map((p) => [p.date, p.value]));
    return [...data.sleeps]
      .sort((a, b) => a.end_time.localeCompare(b.end_time))
      .map((s) => {
        const date = dayKey(new Date(s.end_time));
        return { date, duration_min: s.duration_minutes ?? null, deep_min: s.deep_minutes ?? null, hrv: hrv.get(date) ?? null, resting_hr: rhr.get(date) ?? null };
      });
  };
  return {
    suggestion_cards: (): Suggestion[] => {
      const list = workouts();
      const runs = list.filter((w) => w.workout_type === 'running').reverse();
      const out: Suggestion[] = [];
      const last = runs[0];
      if (last) {
        out.push({
          code: 'workout_done', key: `workout_done:${last.workout_id}`, workout_id: last.workout_id, workout_type: last.workout_type,
          start_time: last.start_time, distance_m: last.distance_m, duration_s: last.duration_s, same_type_ids: runs.slice(1, 5).map((w) => w.workout_id),
        });
      }
      const night = nights().at(-1);
      if (night?.duration_min) {
        out.push({
          code: 'sleep_poor', key: `sleep_poor:${night.date}`, night: night.date, duration_min: night.duration_min, baseline_duration_min: night.duration_min + 52,
          deep_min: night.deep_min, baseline_deep_min: night.deep_min, short: true, deep_low: false, baseline_nights: 28,
        });
      }
      return out;
    },
    card_hand_facts: (a): HandFacts => {
      const days = Math.max(1, Number(a.days ?? 365));
      const today = dayKey(data.now);
      const from = dayKey(new Date(data.now.getTime() - (days - 1) * 86_400_000));
      return { today, workouts: workouts().filter((w) => w.date >= from), nights: nights().filter((n) => n.date >= from) };
    },
    card_hand_lines: (a): HandLines[] => {
      const ids = Array.isArray(a.workoutIds) ? (a.workoutIds as string[]) : [];
      const byId = new Map(workouts().map((w) => [w.workout_id, w]));
      return ids.flatMap((id) => {
        const w = byId.get(id);
        if (!w) return [];
        const seed = seedOf(id);
        const km = (w.distance_m ?? 0) / 1000;
        const wobble = (seed % 7) / 200;
        const route = w.start ? Array.from({ length: 24 }, (_, i) => loopPoint(i / 23 * 0.995, km, wobble)) : [];
        const base = w.avg_hr ?? 140;
        const hr = Array.from({ length: 32 }, (_, i) => Math.round(base - 18 * Math.exp(-i / 4) + 6 * Math.sin((i + seed) / 3)));
        return [{ workout_id: id, route, hr }];
      });
    },
  };
};

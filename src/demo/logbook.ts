/** 演示里的履历：两双鞋（一双快到退役）、一双 Zepp 记过没登记的、一场将来的半马、一场跑完的 10K、一段好了的伤。 */
import type { DemoData } from './dataset';
import type { DemoHandler } from './operations';
import { at, dayKey, iso } from './rng';
import { demoText } from './texts';
import type {
  Injury, InjuryInput, PersonalRecords, Race, RaceInput, ShoeInput, ShoeSummary, WorkoutFeel, WorkoutFeelInput,
} from '../types/logbook';

const footwearOf = (kind: string) => (kind.includes('run') ? 'running' : kind.includes('walk') ? 'walking' : kind.includes('hik') ? 'hiking' : null);

export const createDemoLogbook = (data: DemoData): Record<string, DemoHandler> => {
  const text = demoText;
  const stamp = iso(data.now);
  const day = (offset: number) => dayKey(at(data.now, offset));
  // 日常训练鞋从 70 天前开始穿：只算那之后的跑步，登记前已跑的补到快退役（演示「快到了」的提醒）。
  const since = day(-70);
  const worn = data.workouts.filter(w => footwearOf(w.effective_type) === 'running' && dayKey(new Date(w.start_time)) >= since);
  const runKm = worn.reduce((sum, w) => sum + (w.distance_meters ?? 0) / 1000, 0);
  let shoes: ShoeInput[] = [
    { id: 1, name: text().shoeDaily, sport: 'running', is_default: true, zepp_gear_id: null, start_km: Math.max(0, 645 - runKm), retire_km: 700, started_on: since, retired_on: null, notes: '' },
    { id: 2, name: text().shoeRace, sport: 'running', is_default: false, zepp_gear_id: null, start_km: 62, retire_km: 400, started_on: day(-80), retired_on: null, notes: '' },
  ];
  let unknownGear = [{ zepp_gear_id: '7301', workouts: 14, km: 61.8, first_used: day(-120), last_used: day(-9), sport: 'walking' as const }];
  let races: RaceInput[] = [
    { id: 1, name: text().raceHalf, race_date: day(38), sport: 'running', distance_m: 21097.5, goal_seconds: 6300, priority: 'a', result_seconds: null, workout_id: null, notes: '' },
    { id: 2, name: text().race10k, race_date: day(-64), sport: 'running', distance_m: 10000, goal_seconds: 2880, priority: 'b', result_seconds: 2806, workout_id: null, notes: '' },
  ];
  let injuries: InjuryInput[] = [
    { id: 1, title: text().injury, body_part: 'it_band_r', severity: 2, start_date: day(-96), end_date: day(-71), notes: '' },
  ];
  const feels = new Map<string, WorkoutFeelInput>();
  const nextId = (list: { id: number | null }[]) => Math.max(0, ...list.map(item => item.id ?? 0)) + 1;
  const upsert = <T extends { id: number | null }>(list: T[], input: T): [T[], number] => {
    const id = input.id ?? nextId(list);
    const value = { ...input, id };
    return [list.some(item => item.id === id) ? list.map(item => (item.id === id ? value : item)) : [...list, value], id];
  };
  const summary = (shoe: ShoeInput): ShoeSummary => {
    const km = shoe.start_km + (shoe.is_default ? runKm : 0);
    const wear = shoe.retired_on ? 'retired' : km >= shoe.retire_km ? 'due' : km >= shoe.retire_km * 0.9 ? 'near' : 'fresh';
    return { ...shoe, id: shoe.id!, created_at: stamp, updated_at: stamp, km, workouts: shoe.is_default ? worn.length : 6, last_used: shoe.is_default ? day(0) : day(-64), wear };
  };
  const records = (): PersonalRecords => ({
    runs_scanned: data.workouts.filter(w => footwearOf(w.effective_type) === 'running').length,
    records: [
      { key: '5k', distance_m: 5000, best: { seconds: 1338, method: 'samples', workout_id: data.workouts[3]?.workout_id ?? null, race_id: null, race_name: null, date: day(-23) }, runners_up: [{ seconds: 1361, method: 'samples', workout_id: null, race_id: null, race_name: null, date: day(-51) }] },
      { key: '10k', distance_m: 10000, best: { seconds: 2806, method: 'race', workout_id: null, race_id: 2, race_name: text().race10k, date: day(-64) }, runners_up: [{ seconds: 2874, method: 'samples', workout_id: null, race_id: null, race_name: null, date: day(-30) }] },
      { key: 'half', distance_m: 21097.5, best: null, runners_up: [] },
      { key: 'marathon', distance_m: 42195, best: null, runners_up: [] },
    ],
  });
  const feelOf = (workoutId: string): WorkoutFeel | null => {
    const workout = data.workouts.find(w => w.workout_id === workoutId);
    if (!workout) return null;
    const footwear = footwearOf(workout.effective_type);
    const saved = feels.get(workoutId) ?? { workout_id: workoutId, rpe: null, soreness: [], shoe_mode: 'auto' as const, shoe_id: null };
    const fallback = footwear === 'running' ? shoes.find(s => s.is_default && s.sport === 'running')?.id ?? null : null;
    const assigned = !footwear ? null
      : saved.shoe_mode === 'chosen' ? { shoe_id: saved.shoe_id, how: 'chosen' as const }
      : saved.shoe_mode === 'none' ? { shoe_id: null, how: 'none' as const }
      : fallback ? { shoe_id: fallback, how: 'default' as const } : { shoe_id: null, how: 'unknown' as const };
    return { ...saved, watch_rpe: footwear === 'running' ? 6 : null, footwear, assigned,
      choices: shoes.map(s => ({ id: s.id!, name: s.name, sport: s.sport, retired: Boolean(s.retired_on) })) };
  };
  return {
    shoes_overview: () => ({ shoes: shoes.map(summary), unknown_gear: unknownGear }),
    shoe_save: a => {
      const input = a.input as ShoeInput;
      if (input.is_default) shoes = shoes.map(s => (s.sport === input.sport ? { ...s, is_default: false } : s));
      if (input.zepp_gear_id) unknownGear = unknownGear.filter(g => g.zepp_gear_id !== input.zepp_gear_id);
      const [next, id] = upsert(shoes, input);
      shoes = next;
      return id;
    },
    shoe_delete: a => { shoes = shoes.filter(s => s.id !== Number(a.id)); },
    workout_feel_get: a => feelOf(String(a.workoutId)),
    workout_feel_save: a => { const input = a.input as WorkoutFeelInput; feels.set(input.workout_id, input); },
    injuries_list: (): Injury[] => [...injuries]
      .sort((x, y) => Number(Boolean(x.end_date)) - Number(Boolean(y.end_date)) || y.start_date.localeCompare(x.start_date))
      .map(i => ({ ...i, id: i.id!, created_at: stamp, updated_at: stamp })),
    injury_save: a => { const [next, id] = upsert(injuries, a.input as InjuryInput); injuries = next; return id; },
    injury_delete: a => { injuries = injuries.filter(i => i.id !== Number(a.id)); },
    races_list: (): Race[] => [...races]
      .sort((x, y) => x.race_date.localeCompare(y.race_date))
      .map(r => ({ ...r, id: r.id!, created_at: stamp, updated_at: stamp, candidate: null })),
    race_save: a => { const [next, id] = upsert(races, a.input as RaceInput); races = next; return id; },
    race_delete: a => { races = races.filter(r => r.id !== Number(a.id)); },
    personal_records: () => records(),
  };
};

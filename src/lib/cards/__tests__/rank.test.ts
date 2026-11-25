import { describe, expect, it } from 'vitest';
import { pickSuggestion, rankSuggestions, type HandFacts, type HandNight, type HandWorkout } from '../hands';
import { addDays } from '../../aiTask/bridgeScale';
import type { Suggestion } from '../../../types/hands';

const TODAY = '2026-11-20';
let seq = 0;
/** 一次运动：`daysAgo` 天前、`km` 公里、配速 `pace` 秒 / 公里（数值都是虚构的）。 */
const run = (daysAgo: number, km: number, pace: number, extra: Partial<HandWorkout> = {}): HandWorkout => {
  seq += 1;
  const date = addDays(TODAY, -daysAgo);
  return {
    workout_id: extra.workout_id ?? `w${seq}`, workout_type: 'run', start_time: `${date}T07:00:00+08:00`, date,
    distance_m: km * 1000, duration_s: Math.round(km * pace), avg_hr: 150, training_load: null, race: false, start: null, end: null, ...extra,
  };
};
const night = (daysAgo: number, values: Partial<HandNight> = {}): HandNight => ({
  date: addDays(TODAY, -daysAgo), duration_min: 450, deep_min: 90, hrv: 50, resting_hr: 52, ...values,
});
const facts = (workouts: HandWorkout[], nights: HandNight[] = []): HandFacts => ({
  today: TODAY, workouts: [...workouts].sort((a, b) => a.start_time.localeCompare(b.start_time)), nights: [...nights].sort((a, b) => a.date.localeCompare(b.date)),
});
/** 一个月的平常日子：隔天跑 5 km、每晚睡得照常。 */
const usual = () => ({
  workouts: Array.from({ length: 12 }, (_, i) => run(40 - i * 3, 5, 330)),
  nights: Array.from({ length: 30 }, (_, i) => night(i + 1)),
});
const order = (f: HandFacts, signals: Suggestion[] = []) => rankSuggestions(f, signals).map((s) => s.template);

const workoutDone = (id: string): Suggestion => ({
  code: 'workout_done', key: `workout_done:${id}`, workout_id: id, workout_type: 'run', start_time: `${TODAY}T07:00:00+08:00`, distance_m: 8000, duration_s: 2600, same_type_ids: [],
});
const sleepPoor: Suggestion = {
  code: 'sleep_poor', key: `sleep_poor:${TODAY}`, night: TODAY, duration_min: 300, baseline_duration_min: 450, deep_min: null, baseline_deep_min: null,
  short: true, deep_low: false, baseline_nights: 28,
};
const longIdle: Suggestion = { code: 'long_idle', key: 'long_idle:x', days: 12, last_workout_id: 'w1', last_workout_type: 'run', last_date: addDays(TODAY, -12) };

describe('今日一问的推荐顺序', () => {
  it('平常日子：帮我排明天在前，其余按固定顺序垫底，发不出牌的模板不出', () => {
    const { workouts, nights } = usual();
    const list = order(facts(workouts, nights));
    expect(list[0]).toBe('plan_tomorrow');
    // 没有后端触发码：复盘刚练完、排个轻松的回归不出；没有昨晚的睡眠：昨晚睡得怎么样不出。
    expect(list).not.toContain('review_workout');
    expect(list).not.toContain('comeback');
    expect(list).not.toContain('sleep_review');
    expect(list).toContain('distance_best');
    expect(new Set(list).size).toBe(list.length);
  });

  it('三天内比过赛：复盘比赛排第一', () => {
    const { workouts, nights } = usual();
    const list = order(facts([...workouts, run(1, 21.1, 300, { race: true, workout_id: 'race' })], nights));
    expect(list[0]).toBe('race_review');
    // 五天前的比赛就不抢第一了，但照样能换到。
    const old = order(facts([...workouts, run(5, 21.1, 300, { race: true })], nights));
    expect(old[0]).not.toBe('race_review');
    expect(old).toContain('race_review');
  });

  it('七天内刷了 PR：我进步了吗排第一；第一次跑这个距离不算', () => {
    const { workouts, nights } = usual();
    // 快了 5%：刷新了 PR，但还不到「像比赛」的程度。
    expect(order(facts([...workouts, run(2, 5, 315)], nights))[0]).toBe('distance_best');
    expect(order(facts([run(2, 10, 300)], nights))[0]).not.toBe('distance_best');
  });

  it('后端的触发码按 刚练完 → 昨晚恢复异常 → 昨晚睡得差 → 很久没动 排', () => {
    const { workouts, nights } = usual();
    const today = run(0, 8, 325, { workout_id: 'today' });
    expect(order(facts([...workouts, today], nights), [workoutDone('today')])[0]).toBe('review_workout');
    const rough = [...nights, night(0, { hrv: 30, resting_hr: 62, duration_min: 300 })];
    expect(order(facts(workouts, rough), [sleepPoor])[0]).toBe('recovery_nights');
    expect(order(facts(workouts, rough), [sleepPoor])[1]).toBe('sleep_review');
    expect(order(facts(workouts, nights), [sleepPoor, longIdle]).slice(0, 2)).toEqual(['sleep_review', 'comeback']);
  });

  it('触发码对不上事实（那次运动不在）：那个模板跳过，不出空牌', () => {
    const { workouts, nights } = usual();
    expect(order(facts(workouts, nights), [workoutDone('missing')])).not.toContain('review_workout');
  });

  it('什么数据都没有：一问都不出', () => {
    expect(rankSuggestions(facts([]))).toEqual([]);
    expect(pickSuggestion(facts([]))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  comeback, distanceBest, drawOut, handPicks, nightFlags, planTomorrow, raceLike, raceReview, recoveryDay, recoveryNights, refineSameRoute,
  reviewWorkout, sameRoute, swapIn, trackDistance, HAND_MAX, type HandFacts, type HandNight, type HandResult, type HandWorkout,
} from '../hands';
import { addDays } from '../../aiTask/bridgeScale';

const TODAY = '2026-11-20';
let seq = 0;
/** 一次运动：`daysAgo` 天前、`km` 公里、配速 `pace` 秒 / 公里。 */
const run = (daysAgo: number, km: number, pace: number, extra: Partial<HandWorkout> = {}): HandWorkout => {
  seq += 1;
  const date = addDays(TODAY, -daysAgo);
  return {
    workout_id: extra.workout_id ?? `w${seq}`, workout_type: 'run', start_time: `${date}T07:00:00+08:00`, date,
    distance_m: km * 1000, duration_s: Math.round(km * pace), avg_hr: 150, training_load: null, race: false, start: null, end: null, ...extra,
  };
};
const at = (lat: number, lng: number): [number, number] => [lat, lng];
const night = (daysAgo: number, values: Partial<HandNight> = {}): HandNight => ({
  date: addDays(TODAY, -daysAgo), duration_min: 450, deep_min: 90, hrv: 50, resting_hr: 52, ...values,
});
const facts = (workouts: HandWorkout[], nights: HandNight[] = []): HandFacts => ({
  today: TODAY, workouts: [...workouts].sort((a, b) => a.start_time.localeCompare(b.start_time)), nights: [...nights].sort((a, b) => a.date.localeCompare(b.date)),
});
const dealt = (result: HandResult) => {
  if (!result.ok) throw new Error(`没发出牌：${result.reason}`);
  return result.hand;
};
const ids = (result: HandResult) => dealt(result).cards.map((card) => (card.kind === 'workout' ? card.workout.workout_id : card.date));

describe('同一路线的历次', () => {
  const loop = { start: at(31.2, 121.5), end: at(31.2005, 121.5) };
  it('起终点、距离都对得上的同类运动发成一手，锚点是最近那次', () => {
    const list = [
      run(30, 8, 330, { workout_id: 'a', ...loop }),
      run(20, 8.3, 320, { workout_id: 'b', ...loop }),
      run(10, 7.9, 315, { workout_id: 'c', ...loop }),
      run(5, 8, 310, { workout_id: 'elsewhere', start: at(31.3, 121.6), end: at(31.3, 121.6) }),
      run(3, 12, 330, { workout_id: 'longer', ...loop }),
      run(2, 8, 300, { workout_id: 'ride', workout_type: 'ride', ...loop }),
    ];
    const hand = dealt(sameRoute(facts(list)));
    expect(hand.cards.map((card) => card.kind === 'workout' && card.workout.workout_id)).toEqual(['a', 'b', 'c']);
    expect(hand.cards.find((card) => card.role === 'anchor')?.id).toBe('w:c');
  });

  it('没有重复跑过的路线：明确的空状态，不发空牌', () => {
    const result = sameRoute(facts([run(3, 5, 330, { start: at(31.2, 121.5), end: at(31.2, 121.5) })]));
    expect(result).toEqual({ ok: false, kind: 'same_route', reason: 'no_routes' });
  });

  it('起终点一样、中间走了别的路：小图到了以后挪出去', () => {
    const list = [run(20, 8, 330, { workout_id: 'a', ...loop }), run(10, 8, 320, { workout_id: 'b', ...loop }), run(1, 8, 320, { workout_id: 'c', ...loop })];
    const first = sameRoute(facts(list));
    const there = [at(31.2, 121.5), at(31.21, 121.51), at(31.2005, 121.5)];
    const detour = [at(31.2, 121.5), at(31.19, 121.49), at(31.2005, 121.5)];
    const refined = refineSameRoute(first as HandResult & { ok: true }, [
      { workout_id: 'a', route: there, hr: [] }, { workout_id: 'b', route: detour, hr: [] }, { workout_id: 'c', route: there, hr: [] },
    ]);
    expect(ids(refined)).toEqual(['a', 'c']);
    expect(trackDistance(there, there)).toBe(0);
    expect(trackDistance(there, [])).toBe(Infinity);
  });
});

describe('同距离段 / 刷新 PR', () => {
  it('取最近跑的那个距离段：PR 链加最近几次', () => {
    const list = [
      run(90, 5, 330, { workout_id: 'p1' }), run(80, 5.1, 340, { workout_id: 'slow' }), run(60, 5, 320, { workout_id: 'p2' }),
      run(40, 5, 325, { workout_id: 'mid' }), run(20, 5.05, 310, { workout_id: 'p3' }), run(2, 5, 318, { workout_id: 'last' }),
      run(50, 10, 340, { workout_id: 'ten' }),
    ];
    const hand = dealt(distanceBest(facts(list)));
    expect(hand.params.bucket).toBe('5k');
    expect(ids({ ok: true, hand })).toEqual(['p1', 'p2', 'mid', 'p3', 'last']);
    expect(hand.cards.filter((card) => card.role === 'pr').map((card) => card.id)).toEqual(['w:p1', 'w:p2', 'w:p3']);
    expect(hand.bench.map((card) => card.id)).toEqual(['w:slow']);
  });

  it('距离或时长坏了（配速离谱）的不参与；没有够两次的距离段就是空状态', () => {
    expect(distanceBest(facts([run(5, 5, 330), run(4, 5, 30)]))).toEqual({ ok: false, kind: 'distance_best', reason: 'no_distance' });
  });
});

describe('比赛复盘', () => {
  it('标了比赛的那次 + 赛前四周分量最重的训练，赛前的睡眠恢复整段一起交', () => {
    const build = Array.from({ length: 12 }, (_, i) => run(12 + i * 2, 6 + (i % 4), 340, { workout_id: `b${i}`, training_load: 40 + i }));
    const list = [...build, run(70, 8, 340, { workout_id: 'too-early' }), run(10, 10, 300, { workout_id: 'race', race: true })];
    const hand = dealt(raceReview(facts(list)));
    expect(hand.cards.length).toBe(HAND_MAX);
    expect(hand.cards.some((card) => card.id === 'w:race' && card.role === 'race')).toBe(true);
    expect(hand.cards.some((card) => card.id === 'w:too-early') || hand.bench.some((card) => card.id === 'w:too-early')).toBe(false);
    expect(hand.span).toEqual({ from: addDays(TODAY, -38), to: addDays(TODAY, -10), categories: ['sleep', 'recovery', 'resting_hr', 'training'] });
    // 分量最重的留在主牌，轻的进候补。
    expect(hand.cards.some((card) => card.id === 'w:b11')).toBe(true);
    expect(hand.bench.some((card) => card.id === 'w:b0')).toBe(true);
  });

  it('没标比赛：配速明显快于常态的一次也算；平常的课不算', () => {
    const usual = Array.from({ length: 6 }, (_, i) => run(20 + i * 5, 8, 340));
    const fast = run(5, 10, 300, { workout_id: 'fast' });
    expect(raceLike(fast, [...usual, fast])).toBe(true);
    expect(raceLike(usual[0]!, [...usual, fast])).toBe(false);
    expect(raceReview(facts(usual))).toEqual({ ok: false, kind: 'race_review', reason: 'no_race' });
  });
});

describe('恢复异常夜', () => {
  const baseline = Array.from({ length: 20 }, (_, i) => night(i + 3));
  it('HRV 低、静息心率高、睡得短的夜晚各自标出，带上前一天的运动', () => {
    const odd = night(2, { hrv: 38, resting_hr: 60 });
    const short = night(1, { duration_min: 300 });
    const list = [run(3, 15, 330, { workout_id: 'long-run' })];
    const hand = dealt(recoveryNights(facts(list, [...baseline, odd, short])));
    const flagged = hand.cards.filter((card) => card.kind === 'night');
    expect(flagged.map((card) => card.date)).toEqual([odd.date, short.date]);
    expect(flagged[0]!.kind === 'night' && flagged[0]!.flags).toEqual(['hrv_low', 'rhr_high']);
    expect(hand.cards.find((card) => card.id === 'w:long-run')?.role).toBe('day_before');
  });

  it('基线不足 7 晚不下结论；都正常就是空状态', () => {
    expect(nightFlags(night(0, { hrv: 10 }), [night(1), night(2)])).toEqual([]);
    expect(recoveryNights(facts([], baseline))).toEqual({ ok: false, kind: 'recovery_nights', reason: 'no_outliers' });
  });
});

describe('首页建议卡点进来的牌', () => {
  it('复盘这次：这一次 + 后端给的同类几次，近一周的恢复整段交', () => {
    const list = [run(9, 8, 330, { workout_id: 'x' }), run(6, 8, 330, { workout_id: 'y' }), run(0, 8, 320, { workout_id: 'now' })];
    const hand = dealt(reviewWorkout(facts(list), 'now', ['y', 'x']));
    expect(ids({ ok: true, hand })).toEqual(['x', 'y', 'now']);
    expect(hand.span?.to).toBe(TODAY);
  });

  it('排个恢复日 / 轻松的回归 / 帮我排明天都能发出牌，没有数据时是空状态', () => {
    const nights = Array.from({ length: 7 }, (_, i) => night(i));
    const list = [run(1, 5, 330), run(2, 6, 330), run(20, 8, 330)];
    expect(dealt(recoveryDay(facts(list, nights), TODAY)).cards[0]!.role).not.toBe(undefined);
    expect(dealt(comeback(facts(list))).cards.length).toBe(3);
    const tomorrow = dealt(planTomorrow(facts(list, nights)));
    expect(tomorrow.params.tomorrow).toBe(addDays(TODAY, 1));
    expect(tomorrow.cards.filter((card) => card.kind === 'workout').length).toBe(2);
    expect(planTomorrow(facts([], []))).toEqual({ ok: false, kind: 'plan_tomorrow', reason: 'no_data' });
  });
});

describe('牌 → 任务', () => {
  it('运动牌进 workout_ids、那几天交运动；一晚交睡眠、恢复、静息心率；span 整段交', () => {
    const list = [run(3, 5, 330, { workout_id: 'a' }), run(0, 5, 330, { workout_id: 'b' })];
    const hand = dealt(reviewWorkout(facts(list, [night(1)]), 'b', ['a']));
    const picks = handPicks({ ...hand, cards: [...hand.cards, { kind: 'night', id: 'n', date: addDays(TODAY, -1), role: 'night', night: night(1) }] });
    expect(picks.workoutIds).toEqual(['a', 'b']);
    expect(picks.byCategory.get('workout')).toEqual([addDays(TODAY, -3), TODAY]);
    expect(picks.byCategory.get('sleep')?.length).toBe(7);
    expect(picks.byCategory.has('body')).toBe(false);
  });

  it('抽掉一张、换进一张以后，任务跟着变', () => {
    const list = Array.from({ length: 10 }, (_, i) => run(30 - i * 2, 5, 330 - i, { workout_id: `r${i}` }));
    const hand = dealt(distanceBest(facts(list)));
    const out = drawOut(hand, hand.cards[0]!.id);
    expect(out.cards.length).toBe(hand.cards.length - 1);
    expect(out.bench[0]!.id).toBe(hand.cards[0]!.id);
    expect(handPicks(out).workoutIds).not.toContain(hand.cards[0]!.kind === 'workout' ? hand.cards[0]!.workout.workout_id : '');
    const back = swapIn(out, out.bench[0]!.id, out.cards[1]!.id);
    expect(back.cards.map((card) => card.id)).toContain(hand.cards[0]!.id);
    expect(back.cards.map((card) => card.id)).not.toContain(out.cards[1]!.id);
    expect(back.bench[0]!.id).toBe(out.cards[1]!.id);
  });
});

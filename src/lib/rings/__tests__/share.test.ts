import { describe, expect, it } from 'vitest';
import { shareStory, type ShareWords } from '../share';
import type { RingYear } from '../../../types/rings';

const words: ShareWords = {
  heroWorkouts: 'workouts', heroDays: 'days', heroHours: 'hours',
  perWeek: n => `${n}/wk`,
  ran: km => `ran ${km}`, marathons: n => `${n} marathons`, runs: n => `${n} runs`,
  farthest: km => `far ${km}`, longest: time => `long ${time}`,
  busiest: m => `busy ${m}`, busiestNote: n => `${n} that month`,
  records: n => `${n} PB`, races: n => `${n} races`,
  steps: n => `${n} steps`, sleep: (h, m) => `${h}h${m}`, sleepNote: n => `${n} nights`,
};

const year = (patch: Partial<RingYear> = {}): RingYear => ({
  year: 2024, in_progress: false, data_days: 150, workouts: 83, active_days: 74, duration_s: 261000, distance_m: 0,
  runs: 71, run_distance_m: 577_700, weeks: [], busiest_month: 10, busiest_month_workouts: 22,
  longest_run: { workout_id: 'r', date: '2024-10-14', kind: 'running', distance_m: 13_300, duration_s: 4000 },
  longest_workout: { workout_id: 'w', date: '2024-09-02', kind: 'outdoor_cycling', distance_m: null, duration_s: 13_200 },
  steps_total: null, steps_days: 0, sleep_avg_minutes: null, sleep_nights: 0, personal_records: [], races: [], stars: [],
  ...patch,
});

describe('rings share story', () => {
  it('turns the year into three big numbers and highlight cards worth sharing', () => {
    const story = shareStory(year(), words, key => key, kind => kind);
    expect(story.hero.map(h => [h.value, h.label])).toEqual([['83', 'workouts'], ['74', 'days'], ['72.5', 'hours']]);
    expect(story.perWeek).toBe('3.9/wk');
    expect(story.cards.map(c => c.key)).toEqual(['running', 'farthest', 'longest', 'busiest']);
    // 577.7 km ÷ 42.195 ≈ 13.7 个全马：由真实距离直接算出来的量。
    expect(story.cards[0]).toMatchObject({ title: 'ran 577.7', note: '13.7 marathons' });
    expect(story.cards[2]!.title).toBe('long 3:40');
  });

  it('puts PBs and races first and never invents missing numbers', () => {
    const story = shareStory(year({ personal_records: ['5k'], races: [{ name: 'City 10K', date: '2024-04-01', result_seconds: 2700 }] }), words, key => key, kind => kind);
    expect(story.cards.map(c => c.key)).toEqual(['records', 'races', 'running', 'farthest']);
    const blank = shareStory(year({ data_days: 0, workouts: 0, active_days: 0, duration_s: 0, runs: 0, run_distance_m: 0, longest_run: null, longest_workout: null, busiest_month: null, busiest_month_workouts: 0 }), words, key => key, kind => kind);
    expect(blank).toEqual({ hero: [], perWeek: null, cards: [] });
    // 不到一个全马就说跑了几次，不写「0.3 个全马」。
    expect(shareStory(year({ run_distance_m: 12_000, runs: 3 }), words, key => key, kind => kind).cards[0]!.note).toBe('3 runs');
  });
});

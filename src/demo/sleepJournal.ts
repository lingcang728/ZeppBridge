/* 演示里的睡前日志：前 40 晚里按睡得好坏撒几个标签（睡得差的多半喝了咖啡、刷了屏，睡得好的多半看了书），今天那一晚空着，
   首页打卡就会问。睡前因素和后端 storage/sleep_journal.rs 同一套算法：有它的晚上减去记过但没它的晚上，两边各至少 3 晚。 */
import type { DemoData } from './dataset';
import { dayKey } from './rng';
import type { BedtimeCode, SleepFactor, SleepJournalEntry, SleepJournalInput, WakeMood } from '../types/sleepJournal';
import type { SleepSession } from '../types';

const MIN_NIGHTS = 3;
const MAIN_SLEEP = 180;
const wakeDay = (s: SleepSession) => dayKey(new Date(s.end_time));
const round1 = (v: number) => Math.round(v * 10) / 10;
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

export const createDemoSleepJournal = (data: DemoData) => {
  const entries = new Map<string, SleepJournalEntry>();
  const main = data.sleeps.filter((s) => (s.duration_minutes ?? 0) >= MAIN_SLEEP);
  const stamp = data.now.toISOString();
  main.slice(1, 41).forEach((night, i) => {
    if (i % 5 === 3) return; // 有几晚没记
    const score = night.score ?? 75;
    const tags = new Set<BedtimeCode>();
    if (score < 74) { tags.add(i % 2 ? '12' : '8'); if (i % 3 === 0) tags.add('14'); }
    if (score >= 80) tags.add('2');
    if (i % 4 === 1) tags.add('3');
    if (i % 7 === 2) tags.add('4');
    if (i % 9 === 5) tags.add('1');
    const mood: WakeMood = score >= 84 ? '4' : score >= 78 ? '3' : score >= 72 ? '2' : '1';
    entries.set(wakeDay(night), {
      date: wakeDay(night), behaviors: [...tags].sort((a, b) => Number(a) - Number(b)), mood, source: 'zepp', updated_at: stamp,
    });
  });
  let dismissed = false;

  const factors = () => {
    const nights = main.flatMap((s) => {
      const entry = entries.get(wakeDay(s));
      return entry && (entry.behaviors.length || entry.mood) ? [{ behaviors: entry.behaviors, s }] : [];
    });
    const seen = [...new Set(nights.flatMap((n) => n.behaviors))].sort((a, b) => Number(a) - Number(b));
    const delta = (withTag: SleepSession[], without: SleepSession[], pick: (s: SleepSession) => number | null) => {
      const a = withTag.map(pick).filter((v): v is number => v !== null);
      const b = without.map(pick).filter((v): v is number => v !== null);
      return a.length >= MIN_NIGHTS && b.length >= MIN_NIGHTS ? round1(mean(a)! - mean(b)!) : null;
    };
    const list: SleepFactor[] = seen.map((code) => {
      const withTag = nights.filter((n) => n.behaviors.includes(code)).map((n) => n.s);
      const without = nights.filter((n) => !n.behaviors.includes(code)).map((n) => n.s);
      return {
        behavior: code, nights: withTag.length, baseline_nights: without.length,
        score_delta: delta(withTag, without, (s) => (s.score && s.score > 0 ? s.score : null)),
        deep_minutes_delta: delta(withTag, without, (s) => s.deep_minutes ?? null),
        wake_count_delta: delta(withTag, without, (s) => s.wake_count ?? null),
      };
    });
    return { journaled_nights: nights.length, min_nights: MIN_NIGHTS, factors: list };
  };

  return {
    sleep_journal_prompt: () => {
      const night = main[0];
      if (!night || dismissed) return null;
      const date = wakeDay(night);
      const entry = entries.get(date);
      if (entry && (entry.behaviors.length || entry.mood)) return null;
      return { date, sleep_id: night.sleep_id, start_time: night.start_time, end_time: night.end_time, duration_minutes: night.duration_minutes, score: night.score ?? null };
    },
    sleep_journal_list: (args: Record<string, unknown>) => [...entries.values()]
      .filter((e) => e.date >= String(args.from) && e.date <= String(args.to))
      .sort((a, b) => b.date.localeCompare(a.date)),
    sleep_journal_save: (args: Record<string, unknown>) => {
      const input = args.input as SleepJournalInput;
      const entry: SleepJournalEntry = { date: input.date, behaviors: [...input.behaviors], mood: input.mood, source: 'local', updated_at: new Date().toISOString() };
      entries.set(input.date, entry);
      return entry;
    },
    sleep_journal_dismiss: () => { dismissed = true; },
    sleep_journal_snooze: () => { dismissed = true; return dayKey(new Date(data.now.getTime() + 7 * 864e5)); },
    sleep_journal_factors: factors,
  };
};

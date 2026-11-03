/**
 * 年轮一年的事实（页面右栏和分享图共用一份渲染）。没有的就是「—」，不拿 0 充数；
 * 新 PB、跑完的比赛这一年没有就整行不出。
 */
import { displayDateTimeFormatter, parseDisplayDate } from '../dateTime';
import { intlLocale } from '../../i18n';
import { kmText } from '../logbook/display';
import type { RingYear } from '../../types/rings';

export const NONE = '—';

/** 文案里要用到的那几句（`useRingsText()` 的子集，便于测试时塞假的）。 */
export interface FactWords {
  workouts: string; times: (n: number) => string;
  activeDays: string; days: (n: number) => string;
  hours: string; hoursValue: (h: string) => string;
  running: string; runValue: (runs: number, km: string) => string;
  longestRun: string; longestWorkout: string;
  busiestMonth: string; busiestValue: (month: string, n: number) => string;
  steps: string; stepsValue: (n: string) => string; sleep: string; sleepValue: (h: number, m: number) => string;
  records: string; races: string;
}

export interface Fact {
  key: 'workouts' | 'activeDays' | 'hours' | 'running' | 'longestRun' | 'longestWorkout' | 'busiestMonth' | 'steps' | 'sleep' | 'records' | 'races';
  label: string;
  value: string;
  /** 值下面的一行小字（那次运动是哪天）：以前挤在值后面，「户外骑行 · 5:51 · 12月7日」窄的时候会断在奇怪的地方。 */
  detail?: string;
  /** 页面上入场时数字从 0 滚上来（只给纯数量的那几行；时间、日期不滚）。 */
  count?: boolean;
  /** 可以点过去的那次运动。 */
  workoutId?: string;
}

const shortDay = (date: string) => displayDateTimeFormatter({ month: 'short', day: 'numeric' }).format(parseDisplayDate(date));

export const monthName = (month: number, year: number) =>
  new Intl.DateTimeFormat(intlLocale(), { month: 'long' }).format(new Date(year, month - 1, 15));

export const yearFacts = (
  year: RingYear,
  words: FactWords,
  recordName: (key: RingYear['personal_records'][number]) => string,
  kindName: (kind: string) => string,
): Fact[] => {
  const number = new Intl.NumberFormat(intlLocale());
  const blank = year.data_days === 0;
  const facts: Fact[] = [
    { key: 'workouts', label: words.workouts, value: blank ? NONE : words.times(year.workouts), count: true },
    { key: 'activeDays', label: words.activeDays, value: blank ? NONE : words.days(year.active_days), count: true },
    { key: 'hours', label: words.hours, value: year.duration_s > 0 ? words.hoursValue(number.format(Math.round(year.duration_s / 360) / 10)) : NONE, count: true },
    { key: 'running', label: words.running, value: blank ? NONE : words.runValue(year.runs, number.format(Number(kmText(year.run_distance_m / 1000)))), count: true },
  ];
  const run = year.longest_run;
  facts.push({
    key: 'longestRun', label: words.longestRun, workoutId: run?.workout_id,
    value: run?.distance_m ? `${kmText(run.distance_m / 1000)} km` : NONE, detail: run?.distance_m ? shortDay(run.date) : undefined, count: true,
  });
  const long = year.longest_workout;
  facts.push({
    key: 'longestWorkout', label: words.longestWorkout, workoutId: long?.workout_id,
    value: long?.duration_s ? `${kindName(long.kind)}\u00a0·\u00a0${Math.floor(long.duration_s / 3600)}:${String(Math.floor((long.duration_s % 3600) / 60)).padStart(2, '0')}` : NONE,
    detail: long?.duration_s ? shortDay(long.date) : undefined,
  });
  facts.push({
    key: 'busiestMonth', label: words.busiestMonth,
    value: year.busiest_month ? words.busiestValue(monthName(year.busiest_month, year.year), year.busiest_month_workouts) : NONE,
  });
  facts.push({ key: 'steps', label: words.steps, value: year.steps_total !== null ? words.stepsValue(number.format(year.steps_total)) : NONE, count: true });
  const sleep = year.sleep_avg_minutes;
  facts.push({ key: 'sleep', label: words.sleep, value: sleep !== null ? words.sleepValue(Math.floor(Math.round(sleep) / 60), Math.round(sleep) % 60) : NONE });
  if (year.personal_records.length) facts.push({ key: 'records', label: words.records, value: year.personal_records.map(recordName).join(' · ') });
  if (year.races.length) facts.push({ key: 'races', label: words.races, value: year.races.map(r => r.name).join(' · ') });
  return facts;
};

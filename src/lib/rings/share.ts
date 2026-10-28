/**
 * 年轮分享图上的字（lib/rings/draw.ts 画）：2026-10-28 重做（用户：「数据不够有吸引力，没有分享的动力」）。
 * 不再是一张「标签 / 值」的表，而是三个数（几次运动、几天有运动、几小时）+ 四条高光，每条一句平实的话加一行注脚：
 * 「跑了 577.7 km / 差不多 13.7 个全马」「十月练得最多」。刷新的 PB、跑完的比赛最值得晒，有就排最前面。
 * 同日第二版去掉了「次出发」「小时流汗」「最拼」这类口号腔（用户：AI 味太浓）。
 * 只用这一年的真实数字和由它们直接算出来的量（全马数 = 跑步距离 ÷ 42.195，每周几次 = 次数 ÷ 有数据的周数），
 * 缺的整张不出，不拿 0 填空。数字排版在这里（按界面语言），draw.ts 只管画。
 */
import { displayDateTimeFormatter, parseDisplayDate } from '../dateTime';
import { intlLocale } from '../../i18n';
import { kmText } from '../logbook/display';
import { monthName } from './facts';
import type { RingYear } from '../../types/rings';

const MARATHON_KM = 42.195;

export interface ShareWords {
  heroWorkouts: string; heroDays: string; heroHours: string;
  perWeek: (n: string) => string;
  ran: (km: string) => string; marathons: (n: string) => string; runs: (n: number) => string;
  farthest: (km: string) => string;
  longest: (time: string) => string;
  busiest: (month: string) => string; busiestNote: (n: number) => string;
  records: (n: number) => string; races: (n: number) => string;
  steps: (n: string) => string;
  sleep: (h: number, m: number) => string; sleepNote: (nights: number) => string;
}

export interface ShareHero { value: string; label: string }
export interface ShareCard { key: 'records' | 'races' | 'running' | 'farthest' | 'longest' | 'busiest' | 'steps' | 'sleep'; title: string; note: string | null }
export interface ShareStory { hero: ShareHero[]; perWeek: string | null; cards: ShareCard[] }

const shortDay = (date: string) => displayDateTimeFormatter({ month: 'short', day: 'numeric' }).format(parseDisplayDate(date));
const clock = (seconds: number) => `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`;

/** 分享图上的三个大数、一句「平均每周几次」和最多四张高光卡。 */
export function shareStory(
  year: RingYear,
  words: ShareWords,
  recordName: (key: RingYear['personal_records'][number]) => string,
  kindName: (kind: string) => string,
): ShareStory {
  const number = new Intl.NumberFormat(intlLocale());
  const one = new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 1 });
  const hero: ShareHero[] = [];
  if (year.workouts > 0) hero.push({ value: number.format(year.workouts), label: words.heroWorkouts });
  if (year.active_days > 0) hero.push({ value: number.format(year.active_days), label: words.heroDays });
  if (year.duration_s > 0) hero.push({ value: one.format(Math.round(year.duration_s / 360) / 10), label: words.heroHours });
  // 有数据的日子不到两周时，「每周几次」只是噪声。
  const perWeek = year.workouts > 0 && year.data_days >= 14 ? words.perWeek(one.format(year.workouts / (year.data_days / 7))) : null;

  const cards: ShareCard[] = [];
  if (year.personal_records.length) cards.push({ key: 'records', title: words.records(year.personal_records.length), note: year.personal_records.map(recordName).join(' · ') });
  if (year.races.length) cards.push({ key: 'races', title: words.races(year.races.length), note: year.races.map(r => r.name).join(' · ') });
  if (year.runs > 0 && year.run_distance_m > 0) {
    const km = year.run_distance_m / 1000;
    cards.push({ key: 'running', title: words.ran(number.format(Number(kmText(km)))), note: km >= MARATHON_KM ? words.marathons(one.format(km / MARATHON_KM)) : words.runs(year.runs) });
  }
  const run = year.longest_run;
  if (run?.distance_m) cards.push({ key: 'farthest', title: words.farthest(kmText(run.distance_m / 1000)), note: shortDay(run.date) });
  const long = year.longest_workout;
  if (long?.duration_s) cards.push({ key: 'longest', title: words.longest(clock(long.duration_s)), note: `${kindName(long.kind)} · ${shortDay(long.date)}` });
  if (year.busiest_month && year.busiest_month_workouts > 0) {
    cards.push({ key: 'busiest', title: words.busiest(monthName(year.busiest_month, year.year)), note: words.busiestNote(year.busiest_month_workouts) });
  }
  if (year.steps_total !== null && year.steps_total > 0) cards.push({ key: 'steps', title: words.steps(number.format(year.steps_total)), note: null });
  const sleep = year.sleep_avg_minutes;
  if (sleep !== null && sleep > 0) {
    const m = Math.round(sleep);
    cards.push({ key: 'sleep', title: words.sleep(Math.floor(m / 60), m % 60), note: year.sleep_nights > 0 ? words.sleepNote(year.sleep_nights) : null });
  }
  return { hero, perWeek, cards: cards.slice(0, 4) };
}

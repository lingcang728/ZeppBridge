import type { SleepSession } from '../types';
import { localDateString } from './format';

/**
 * 睡眠随时间：每晚一个点（按「入睡那天」算一晚），给时长、分期和作息规律。
 *
 * 作息规律用「钟面分钟」：入睡 / 起床时刻换算成当天的分钟数。入睡在中午前（00:30）算前一天的 24:30，
 * 这样 23:30 和 00:30 只差一小时，不会被当成差了 23 小时。规律性 = 入睡时刻的标准差（分钟）。
 */
export interface SleepNight {
  /** 入睡那天（本地日期）。 */
  date: string;
  minutes: number;
  deep: number | null;
  light: number | null;
  rem: number | null;
  awake: number | null;
  /** 入睡时刻（钟面分钟，凌晨入睡 +1440）。 */
  bedtime: number;
  /** 起床时刻（钟面分钟，0–1440）。 */
  wake: number;
}

const clockMinutes = (date: Date) => date.getHours() * 60 + date.getMinutes();

export const sleepNights = (sessions: SleepSession[], startDate: string, endDate: string): SleepNight[] => {
  const byDate = new Map<string, SleepNight>();
  for (const session of sessions) {
    const start = new Date(session.start_time);
    const end = new Date(session.end_time);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || !(session.duration_minutes > 0)) continue;
    // 凌晨 0–12 点入睡的，算前一晚。
    const anchor = start.getHours() < 12 ? new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1) : start;
    const date = localDateString(anchor);
    if (date < startDate || date > endDate) continue;
    const bed = clockMinutes(start);
    const night: SleepNight = {
      date,
      minutes: session.duration_minutes,
      deep: session.deep_minutes ?? null,
      light: session.light_minutes ?? null,
      rem: session.rem_minutes ?? null,
      awake: session.awake_minutes ?? null,
      bedtime: start.getHours() < 12 ? bed + 1440 : bed,
      wake: clockMinutes(end),
    };
    // 一晚有几段（午睡）时留最长的那段当主睡眠。
    const existing = byDate.get(date);
    if (!existing || existing.minutes < night.minutes) byDate.set(date, night);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
};

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** 入睡时刻的标准差（分钟）；少于 3 晚不给。 */
export const bedtimeSpread = (nights: SleepNight[]): number | null => {
  if (nights.length < 3) return null;
  const values = nights.map((night) => night.bedtime);
  const center = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - center) ** 2)));
};

export const averageBedtime = (nights: SleepNight[]): number | null => (nights.length ? mean(nights.map((night) => night.bedtime)) : null);
export const averageWake = (nights: SleepNight[]): number | null => (nights.length ? mean(nights.map((night) => night.wake)) : null);
export const averageMinutes = (nights: SleepNight[]): number | null => (nights.length ? mean(nights.map((night) => night.minutes)) : null);

/** 钟面分钟 → "23:40"（超过 24 点的回到次日）。 */
export const clockText = (minutes: number): string => {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
};

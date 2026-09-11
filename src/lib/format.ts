import { defineMessages, intlLocale, messagesOf } from '../i18n';
import {
  dateFormatPreference,
  regionalLocale,
  timeFormatPreference,
  type DateFormatPreference,
} from './datePreferences';
import {
  bigDistanceThresholdMeters,
  distanceUnitLabel,
  paceUnitLabel,
  shortDistanceUnitLabel,
  toBigDistance,
  toShortDistance,
} from './units';

export type HealthCategory = 'heart' | 'sleep' | 'activity';

/*
 * 这一层的占位文案。缺失值的说法必须跟着界面语言走，否则英文界面上会冒出
 * 「时长未知」这种半截中文——而这些恰恰是最需要看懂的字：它们说的是
 * 「这里没有数据」，不是「这里是 0」。
 */
const messages = defineMessages(
  {
    noUpdates: '暂无更新',
    noRecords: '尚无记录',
    timeUnknown: '时间未知',
    dateUnknown: '日期未知',
    durationUnknown: '时长未知',
    notRecorded: '未记录',
    duration: (hours: number, minutes: number) =>
      (hours > 0 ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`),
  },
  {
    noUpdates: 'No updates yet',
    noRecords: 'No records yet',
    timeUnknown: 'Time unknown',
    dateUnknown: 'Date unknown',
    durationUnknown: 'Duration unknown',
    notRecorded: 'Not recorded',
    duration: (hours: number, minutes: number) =>
      (hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`),
  },
);

const copy = () => messagesOf(messages);

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const localDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const DATE_TOKENS = new Set<string>(['year', 'month', 'day']);

/** 显式偏好对应的年月日排列；`regional` 交给 `Intl` 自己决定。 */
const dateOrder = (preference: DateFormatPreference): readonly string[] | null =>
  preference === 'dmy'
    ? ['day', 'month', 'year']
    : preference === 'mdy'
      ? ['month', 'day', 'year']
      : preference === 'ymd'
        ? ['year', 'month', 'day']
        : null;

/** 显式排列下请求了哪些年月日字段（`regional` 不进来）。 */
const requestedDateTokens = (options: Intl.DateTimeFormatOptions): Set<string> => {
  const tokens = new Set<string>();
  if (options.year) tokens.add('year');
  if (options.month) tokens.add('month');
  if (options.day) tokens.add('day');
  return tokens;
};

/**
 * 按偏好把年月日排成纯数字，接一个中性分隔符。
 *
 * **不能**借用地区的字面量当分隔符：英文是空格还好，zh-CN 是「年 / 月 / 日」，
 * 拿它拼 dmy 会得到 `1年1年2026日` 这种既重复又错位的坏串。数字 + `/` 与地区
 * 无关，任何一种排列都成立——这正是「显式排列」的含义。
 */
const orderedDateText = (
  date: Date,
  order: readonly string[],
  requested: ReadonlySet<string>,
): string => {
  const options: Intl.DateTimeFormatOptions = {};
  if (requested.has('year')) options.year = 'numeric';
  if (requested.has('month')) options.month = 'numeric';
  if (requested.has('day')) options.day = 'numeric';
  const values = new Map<string, string>(
    new Intl.DateTimeFormat(regionalLocale(), options)
      .formatToParts(date)
      .filter((part) => DATE_TOKENS.has(part.type))
      .map((part) => [part.type, part.value]),
  );
  return order.filter((token) => values.has(token)).map((token) => values.get(token)).join('/');
};

/** 星期与时间仍由地区决定：名字、位置、12/24 小时制都不动。 */
const regionalRemainder = (date: Date, options: Intl.DateTimeFormatOptions): string => {
  const remainder: Intl.DateTimeFormatOptions = {};
  if (options.weekday) remainder.weekday = options.weekday;
  if (options.hour) {
    remainder.hour = options.hour;
    if (options.minute) remainder.minute = options.minute;
    if (options.second) remainder.second = options.second;
    Object.assign(remainder, hourCycleOption());
  }
  return new Intl.DateTimeFormat(regionalLocale(), remainder).format(date);
};

const formatWith = (
  date: Date,
  options: Intl.DateTimeFormatOptions,
  preference: DateFormatPreference,
): string => {
  const order = dateOrder(preference);
  const formatter = new Intl.DateTimeFormat(regionalLocale(), options);
  if (!order) return formatter.format(date);

  const dateText = orderedDateText(date, order, requestedDateTokens(options));
  const remainder = regionalRemainder(date, options);
  if (!dateText) return remainder;
  if (!remainder) return dateText;

  // 星期摆在日期前还是后跟着地区：英文是「Thu, Jan 1」，zh-CN 是「1月1日 周四」。
  const parts = formatter.formatToParts(date);
  const weekdayFirst =
    parts.findIndex((part) => part.type === 'weekday')
    < parts.findIndex((part) => DATE_TOKENS.has(part.type));
  return options.weekday && weekdayFirst
    ? `${remainder} ${dateText}`
    : `${dateText} ${remainder}`;
};

/** `12h` / `24h` 覆盖小时制；`regional` 交给地区决定。 */
const hourCycleOption = (): Intl.DateTimeFormatOptions => {
  const preference = timeFormatPreference.value;
  if (preference === '12h') return { hour12: true };
  if (preference === '24h') return { hour12: false };
  return {};
};

const dateStyleOptions = (style: 'short' | 'long'): Intl.DateTimeFormatOptions =>
  style === 'long'
    ? { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }
    : { month: 'short', day: 'numeric', weekday: 'short' };

const toDate = (value?: string | number): Date | null => {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 纯日历日期（`YYYY-MM-DD`）按本地的年月日构造，绝不走 UTC。
 *
 * `new Date('2026-01-01')` 会按 UTC 午夜解析，在纽约就变成 2025-12-31
 * 晚上，整整齐齐错一天——日历日期本来就没有时刻，更没有时区。
 */
const toCalendarDate = (value: string | Date): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const match = CALENDAR_DATE.exec(value);
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDateTime = (
  value?: string | number,
  empty = copy().noUpdates,
  options: { seconds?: boolean } = {},
): string => {
  const date = toDate(value);
  if (!date) return empty;
  return formatWith(
    date,
    {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...(options.seconds ? { second: '2-digit' } : {}),
      ...hourCycleOption(),
    },
    dateFormatPreference.value,
  );
};

export const formatFullDateTime = (
  value?: string | number,
  empty = copy().noRecords,
  options: { seconds?: boolean } = {},
): string => {
  if (value === undefined || value === null || value === '') return empty;
  const date = toDate(value);
  if (!date) return copy().timeUnknown;
  return formatWith(
    date,
    {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...(options.seconds ? { second: '2-digit' } : {}),
      ...hourCycleOption(),
    },
    dateFormatPreference.value,
  );
};

export const formatDate = (value: string | number, style: 'short' | 'long' = 'short'): string => {
  const date = toDate(value);
  if (!date) return copy().dateUnknown;
  return formatWith(date, dateStyleOptions(style), dateFormatPreference.value);
};

/** 日历日期入口：`YYYY-MM-DD` 按本地字段解析，`Date` 原样使用。 */
export const formatCalendarDate = (
  value: string | Date,
  style: 'short' | 'long' = 'short',
): string => {
  const date = toCalendarDate(value);
  if (!date) return copy().dateUnknown;
  return formatWith(date, dateStyleOptions(style), dateFormatPreference.value);
};

/** 日历月份标题，如 `2026年1月` / `January 2026`；`month` 从 0 起。 */
export const formatCalendarMonth = (year: number, month: number): string =>
  new Intl.DateTimeFormat(regionalLocale(), { year: 'numeric', month: 'long' })
    .format(new Date(year, month, 1));

/**
 * 一周七天表头，从星期日开始。默认 `short`；zh-CN 的窄名（日 / 一 / 二…）传 `narrow`。
 *
 * 地区仍然取自系统（`regionalLocale`），和上面几个格式化函数同一套策略；
 * 界面语言只决定用哪一档宽度。
 */
export const formatWeekdayNames = (style: 'narrow' | 'short' | 'long' = 'short'): string[] => {
  // 2026-01-04 是星期日，从它数七天就是一周的表头。
  const sunday = new Date(2026, 0, 4);
  const formatter = new Intl.DateTimeFormat(regionalLocale(), { weekday: style });
  return Array.from({ length: 7 }, (_unused, offset) =>
    formatter.format(new Date(2026, 0, sunday.getDate() + offset)));
};

export const formatTime = (value: string | number): string => {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(regionalLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    ...hourCycleOption(),
  }).format(date);
};

export const formatDuration = (minutes?: number | null, empty = copy().durationUnknown): string => {
  if (!isFiniteNumber(minutes) || minutes < 0) return empty;
  const total = Math.round(minutes);
  return copy().duration(Math.floor(total / 60), total % 60);
};

export const formatDistance = (meters?: number, empty = copy().notRecorded): string => {
  if (!isFiniteNumber(meters) || meters <= 0) return empty;
  return meters >= bigDistanceThresholdMeters()
    ? `${toBigDistance(meters).toFixed(2)} ${distanceUnitLabel()}`
    : `${Math.round(toShortDistance(meters))} ${shortDistanceUnitLabel()}`;
};

export const formatPace = (
  distanceMeters?: number,
  durationMinutes?: number | null,
): string | null => {
  if (!isFiniteNumber(distanceMeters) || distanceMeters <= 0) return null;
  if (!isFiniteNumber(durationMinutes) || durationMinutes <= 0) return null;
  // 先换算成「每个显示单位多少秒」再取整，不是把公制结果再乘一次：
  // 先取整再换算会把四舍五入的误差也一并放大 1.6 倍。
  const totalSeconds = Math.round((durationMinutes * 60) / (toBigDistance(distanceMeters)));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')} ${paceUnitLabel()}`;
};

export const formatMetric = (value: number | undefined, digits = 0): string => {
  if (!isFiniteNumber(value)) return '—';
  return value.toLocaleString(intlLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

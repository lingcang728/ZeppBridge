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

/**
 * 按偏好重排年月日，其余部分（星期、时间、标点）原地保留。
 *
 * `Intl` 没有「只要这种年月日顺序」的开关，所以拿它排好的 parts，把三个日期
 * 字段按目标顺序填回原位：月份和星期的名字仍然跟着地区走，只换顺序。少于
 * 两个日期字段时无从排序（比如只有时间），原样返回。
 */
const applyDateOrder = (parts: Intl.DateTimeFormatPart[], preference: DateFormatPreference): string => {
  const order = dateOrder(preference);
  if (!order) return parts.map((part) => part.value).join('');
  const dateIndexes = parts
    .map((part, index) => (DATE_TOKENS.has(part.type) ? index : -1))
    .filter((index) => index >= 0);
  if (dateIndexes.length < 2) return parts.map((part) => part.value).join('');
  const first = dateIndexes[0];
  const last = dateIndexes[dateIndexes.length - 1];
  // 分界符用地区原生的，别再自己编一个：英文是空格，多数地区是斜杠。
  let separator = '';
  for (let index = first + 1; index < last; index += 1) {
    if (parts[index].type === 'literal' && parts[index].value !== '') {
      separator = parts[index].value;
      break;
    }
  }
  if (!separator) separator = '/';
  const values = new Map<string, string>(
    parts.filter((part) => DATE_TOKENS.has(part.type)).map((part) => [part.type, part.value]),
  );
  const ordered = order.filter((token) => values.has(token)).map((token) => values.get(token));
  const dateText = ordered.join(separator);
  let out = '';
  for (let index = 0; index < parts.length; index += 1) {
    if (index < first) out += parts[index].value;
    else if (index === first) out += dateText;
    else if (index > last) out += parts[index].value;
  }
  return out;
};

const formatWith = (
  date: Date,
  options: Intl.DateTimeFormatOptions,
  preference: DateFormatPreference,
): string => {
  const formatter = new Intl.DateTimeFormat(regionalLocale(), options);
  return dateOrder(preference) === null
    ? formatter.format(date)
    : applyDateOrder(formatter.formatToParts(date), preference);
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

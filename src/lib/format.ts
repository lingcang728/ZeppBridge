import { today as currentToday } from './currentDay';
import { displayDateTimeFormatter, parseDisplayDate } from './dateTime';
import { defineMessages, intlLocale, messagesOf } from '../i18n';
import {
  bigDistanceThresholdMeters,
  distanceUnitLabel,
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
    noRecords: '暂无记录',
    timeUnknown: '时间未知',
    dateUnknown: '日期未知',
    durationUnknown: '时长未知',
    notRecorded: '未记录',
    today: '今天',
    yesterday: '昨天',
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
    today: 'Today',
    yesterday: 'Yesterday',
    duration: (hours: number, minutes: number) =>
      (hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`),
  },
  {
    noUpdates: 'Sin actualizaciones',
    noRecords: 'Sin registros',
    timeUnknown: 'Hora desconocida',
    dateUnknown: 'Fecha desconocida',
    durationUnknown: 'Duración desconocida',
    notRecorded: 'No registrado',
    today: 'Hoy',
    yesterday: 'Ayer',
    duration: (hours: number, minutes: number) =>
      (hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`),
  },
  'lib/format',
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

/**
 * 一个时刻的短说法：今天只写「今天 15:22」，昨天写「昨天 22:20」，更早的写「09-25 22:20」。
 * 给「最新一条样本在什么时候」这类提示用——比完整年月日时分好读，又不会把昨天说成今天。
 */
export const formatWhen = (value?: string | null, now = currentToday()): string | null => {
  if (!value) return null;
  const date = parseDisplayDate(value);
  if (Number.isNaN(date.getTime())) return null;
  const time = displayDateTimeFormatter({ hour: '2-digit', minute: '2-digit' }).format(date);
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayStart(now) - dayStart(date)) / 86_400_000);
  if (days === 0) return `${copy().today} ${time}`;
  if (days === 1) return `${copy().yesterday} ${time}`;
  const day = displayDateTimeFormatter({ month: '2-digit', day: '2-digit' }).format(date).replace(/\//g, '-');
  return `${day} ${time}`;
};

export const formatDateTime = (value?: string, empty = copy().noUpdates): string => {
  if (!value) return empty;
  const date = parseDisplayDate(value);
  if (Number.isNaN(date.getTime())) return empty;
  return displayDateTimeFormatter({
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const formatFullDateTime = (value?: string, empty = copy().noRecords): string => {
  if (!value) return empty;
  const date = parseDisplayDate(value);
  if (Number.isNaN(date.getTime())) return copy().timeUnknown;
  return displayDateTimeFormatter({
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const formatDate = (value: string, style: 'short' | 'long' = 'short'): string => {
  const date = parseDisplayDate(value);
  if (Number.isNaN(date.getTime())) return copy().dateUnknown;
  if (style === 'long') {
    return displayDateTimeFormatter({
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }).format(date);
  }
  return displayDateTimeFormatter({
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
};

export const formatTime = (value: string): string => {
  const date = parseDisplayDate(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : displayDateTimeFormatter({ hour: '2-digit', minute: '2-digit' }).format(date);
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

export const formatMetric = (value: number | undefined, digits = 0): string => {
  if (!isFiniteNumber(value)) return '—';
  return value.toLocaleString(intlLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

/**
 * 全应用唯一的字节写法：< 1 KiB 写 B，< 1 MiB 写整数 KB，< 1 GiB 写一位小数 MB，
 * 再往上两位小数 GB。没有值（null / NaN / ≤ 0）给 `empty`——调用方决定那是「—」、
 * 「未提供」还是「0 KB」。
 */
export const formatBytes = (bytes: number | null | undefined, empty = '—'): string => {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return empty;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

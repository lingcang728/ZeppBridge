import { defineMessages, intlLocale, messagesOf } from '../i18n';

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

export const formatDateTime = (value?: string, empty = copy().noUpdates): string => {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return empty;
  return new Intl.DateTimeFormat(intlLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const formatFullDateTime = (value?: string, empty = copy().noRecords): string => {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return copy().timeUnknown;
  return new Intl.DateTimeFormat(intlLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const formatDate = (value: string, style: 'short' | 'long' = 'short'): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return copy().dateUnknown;
  if (style === 'long') {
    return new Intl.DateTimeFormat(intlLocale(), {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }).format(date);
  }
  return new Intl.DateTimeFormat(intlLocale(), {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
};

export const formatTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit' }).format(date);
};

export const formatDuration = (minutes?: number | null, empty = copy().durationUnknown): string => {
  if (!isFiniteNumber(minutes) || minutes < 0) return empty;
  const total = Math.round(minutes);
  return copy().duration(Math.floor(total / 60), total % 60);
};

export const formatDistance = (meters?: number, empty = copy().notRecorded): string => {
  if (!isFiniteNumber(meters) || meters <= 0) return empty;
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
};

export const formatPace = (
  distanceMeters?: number,
  durationMinutes?: number | null,
): string | null => {
  if (!isFiniteNumber(distanceMeters) || distanceMeters <= 0) return null;
  if (!isFiniteNumber(durationMinutes) || durationMinutes <= 0) return null;
  const totalSeconds = Math.round((durationMinutes / (distanceMeters / 1000)) * 60);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')} /km`;
};

export const formatMetric = (value: number | undefined, digits = 0): string => {
  if (!isFiniteNumber(value)) return '—';
  return value.toLocaleString(intlLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

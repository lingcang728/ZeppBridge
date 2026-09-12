import { computed, ref } from 'vue';
import { defineMessages, messagesOf } from '../i18n';

export type TimeFormat = 'regional' | '12h' | '24h';
export type DateOrder = 'regional' | 'ymd' | 'dmy' | 'mdy';
export const TIME_FORMATS: readonly TimeFormat[] = ['regional', '12h', '24h'];
export const DATE_ORDERS: readonly DateOrder[] = ['regional', 'ymd', 'dmy', 'mdy'];
function saved<T extends string>(key: string, choices: readonly T[]): T {
  try {
    const value = localStorage.getItem(key) as T;
    if (choices.includes(value)) return value;
  } catch { /* Storage may be unavailable. */ }
  return choices[0]!;
}
const time = ref(saved('zeppbridge-time-format', TIME_FORMATS));
const order = ref(saved('zeppbridge-date-order', DATE_ORDERS));
export const timeFormat = computed(() => time.value);
export const dateOrder = computed(() => order.value);
export function setTimeFormat(value: TimeFormat) {
  if (!TIME_FORMATS.includes(value)) return;
  time.value = value;
  try { localStorage.setItem('zeppbridge-time-format', value); } catch { /* Session only. */ }
}
export function setDateOrder(value: DateOrder) {
  if (!DATE_ORDERS.includes(value)) return;
  order.value = value;
  try { localStorage.setItem('zeppbridge-date-order', value); } catch { /* Session only. */ }
}
const words = defineMessages(
  { time: '时间格式', date: '日期格式', regional: '跟随系统地区', '12h': '12 小时', '24h': '24 小时', ymd: '年/月/日', dmy: '日/月/年', mdy: '月/日/年' },
  { time: 'Time format', date: 'Date format', regional: 'System region', '12h': '12-hour', '24h': '24-hour', ymd: 'Year/month/day', dmy: 'Day/month/year', mdy: 'Month/day/year' },
  { time: 'Formato de hora', date: 'Formato de fecha', regional: 'Región del sistema', '12h': '12 horas', '24h': '24 horas', ymd: 'Año/mes/día', dmy: 'Día/mes/año', mdy: 'Mes/día/año' },
);
export const dateTimeLabels = computed(() => messagesOf(words));

/** Calendar dates are local dates; ISO timestamps retain their explicit offset. */
export function parseDisplayDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(value);
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date : new Date(NaN);
}

/** Shared display policy. Never changes exported timestamps or source timezone semantics. */
export function displayDateTimeFormatter(options: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormat {
  const adjusted = { ...options };
  delete adjusted.hour12;
  if (adjusted.hour || adjusted.timeStyle) {
    if (time.value !== 'regional') adjusted.hourCycle = time.value === '12h' ? 'h12' : 'h23';
  }
  let region = typeof navigator === 'undefined' ? undefined : navigator.languages?.[0] || navigator.language;
  if (order.value !== 'regional' && (adjusted.day || adjusted.dateStyle)) {
    region = { ymd: 'sv-SE', dmy: 'en-GB', mdy: 'en-US' }[order.value];
    if (!adjusted.dateStyle) {
      adjusted.month = '2-digit';
      adjusted.day = '2-digit';
    }
    // Date order must not choose the hour cycle on behalf of the user.
    if (time.value === 'regional' && (adjusted.hour || adjusted.timeStyle)) {
      adjusted.hour12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12;
    }
  }
  return new Intl.DateTimeFormat(region, adjusted);
}

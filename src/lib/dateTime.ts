import { computed, ref } from 'vue';
import { defineMessages, intlLocale, messagesOf } from '../i18n';

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
/* 操作系统的区域格式（Windows「区域 → 格式」、macOS「语言与地区」、Linux LC_TIME），开机由后端探一次。
   「跟随系统地区」以前跟的其实是界面语言：英文界面的欧洲用户因此看到 MM/DD、12 小时制（2026-10 反馈）。
   探不到（浏览器预览、老后端）就是 null，退回界面语言，和以前一样。 */
const systemRegion = ref<string | null>(null);
export function setSystemRegion(value: string | null | undefined) {
  const tag = value?.trim().split('.')[0]?.split('@')[0]?.replace(/_/g, '-');
  try {
    systemRegion.value = tag ? Intl.getCanonicalLocales(tag)[0] ?? null : null;
  } catch {
    systemRegion.value = null;
  }
}

type ExplicitOrder = Exclude<DateOrder, 'regional'>;
const orderCache = new Map<string, ExplicitOrder>();
/** 某个区域把年月日排成什么顺序（数字日期）。 */
export function regionDateOrder(locale: string): ExplicitOrder {
  const cached = orderCache.get(locale);
  if (cached) return cached;
  const sequence = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(2001, 10, 22))
    .filter((part) => part.type === 'year' || part.type === 'month' || part.type === 'day')
    .map((part) => part.type[0])
    .join('');
  const found: ExplicitOrder = sequence === 'dmy' ? 'dmy' : sequence === 'mdy' ? 'mdy' : 'ymd';
  orderCache.set(locale, found);
  return found;
}

const words = defineMessages(
  { time: '时间格式', date: '日期格式', regional: '跟随系统地区', '12h': '12 小时', '24h': '24 小时', ymd: '年/月/日', dmy: '日/月/年', mdy: '月/日/年' },
  { time: 'Time format', date: 'Date format', regional: 'System region', '12h': '12-hour', '24h': '24-hour', ymd: 'Year/month/day', dmy: 'Day/month/year', mdy: 'Month/day/year' },
  { time: 'Formato de hora', date: 'Formato de fecha', regional: 'Región del sistema', '12h': '12 horas', '24h': '24 horas', ymd: 'Año/mes/día', dmy: 'Día/mes/año', mdy: 'Mes/día/año' },
  'lib/dateTime',
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

/* Intl.DateTimeFormat 的构造在格式化热路径上很贵（locale 谈判 + 选项骨架
   解析）。键 = 界面语言 | 时间格式偏好 | 日期顺序偏好 | 选项序列化——这三个
   偏好都在键里，任何一项变化 key 自然换新，不用显式失效。 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

/* 选项对象的键序由调用点写法决定；排序后序列化，同一组选项归到同一键。 */
const optionsKey = (options: Intl.DateTimeFormatOptions): string =>
  JSON.stringify(
    Object.keys(options)
      .sort()
      .map((name) => [name, (options as Record<string, unknown>)[name]]),
  );

/* 系统 hour12 只跟 OS 地区有关、与任何偏好无关——每个区域探一次记住即可。
   后端给了区域格式就按它；没给就退回 WebView 的默认语言。 */
const hour12Cache = new Map<string, boolean | undefined>();
const probeSystemHour12 = (): boolean | undefined => {
  const region = systemRegion.value ?? '';
  if (!hour12Cache.has(region)) {
    hour12Cache.set(region, new Intl.DateTimeFormat(region || undefined, { hour: 'numeric' }).resolvedOptions().hour12);
  }
  return hour12Cache.get(region);
};

/* 界面语言的语种 + 系统区域的国家，例如 en + pt-PT → en-PT。拼不出来就 undefined。 */
function blendLocale(language: string, systemLocale: string): string | undefined {
  try {
    const country = new Intl.Locale(systemLocale).region;
    if (!country) return undefined;
    return Intl.getCanonicalLocales(`${new Intl.Locale(language).language}-${country}`)[0];
  } catch {
    return undefined;
  }
}

/** Shared display policy. Never changes exported timestamps or source timezone semantics. */
export function displayDateTimeFormatter(options: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormat {
  const key = `${intlLocale()}|${systemRegion.value ?? ''}|${time.value}|${order.value}|${optionsKey(options)}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const adjusted = { ...options };
  delete adjusted.hour12;
  if (adjusted.hour || adjusted.timeStyle) {
    if (time.value !== 'regional') adjusted.hourCycle = time.value === '12h' ? 'h12' : 'h23';
    else if (systemRegion.value) adjusted.hour12 = probeSystemHour12();
  }
  let region: string | undefined = intlLocale();
  /* 「跟随系统地区」且系统区域的数字日期顺序和界面语言不同（英文界面 + 葡萄牙区域）：按系统区域的顺序排，
     字（月名、星期）仍跟界面语言——先试「界面语言 + 区域国家」（en-PT），CLDR 有这一组就用它；
     没有的话只给纯数字的格式换顺序，带字的格式宁可照旧，也不能把星期换成英文。 */
  let effectiveOrder: DateOrder = order.value;
  if (effectiveOrder === 'regional' && systemRegion.value) {
    const wanted = regionDateOrder(systemRegion.value);
    if (wanted !== regionDateOrder(region)) {
      const blended = blendLocale(region, systemRegion.value);
      const hasWords = Boolean(adjusted.weekday || adjusted.dateStyle || adjusted.era)
        || ['short', 'long', 'narrow'].includes(String(adjusted.month));
      if (blended && regionDateOrder(blended) === wanted) region = blended;
      else if (!hasWords) effectiveOrder = wanted;
    }
  }
  if (effectiveOrder !== 'regional' && (adjusted.day || adjusted.dateStyle)) {
    region = { ymd: 'sv-SE', dmy: 'en-GB', mdy: 'en-US' }[effectiveOrder];
    if (!adjusted.dateStyle) {
      adjusted.month = '2-digit';
      adjusted.day = '2-digit';
    }
    // Date order must not choose the hour cycle on behalf of the user.
    if (time.value === 'regional' && (adjusted.hour || adjusted.timeStyle)) {
      adjusted.hour12 = probeSystemHour12();
    }
  }
  const formatter = new Intl.DateTimeFormat(region, adjusted);
  formatterCache.set(key, formatter);
  return formatter;
}

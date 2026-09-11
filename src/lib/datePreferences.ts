import { computed, ref, type ComputedRef } from 'vue';
import { intlLocale } from '../i18n';

/**
 * 本地显示层的日期与时间格式偏好。
 *
 * 和单位（`units.ts`）、界面语言（`i18n/index.ts`）一个性质：这只是「怎么看」，
 * 不碰数据库 schema，也不回传后端。绝对时刻一律按运行时的本地时区渲染，
 * 这里只决定年月日的排列顺序和 12 / 24 小时制。
 *
 * **为什么地区不跟界面语言走：** 界面选英文不代表用户在美国。`intlLocale()`
 * 会把英文界面固定在 en-US，于是英国用户看到 9/5/2026 这种月在前、日
 * 在后的日期。系统地区（`navigator.language`）才是判断顺序的依据。
 */
export type DateFormatPreference = 'regional' | 'dmy' | 'mdy' | 'ymd';
export type TimeFormatPreference = 'regional' | '12h' | '24h';

/** 日期格式选择器按这个顺序排。 */
export const DATE_FORMATS: readonly DateFormatPreference[] = ['regional', 'dmy', 'mdy', 'ymd'];
/** 时间格式选择器按这个顺序排。 */
export const TIME_FORMATS: readonly TimeFormatPreference[] = ['regional', '12h', '24h'];

const DATE_STORAGE_KEY = 'zeppbridge-date-format';
const TIME_STORAGE_KEY = 'zeppbridge-time-format';

const isDateFormat = (value: unknown): value is DateFormatPreference =>
  value === 'regional' || value === 'dmy' || value === 'mdy' || value === 'ymd';

const isTimeFormat = (value: unknown): value is TimeFormatPreference =>
  value === 'regional' || value === '12h' || value === '24h';

const read = <T>(key: string, valid: (value: unknown) => value is T, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    if (valid(saved)) return saved;
  } catch {
    // 隐私模式下 localStorage 可能直接抛异常，不该拦住应用启动。
  }
  return fallback;
};

const persist = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 存不下就只在本次会话里生效，比整个切换动作失败要好。
  }
};

const currentDateFormat = ref<DateFormatPreference>(read(DATE_STORAGE_KEY, isDateFormat, 'regional'));
const currentTimeFormat = ref<TimeFormatPreference>(read(TIME_STORAGE_KEY, isTimeFormat, 'regional'));

/** 当前日期格式。只读；要改走 `setDateFormat`。 */
export const dateFormatPreference: ComputedRef<DateFormatPreference> =
  computed(() => currentDateFormat.value);
/** 当前时间格式。只读；要改走 `setTimeFormat`。 */
export const timeFormatPreference: ComputedRef<TimeFormatPreference> =
  computed(() => currentTimeFormat.value);

export const setDateFormat = (value: DateFormatPreference): void => {
  if (!isDateFormat(value) || value === currentDateFormat.value) return;
  currentDateFormat.value = value;
  persist(DATE_STORAGE_KEY, value);
};

export const setTimeFormat = (value: TimeFormatPreference): void => {
  if (!isTimeFormat(value) || value === currentTimeFormat.value) return;
  currentTimeFormat.value = value;
  persist(TIME_STORAGE_KEY, value);
};

/**
 * 传给 `Intl` 的语言标记：跟随系统 / 浏览器地区，而不是界面语言。
 *
 * 没有 `navigator`（测试或非浏览器环境）时安全退回界面语言。
 */
export const regionalLocale = (): string => {
  if (typeof navigator !== 'undefined') {
    const language = navigator.language;
    if (typeof language === 'string' && language) return language;
  }
  return intlLocale();
};

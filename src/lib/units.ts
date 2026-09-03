import { computed, ref } from 'vue';
import { defineMessages, messagesOf } from '../i18n';

/**
 * 距离单位。
 *
 * u/Andrew-Scoggins 开口要的（Reddit，2026-09-02），但这不是一个人的事：
 * 配速和距离一直写死成公制，所有不用公制的国家都撞在同一处。
 *
 * **为什么不放在 `UserPrefs` 里：** 这是纯显示层的选择，和界面语言一个性质。
 * 语言就存在 `localStorage`（见 `i18n/index.ts`），单位跟它走：不用改数据库
 * schema，也不会让一个只影响看的东西跑到后端去。
 *
 * **导出不受影响。** JSON / CSV / GPX / FIT 永远是公制——那是 CLI 和 MCP 的契约，
 * 也是第三方平台读它们的前提。这里只换界面上看到的那一层。
 */
export type DistanceUnit = 'metric' | 'imperial';

/** 单位选择器按这个顺序排。 */
export const DISTANCE_UNITS: readonly DistanceUnit[] = ['metric', 'imperial'];

const STORAGE_KEY = 'zeppbridge-distance-unit';

/** 国际单位制定义的英里。不是约数，精确值。 */
export const METRES_PER_MILE = 1609.344;
/** 同上，国际英尺。 */
export const METRES_PER_FOOT = 0.3048;

const isDistanceUnit = (value: unknown): value is DistanceUnit =>
  value === 'metric' || value === 'imperial';

/**
 * 默认用哪一种：记住的选择优先，其次看系统地区。
 *
 * 只有明确是那几个不用公制的地区才给英制。世界上绝大多数人用公制，
 * 猜错了让他们去设置里改，不如一开始就猜向多数那边。
 * 英国故意不算：那里开车看英里、跑步看公里是常态，没有一个能猜对的默认值。
 */
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);

const detectUnit = (): DistanceUnit => {
  if (typeof window === 'undefined') return 'metric';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isDistanceUnit(saved)) return saved;
  } catch {
    // 隐私模式下 `localStorage` 可能直接抛异常，不该拦住应用启动。
  }
  const preferred = window.navigator.languages?.[0] ?? window.navigator.language ?? '';
  const region = preferred.split('-')[1]?.toUpperCase();
  return region && IMPERIAL_REGIONS.has(region) ? 'imperial' : 'metric';
};

const current = ref<DistanceUnit>(detectUnit());

/** 当前单位。只读；要改走 `setDistanceUnit`。 */
export const distanceUnit = computed<DistanceUnit>(() => current.value);

export const setDistanceUnit = (value: DistanceUnit) => {
  if (!isDistanceUnit(value) || value === current.value) return;
  current.value = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // 存不下就只在本次会话里生效，比整个切换动作失败要好。
  }
};

const imperial = () => current.value === 'imperial';

/*
 * 单位的写法跟着界面语言走。
 *
 * 中文界面里距离本来写的就是「公里」「米」（运动列表、最近记录都是），
 * 把它们换成 `km` 是一个没人要求的回退。配速相反：`5'30"/km` 两边界面里
 * 本来就都是这么写的，所以它保持符号。
 */

/** 大单位的名字：`km` / `mi`。 */
const unitWords = defineMessages(
  { big: '公里', short: '米', bigImperial: '英里', shortImperial: '英尺' },
  { big: 'km', short: 'm', bigImperial: 'mi', shortImperial: 'ft' },
);

export const distanceUnitLabel = (): string => {
  const words = messagesOf(unitWords);
  return imperial() ? words.bigImperial : words.big;
};
/** 小单位的名字：`m` / `ft`。活动不足一公里时用它。 */
export const shortDistanceUnitLabel = (): string => {
  const words = messagesOf(unitWords);
  return imperial() ? words.shortImperial : words.short;
};
/** 配速后缀：`/km` / `/mi`。 */
/** 选择器上那两个按钮的文字。跟着界面语言，和 `LOCALE_LABELS` 一个位置。 */
export const distanceUnitOptionLabel = (unit: DistanceUnit): string => {
  const words = messagesOf(unitWords);
  return unit === 'imperial' ? words.bigImperial : words.big;
};

/** 配速后缀：`/km` / `/mi`。 */
export const paceUnitLabel = (): string => (imperial() ? '/mi' : '/km');
/** 图表轴上的配速单位：`min/km` / `min/mi`。 */
export const paceAxisLabel = (): string => (imperial() ? 'min/mi' : 'min/km');

/** 米 → 当前大单位的数值。 */
export const toBigDistance = (meters: number): number =>
  meters / (imperial() ? METRES_PER_MILE : 1000);

/** 米 → 当前小单位的数值。 */
export const toShortDistance = (meters: number): number =>
  imperial() ? meters / METRES_PER_FOOT : meters;

/** 大小单位的分界：公制下是 1000 m，英制下是 1 英里。 */
export const bigDistanceThresholdMeters = (): number => (imperial() ? METRES_PER_MILE : 1000);

/** 海拔 / 爬升：米 → 米或英尺。 */
export const toElevation = (meters: number): number =>
  imperial() ? meters / METRES_PER_FOOT : meters;
/** 爬升的单位名。和小距离一样，单独一个函数只为了调用点读起来是对的。 */
export const elevationUnitLabel = (): string => shortDistanceUnitLabel();

/** 每公里秒 → 每个当前大单位的秒。公制下原样返回。 */
export const paceSecondsPerBigUnit = (secondsPerKm: number): number =>
  imperial() ? secondsPerKm * (METRES_PER_MILE / 1000) : secondsPerKm;

/** 每公里分 → 每个当前大单位的分。 */
export const paceMinutesPerBigUnit = (minutesPerKm: number): number =>
  imperial() ? minutesPerKm * (METRES_PER_MILE / 1000) : minutesPerKm;

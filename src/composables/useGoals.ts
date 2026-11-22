import { ref, watch, type Ref } from 'vue';

/**
 * 个人目标：每天步数、每晚睡眠、每周距离。只存在这台机器的浏览器存储里（和趋势范围一样），不上传。
 * 某一项是 null 表示「不设这个目标」。距离统一存成米，显示时按当前的公制 / 英制换算。
 * 图表上的目标线（每日步数、睡眠时长）和概览的目标卡读的是同一份。
 */
export interface Goals {
  stepsPerDay: number | null;
  /** 每晚睡眠，小时。 */
  sleepHours: number | null;
  /** 每周运动距离，米。 */
  weeklyDistanceM: number | null;
}

const STORAGE_KEY = 'zeppbridge.goals';
/** 起步的参考值：只是第一次打开时的默认，随时可以改或清掉。 */
export const DEFAULT_GOALS: Goals = { stepsPerDay: 8000, sleepHours: 7.5, weeklyDistanceM: 30_000 };

const sane = (value: unknown, min: number, max: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;

export const normalizeGoals = (raw: unknown, fallback: Goals = DEFAULT_GOALS): Goals => {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const source = raw as Record<string, unknown>;
  // 键不存在 = 没存过（用默认）；键存在但是 null / 非法 = 用户清掉了（不设）。
  const pick = (key: keyof Goals, min: number, max: number) => (key in source ? sane(source[key], min, max) : fallback[key]);
  return {
    stepsPerDay: pick('stepsPerDay', 500, 100_000),
    sleepHours: pick('sleepHours', 3, 14),
    weeklyDistanceM: pick('weeklyDistanceM', 1000, 2_000_000),
  };
};

const read = (): Goals => {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    return text ? normalizeGoals(JSON.parse(text)) : { ...DEFAULT_GOALS };
  } catch {
    return { ...DEFAULT_GOALS };
  }
};

let shared: Ref<Goals> | null = null;

export const useGoals = (): Ref<Goals> => {
  if (shared) return shared;
  shared = ref<Goals>(read());
  watch(shared, (value) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // 写不进（隐私模式）就不记，本次会话里各处仍然一致。
    }
  }, { deep: true });
  return shared;
};

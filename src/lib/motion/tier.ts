import { computed, ref } from 'vue';

/**
 * 动效档位与电源状态（批次 6）：useEffects 在首屏就要读 `autoLite`，所以只把这一小块放首屏；
 * 重特效名额、灰粒预算在 performance.ts（跟着灰烬动画懒加载），量帧和看电源在 performanceSensing.ts。
 */
export type MotionTier = 'high' | 'mid' | 'low';
export const ORDER: MotionTier[] = ['low', 'mid', 'high'];
const TIER_KEY = 'zeppbridge.motion.tier.v1';
/** 电量低于这个比例且没在充电，算省电（Telegram 的默认阈值也是 15%）。 */
export const LOW_BATTERY = 0.15;

const lower = (a: MotionTier, b: MotionTier): MotionTier => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);
export const down = (tier: MotionTier): MotionTier => ORDER[Math.max(0, ORDER.indexOf(tier) - 1)]!;

/** 核数给的上限：8 核以上高、4 核以上中，其余低；读不到按中。 */
export const tierFromCores = (cores?: number): MotionTier =>
  !cores ? 'mid' : cores >= 8 ? 'high' : cores >= 4 ? 'mid' : 'low';

/** 帧间隔 → 档位：看 90 分位。超过 200ms 的一帧当作窗口被拖动 / 切走，不算（Telegram 也这样丢掉异常步长）。 */
export const tierFromFrames = (intervals: number[], ceiling: MotionTier): MotionTier => {
  const usable = intervals.filter((ms) => ms > 0 && ms < 200).sort((a, b) => a - b);
  if (usable.length < 12) return ceiling;
  const p90 = usable[Math.floor(usable.length * 0.9)]!;
  return lower(p90 > 40 ? 'low' : p90 > 22 ? 'mid' : 'high', ceiling);
};

/** 一次重特效的帧：超过 33ms（掉到 30 帧以下）的占三成以上，算「这台机器扛不住」。 */
export const effectWasJanky = (intervals: number[]): boolean => {
  const usable = intervals.filter((ms) => ms > 0 && ms < 200);
  return usable.length >= 12 && usable.filter((ms) => ms > 33).length / usable.length > 0.3;
};

export const readTier = (): MotionTier | null => {
  try {
    const saved = window.localStorage.getItem(TIER_KEY);
    return saved === 'high' || saved === 'mid' || saved === 'low' ? saved : null;
  } catch { return null; }
};
export const saveTier = (tier: MotionTier) => {
  try { window.localStorage.setItem(TIER_KEY, tier); } catch { /* 存不下就只管这一次 */ }
};

export const cores = () => (typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency);
export const motionTier = ref<MotionTier>((typeof window !== 'undefined' && readTier()) || tierFromCores(cores()));
export const power = ref({ onBattery: false, low: false });
/** 「自动」特效档该不该退成低特效：量出来是低档，或者电量低。 */
export const autoLite = computed(() => motionTier.value === 'low' || power.value.low);


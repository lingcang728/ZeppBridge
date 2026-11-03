/**
 * 动效的性能预算（批次 6，参考 Telegram-iOS 的思路，没有拷代码；笔记在 docs/development/motion-performance-notes.md）。
 *
 * - **档位**：按核数先猜一个上限（Telegram 用核数判断「图形够不够用」），首启空闲时量几十帧再定，记住；
 *   之后每放完一次重特效看它的帧，连续两次大半帧超时就往下降一档。帧时只留在本机内存，不上报。
 * - **电源**：用电池时灰的画布只画 30 帧；电量低于 15% 且没在充电时，「自动」特效档按低特效走（useEffects）。
 * - **重特效一次一个**：灰烬（换语言、信纸化灰）同一时刻只许一个；第二个拿不到名额就退成直接切换，不叠着抢帧。
 *
 * 用户在设置里明确选了「完整」就不自动降级——只少画一些灰粒、用电池时少画几帧。
 * 档位与电源状态在 tier.ts（首屏只要它）；首启量帧和看电源在 performanceSensing.ts，外壳就绪后才按需加载。
 */
import { down, effectWasJanky, motionTier, power, saveTier, type MotionTier } from './tier';

export { autoLite, effectWasJanky, LOW_BATTERY, motionTier, power, tierFromCores, tierFromFrames, type MotionTier } from './tier';

/** 一屏灰最多多少粒。用电池时再少四成。 */
export const grainBudget = (): number =>
  ({ high: 36000, mid: 24000, low: 12000 })[motionTier.value] * (power.value.onBattery ? 0.6 : 1);
/** 灰的画布两帧之间至少隔多久：用电池时 30 帧，否则跟屏幕。留 3ms 余量，免得 60Hz 下踩着线隔帧跳。 */
export const frameFloorMs = (): number => (power.value.onBattery ? 1000 / 30 - 3 : 0);

/* ── 重特效名额 ──────────────────────────────── */

let holder: string | null = null;
let holds = 0;
let streak = 0;

/**
 * 要一个重特效名额。同名可以重入（换语言连拨时同一条队列里的几圈）；被别的特效占着就返回 null，调用方退成直接切换。
 * 返回的释放函数带上这次特效的帧间隔（没有就不给），用来自适应降档。忘了释放 8 秒后自己放开。
 */
export const claimHeavy = (name: string): ((intervals?: number[]) => void) | null => {
  if (holder && holder !== name) return null;
  holder = name;
  holds += 1;
  let released = false;
  const timer = globalThis.setTimeout(() => release(), 8000);
  const release = (intervals?: number[]) => {
    if (released) return;
    released = true;
    globalThis.clearTimeout(timer);
    holds = Math.max(0, holds - 1);
    if (!holds) holder = null;
    if (intervals) noteEffect(intervals);
  };
  return release;
};

/** 连续两次重特效都卡，往下降一档并记住；中间有一次顺就清零。 */
export const noteEffect = (intervals: number[]): void => {
  if (!effectWasJanky(intervals)) { streak = 0; return; }
  streak += 1;
  if (streak < 2) return;
  streak = 0;
  const next = down(motionTier.value);
  if (next === motionTier.value) return;
  motionTier.value = next;
  saveTier(next);
};

/* ── 帧记录（只在内存） ──────────────────────────────── */

let recording: number[] | null = null;
/** 灰的画布每画一帧记一笔间隔（ashDust）。 */
export const recordFrame = (ms: number): void => { if (recording && recording.length < 600) recording.push(ms); };
export const beginFrameLog = (): void => { recording = []; };
export const endFrameLog = (): number[] => { const out = recording ?? []; recording = null; return out; };

/** 测试用：回到初始状态。 */
export const resetMotionPerformance = (tier: MotionTier = 'mid'): void => {
  motionTier.value = tier;
  power.value = { onBattery: false, low: false };
  holder = null;
  holds = 0;
  streak = 0;
  recording = null;
};

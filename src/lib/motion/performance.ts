import { computed, ref } from 'vue';

/**
 * 动效的性能预算（批次 6，参考 Telegram-iOS 的思路，没有拷代码；笔记在 docs/development/motion-performance-notes.md）。
 *
 * - **档位**：按核数先猜一个上限（Telegram 用核数判断「图形够不够用」），首启空闲时量几十帧再定，记住；
 *   之后每放完一次重特效看它的帧，连续两次大半帧超时就往下降一档。帧时只留在本机内存，不上报。
 * - **电源**：用电池时灰的画布只画 30 帧；电量低于 15% 且没在充电时，「自动」特效档按低特效走（useEffects）。
 * - **重特效一次一个**：灰烬（换语言、信纸化灰）同一时刻只许一个；第二个拿不到名额就退成直接切换，不叠着抢帧。
 *
 * 用户在设置里明确选了「完整」就不自动降级——只少画一些灰粒、用电池时少画几帧。
 */
export type MotionTier = 'high' | 'mid' | 'low';
const ORDER: MotionTier[] = ['low', 'mid', 'high'];
const TIER_KEY = 'zeppbridge.motion.tier.v1';
/** 电量低于这个比例且没在充电，算省电（Telegram 的默认阈值也是 15%）。 */
export const LOW_BATTERY = 0.15;

const lower = (a: MotionTier, b: MotionTier): MotionTier => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);
const down = (tier: MotionTier): MotionTier => ORDER[Math.max(0, ORDER.indexOf(tier) - 1)]!;

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

const readTier = (): MotionTier | null => {
  try {
    const saved = window.localStorage.getItem(TIER_KEY);
    return saved === 'high' || saved === 'mid' || saved === 'low' ? saved : null;
  } catch { return null; }
};
const saveTier = (tier: MotionTier) => {
  try { window.localStorage.setItem(TIER_KEY, tier); } catch { /* 存不下就只管这一次 */ }
};

const cores = () => (typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency);
export const motionTier = ref<MotionTier>((typeof window !== 'undefined' && readTier()) || tierFromCores(cores()));
export const power = ref({ onBattery: false, low: false });
/** 「自动」特效档该不该退成低特效：量出来是低档，或者电量低。 */
export const autoLite = computed(() => motionTier.value === 'low' || power.value.low);

/** 一屏灰最多多少粒。用电池时再少四成。 */
export const grainBudget = (): number =>
  ({ high: 36000, mid: 24000, low: 12000 })[motionTier.value] * (power.value.onBattery ? 0.6 : 1);
/** 灰的画布两帧之间至少隔多久：用电池时 30 帧，否则跟屏幕。留 3ms 余量，免得 60Hz 下踩着线隔帧跳。 */
export const frameFloorMs = (): number => (power.value.onBattery ? 1000 / 30 - 3 : 0);

/* ── 首启量帧 ──────────────────────────────── */

const measureFrames = (count: number): Promise<number[] | null> => new Promise((resolve) => {
  const intervals: number[] = [];
  let last = 0;
  const step = (ts: number) => {
    if (document.hidden) { resolve(null); return; }
    if (last) intervals.push(ts - last);
    last = ts;
    if (intervals.length >= count) resolve(intervals);
    else requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});

let started = false;
/**
 * 桌面外壳就绪后调一次（AppShell）：开始看电源；没量过档位的话，等空闲时量 48 帧。
 * 量的时候窗口被切走就作罢，下次启动再量。
 */
export const startMotionSensing = (): void => {
  if (started || typeof window === 'undefined') return;
  started = true;
  void watchPower();
  if (readTier()) return;
  const idle = (run: () => void) => ('requestIdleCallback' in window
    ? window.requestIdleCallback(run, { timeout: 4000 }) : globalThis.setTimeout(run, 1500));
  idle(() => {
    void measureFrames(48).then((intervals) => {
      if (!intervals) { started = false; return; }
      const tier = tierFromFrames(intervals, tierFromCores(cores()));
      motionTier.value = tier;
      saveTier(tier);
    });
  });
};

type Battery = EventTarget & { charging: boolean; level: number };
const watchPower = async () => {
  const nav = navigator as Navigator & { getBattery?: () => Promise<Battery> };
  if (!nav.getBattery) return;
  try {
    const battery = await nav.getBattery();
    const update = () => {
      power.value = { onBattery: !battery.charging, low: !battery.charging && battery.level <= LOW_BATTERY };
    };
    update();
    battery.addEventListener('chargingchange', update);
    battery.addEventListener('levelchange', update);
  } catch { /* 拿不到电池信息就当插着电 */ }
};

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
  started = false;
};

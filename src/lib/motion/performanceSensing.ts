import { cores, LOW_BATTERY, motionTier, power, readTier, saveTier, tierFromCores, tierFromFrames } from './tier';

/**
 * 动效预算的「量」那一半（批次 6）：首启空闲时量 48 帧定档、看电源。从 performance.ts 拆出来，
 * 外壳就绪后才 `import()`（AppShell），不进首屏关键路径（首屏体积预算）。
 */
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
 * 桌面外壳就绪后调一次：开始看电源；没量过档位的话，等空闲时量 48 帧。
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

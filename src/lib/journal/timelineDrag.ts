/**
 * 纪元时间轴（components/journal/EpochTimeline.vue）的拖动手感：估速、过界的橡皮筋、松手后的滑行和弹回。
 *
 * 2026-10-28 用户嫌拖起来「吃力」：不跟手、松手就停、到头硬停。
 * - 估速只看最后一个事件，常常只挪了零点几像素，速度≈0；改成最近 80ms 的采样做最小二乘。
 * - 滑行的时间常数从 150ms 拉到 325ms（iOS 的减速手感）。
 * - 拖过界不再硬停：越拉越沉（iOS 的渐近公式），松手或滑行冲过界用临界阻尼弹簧弹回，不来回晃。
 *
 * 纯函数：状态由调用方保存，便于测试。时间都是毫秒，速度是 px/ms。
 */
import { paced } from '../motion/timing';

export interface Sample { t: number; x: number }
export interface Motion { x: number; v: number }

/** 估速看最近这么久的采样。 */
export const VELOCITY_WINDOW_MS = 80;
/** 松手后滑行的时间常数：速度每过这么久衰减到 1/e，总共滑出去「速度 × 它」那么远。 */
export const GLIDE_TAU_MS = 325;
/** 滑到这么慢就算停了。 */
export const GLIDE_STOP = 0.01;
/** 橡皮筋系数（iOS 用 0.55）：越大越松。 */
export const RUBBER_C = 0.55;
/** 弹回大约用多久落定（静止起步时差 1% 以内）；过场时长，跟着全局节奏走。 */
export const SPRING_MS = paced(400);
/* 临界阻尼弹簧静止起步，(1 + ωt)·e^(−ωt) = 1% 时 ωt ≈ 6.64。 */
const SPRING_OMEGA = 6.64 / SPRING_MS;

/** 记一个采样，丢掉估速用不上的旧采样（会改写 samples）。 */
export function addSample(samples: Sample[], t: number, x: number) {
  samples.push({ t, x });
  while (samples.length > 2 && samples[0]!.t < t - VELOCITY_WINDOW_MS * 2) samples.shift();
}

/** 最后一次移动离松手超过这么久，就当手已经停住了。 */
export const STOPPED_MS = 50;

/**
 * 松手时（`now`）的速度：最后一次移动往前 VELOCITY_WINDOW_MS 内的采样，最小二乘拟合直线的斜率。
 * 松手那一下不算采样：它的位置就是最后一次移动的位置，算进去会把速度平白拉低一截。
 * 最后一次移动离松手超过 STOPPED_MS，或不到两个采样，就是 0。
 */
export function estimateVelocity(samples: readonly Sample[], now: number, window = VELOCITY_WINDOW_MS) {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > STOPPED_MS) return 0;
  const recent = samples.filter(s => s.t >= last.t - window);
  if (recent.length < 2) return 0;
  const mt = recent.reduce((sum, s) => sum + s.t, 0) / recent.length;
  const mx = recent.reduce((sum, s) => sum + s.x, 0) / recent.length;
  let num = 0, den = 0;
  for (const s of recent) { num += (s.t - mt) * (s.x - mx); den += (s.t - mt) ** 2; }
  return den > 0 ? num / den : 0;
}

/** 越界拉了 `overshoot` 那么远，实际只挪 `(1 − 1/(x·c/d + 1))·d`：起步跟手（斜率 c），越拉越沉，永远到不了 d。 */
export function rubberBand(overshoot: number, dimension: number, c = RUBBER_C) {
  const x = Math.abs(overshoot);
  return Math.sign(overshoot) * (1 - 1 / (x * c / dimension + 1)) * dimension;
}
/** rubberBand 的反函数：画面上越界了这么多，手得拉多远。 */
export function unrubberBand(shown: number, dimension: number, c = RUBBER_C) {
  const y = Math.min(Math.abs(shown), dimension * 0.999);
  return Math.sign(shown) * dimension / c * y / (dimension - y);
}

/** 手拉到的位置 → 画面上的位置：[min, max] 里原样跟手，两头外面加橡皮筋。 */
export function resist(raw: number, min: number, max: number, dimension: number) {
  if (raw < min) return min - rubberBand(min - raw, dimension);
  if (raw > max) return max + rubberBand(raw - max, dimension);
  return raw;
}
/** resist 的反函数：从画面上某个（可能越界的）位置接着拖。 */
export function unresist(shown: number, min: number, max: number, dimension: number) {
  if (shown < min) return min - unrubberBand(min - shown, dimension);
  if (shown > max) return max + unrubberBand(shown - max, dimension);
  return shown;
}

/** 滑行一步：速度按指数衰减，位移按这一段的精确积分走（帧长短不同，滑出去的总距离一样）。 */
export function glideStep({ x, v }: Motion, dt: number, tau = GLIDE_TAU_MS): Motion {
  const decay = Math.exp(-dt / tau);
  return { x: x + v * tau * (1 - decay), v: v * decay };
}

/** 临界阻尼弹簧朝 `target` 走一步（解析解，不随帧长发散）：最快落定、不来回晃。 */
export function springStep({ x, v }: Motion, target: number, dt: number, omega = SPRING_OMEGA): Motion {
  const d = x - target, k = v + omega * d, decay = Math.exp(-omega * dt);
  return { x: target + (d + k * dt) * decay, v: (v - omega * k * dt) * decay };
}

/** 弹回算落定了：离终点不到半个像素、也几乎不动了。 */
export const springSettled = ({ x, v }: Motion, target: number) => Math.abs(x - target) < 0.5 && Math.abs(v) < 0.02;

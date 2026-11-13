/**
 * 可折返飞行（2026-11-12 修复计划 A1）：设置卡、概览卡 ↔ 页、弹窗、信封共用的「走一段路」的转场原语。
 *
 * 一次飞行 = 一组同一时间轴上的 WAAPI 动画 + 一个方向 + 一份「谁被藏了、谁是临时挂上去的」清单。
 * 规则（docs/development/ui-guidelines.md 的动效一节）：
 *
 * 1. **点下去就动**：建好立刻放，不等帧稳、不等数据。
 * 2. **打断就是掉头**（`turn()`）：同一组动画把播放速率翻过来——路线就是来路，走了多久就花多久回去。
 *    不冻结、不重新量、不吞点击；连续打断只是来回翻。只对还在放的那组翻：已经放完的分段 `reverse()` 会闪一帧
 *    （记忆 waapi-reverse-finished-flash），所以组里每一段都和整组一样长、`fill: 'both'`，整组一起开始、一起结束。
 * 3. **中段不出空板**：替身和内容的交接（`handoff`）由调用方在「内容画好了」那一刻触发，按当时的进度插进时间轴，
 *    掉头时交接也跟着原路倒回去。
 * 4. **藏原卡必须有替身顶着**（`cover`）：藏和替身出现在同一帧；收尾、掉头落地、被接管时由这里统一还原。
 * 5. 时长和曲线只在 timing.ts 定义一份。
 *
 * 整组登记成不被 settleMotion 快进（interrupt.ts）：打断由飞行自己处理（掉头），全局快进只会把它压成一下跳。
 */
import { exemptFromSettle, hurryAnimation } from './interrupt';
import { HANDOFF_SPAN } from './timing';

export type Direction = 1 | -1;

export interface FlightOptions {
  duration: number;
  /** 落地：`direction` 是落在哪一头（1 = 终点，-1 = 掉头回到起点）。默认落地前已经 dispose。 */
  onLand?: (direction: Direction) => void;
  /** 落地时先不撤（替身、垫底还留着）：内容还没画好时调用方等它画好、交接完再自己 dispose。 */
  keepOnLand?: boolean;
}

/** 起点不是 0：透明度为 0 的层 Chromium 可能不合成，第一帧可见时才去光栅化，又是一跳。 */
export const NEARLY_HIDDEN = 0.001;

/** 被某次飞行藏着的元素：新飞行要拿它克隆替身时先临时还原（规则 4：替身永远不从被藏着的卡上克隆）。 */
const hiddenBy = new WeakMap<Element, Animation>();

/** 在 `el` 没被藏着的样子下做 `fn`（同一任务里藏回去，中间不出帧）。 */
export function whileShown<T>(el: Element, fn: () => T): T {
  const hide = hiddenBy.get(el);
  if (!hide || hide.playState === 'idle') return fn();
  hide.cancel();
  try {
    return fn();
  } finally {
    hide.play();
  }
}

/**
 * 交接的关键帧（纯函数，方便测）：在整段时间轴的 `at`（0–1）开始，`span` 内从 `from` 变到 `to`，其余时间保持。
 * 用线性缓动按时间走：组里的形状动画自己带曲线，交接只看时间。
 */
export function handoffFrames(from: number, to: number, at: number, span = HANDOFF_SPAN): Keyframe[] {
  const start = Math.min(Math.max(0, at), 1);
  const end = Math.min(1, start + span);
  const frames: Keyframe[] = [{ opacity: from, offset: 0 }];
  if (start > 0) frames.push({ opacity: from, offset: start });
  if (end > start) frames.push({ opacity: to, offset: end });
  else frames[frames.length - 1] = { opacity: to, offset: start };
  if (end < 1) frames.push({ opacity: to, offset: 1 });
  return frames;
}

export interface Flight {
  readonly duration: number;
  /** 1 = 往终点走，-1 = 掉头往回走。 */
  readonly direction: Direction;
  readonly anims: readonly Animation[];
  /** 组里的第一段（形状）：时间以它为准。 */
  readonly main: Animation | null;
  /** 在组里加一段（和整组同长、fill both、从此刻的时间接着走）。`hold`：开头这一份时间先停在第一帧（WAAPI 的 delay），
      曲线只放在剩下的时间里——倒着放（关）时就是「先落地、再停一小段」，落地那一刻速度照样减到零。 */
  add: (el: Element, keyframes: Keyframe[], options?: { easing?: string; pseudoElement?: string; hold?: number }) => Animation;
  /** 内容画好了：在当前进度（不早于 `notBefore`）插一段交接——`show` 从无到有，`hide` 从有到无。已落地就单独放一小段。 */
  handoff: (parts: { show?: Element[]; hide?: Element[] }, notBefore?: number) => void;
  /** 藏起原卡：同一帧里替身已经顶在它的位置上（调用方保证）。落地 / 收尾时还原。 */
  cover: (el: Element | null | undefined) => void;
  /** 临时挂上去的东西（替身、垫底、遮罩）：dispose 时撤掉。 */
  own: (cleanup: () => void) => void;
  /** 掉头。整组已经放完（或已撤掉）时返回 false：调用方另起一段反向的飞行。 */
  turn: () => boolean;
  /** 刚建好的一组从终点倒着放（关 = 开的原路倒回）。别用「拨到终点 + turn()」：见实现里的注释。 */
  startFromEnd: () => void;
  /** 剩下的部分在 `ms` 内放完（保留曲线）。用于滚动、压缩收尾。 */
  hurry: (ms: number) => void;
  /** 还在放（含刚建好、还没开始的那一帧）。 */
  running: () => boolean;
  /** 此刻的进度 0–1（按时间）。 */
  progress: () => number;
  /** 撤掉全部动画、还原被藏的原卡、执行 own 登记的收尾。可以重复调用。 */
  dispose: () => void;
}

export function createFlight({ duration, onLand, keepOnLand = false }: FlightOptions): Flight {
  const anims: Animation[] = [];
  const covered: Array<{ el: Element; hide: Animation }> = [];
  const cleanups: Array<() => void> = [];
  let direction: Direction = 1;
  let disposed = false;
  let landed = false;
  /** 已经放完以后才画好的内容：单独补的那一小段交接（不在组里，不掉头）。 */
  const late: Animation[] = [];

  const time = (): number => {
    const value = Number(anims[0]?.currentTime ?? 0);
    return Number.isFinite(value) ? Math.min(duration, Math.max(0, value)) : 0;
  };
  const running = () => !disposed && !landed && anims.length > 0 && anims.some((a) => a.playState === 'running' || a.pending);

  const land = () => {
    if (landed || disposed) return;
    landed = true;
    const end = direction;
    if (!keepOnLand) dispose();
    onLand?.(end);
  };

  const add: Flight['add'] = (el, keyframes, options = {}) => {
    const hold = Math.min(0.9, Math.max(0, options.hold ?? 0)) * duration;
    const animation = exemptFromSettle(el.animate(keyframes, {
      duration: duration - hold, delay: hold, easing: options.easing ?? 'linear', fill: 'both', ...(options.pseudoElement ? { pseudoElement: options.pseudoElement } : {}),
    }));
    if (anims.length) {
      animation.currentTime = time();
      if (direction < 0) animation.playbackRate = -Math.abs(anims[0]!.playbackRate || 1);
      else animation.playbackRate = anims[0]!.playbackRate || 1;
    } else {
      // 第一段就是时间的基准：它放完（任一头）就是整组落地。
      animation.addEventListener('finish', () => land());
    }
    anims.push(animation);
    return animation;
  };

  const handoff: Flight['handoff'] = ({ show = [], hide = [] }, notBefore = 0) => {
    if (disposed) return;
    const at = Math.max(notBefore, time() / Math.max(duration, 1));
    if (!landed && at + HANDOFF_SPAN * 0.5 < 1) {
      for (const el of show) add(el, handoffFrames(NEARLY_HIDDEN, 1, at));
      for (const el of hide) add(el, handoffFrames(1, 0, at));
      return;
    }
    // 形状已经（快）落地：交接单独放完，调用方在落地时别急着撤替身（见 usePageMorph）。
    const span = Math.max(90, duration * HANDOFF_SPAN);
    for (const el of show) late.push(exemptFromSettle(el.animate([{ opacity: NEARLY_HIDDEN }, { opacity: 1 }], { duration: span, easing: 'linear', fill: 'both' })));
    for (const el of hide) late.push(exemptFromSettle(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: span, easing: 'linear', fill: 'both' })));
  };

  const cover: Flight['cover'] = (el) => {
    if (!el || disposed) return;
    const hide = exemptFromSettle(el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' }));
    hiddenBy.set(el, hide);
    covered.push({ el, hide });
  };

  const turn = () => {
    if (!running()) return false;
    direction = direction > 0 ? -1 : 1;
    for (const animation of anims) {
      const rate = -(animation.playbackRate || 1);
      // updatePlaybackRate 在合成器上换向、不丢当前位置；同步设 playbackRate 会在 pending 的那一帧里原地停一下。
      if (typeof animation.updatePlaybackRate === 'function') animation.updatePlaybackRate(rate);
      else animation.playbackRate = rate;
    }
    return true;
  };

  /*
   * 刚建好的正向动画初始游标在 0：必须先把 currentTime 拨到终点 duration，再切负的 playbackRate。
   * 否则在 currentTime = 0 上先设负速率，WAAPI 会在同一微任务判定反向播放已到头（0），当场排队触发 finish → land → dispose，
   * 导致停稳后的弹窗和信封在关闭第 1 帧直接瞬灭（2026-11-12 60fps 录屏逐帧定位）。
   */
  const startFromEnd = () => {
    if (disposed || landed) return;
    direction = -1;
    for (const animation of anims) {
      animation.currentTime = duration;
      animation.playbackRate = -Math.abs(animation.playbackRate || 1);
    }
  };

  const hurry = (ms: number) => {
    if (!running()) return;
    for (const animation of anims) hurryAnimation(animation, ms);
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const animation of anims) animation.cancel();
    for (const animation of late) animation.cancel();
    for (const { el, hide } of covered) {
      hide.cancel();
      if (hiddenBy.get(el) === hide) hiddenBy.delete(el);
    }
    covered.length = 0;
    for (const cleanup of cleanups.splice(0)) {
      try { cleanup(); } catch { /* 收尾不能卡住别的收尾 */ }
    }
  };

  return {
    duration,
    get direction() { return direction; },
    anims,
    get main() { return anims[0] ?? null; },
    add,
    handoff,
    cover,
    own: (cleanup) => { if (disposed) cleanup(); else cleanups.push(cleanup); },
    turn,
    startFromEnd,
    hurry,
    running,
    progress: () => time() / Math.max(duration, 1),
    dispose,
  };
}

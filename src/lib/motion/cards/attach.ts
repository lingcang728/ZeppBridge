/**
 * 交出动画的素材（2026-10-28 重做，用户拍板的隐喻：在和 AI 的对话框里加附件）。编排在 composables/ai/useAttachFlight.ts。
 *
 * - 牌：沿自己那根线滑向门锁、边走边缩、边走边摆正，最后钻到锁盘后面；
 * - 线：那根枝跟在牌后面收进锁（`stroke-dashoffset` 和牌用同一条时间轴、同一条曲线，路线按弧长取点，端点始终贴着牌）；
 *   一组里最后一张牌把主干也收走；
 * - 锁：每接一张亮一圈品牌色（像过门）；附件小卡这时从锁盘后面出来，沿右边那束线滑进对话框里的托盘，托盘计数跳一下。
 *
 * 整段写成一张「计划」：每一步 = 一个元素的关键帧 + 起止时间。正着放是交出去；同一张计划用 `direction: 'reverse'` 放
 * 就是严格倒放（撤销）；放到一半要收回，就把正在放的这些动画原地掉头（`rewind`），从此刻的样子沿原路退回，彼此先后不乱。
 * 所有动画都 `fill: 'both'`：倒放已放完的分段不会闪（reversible.ts 记过的坑只在没有 forwards fill 时出现）。
 * 只动 transform / opacity，外加线的虚线偏移（只在这一两秒里动）。
 */
import type { Pt } from '../../aiTask/threads';
import { OPEN_EASE, paced } from '../timing';
import { settled } from './spring';

export interface Step { el: Element; frames: Keyframe[]; delay: number; duration: number; easing?: string }
export interface Plan { steps: Step[]; total: number }
export interface Played { animations: Animation[]; clock: Animation; plan: Plan }

/** 慢慢出发、长长地落定（不是旧版那条猛吸的 ease-in）；倒放时同样是慢慢离开锁、轻轻落回牌位。 */
export const ATTACH_EASE = 'cubic-bezier(.45, .2, .2, 1)';
export const FLY_MS = paced(760);
/** 牌按线的顺序错开出发。 */
export const STAGGER = 70;
export const CHIP_MS = paced(600);
/** 牌走到这一成时间时已经钻到锁盘后面：锁亮一圈，附件从锁的另一边出来。 */
export const GATE_AT = 0.74;
const GATE_MS = paced(420);
/** 半路收回：原路退回的倍速（即时反馈，不跟全局节奏放慢）。 */
export const RECALL_RATE = 1.8;

export const planOf = (steps: Step[]): Plan => ({ steps, total: Math.max(1, ...steps.map((s) => s.delay + s.duration)) });

/** 放一张计划；`reverse` = 严格倒放（每一步的起点按总长镜像）。`clock` 是没有目标的空动画，量计划放到哪了（托盘计数看它）。 */
export const play = (plan: Plan, reverse = false): Played => {
  const direction: PlaybackDirection = reverse ? 'reverse' : 'normal';
  const animations = plan.steps.map((step) => step.el.animate(step.frames, {
    duration: step.duration, delay: reverse ? plan.total - step.delay - step.duration : step.delay,
    easing: step.easing ?? 'linear', fill: 'both', direction,
  }));
  const clock = new Animation(new KeyframeEffect(null, [], { duration: plan.total, fill: 'both', direction }), document.timeline);
  clock.play();
  return { animations, clock, plan };
};

/** 计划此刻放到第几毫秒（按正着放的时间轴算，倒放时从总长往回走）。 */
export const positionOf = (played: Played): number => Number(played.clock.effect?.getComputedTiming().progress ?? 0) * played.plan.total;

/** 原地掉头：每一段从此刻的样子沿原路退回去（还没出发的就留在起点）。 */
export const rewind = (played: Played, rate = RECALL_RATE): Promise<void> => {
  const all = [...played.animations, played.clock];
  for (const animation of all) {
    animation.updatePlaybackRate(-rate);
    if (animation.playState === 'finished') animation.play();
  }
  return settled(all);
};

export const cancelPlayed = (played: Played | null): void => {
  if (!played) return;
  for (const animation of played.animations) animation.cancel();
  played.clock.cancel();
};

const deg = (el: Element) => {
  const match = /(-?[\d.]+)deg/.exec(getComputedStyle(el).rotate);
  return match ? Number(match[1]) : 0;
};
const f1 = (n: number) => n.toFixed(1);

/**
 * 一张牌沿路线飞进锁。`points`：视口坐标、按弧长等距；`turn`：牌位上带旋转的那一层（牌在浮、斜着放）；
 * `side`：线接在牌的哪一边（变换原点就放在那里，线的端点和牌一起走）。
 */
export const cardStep = (el: HTMLElement, turn: Element, side: 'left' | 'right', points: Pt[], delay: number): Step => {
  const theta = deg(turn);
  const rad = (theta * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const box = el.getBoundingClientRect();
  const half = (side === 'left' ? -1 : 1) * (el.offsetWidth / 2);
  // 牌上接线那一点此刻在屏幕上的位置（转过的矩形，外接框的中心就是它的中心）。
  const start = { x: box.left + box.width / 2 + cos * half, y: box.top + box.height / 2 + sin * half };
  const p0 = points[0] ?? start;
  const n = Math.max(1, points.length - 1);
  const origin = side === 'left' ? '0% 50%' : '100% 50%';
  const frames = points.map((p, k): Keyframe => {
    const u = k / n;
    // 线画在牌本来的位置上，牌却在浮、在转：差的那几像素随进度抹平——首帧不跳，末帧正好在锁心。
    const dx = p.x - p0.x + (p0.x - start.x) * u;
    const dy = p.y - p0.y + (p0.y - start.y) * u;
    // 屏幕上的位移换回牌位转过的坐标里；牌边走边摆正、缩到三成。
    const vx = cos * dx + sin * dy;
    const vy = -sin * dx + cos * dy;
    return {
      offset: u, transformOrigin: origin, opacity: u > 0.9 ? (1 - u) / 0.1 : 1,
      transform: `translate(${f1(vx)}px, ${f1(vy)}px) rotate(${(-theta * u).toFixed(2)}deg) scale(${(1 - 0.68 * u).toFixed(3)})`,
    };
  });
  return { el, frames, delay, duration: FLY_MS, easing: ATTACH_EASE };
};

/** 线跟着牌收：在 `from`–`to`（牌的弧长进度）之间虚线偏移 0 → 1，和牌同一条时间轴。 */
export const reelStep = (el: Element, from: number, to: number, delay: number): Step => ({
  el, delay, duration: FLY_MS, easing: ATTACH_EASE,
  frames: [
    { offset: 0, strokeDashoffset: '0' },
    ...(from > 0 ? [{ offset: from, strokeDashoffset: '0' }] : []),
    { offset: Math.max(from + 0.001, Math.min(1, to)), strokeDashoffset: '1' },
    ...(to < 1 ? [{ offset: 1, strokeDashoffset: '1' }] : []),
  ],
});

/** 锁上亮一圈的那枚环（临时挂在锁上，倒放也要用，编排收尾时摘掉）。 */
export const gateRing = (lock: Element): HTMLElement => {
  const ring = document.createElement('span');
  ring.setAttribute('aria-hidden', 'true');
  Object.assign(ring.style, {
    position: 'absolute', inset: '-9px', borderRadius: '50%', border: '2px solid var(--accent)', opacity: '0', pointerEvents: 'none',
    boxShadow: '0 0 12px -4px color-mix(in srgb, var(--accent) 60%, transparent)',
  });
  lock.appendChild(ring);
  return ring;
};

export const gateStep = (ring: Element, delay: number): Step => ({
  el: ring, delay, duration: GATE_MS, easing: 'ease-out',
  frames: [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 0.55, transform: 'scale(1.02)', offset: 0.28 }, { opacity: 0, transform: 'scale(1.14)' }],
});

/** 附件小卡从锁盘后面出来，沿路线滑进托盘里它那一格（`points` 视口坐标，终点就是格子中心）。 */
export const chipStep = (el: HTMLElement, points: Pt[], delay: number): Step => {
  const box = el.getBoundingClientRect();
  const c = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const n = Math.max(1, points.length - 1);
  const frames = points.map((p, k): Keyframe => {
    const u = k / n;
    return { offset: u, transform: k === n ? 'none' : `translate(${f1(p.x - c.x)}px, ${f1(p.y - c.y)}px) scale(${(0.45 + 0.55 * u).toFixed(3)})` };
  });
  return { el, frames, delay, duration: CHIP_MS, easing: ATTACH_EASE };
};

/** 托盘计数跳一下。 */
export const popStep = (el: Element, delay: number): Step => ({
  el, delay, duration: 300, easing: 'ease-out',
  frames: [{ transform: 'none' }, { transform: 'scale(1.32)', offset: 0.35 }, { transform: 'none' }],
});

/** 淡入（从下面一点浮上来）：托盘底板、回执各块。 */
export const riseStep = (el: Element, delay: number, duration: number, lift = 6): Step => ({
  el, delay, duration, easing: OPEN_EASE,
  frames: [{ opacity: 0, transform: `translateY(${lift}px)` }, { opacity: 1, transform: 'none' }],
});

/**
 * 并成一枚 .md：小卡往文件卡中心收拢、缩小、淡掉，托盘底板退掉；文件卡从小放大到位，标题、提示、按钮依次淡入。
 * `pieces` 是回执那一面标了 `data-enter` 的几块（head / file / rest / act）。倒放就是「拆开」。
 */
export const mergeSteps = (chips: HTMLElement[], panel: Element | null, pieces: HTMLElement[]): Step[] => {
  const file = pieces.find((el) => el.dataset.enter === 'file') ?? null;
  const target = (file ?? pieces[0])?.getBoundingClientRect();
  const steps: Step[] = [];
  chips.forEach((el, i) => {
    if (!target) return;
    const box = el.getBoundingClientRect();
    const dx = target.left + target.width / 2 - (box.left + box.width / 2);
    const dy = target.top + target.height / 2 - (box.top + box.height / 2);
    steps.push({
      el, delay: i * 28, duration: paced(460), easing: ATTACH_EASE,
      frames: [{ transform: 'none', opacity: 1 }, { transform: `translate(${f1(dx * 0.7)}px, ${f1(dy * 0.7)}px) scale(.62)`, opacity: 1, offset: 0.62 },
        { transform: `translate(${f1(dx)}px, ${f1(dy)}px) scale(.4)`, opacity: 0 }],
    });
  });
  if (panel) steps.push({ el: panel, delay: paced(80), duration: paced(320), easing: OPEN_EASE, frames: [{ opacity: 1 }, { opacity: 0 }] });
  const at: Record<string, [number, number]> = { head: [0, paced(380)], file: [paced(240), paced(480)], rest: [paced(400), paced(320)], act: [paced(480), paced(340)] };
  for (const el of pieces) {
    const [delay, duration] = at[el.dataset.enter ?? ''] ?? at.rest!;
    steps.push(el === file
      ? { el, delay, duration, easing: OPEN_EASE, frames: [{ opacity: 0, transform: 'scale(.72)' }, { opacity: 1, transform: 'none' }] }
      : riseStep(el, delay, duration));
  }
  return steps;
};

/**
 * 一张卡 ↔ 一枚胶囊的窗口形变：今日一问按 × 缩成「我的指标」旁边的胶囊，点胶囊再长回原处。
 *
 * 和卡 ↔ 页同一种做法（lib/motion/window.ts）：一块 fixed 的板盖住起点和终点的并集，裁切框沿弧线从起点矩形
 * 走到终点矩形，圆角整段是同一个值（卡的圆角；胶囊那一端浏览器自动夹成半圆），动画留在合成器上——
 * 不拉伸任何东西，以前把胶囊按卡的大小非等比放大，999px 的圆角被拉成一团。
 * 板底铺卡的实色；卡和胶囊各拷一份（lib/motion/replica.ts），跟着窗口左上角走、1:1 不缩放：
 * 前一半起点那份淡掉，后一半终点那份淡入。只动 clip-path / transform / opacity。
 */
import { cardReplica, windowInset, windowPoses, WINDOW_OFFSETS, type WindowRect } from './window';

const r2 = (value: number) => Number(value.toFixed(2));
const rectOf = (el: Element): WindowRect => {
  const box = el.getBoundingClientRect();
  return { left: box.left, top: box.top, width: box.width, height: box.height };
};
const union = (a: WindowRect, b: WindowRect): WindowRect => {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  return { left, top, width: Math.max(a.left + a.width, b.left + b.width) - left, height: Math.max(a.top + a.height, b.top + b.height) - top };
};

export interface CardChipFlight {
  /** 放完（或被取消）。 */
  finished: Promise<void>;
  /** 撤掉整块板（真元素接上之后调）。 */
  remove: () => void;
}

/**
 * 起点、终点各给一个元素（拷贝在调用这一刻按它们的样子拍下）；`fromRect` / `toRect` 覆盖量到的框
 * （长回来时卡还没长开，终点给它长开后的框）。
 */
export function flyCardChip(options: {
  from: HTMLElement;
  to: HTMLElement;
  fromRect?: WindowRect;
  toRect?: WindowRect;
  radius: number;
  duration: number;
  easing: string;
}): CardChipFlight {
  const from = options.fromRect ?? rectOf(options.from);
  const to = options.toRect ?? rectOf(options.to);
  const box = union(from, to);
  const fromCopy = cardReplica(options.from).el;
  const toCopy = cardReplica(options.to).el;
  // 拷贝按元素此刻的框拍；给了覆盖框时按覆盖框的大小摆（长回来那一端：卡此刻还是 0 高）。
  for (const [copy, rect] of [[fromCopy, from], [toCopy, to]] as const) {
    Object.assign(copy.style, { left: `${r2(rect.left - box.left)}px`, top: `${r2(rect.top - box.top)}px`, width: `${r2(rect.width)}px`, height: `${r2(rect.height)}px` });
  }

  const plate = document.createElement('div');
  plate.setAttribute('aria-hidden', 'true');
  plate.dataset.morphLayer = '';
  Object.assign(plate.style, {
    position: 'fixed', left: `${r2(box.left)}px`, top: `${r2(box.top)}px`, width: `${r2(box.width)}px`, height: `${r2(box.height)}px`,
    zIndex: '20', pointerEvents: 'none', overflow: 'hidden', background: 'var(--mat-card-solid)', willChange: 'clip-path',
    clipPath: windowInset(from, box, options.radius, true),
  });
  plate.append(fromCopy, toCopy);
  document.body.appendChild(plate);

  const poses = windowPoses({ rect: from, anchor: { x: from.left, y: from.top } }, { rect: to, anchor: { x: to.left, y: to.top } });
  const timing = { duration: options.duration, easing: options.easing, fill: 'forwards' as const };
  const animations = [
    plate.animate(poses.map((pose, i) => ({ offset: WINDOW_OFFSETS[i], clipPath: windowInset(pose.rect, box, options.radius, true) })), timing),
    fromCopy.animate(poses.map((pose, i) => ({
      offset: WINDOW_OFFSETS[i], transform: `translate(${r2(pose.anchor.x - from.left)}px, ${r2(pose.anchor.y - from.top)}px)`,
    })), timing),
    toCopy.animate(poses.map((pose, i) => ({
      offset: WINDOW_OFFSETS[i], transform: `translate(${r2(pose.anchor.x - to.left)}px, ${r2(pose.anchor.y - to.top)}px)`,
    })), timing),
    // 透明度按时间线性走，两份交叉重叠一段（两成到五成）：窗口里始终有东西，不会飞到一半变成一块空板。
    fromCopy.animate([{ opacity: 1 }, { opacity: 1, offset: 0.1 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }], { duration: options.duration, fill: 'forwards' }),
    toCopy.animate([{ opacity: 0 }, { opacity: 0, offset: 0.2 }, { opacity: 1, offset: 0.6 }, { opacity: 1 }], { duration: options.duration, fill: 'forwards' }),
  ];
  const finished = Promise.all(animations.map((a) => a.finished.catch(() => undefined))).then(() => undefined);
  return { finished, remove: () => plate.remove() };
}

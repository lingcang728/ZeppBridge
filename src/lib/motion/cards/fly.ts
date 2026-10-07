/**
 * 牌飞进 / 飞出收集箱（第三轮精修 A3，取代第二轮的 flyToTarget 替身）。
 *
 * 第二轮在 body 上克隆 `.pcard`：丢了牌桌给的 `--card-w`（回落 150px）和外层牌位的歪角 / 下沉，替身在原牌右下方半张牌处
 * 凭空出现（105619 f600–f629）。现在克隆的是**整个牌位**：摆在和真牌完全相同的位置、角度、大小，带着牌此刻的抬起；
 * 真牌在同一个任务里隐身，所以看上去就是「这张牌本身离开牌位」。替身沿往上拱的弧线缩小飞进箱子，**到了**才算数
 * （`onLand`：箱子顶一下、计数 +1），被取消就回滚。反方向 `flyFromBox`：一张牌从箱子里飞回牌位，落定那一帧换回真牌。
 *
 * `receive`：来处（「挑日子」按钮、「你的过去」的那一格）接住收回来的一叠——先张开一下，落定时顶一下、亮一圈强调色。
 * 只动 transform / opacity / scale；减少动效时不飞，直接算数。
 */
import { CLOSE_EASE } from '../timing';
import { catchCard, lidClose, lidOpen } from './box';
import { restOf, toLocal } from './pose';
import { reducedMotion, settled, SPRINGS, springCurve } from './spring';

const FLY_MS = 560;
const BACK_MS = 480;
const PULSE_MS = 620;

/** 轻轻一顶：用独立的 `scale` 属性，不冲掉元素自己的 transform（收集箱在 /ai 上是抬高的）。 */
export const bump = (target: Element | null | undefined): void => {
  if (!target || reducedMotion()) return;
  const { easing, duration } = springCurve(SPRINGS.pop);
  target.animate([{ scale: '1.14' }, { scale: '1' }], { duration, easing });
};

/** 在元素上方亮一圈强调色（盖一层 fixed 光圈，只淡入淡出它自己；SVG 里的一格也能用）。 */
export const landPulse = (target: Element | null | undefined, tint = 'var(--accent)'): void => {
  if (!target || reducedMotion()) return;
  const rect = target.getBoundingClientRect();
  if (!rect.width && !rect.height) return;
  const radius = target instanceof HTMLElement ? getComputedStyle(target).borderRadius : '6px';
  const ring = document.createElement('div');
  ring.setAttribute('aria-hidden', 'true');
  Object.assign(ring.style, {
    position: 'fixed', left: `${rect.left - 3}px`, top: `${rect.top - 3}px`, width: `${rect.width + 6}px`, height: `${rect.height + 6}px`,
    borderRadius: radius && radius !== '0px' ? radius : '8px', pointerEvents: 'none', zIndex: '3001', opacity: '0',
    boxShadow: `0 0 0 2px ${tint}, 0 0 22px 4px color-mix(in srgb, ${tint} 45%, transparent)`,
  });
  document.body.appendChild(ring);
  void settled([ring.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: PULSE_MS, easing: 'ease-out' })]).then(() => ring.remove());
};

/** 来处接住一叠：放回期间张开（`.is-receiving`），落定时顶一下、亮一圈。 */
export const receive = (target: Element | null | undefined) => {
  target?.classList.add('is-receiving');
  return {
    land: (tint?: string) => {
      target?.classList.remove('is-receiving');
      bump(target);
      landPulse(target, tint);
    },
    cancel: () => target?.classList.remove('is-receiving'),
  };
};

/** 牌自己的 `translate`（被拖着、叠在别的牌上，1B·B3）折成屏幕上的位移：它是在牌位歪着的坐标系里写的。 */
const draggedOffset = (card: HTMLElement, angle: number) => {
  const m = /(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?/.exec(card.style.translate || '');
  return m ? toLocal(Number(m[1]), Number(m[2] ?? 0), -angle) : { x: 0, y: 0 };
};

/** 拷一份整个牌位，摆在真牌此刻的位置、角度、大小上（fixed，挂在 body 上）。 */
const ghostOf = (card: HTMLElement) => {
  const slot = card.parentElement?.classList.contains('pslot') ? card.parentElement : card;
  const resting = restOf(card);
  const shift = draggedOffset(card, resting.angle);
  const rest = { ...resting, center: { x: resting.center.x + shift.x, y: resting.center.y + shift.y } };
  const w = slot.offsetWidth || card.offsetWidth;
  const h = slot.offsetHeight || card.offsetHeight;
  const ghost = slot.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('id');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.classList.remove('shift-l', 'shift-r');
  const ghostCard = (ghost === slot ? ghost : ghost.querySelector<HTMLElement>('.pcard')) ?? ghost;
  // 牌桌给的牌宽、牌此刻的抬起都带上；真牌可能已经隐身了，替身不要跟着隐身。
  ghost.style.setProperty('--card-w', getComputedStyle(card).getPropertyValue('--card-w') || `${card.offsetWidth}px`);
  ghostCard.style.transform = getComputedStyle(card).transform === 'none' ? '' : getComputedStyle(card).transform;
  ghostCard.style.visibility = '';
  ghostCard.style.translate = 'none';
  ghostCard.style.rotate = card.style.rotate;
  Object.assign(ghost.style, {
    position: 'fixed', left: `${(rest.center.x - w / 2).toFixed(1)}px`, top: `${(rest.center.y - h / 2).toFixed(1)}px`,
    width: `${w}px`, height: `${h}px`, margin: '0', zIndex: '3000', pointerEvents: 'none', transformOrigin: '50% 50%',
    transform: `rotate(${rest.angle.toFixed(2)}deg)`, translate: 'none', scale: 'none',
  });
  document.body.appendChild(ghost);
  return { ghost, rest, w };
};

/** 牌位 → 箱子的一段弧线。 */
const arcTo = (rest: ReturnType<typeof restOf>, goal: DOMRect, w: number) => {
  const dx = goal.left + goal.width / 2 - rest.center.x;
  const dy = goal.top + goal.height / 2 - rest.center.y;
  const scale = Math.max(0.12, Math.min(0.45, goal.height / Math.max(w * 1.4, 1)));
  const arc = Math.min(140, 40 + Math.hypot(dx, dy) * 0.18);
  return {
    home: `rotate(${rest.angle.toFixed(2)}deg)`,
    mid: `translate(${(dx * 0.5).toFixed(1)}px, ${(dy * 0.5 - arc).toFixed(1)}px) rotate(-7deg) scale(${((1 + scale) / 2).toFixed(3)})`,
    end: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(0deg) scale(${scale.toFixed(3)})`,
  };
};

/**
 * 真牌离开牌位、飞进箱子。返回 true = 到了（`onLand` 已经调过）；false = 被取消（真牌重新露出来，调用方回滚）。
 * 真牌在这里同步隐身；之后牌位上显示什么（「在收集箱里」的虚线轮廓）由调用方决定，记得把 visibility 还回去。
 */
export const flyCardHome = async (card: HTMLElement, target: HTMLElement | null, onLand: () => void): Promise<boolean> => {
  if (!target || reducedMotion()) {
    onLand();
    bump(target);
    return true;
  }
  const { ghost, rest, w } = ghostOf(card);
  card.style.visibility = 'hidden';
  const path = arcTo(rest, target.getBoundingClientRect(), w);
  // 小丑盒：飞到一半盖子弹开接住，落进去再合上（1B·B1）。
  const caught = catchCard(target, FLY_MS);
  const flight = ghost.animate(
    [
      { transform: path.home, opacity: 1 },
      { transform: path.mid, opacity: 1, offset: 0.5 },
      { opacity: 1, offset: 0.86 },
      { transform: path.end, opacity: 0 },
    ],
    { duration: FLY_MS, easing: 'cubic-bezier(.35, 0, .25, 1)', fill: 'forwards' },
  );
  await settled([flight]);
  const landed = flight.playState === 'finished';
  caught(landed);
  ghost.remove();
  if (landed) {
    onLand();
    bump(target);
  } else {
    card.style.visibility = '';
  }
  return landed;
};

/**
 * 一张牌从箱子飞回牌位：调用方先把真牌渲染好（隐身，visibility hidden）再调它；落定那一帧替身移除、真牌露出来。
 */
export const flyFromBox = async (source: HTMLElement | null, card: HTMLElement): Promise<void> => {
  if (!source || reducedMotion()) {
    card.style.visibility = '';
    return;
  }
  const { ghost, rest, w } = ghostOf(card);
  card.style.visibility = 'hidden';
  const path = arcTo(rest, source.getBoundingClientRect(), w);
  bump(source);
  // 盖子弹开、牌蹦出来，离开盒口就合上。
  lidOpen(source);
  lidClose(source, BACK_MS * 0.3);
  const flight = ghost.animate(
    [
      { transform: path.end, opacity: 0 },
      { opacity: 1, offset: 0.16 },
      { transform: path.mid, opacity: 1, offset: 0.5 },
      { transform: path.home, opacity: 1 },
    ],
    { duration: BACK_MS, easing: CLOSE_EASE, fill: 'forwards' },
  );
  await settled([flight]);
  card.style.visibility = '';
  ghost.remove();
};

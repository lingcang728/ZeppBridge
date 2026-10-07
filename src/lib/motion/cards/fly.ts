/**
 * 一张牌飞进收集箱（精修批次 7.1 / 7.3）：在牌的位置拷一张小替身（真牌不动），沿一条往上拱的弧线
 * 缩小飞到箱子上，淡掉；箱子轻轻一顶。替身挂在 body 上、fixed 定位，只动 transform / opacity。
 * 减少动效时只让箱子顶一下。
 */
import { centerOf, reducedMotion, settled, SPRINGS, springCurve } from './spring';

const FLY_MS = 560;

const bump = (target: HTMLElement) => {
  const { easing, duration } = springCurve(SPRINGS.pop);
  target.animate([{ transform: 'scale(1.14)' }, { transform: 'none' }], { duration, easing });
};

export const flyToTarget = async (source: HTMLElement, target: HTMLElement | null): Promise<void> => {
  if (!target) return;
  if (reducedMotion()) { bump(target); return; }
  const rect = source.getBoundingClientRect();
  const goal = target.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('id');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  Object.assign(ghost.style, {
    position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    margin: '0', zIndex: '3000', pointerEvents: 'none', transformOrigin: '50% 50%',
  });
  document.body.appendChild(ghost);
  const from = centerOf(rect);
  const to = centerOf(goal);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const scale = Math.max(0.12, Math.min(0.5, goal.width / Math.max(rect.width, 1)));
  // 弧线：中途往上拱一截（离得越远拱得越高），像把牌抛进去。
  const arc = Math.min(140, 40 + Math.hypot(dx, dy) * 0.18);
  const animation = ghost.animate(
    [
      { transform: 'none', opacity: 1 },
      { transform: `translate(${(dx * 0.5).toFixed(1)}px, ${(dy * 0.5 - arc).toFixed(1)}px) rotate(-8deg) scale(${((1 + scale) / 2).toFixed(3)})`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(4deg) scale(${scale.toFixed(3)})`, opacity: 0.2 },
    ],
    { duration: FLY_MS, easing: 'cubic-bezier(.35, 0, .25, 1)', fill: 'forwards' },
  );
  await settled([animation]);
  ghost.remove();
  bump(target);
};

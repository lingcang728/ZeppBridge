/**
 * 收集箱倒进舞台左边的牌（2026-10-08）。
 *
 * 这个文件以前还放着交给 AI 的「汇聚」（牌抖两下飞进锁、回执牌从锁里长出来）；2026-10-28 换成「加附件」，
 * 那一套挪到 attach.ts（编排在 composables/ai/useAttachFlight.ts），这里只剩倒牌。
 */
import { CLOSE_EASE } from '../timing';
import { lidClose, lidOpen } from './box';
import { reducedMotion, settled, SPRINGS, springCurve } from './spring';

/**
 * 收集箱倒进舞台左边的牌（2026-10-08）：盖子弹开，每一类蹦出几张小牌，沿往上拱的弧线飞进那一类的牌，
 * 落进去那一下牌顶一下。小牌是临时画的一块板（这一类的颜色），不拷贝箱子里的真牌——铺开层这时是收着的。
 */
export const pourFromBox = async (source: HTMLElement | null, targets: Array<{ el: HTMLElement; tint: string; count: number }>): Promise<void> => {
  if (!source || reducedMotion() || !targets.length) return;
  const from = source.querySelector('.jack')?.getBoundingClientRect() ?? source.getBoundingClientRect();
  const start = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
  lidOpen(source);
  const flights: Animation[] = [];
  const chips: HTMLElement[] = [];
  targets.forEach((target, t) => {
    const goal = target.el.getBoundingClientRect();
    const dx = goal.left + goal.width / 2 - start.x;
    const dy = goal.top + goal.height / 2 - start.y;
    const arc = Math.min(160, 60 + Math.hypot(dx, dy) * 0.16);
    for (let k = 0; k < Math.min(3, Math.max(1, target.count)); k += 1) {
      const chip = document.createElement('div');
      chip.setAttribute('aria-hidden', 'true');
      Object.assign(chip.style, {
        position: 'fixed', left: `${start.x - 14}px`, top: `${start.y - 19}px`, width: '28px', height: '38px', borderRadius: '6px', zIndex: '1900', pointerEvents: 'none',
        background: `radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, ${target.tint} 40%, transparent), transparent 70%), var(--mat-raised)`,
        boxShadow: 'var(--mat-raised-rim), 0 8px 18px -10px rgba(0,0,0,.7)',
      });
      document.body.appendChild(chip);
      chips.push(chip);
      const delay = t * 90 + k * 50;
      const spin = (k - 1) * 9;
      const flight = chip.animate([
        { transform: 'translate(0, 6px) scale(.5)', opacity: 0 },
        { transform: 'translate(0, -26px) scale(.9)', opacity: 1, offset: 0.18 },
        { transform: `translate(${(dx * 0.5).toFixed(1)}px, ${(dy * 0.5 - arc).toFixed(1)}px) rotate(${spin}deg) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(0deg) scale(.7)`, opacity: 0 },
      ], { duration: 640, delay, easing: CLOSE_EASE, fill: 'both' });
      flights.push(flight);
      if (k === 0) void flight.finished.then(() => bumpCard(target.el)).catch(() => undefined);
    }
  });
  lidClose(source, 420);
  await settled(flights);
  for (const chip of chips) chip.remove();
};

const bumpCard = (el: HTMLElement) => {
  const { easing, duration } = springCurve(SPRINGS.pop);
  el.animate([{ scale: '1.08' }, { scale: '1' }], { duration, easing });
};

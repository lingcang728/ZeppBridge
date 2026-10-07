/**
 * 翻面（精修批次 7.1）：牌横向压扁到一条线，换面，再弹开。
 *
 * 不做真正的 3D rotateY：带字的牌一转 3D，Chromium 会把字栅格化成位图，转到一半字是糊的
 * （2026-10 卡片动效的教训）。2D 的 scaleX 看上去一样是「翻过去」，字始终清楚。
 */
import { reducedMotion, SPRINGS, springCurve } from './spring';

const HALF_MS = 120;

/** 翻面：`swap` 在牌压成一条线时调用（改数据、等 DOM 更新都在里面做完）。 */
export const flipCard = async (card: HTMLElement, swap: () => void | Promise<void>): Promise<void> => {
  if (reducedMotion()) {
    await swap();
    return;
  }
  const close = card.animate([{ transform: 'none' }, { transform: 'scaleX(.04) scaleY(1.03)' }], { duration: HALF_MS, easing: 'cubic-bezier(.55, 0, .9, .45)', fill: 'forwards' });
  await close.finished.catch(() => undefined);
  await swap();
  const { easing, duration } = springCurve(SPRINGS.flip);
  const open = card.animate([{ transform: 'scaleX(.04) scaleY(1.03)' }, { transform: 'none' }], { duration, easing });
  close.cancel();
  await open.finished.catch(() => undefined);
};

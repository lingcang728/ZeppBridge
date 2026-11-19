/**
 * 同步带来的新值「从同步胶囊那里来」：离胶囊越近的数字越早开始滚，延时 = 距离 ÷ 速度，封顶 ARRIVAL_MAX。
 *
 * 不用固定的错落时间表：延时由真实几何距离算出来，任何布局、任何窗口宽度都自然排出先后。
 * 没变的数字根本不动，所以动起来的那几处就是这次同步的变更清单。
 * 胶囊（components/shell/AppTopBar.vue）标 `data-arrival-origin`；找不到它（顶栏收起、测试）就不延时。
 */
export const ARRIVAL_SPEED = 4; // px / ms
export const ARRIVAL_MAX = 240; // ms

export type Box = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

export const arrivalDelay = (target: Box, origin: Box | null): number => {
  if (!origin) return 0;
  const dx = target.left + target.width / 2 - (origin.left + origin.width / 2);
  const dy = target.top + target.height / 2 - (origin.top + origin.height / 2);
  return Math.min(ARRIVAL_MAX, Math.round(Math.hypot(dx, dy) / ARRIVAL_SPEED));
};

export const arrivalOrigin = (): Box | null => {
  if (typeof document === 'undefined') return null;
  const box = document.querySelector('[data-arrival-origin]')?.getBoundingClientRect();
  return box && box.width > 0 && box.height > 0 ? box : null;
};

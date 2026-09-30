/**
 * 幽灵板时代留下的两个小工具。卡片 ↔ 整页 / 大卡的形变本身已经换成 lib/motion/window.ts
 * （ColorOS 17 式的圆角窗口，窗口里带着卡片的拷贝）；这里只剩：
 *   - `ghostInset`：矩形换算成 inset 裁切（window.ts 的 windowInset 同一套算法，保留给旧测试和调用方）；
 *   - `revealAfterGhost`：真内容在窗口长到几成以后才淡入的关键帧（设置大卡打开时用）。
 */
export interface GhostRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const r2 = (value: number) => Number(value.toFixed(2));

/** 板默认在六成时间长满：旧画面到这时才被完全盖住，新内容从这里开始淡入。 */
export const GHOST_GROWN_AT = 0.6;

/** 新内容的淡入：窗口长到 `growUntil` 之前一直看不见（否则新旧两层叠成重影），之后和窗口的淡出交叉。 */
export const revealAfterGhost = (growUntil = GHOST_GROWN_AT): Keyframe[] => [
  { opacity: 0, transform: 'translateY(8px)' },
  { opacity: 0, transform: 'translateY(8px)', offset: growUntil, easing: 'ease-out' },
  { opacity: 1, transform: 'none' },
];

/** 起点矩形换算成终点板上的 inset 裁切（纯函数，方便测）。 */
export function ghostInset(from: GhostRect, to: GhostRect, radius: number): string {
  const top = Math.max(0, from.top - to.top);
  const left = Math.max(0, from.left - to.left);
  const right = Math.max(0, to.left + to.width - (from.left + from.width));
  const bottom = Math.max(0, to.top + to.height - (from.top + from.height));
  return `inset(${r2(top)}px ${r2(right)}px ${r2(bottom)}px ${r2(left)}px round ${r2(radius)}px)`;
}

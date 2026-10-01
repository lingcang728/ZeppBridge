/**
 * 幽灵板时代留下的小工具。卡片 ↔ 整页的形变已经换成 lib/motion/window.ts（ColorOS 17 式的圆角窗口），
 * 设置卡叠的开合换成了大卡自己的容器形变（composables/useDeckMorph.ts）；这里只剩
 * `ghostInset`：矩形换算成 inset 裁切（window.ts 的 windowInset 同一套算法，保留给旧测试和调用方）。
 */
export interface GhostRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const r2 = (value: number) => Number(value.toFixed(2));

/** 起点矩形换算成终点板上的 inset 裁切（纯函数，方便测）。 */
export function ghostInset(from: GhostRect, to: GhostRect, radius: number): string {
  const top = Math.max(0, from.top - to.top);
  const left = Math.max(0, from.left - to.left);
  const right = Math.max(0, to.left + to.width - (from.left + from.width));
  const bottom = Math.max(0, to.top + to.height - (from.top + from.height));
  return `inset(${r2(top)}px ${r2(right)}px ${r2(bottom)}px ${r2(left)}px round ${r2(radius)}px)`;
}

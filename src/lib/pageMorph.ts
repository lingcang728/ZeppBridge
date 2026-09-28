/**
 * 切页时「卡片 ↔ 整页」的形变几何。纯函数，方便测。
 *
 * 从概览点一张卡进详情：新页从那张卡的位置、按卡的宽度等比缩着出现，再长成整页；
 * 返回时反过来缩回那张卡。和设置卡叠（lib/deck/morph.ts）是同一种手法：以左上角为原点
 * 缩放，底部按卡的高度裁掉，于是第一帧看上去就是那张卡大小的一块圆角板。
 *
 * 页面比视口高、而且可能正滚在中间：只拿「画面上看得见的那一段」去对卡片。
 * `page` 是整页元素的包围盒（可能伸出视口），`view` 是它和滚动区视口相交的那一段。
 */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PageFrame {
  transformOrigin: string;
  transform: string;
  clipPath: string;
}

const r2 = (value: number) => Number(value.toFixed(2));

/** 页面和视口相交的那一段；不相交时返回 null。 */
export function visiblePart(page: Rect, viewport: Rect): Rect | null {
  const left = Math.max(page.left, viewport.left);
  const top = Math.max(page.top, viewport.top);
  const right = Math.min(page.left + page.width, viewport.left + viewport.width);
  const bottom = Math.min(page.top + page.height, viewport.top + viewport.height);
  if (right - left < 1 || bottom - top < 1) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/** 看得见的那一段原样铺开：不缩放，只裁掉视口外面的部分（裁掉的本来就看不见）。 */
export function openPageFrame(page: Rect, view: Rect, radius = 0): PageFrame {
  const insetTop = view.top - page.top;
  const insetLeft = view.left - page.left;
  const insetRight = page.left + page.width - (view.left + view.width);
  const insetBottom = page.top + page.height - (view.top + view.height);
  return {
    transformOrigin: `${r2(insetLeft)}px ${r2(insetTop)}px`,
    transform: 'translate(0px, 0px) scale(1)',
    clipPath: `inset(${r2(insetTop)}px ${r2(insetRight)}px ${r2(insetBottom)}px ${r2(insetLeft)}px round ${r2(radius)}px)`,
  };
}

/**
 * 看得见的那一段缩成 `card`：左上角对齐卡的左上角、宽度等于卡宽，底部裁成卡高。
 * `radius` 是卡片的圆角；缩放会把圆角一起缩小，所以裁切圆角要反向放大。
 */
export function cardPageFrame(page: Rect, view: Rect, card: Rect, radius: number): PageFrame {
  const scale = view.width > 0 ? card.width / view.width : 1;
  const safe = Math.max(scale, 0.05);
  const visible = Math.min(view.height, card.height / safe);
  const insetTop = view.top - page.top;
  const insetLeft = view.left - page.left;
  const insetRight = page.left + page.width - (view.left + view.width);
  const insetBottom = page.top + page.height - (view.top + visible);
  return {
    transformOrigin: `${r2(insetLeft)}px ${r2(insetTop)}px`,
    transform: `translate(${r2(card.left - view.left)}px, ${r2(card.top - view.top)}px) scale(${Number(scale.toFixed(4))})`,
    clipPath: `inset(${r2(insetTop)}px ${r2(insetRight)}px ${r2(insetBottom)}px ${r2(insetLeft)}px round ${r2(radius / safe)}px)`,
  };
}

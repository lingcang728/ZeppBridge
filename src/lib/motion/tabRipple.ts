/**
 * 顶栏涟漪（用户 2026-10-29 选的：概览 / 交给 AI / 设置三页互切，以及从二级页直接点顶栏换入口）：
 * 从被点的那枚导航标签往下扩散一圈波前，波前扫到哪一块，哪一块就轻轻往外沉下去、淡掉；新页同一处的那一块
 * 随后从靠近标签的一侧浮上来落定。离标签近的先换、远的后换，整屏像被涟漪重组一遍——和换语言的灰烬涟漪
 * （从语言轮扩散）是同一种语言。
 *
 * 「一块」是页面在可视区里的卡片 / 行 / 标题（pickTiles）：从页面根往下拆，大而透明的容器（网格、舞台）
 * 继续拆，有底色、有边框、有投影的块或者够小的块就是一块；最多 RIPPLE_TILES 块，拆不动了大块就整块走。
 * 可视区外的不动（旧页反正要走，新页的在下面，滚到时它早就落定了）。
 *
 * 旧块淡完、新块才开始亮（RIPPLE.lag ≥ 旧块变透明的那一段）：同一处的两块不同时半透明叠成重影
 * （记忆「先备好再展开、内容先后交替不叠影」）。只动 opacity 和独立的 translate / scale 属性——不占 transform，
 * 块自己的倾斜、定位照旧；整屏没有 filter（记忆「动效只动合成属性」）。
 */
import { paced } from './timing';

export interface RippleRect { left: number; top: number; width: number; height: number }
export interface RipplePoint { x: number; y: number }
/** 一块：普通元素，或者整张 SVG（舞台上的连线是一张铺满舞台的 <svg>，不往里拆）。 */
export type RippleTile = HTMLElement | SVGSVGElement;

export const isTile = (node: unknown): node is RippleTile => node instanceof HTMLElement || node instanceof SVGSVGElement;

/** 波前从标签扫到最远的角用 spread；每块旧的沉下去 out、淡完后隔 lag 新的再浮上来 in。 */
export const RIPPLE = { spread: paced(240), out: paced(200), lag: paced(110), in: paced(340) };
/** 旧块在 out 的前这么多就已经透明了（之后只是继续往外沉）：lag 要不小于它乘 out。 */
export const RIPPLE_FADE_AT = 0.55;
/** 旧块往外沉、新块从里侧浮上来的距离（px）和缩放。 */
export const RIPPLE_PUSH = 12;
export const RIPPLE_SCALE_OUT = 0.965;
export const RIPPLE_SCALE_IN = 0.975;
export const RIPPLE_TILES = 56;
/** 整段最长多久（spread + lag + in）：测试和兜底计时用。 */
export const RIPPLE_TOTAL = RIPPLE.spread + RIPPLE.lag + RIPPLE.in;

/** 这一块离涟漪中心多远：到矩形上最近那一点（大块的边一被扫到就开始走）。 */
export const rippleDistance = (rect: RippleRect, origin: RipplePoint): number => {
  const dx = Math.max(rect.left - origin.x, 0, origin.x - (rect.left + rect.width));
  const dy = Math.max(rect.top - origin.y, 0, origin.y - (rect.top + rect.height));
  return Math.hypot(dx, dy);
};

/** 波前扫到这一块的时刻（ms）：按到最远一角的距离归一化，最远的正好在 spread 时被扫到。纯函数，方便测。 */
export const rippleDelay = (rect: RippleRect, origin: RipplePoint, view: RippleRect, spread = RIPPLE.spread): number => {
  const corners = [
    [view.left, view.top], [view.left + view.width, view.top],
    [view.left, view.top + view.height], [view.left + view.width, view.top + view.height],
  ];
  const reach = Math.max(1, ...corners.map(([x, y]) => Math.hypot(x - origin.x, y - origin.y)));
  return Math.round(Math.min(1, rippleDistance(rect, origin) / reach) * spread);
};

/**
 * 盖满整屏的一层（交给 AI 大卡身后的模糊）：它不是「一块」，波前一扫到就淡掉的话，身后的舞台整屏一下子变清楚——
 * 模糊「啪」地掉了。这种层跟着整圈涟漪匀速淡，不位移。纯函数，方便测。
 */
export const coversView = (rect: RippleRect, view: RippleRect): boolean =>
  rect.width * rect.height >= view.width * view.height * 0.8;

/** 往外的方向（从中心指向这一块的中心）乘距离；正在中心正下方的那一块就竖直往下。纯函数，方便测。 */
export const rippleShift = (rect: RippleRect, origin: RipplePoint, px = RIPPLE_PUSH): RipplePoint => {
  const dx = rect.left + rect.width / 2 - origin.x;
  const dy = rect.top + rect.height / 2 - origin.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return { x: 0, y: px };
  return { x: Number(((dx / length) * px).toFixed(1)), y: Number(((dy / length) * px).toFixed(1)) };
};

const meets = (rect: RippleRect, view: RippleRect) =>
  rect.width > 0 && rect.height > 0 && rect.left < view.left + view.width && rect.left + rect.width > view.left
  && rect.top < view.top + view.height && rect.top + rect.height > view.top;

const transparent = (color: string) => color === 'transparent' || /rgba?\([^)]*,\s*0\)$/.test(color.replace(/\s+/g, ' ')) || /\/\s*0\)$/.test(color);

/** 这个盒子自己画了东西（底色、底图、边框、投影、毛玻璃）：拆开它的话它自己那层会原地不动。 */
const paints = (style: CSSStyleDeclaration) =>
  !transparent(style.backgroundColor) || style.backgroundImage !== 'none' || style.boxShadow !== 'none'
  || style.backdropFilter !== 'none' || ['Top', 'Right', 'Bottom', 'Left'].some((side) =>
    parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && style.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none');

const ownText = (el: Element) => Array.from(el.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim());

/**
 * 页面在可视区里的那些「块」。广度优先往下拆：大（高过可视区一半多或宽过四分之三）、自己不画东西、
 * 没有直属文字的容器继续拆，其余的就是一块；块数到上限就不再拆。形变层（data-morph-layer）、模糊层不算。
 */
export function pickTiles(page: RippleTile, view: RippleRect, max = RIPPLE_TILES, self = false): RippleTile[] {
  const tiles: RippleTile[] = [];
  const queue: RippleTile[] = [];
  // `self`：从这个元素本身拆起（晚挂上来的一块，useTabRipple 的 watchLate），而不是只看它的子元素。
  if (!self) queue.push(page);
  else visit([page]);
  while (queue.length) {
    const parent = queue.shift()!;
    visit(Array.from(parent.children));
  }
  return tiles;

  function visit(children: Element[]) {
    for (const child of children) {
      if (!isTile(child) || child.dataset.morphLayer !== undefined || child.classList.contains('page-veil')) continue;
      const style = getComputedStyle(child);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (style.display === 'contents') { queue.push(child); continue; }
      const rect = child.getBoundingClientRect();
      if (!meets(rect, view)) {
        // 零尺寸的定位壳（里面的东西是绝对定位摆出来的）：往里找。
        if ((rect.width === 0 || rect.height === 0) && child.children.length) queue.push(child);
        continue;
      }
      const big = rect.height > view.height * 0.5 || rect.width > view.width * 0.75;
      const room = tiles.length + queue.length + child.children.length <= max;
      if (big && room && child instanceof HTMLElement && child.children.length && !paints(style) && !ownText(child)) queue.push(child);
      else tiles.push(child);
    }
  }
}

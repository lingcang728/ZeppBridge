/**
 * 设置卡组在形态之间的形变几何（FLIP）。纯函数，方便测。
 *
 * 以前三种形态之间靠 View Transitions：整页拍两张快照再补间。它有两个毛病——
 * 过渡进行中点什么都不算数（没法打断，只能等它放完或者跳到结尾），而且快照带着
 * 模糊滤镜逐帧重绘，收起时一顿一顿的。现在卡片始终是真的 DOM：先记下起点，
 * 换形态，再用 Web Animations 从起点补间到终点；半路再换一次，就从此刻画面上
 * 的位置接着走，或者直接把正在放的动画倒着放回去。
 */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

const r2 = (value: number) => Number(value.toFixed(2));
const r4 = (value: number) => Number(value.toFixed(4));

export const centerOf = (box: Box): Point => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });

/** 一张打开的大卡「缩回」成源卡时的样子：左上角对齐、按宽度等比缩小，底部裁成源卡的高度。 */
export interface CardFrame {
  transform: string;
  clipPath: string;
}

/**
 * 打开 / 关上一张卡的端点帧。大卡以左上角为原点缩放（调用方要把 transform-origin
 * 设成 0 0），宽度缩到和源卡一样，再从底部裁掉多出来的部分——于是它在这一帧看起来
 * 就是源卡那么大的一块圆角板，然后长成整张大卡。`radius` 是大卡自己的圆角：缩放时
 * 圆角跟着缩，所以裁切的圆角要反向放大，看上去才和源卡一样圆。
 */
export function collapsedFrame(from: Box, to: Box, radius: number): CardFrame {
  const scale = to.width > 0 ? from.width / to.width : 1;
  const visible = Math.min(to.height, scale > 0 ? from.height / scale : to.height);
  const clipBottom = Math.max(0, to.height - visible);
  return {
    transform: `translate(${r2(from.left - to.left)}px, ${r2(from.top - to.top)}px) scale(${r4(scale)})`,
    clipPath: `inset(0px 0px ${r2(clipBottom)}px 0px round ${r2(radius / Math.max(scale, 0.05))}px)`,
  };
}

export const openFrame = (radius: number): CardFrame => ({
  transform: 'translate(0px, 0px) scale(1)',
  clipPath: `inset(0px 0px 0px 0px round ${r2(radius)}px)`,
});

/**
 * 容器被 `scale(a)`（外加可能的平移 e/f）缩着时，容器里某个元素去掉这层变换以后的位置。
 * 打开一张卡时总览会往后退（缩小、变糊），关卡时要知道源卡「回到原位以后」在哪儿，
 * 大卡才能准确地落回去——而不是落到它此刻缩着的位置。
 *
 * `host` 是容器此刻（变换后）的外框，`originAt` 是它 transform-origin 的比例位置：
 * 缩放不改变原点在外框里的比例位置，所以原点 = 外框上同一比例的那一点再扣掉平移。
 */
export function unscaledBox(
  box: Box,
  host: Box,
  matrix: { a: number; e: number; f: number },
  originAt: Point = { x: 0.5, y: 0.5 },
): Box {
  const a = matrix.a || 1;
  if (a === 1 && !matrix.e && !matrix.f) return box;
  const origin = {
    x: host.left + originAt.x * host.width - matrix.e,
    y: host.top + originAt.y * host.height - matrix.f,
  };
  const map = (x: number, y: number): Point => ({
    x: origin.x + (x - origin.x - matrix.e) / a,
    y: origin.y + (y - origin.y - matrix.f) / a,
  });
  const topLeft = map(box.left, box.top);
  return { left: topLeft.x, top: topLeft.y, width: box.width / a, height: box.height / a };
}

export interface Flight {
  /** 用 CSS `translate` 属性叠加在元素原有的 transform 之外。 */
  translate: Point;
  /** 用 CSS `scale` 属性，绕元素的变换原点。 */
  scale: number;
}

/**
 * 「展开全部」/「收起」时一张卡从旧形态飞到新形态的起点。
 *
 * 新卡此刻的样子是 `to`（已经带着它自己的 transform，比如 coverflow 的侧转），
 * 我们在它外面再叠一层 translate + scale，让它在第一帧和旧卡中心重合、按较紧的
 * 那一边等比缩放（长条卡变成 coverflow 的一张卡时从小往大长，反过来从大往小收）。
 * `origin` 是新卡变换原点的屏幕坐标（布局位置的中心，不受 transform 影响）；
 * 叠加的 scale 绕它进行，所以平移量要把这部分偏移扣回来。
 */
export function flightFrom(from: Box, to: Box, origin: Point): Flight {
  const scale = to.width > 0 && to.height > 0 ? Math.min(from.width / to.width, from.height / to.height) : 1;
  const fromCenter = centerOf(from);
  const toCenter = centerOf(to);
  return {
    translate: {
      x: r2(fromCenter.x - origin.x - scale * (toCenter.x - origin.x)),
      y: r2(fromCenter.y - origin.y - scale * (toCenter.y - origin.y)),
    },
    scale: r4(scale),
  };
}

/**
 * 依次出发的顺序：离 `center` 越近越先走。抽出来时从正中那张往两边，
 * 插回去时反过来（`reverse`）——像把卡一张张抽出卡包、再一张张插回去。
 */
export function staggerOrder(ids: string[], center: string | null, reverse = false): Map<string, number> {
  const middle = Math.max(0, center ? ids.indexOf(center) : 0);
  const n = ids.length;
  const distance = (index: number) => {
    const d = Math.abs(index - middle);
    return Math.min(d, n - d);
  };
  const sorted = ids.map((id, index) => ({ id, d: distance(index), index }))
    .sort((a, b) => a.d - b.d || a.index - b.index);
  const order = reverse ? sorted.reverse() : sorted;
  return new Map(order.map((entry, rank) => [entry.id, rank]));
}

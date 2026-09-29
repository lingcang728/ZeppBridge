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

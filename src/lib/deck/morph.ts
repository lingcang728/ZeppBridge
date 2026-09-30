/**
 * 设置卡组在形态之间的几何。纯函数，方便测。
 *
 * 「展开全部 / 收起」是 FLIP：每张卡从旧形态里的位置等比飞到新形态，一张张依次出发，
 * 像洗牌一样飞出、收拢。中间有一版改成了「叠起 / 发牌」（嫌 coverflow 侧转的卡和卡包里
 * 又宽又矮的卡形状对不上），用户还是更喜欢这种飞法，又换了回来。只动 translate / scale /
 * opacity。
 */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 退到后面一层（绕顶边中点缩小）的总览里，一张卡「回到原大以后」会在哪儿。
 * 关卡时总览正从缩小的状态往回放大，板要落到它放大完的位置，而不是此刻缩着的位置。
 */
export const unscaledBox = (box: Box, origin: { x: number; y: number }, scale: number): Box => {
  const k = scale > 0 ? scale : 1;
  return {
    left: origin.x + (box.left - origin.x) / k,
    top: origin.y + (box.top - origin.y) / k,
    width: box.width / k,
    height: box.height / k,
  };
};

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
  /** 用 CSS `scale` 属性（横、纵各一个），绕元素的变换原点。 */
  scale: Point;
}

/**
 * 「展开全部」/「收起」时一张卡从旧形态飞到新形态的起点（像洗牌一样一张张飞出、收拢）。
 *
 * 新卡此刻的样子是 `to`（已经带着它自己的 transform，比如 coverflow 的侧转），在它外面
 * 再叠一层 translate + scale，让它第一帧和旧卡**严丝合缝**：中心重合、宽和高各自缩放到旧卡的宽和高。
 * 以前按较紧的那一边等比缩放——又宽又矮的卡包卡变成 coverflow 那么宽时只剩一条细带，十来条细带
 * 一起飞，看上去就是「乱飞」（用户 2026-09-30 录屏）。
 * `origin` 是新卡变换原点的屏幕坐标（布局位置的中心，不受 transform 影响）；叠加的 scale
 * 绕它进行，所以平移量要把这部分偏移扣回来。
 */
export function flightFrom(from: Box, to: Box, origin: Point): Flight {
  const scale = {
    x: to.width > 0 ? from.width / to.width : 1,
    y: to.height > 0 ? from.height / to.height : 1,
  };
  const fromCenter = centerOf(from);
  const toCenter = centerOf(to);
  return {
    translate: {
      x: r2(fromCenter.x - origin.x - scale.x * (toCenter.x - origin.x)),
      y: r2(fromCenter.y - origin.y - scale.y * (toCenter.y - origin.y)),
    },
    scale: { x: r4(scale.x), y: r4(scale.y) },
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

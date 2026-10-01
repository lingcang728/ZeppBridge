/**
 * 设置卡组在形态之间的几何。纯函数，方便测。
 *
 * 「展开全部 / 收起」是 FLIP：每张卡从旧形态里的样子飞到新形态（useDeckMorph.fly），一张张依次出发，
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

export const centerOf = (box: Box): Point => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });

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

/** coverflow 舞台的透视距离（DeckCoverflow.vue 的 .cover-stage 是同一个数）：飞进卡包时透视写进变换里。 */
export const COVER_PERSPECTIVE = 1500;

/** coverflow 里一张卡的姿态（DeckCoverflow 的 poseStyle 写进 style.transform 的那几个数）。 */
export interface CoverPose {
  x: number;
  y: number;
  z: number;
  rotate: number;
  scale: number;
}

/**
 * 从 coverflow 卡的 `style.transform`（`translate3d(calc(-50% + Xpx), -50%, Zpx) rotateY(Rdeg) scale(S)`）
 * 读回姿态；认不出来返回 null（洗牌飞行就当它是平的）。
 */
export function coverPoseOf(transform: string): CoverPose | null {
  const translate = /translate3d\(\s*(?:calc\(\s*-50%\s*([+-])\s*([\d.]+)px\s*\)|-50%)\s*,\s*(?:calc\(\s*-50%\s*([+-])\s*([\d.]+)px\s*\)|-50%)\s*,\s*(-?[\d.]+)px\s*\)/.exec(transform);
  if (!translate) return null;
  const signed = (sign?: string, value?: string) => (value === undefined ? 0 : (sign === '-' ? -1 : 1) * Number(value));
  const rotate = /rotateY\(\s*(-?[\d.]+)deg\s*\)/.exec(transform);
  const scale = /scale\(\s*([\d.]+)/.exec(transform);
  return {
    x: signed(translate[1], translate[2]),
    y: signed(translate[3], translate[4]),
    z: Number(translate[5]),
    rotate: rotate ? Number(rotate[1]) : 0,
    scale: scale ? Number(scale[1]) : 1,
  };
}

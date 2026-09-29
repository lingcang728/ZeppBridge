/**
 * 设置卡组在形态之间的几何。纯函数，方便测。
 *
 * 以前「展开全部 / 收起」让每张卡从旧形态里的位置等比飞到新形态（FLIP）：coverflow 的卡
 * 带着 3D 侧转、又宽又矮的卡包卡和它形状对不上，按较紧的一边缩放以后八张卡斜着乱飞，
 * 还一顿一顿的。现在两种形态之间只做「叠起 / 发牌」：卡包里的卡全部收到第一张身后
 * （从最下面那张开始往上收），换成 coverflow 淡入；反过来 coverflow 淡出，卡从第一张身后
 * 依次往下发出来。只动 transform / opacity。
 */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 每张卡要往上挪多少才能叠到第一张身后（顶边对齐第一张）。 */
export const stackOffsets = (tops: number[]): number[] => {
  const first = tops[0] ?? 0;
  return tops.map((top) => Math.round((first - top) * 100) / 100);
};

/** 依次出发的延迟：发牌从上往下，收起从下往上（`reverse`）。 */
export const staggerDelays = (count: number, stepMs: number, reverse = false): number[] =>
  Array.from({ length: count }, (_, index) => (reverse ? count - 1 - index : index) * stepMs);

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

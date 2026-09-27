/**
 * 设置卡组总览的 coverflow 姿态。纯函数：给「这张卡离正中差几格」，
 * 返回它该怎么摆。
 *
 * 正中那张立着、正对人；左右各一张侧转 ~50° 贴在它身边；再往外的卡不再
 * 继续往外排，而是一张压一张地叠在两侧（每张只多露出一条边），越远越小、
 * 越糊、越淡，第四张以后看不见。`d` 是连续值，拖动时所有卡一起平滑过渡。
 */
export interface CoverPose {
  x: number;
  z: number;
  rotate: number;
  scale: number;
  blur: number;
  opacity: number;
  zIndex: number;
  /** 侧卡外侧边缘溶进背景的程度（0 = 不溶，1 = 外侧一半都渐隐掉）。没有硬边。 */
  dissolve: number;
}

/** 最多看得见几张侧卡；再远的完全透明，也不接受点击。 */
export const COVER_VISIBLE = 3.2;

/**
 * @param d     这张卡的下标减去当前位置（可以是小数）
 * @param width 卡片宽度，px：第一张侧卡的偏移按它算，窄屏自动收紧
 */
export function coverflowPose(d: number, width: number): CoverPose {
  const ad = Math.abs(d);
  const sign = d === 0 ? 0 : Math.sign(d);
  const near = Math.min(ad, 1);
  const beyond = Math.max(0, ad - 1);
  const first = width * 0.74;
  const x = sign * (near * first + beyond * width * 0.13);
  const r = (value: number) => Number(value.toFixed(2));
  return {
    x: r(x),
    z: r(-(near * 150 + beyond * 60)),
    rotate: r(-sign * near * 46),
    scale: r(1 - Math.min(ad, 3) * 0.035),
    blur: r(ad < 0.05 ? 0 : Math.min(ad, 3) * 1.4),
    opacity: ad >= COVER_VISIBLE ? 0 : r(1 - beyond * 0.28),
    zIndex: 100 - Math.round(ad * 10),
    dissolve: r(Math.min(1, ad * 0.85)),
  };
}

/** 拖动的像素换算成走了几格：大约一张侧卡的偏移算一格。 */
export const pxPerCard = (width: number): number => Math.max(80, width * 0.74);

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

/**
 * 卡包里一张卡露在外面的那一段：下一张卡的顶边以上（`nextTop` 为空 = 最后一张，整张都露着）。
 * 每张卡的盒子是 184px，只露 78px（悬停让位时多露 44px）——开卡的起点、关卡的落点、
 * 飞行时的裁切都按露出的这一段算，不按整盒（2026-10-01 录屏「开卡一下 + 阴影」「落到过高的卡上」）。
 */
export const peekBox = (box: Box, nextTop: number | null): Box => {
  if (nextTop === null || nextTop <= box.top || nextTop >= box.top + box.height) return box;
  return { ...box, height: nextTop - box.top };
};

/** 大卡四周给投影留的余量：形变最后一帧把裁切放到卡外这么远，撤掉裁切时投影不会突然冒出来。 */
export const SHADOW_BLEED = 100;

/**
 * 大卡在画面里看得见的那一段（竖向裁到视口），四周放出投影余量；某一边被视口截断时那一边不放
 * （截断处本来就在屏幕外）。纯函数，方便测。
 */
export const shownRect = (card: Box, viewportHeight: number, bleed = SHADOW_BLEED): Box => {
  const top = card.top < 0 ? 0 : card.top - bleed;
  const bottom = card.top + card.height > viewportHeight ? viewportHeight : card.top + card.height + bleed;
  return { left: card.left - bleed, top, width: card.width + bleed * 2, height: Math.max(1, bottom - top) };
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const px = (value: number) => `${Number(value.toFixed(2))}px`;

/** 形变的一个时刻：屏幕上看得见的矩形，以及卡内容左上角此刻在屏幕上的位置（内容跟着它走）。 */
export interface CardPose {
  rect: Box;
  anchor: Point;
}

/**
 * 一个时刻换算成大卡自己的 transform + clip-path。`card` 是大卡的布局框（不含变换）。
 * 裁切的圆角整段用同一个值：半径一变，clip-path 动画就退回主线程（lib/motion/window.ts 文件头的实测）。
 */
export const cardFrame = (pose: CardPose, card: Box, radius: number): Keyframe => {
  const { rect, anchor } = pose;
  const top = rect.top - anchor.y;
  const left = rect.left - anchor.x;
  const right = anchor.x + card.width - (rect.left + rect.width);
  const bottom = anchor.y + card.height - (rect.top + rect.height);
  return {
    transform: `translate(${px(anchor.x - card.left)}, ${px(anchor.y - card.top)})`,
    clipPath: `inset(${px(top)} ${px(right)} ${px(bottom)} ${px(left)} round ${px(radius)})`,
  };
};

/**
 * 大卡从 `from` 形变到 `to` 的关键帧：起点、终点，加一个走弧线的中点（竖直方向先走六成多、
 * 水平刚过一半，和概览 ↔ 详情的窗口形变同一种手感）。纯函数，方便测。
 */
export const morphFrames = (from: CardPose, to: CardPose, card: Box, radius: number): Keyframe[] => {
  const t = 0.5;
  const tv = 0.64;
  const mid: CardPose = {
    rect: {
      left: lerp(from.rect.left, to.rect.left, t),
      width: lerp(from.rect.width, to.rect.width, t),
      top: lerp(from.rect.top, to.rect.top, tv),
      height: lerp(from.rect.height, to.rect.height, tv),
    },
    anchor: { x: lerp(from.anchor.x, to.anchor.x, t), y: lerp(from.anchor.y, to.anchor.y, tv) },
  };
  return [cardFrame(from, card, radius), { ...cardFrame(mid, card, radius), offset: 0.5 }, cardFrame(to, card, radius)];
};

/**
 * 洗牌飞行里一张卡的 `translate` / `scale`（独立属性，叠在卡自己的 transform 外面，卡的侧转姿态一路不变）。
 * 缩放是**等比**的、绕卡的变换原点（布局中心 `origin`）；`visual` 是卡在不加这两项时画面上的中心。
 * 要让画面中心落到 `center`、宽度乘以 `k`：t = center − origin − k·(visual − origin)。纯函数，方便测。
 */
export const flightOffset = (center: Point, origin: Point, visual: Point, k: number): Point => ({
  x: center.x - origin.x - k * (visual.x - origin.x),
  y: center.y - origin.y - k * (visual.y - origin.y),
});

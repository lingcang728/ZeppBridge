/**
 * 牌的「姿势」（第三轮精修 A1）：把「这张牌此刻应该在屏幕上的哪一点、转多少度、多大」换算成它自己的 transform。
 *
 * 牌（`.pcard`）套在牌位（`.pslot`）里，牌位本身就带着扇面的下沉和歪角。牌的 transform 是在牌位的坐标系里算的，
 * 所以屏幕上的位移要先按牌位的角度转回来，角度要减掉牌位已经歪的那一点——不然一叠牌落进另一叠时总差几度、
 * 偏几像素（第二轮的替身「在原牌右下方半张牌处凭空出现」就是没算这一层）。
 *
 * 量的是牌位的盒子（牌位不放动画），所以牌正在动的时候也能拿到它「歇着」时的中心。
 */
export interface Point { x: number; y: number }

/** 一张牌歇着时的样子：屏幕中心、牌位的角度（度）、布局宽度（不含缩放）。 */
export interface Rest { center: Point; angle: number; width: number }

/** 一个姿势：屏幕上的中心、屏幕上的角度（度）、相对布局宽度的缩放。 */
export interface Pose { center: Point; angle: number; scale: number }

export const centerOfRect = (rect: DOMRect): Point => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

/** 元素（计算后的）transform 里的旋转角，度。 */
export const angleOf = (el: Element | null | undefined): number => {
  if (!el) return 0;
  const transform = getComputedStyle(el).transform;
  if (!transform || transform === 'none') return 0;
  const m = /matrix\(([^)]+)\)/.exec(transform);
  if (!m) return 0;
  const [a, b] = m[1]!.split(',').map(Number);
  return (Math.atan2(b ?? 0, a ?? 1) * 180) / Math.PI;
};

/** 牌歇着的样子：量牌位（`.pslot`），没有牌位就量牌自己。 */
export const restOf = (card: HTMLElement): Rest => {
  const slot = card.parentElement?.classList.contains('pslot') ? card.parentElement : null;
  const box = (slot ?? card).getBoundingClientRect();
  return { center: centerOfRect(box), angle: slot ? angleOf(slot) : 0, width: card.offsetWidth || box.width };
};

/** 屏幕上的一段位移转到角度为 `deg` 的坐标系里。 */
export const toLocal = (dx: number, dy: number, deg: number): Point => {
  const r = (-deg * Math.PI) / 180;
  return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
};

/** 让歇在 `rest` 的牌摆成 `pose` 的 transform。 */
export const poseTransform = (rest: Rest, pose: Pose): string => {
  const local = toLocal(pose.center.x - rest.center.x, pose.center.y - rest.center.y, rest.angle);
  return `translate(${local.x.toFixed(1)}px, ${local.y.toFixed(1)}px) rotate(${(pose.angle - rest.angle).toFixed(2)}deg) scale(${pose.scale.toFixed(3)})`;
};

/** 叠里第 i 张（共 n 张）：每张错开 1.5px、歪 1–4°，一左一右。 */
export const stackPose = (center: Point, i: number, n: number, scale = 1, baseAngle = 0): Pose => {
  const side = i % 2 === 0 ? -1 : 1;
  const tilt = side * (1 + ((i * 7) % 4));
  return {
    center: { x: center.x + (i - (n - 1) / 2) * 1.5 * scale, y: center.y - i * 1.5 * scale },
    angle: baseAngle + tilt * (i === n - 1 ? 0.4 : 1),
    scale,
  };
};

/** 一组牌歇着时中心的重心。 */
export const centroid = (rests: Rest[]): Point => {
  if (!rests.length) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const x = rests.reduce((sum, r) => sum + r.center.x, 0) / rests.length;
  const y = rests.reduce((sum, r) => sum + r.center.y, 0) / rests.length;
  return { x, y };
};

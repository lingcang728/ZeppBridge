/**
 * PB 墙的牌叠（components/journal/PbDeck.vue）的纯逻辑：谁在第几层、甩一下换到哪张、松手算不算甩。
 *
 * 牌是 `[最快, 第二, 第三]`，`top` 是此刻最上面那张的下标。循环：往左甩 = 顶牌落到最底（top + 1），
 * 往右甩 = 最底那张盖上来（top − 1）。门槛照抄更新信的信纸（LetterPad.vue）：横向超 8px 且横向占优才算拖，
 * 松手位移超 70px 或速度超 0.6 px/ms 才换牌，否则弹回。
 */
import type { Pose } from '../letters/turn';

/** 每一层的摆法：0 最上面，1、2 往下错开一点、转一点角，露出牌边（同信纸的 POSE，按牌的尺寸收小一点）。 */
export const DECK_POSE: Pose[] = [{ x: 0, y: 0, r: 0 }, { x: 3, y: 5, r: 1.2 }, { x: -3, y: 9, r: -1.4 }];

/** 第 i 张离最上面几层（0 = 最上面）。 */
export const deckDepth = (i: number, top: number, count: number): number => (count ? (i - top + count * 2) % count : 0);

export const deckPose = (i: number, top: number, count: number): Pose => DECK_POSE[Math.min(deckDepth(i, top, count), DECK_POSE.length - 1)]!;

/** 往哪边甩以后谁在最上面：−1 往左（顶牌落底）、+1 往右（最底盖上来）。 */
export const deckNext = (top: number, count: number, side: -1 | 1): number => (count ? (top - side + count) % count : 0);

/** 甩的时候动的是哪张：往左是原来的顶牌，往右是原来最底那张（也就是换完以后的顶牌）。 */
export const deckMover = (top: number, count: number, side: -1 | 1): number => (side < 0 ? top : deckNext(top, count, side));

/** 横向超 8px 且横向占优（1.4 倍）才算拖。 */
export const isHorizontalDrag = (dx: number, dy: number): boolean => Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.4;

/** 松手：位移超 70px 或速度超 0.6 px/ms 往那边换牌，否则 0（弹回）。 */
export const releaseSide = (dx: number, speed: number): -1 | 0 | 1 => {
  if (dx < -70 || speed < -0.6) return -1;
  if (dx > 70 || speed > 0.6) return 1;
  return 0;
};

/** 手指拖出来的位移 → 顶牌这一刻显示的位移：往左跟手；往右（盖上来的是最底那张）只给一点阻尼，同信纸。 */
export const dragOffset = (dx: number): number => (dx > 0 ? dx * 0.3 : dx);

/** 拖着的顶牌的样子：在 base（拖之前那一刻的样子）上加位移，往上抬一点、按位移转一点角。 */
export const dragPose = (offset: number, width: number, base: Pose = DECK_POSE[0]!): Pose => ({
  x: base.x + offset,
  y: base.y + Math.min(0, offset) * 0.02,
  r: base.r + (offset / Math.max(1, width)) * 10,
});

/** 计算样式里的 transform（`matrix(a, b, c, d, e, f)` 或 `none`）→ 位置和转角：半路接着走时用。 */
export const poseFromMatrix = (transform: string): Pose => {
  const m = /^matrix\(([^)]+)\)$/.exec(transform.trim());
  if (!m) return { x: 0, y: 0, r: 0 };
  const [a = 1, b = 0, , , e = 0, f = 0] = m[1]!.split(',').map((v) => Number.parseFloat(v));
  return { x: e, y: f, r: (Math.atan2(b, a) * 180) / Math.PI };
};

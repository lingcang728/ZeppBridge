/**
 * 信纸翻页的路径（LetterPad 用）：动的那张整张抽到整沓左边、换层次、再回来。
 *
 * 以前是两段关键帧：前半段缓停在最远处、后半段从静止重新起步。两头都是零速度，于是最远处停住一拍——
 * 往前翻（底下那张抽出来盖到上面）看着「顿一下再复原」；往后翻那张回去时后半段中间猛加速，从整沓后面「一下子冒出来」
 * （2026-10-21 用户录屏）。
 *
 * 现在是一条连贯的圈：横向出去再回来（掉头那一刻横向速度为零是物理上必然的，但只是一瞬，不是一段平台），
 * 同时竖向和转角一直在变——出去往上、回来偏下，所以掉头时整张纸仍在动。整体用一条先快后缓的时间曲线：
 * 抽的那一下利落（往后翻时还接着手指拖出来的速度），落回整沓时慢慢停稳。
 * 层次只在最远处换：那时它和整沓不重叠，换了也看不出来。
 */

export interface Pose { x: number; y: number; r: number }

/** 抽出来最远的位置（按纸的宽高算）：整张抽到整沓左边、往上一点、转一点角。 */
const OUT_X = -1.12;
const OUT_Y = -0.03;
const OUT_R = -7;
/** 出去往上、回来偏下的幅度（按纸高）和转角的额外摆动：掉头时不停。 */
const LOOP_Y = 0.05;
const LOOP_R = 3.5;
const SAMPLES = 24;

export const poseTransform = (p: Pose): string =>
  `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) rotate(${p.r.toFixed(3)}deg)`;

/**
 * 时间 → 路程：先快后缓，起步就有速度（和以前前半段抽出去的起速相当），落下时速度归零。
 * 六成「1 - (1 - t)²」加四成 smoothstep——纯前者起步太冲，纯后者起步要慢慢加速，接不住手指拖出来的那一下。
 */
export const progress = (t: number) => 0.6 * (1 - (1 - t) ** 2) + 0.4 * t * t * (3 - 2 * t);
/** 走到最远处（路程一半）的时刻：progress 单调，二分求。 */
export const TURN_AT = (() => {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (progress(mid) < 0.5) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
})();

/** 路程 s（0..1）处的位置：起止之间线性过渡，叠上出去回来的一圈。 */
export function turnPose(s: number, from: Pose, to: Pose, width: number, height: number): Pose {
  const out = Math.sin(Math.PI * s);
  const loop = Math.sin(2 * Math.PI * s);
  const base = (a: number, b: number) => a + (b - a) * s;
  return {
    x: base(from.x, to.x) + (OUT_X * width - (from.x + to.x) / 2) * out,
    y: base(from.y, to.y) + (OUT_Y * height - (from.y + to.y) / 2) * out - LOOP_Y * height * loop,
    r: base(from.r, to.r) + (OUT_R - (from.r + to.r) / 2) * out - LOOP_R * loop,
  };
}

/**
 * 整段关键帧：按时间均匀取样（线性插值），z-index 在最远处那一刻从 fromZ 换成 toZ（同一时刻两帧，不经过中间值）。
 */
export function turnKeyframes(from: Pose, to: Pose, width: number, height: number, fromZ: string, toZ: string): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    if (frames.length && t > TURN_AT && (frames[frames.length - 1]!.offset as number) < TURN_AT) {
      const peak = poseTransform(turnPose(0.5, from, to, width, height));
      frames.push({ offset: TURN_AT, transform: peak, zIndex: fromZ });
      frames.push({ offset: TURN_AT + 1e-4, transform: peak, zIndex: toZ });
    }
    frames.push({ offset: t, transform: poseTransform(turnPose(progress(t), from, to, width, height)), zIndex: t < TURN_AT ? fromZ : toZ });
  }
  return frames;
}

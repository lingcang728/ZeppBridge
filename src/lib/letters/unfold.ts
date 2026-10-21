/**
 * 拆信那一整段的路径（2026-10-21 用户第三轮录屏：抽出来、闪到顶上、再折角闪一下，一顿一顿像直角转弯；要一气呵成、像圆角）。
 *
 * 一条连续的时间线，所有东西按同一个时钟走：
 *   信封里那张对折的信往上抽，信封同时往下沉（一手抽、一手拿着信封）；抽到整张离开信封口的那一刻，
 *   外面那沓信纸在完全相同的位置、大小接手（两边都是空白的对折纸，看不出换了）——接手时它已经在动，
 *   速度接着信纸原来的速度往下走，不停顿；然后顺着一条弧线放大、往人这边抬一点再落到位，
 *   下半页从折痕后面翻下来（转过竖直以后才看得见，不会盖在上半页上）；信封往后、往下退远淡掉。
 *
 * 只出 transform / opacity 的关键帧（按 25ms 采样、段间线性），三个元素共用采样点，接手那一刻位置分毫不差。
 */

export interface Box { left: number; top: number; width: number; height: number }
export interface UnfoldInput {
  /** 翻到背面后的信封。 */
  envelope: Box;
  /** 信封里那张对折的信（静止时）。 */
  paper: Box;
  /** 外面那沓信纸摆好以后的框（没变换时）。 */
  shell: Box;
}
export interface UnfoldPlan {
  /** 信封（.envelope-wrap）。 */
  envelope: Keyframe[];
  /** 信封里那张信（.env-paper，坐标跟着信封走）。 */
  paper: Keyframe[];
  /** 外面那沓信纸（.pad-shell，transform-origin 在上沿中点）。 */
  shell: Keyframe[];
  /** 下半页（.fold-flap）：自己的时长和起步。 */
  flap: { keyframes: Keyframe[]; delay: number; duration: number };
  /** 对折后露在外面那截的高度（信纸坐标）。 */
  foldH: number;
  /** 信封、信封里那张、外面那沓三条关键帧的时长。 */
  duration: number;
  /** 连下半页翻完在内的整段。 */
  total: number;
  /** 接手的时刻。 */
  handoff: number;
}

const STEP = 25;
const RISE_AT = 140;
const RISE_MS = 600;
const HANDOFF = RISE_AT + RISE_MS;
const FLY_MS = 680;
const RECEDE_MS = 560;
const FLAP_AT = HANDOFF + 220;
const FLAP_MS = 560;
/** 抽信时信封往下沉多少（剩下的距离由信纸往上走）。 */
const SINK = 160;
/** 抽出来以后信纸下沿离信封口还留多少。 */
const CLEAR = 10;
const LIFT_Z = 140;
const TILT = -8;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
/** 抽信的进度：从静止起步，到接手时还带着速度（终点斜率 1.5）。 */
const pull = (u: number) => 1.5 * u * u - 0.5 * u * u * u;
const PULL_END_SLOPE = 1.5;
const smooth = (w: number) => w * w * (3 - 2 * w);
/** 三次 Hermite：起点 p0、起点切线 m0，终点 p1、终点切线 0。 */
const hermite = (w: number, p0: number, m0: number, p1: number) =>
  (2 * w ** 3 - 3 * w ** 2 + 1) * p0 + (w ** 3 - 2 * w ** 2 + w) * m0 + (-2 * w ** 3 + 3 * w ** 2) * p1;
const r = (v: number) => Math.round(v * 100) / 100;

export function planUnfold({ envelope, paper, shell }: UnfoldInput): UnfoldPlan {
  const W = shell.width;
  const H = shell.height;
  /* 对折后外面那截和信封里那张同比例；放大以后正好是信纸的上半截（不超过整页）。 */
  const foldH = Math.round(Math.min(H, W / (paper.width / paper.height)));
  const s0 = paper.width / W;
  /* 信纸相对信封要走的路：下沿越过信封口再留一点。 */
  const travel = paper.top + paper.height - envelope.top + CLEAR;
  const sink = Math.min(SINK, travel * 0.6);
  const duration = HANDOFF + Math.max(FLY_MS, RECEDE_MS);

  const progress = (t: number) => pull(clamp((t - RISE_AT) / RISE_MS));
  /* 接手时信纸在屏幕上的速度（px / ms，往上为负）。 */
  const screenSpeed = (sink - travel) * PULL_END_SLOPE / RISE_MS;
  const sinkSpeed = sink * PULL_END_SLOPE / RISE_MS;
  const x0 = paper.left + paper.width / 2 - (shell.left + W / 2);
  const y0 = paper.top + sink - travel - shell.top;

  const envelopeAt = (t: number) => {
    if (t <= HANDOFF) return { y: sink * progress(t), z: 0, a: 0, o: 1 };
    const w = clamp((t - HANDOFF) / RECEDE_MS);
    const s = smooth(w);
    return { y: hermite(w, sink, sinkSpeed * RECEDE_MS, sink + 110), z: -320 * s, a: 24 * s, o: 1 - smooth(clamp((w - 0.1) / 0.9)) };
  };
  const shellAt = (t: number) => {
    const w = clamp((t - HANDOFF) / FLY_MS);
    const s = smooth(w);
    const arc = Math.sin(Math.PI * w) ** 2;
    return { x: x0 * (1 - s), y: hermite(w, y0, screenSpeed * FLY_MS, 0), z: LIFT_Z * arc, a: TILT * arc, k: s0 + (1 - s0) * s };
  };

  const envelopeFrames: Keyframe[] = [];
  const paperFrames: Keyframe[] = [];
  const shellFrames: Keyframe[] = [];
  const times: number[] = [];
  for (let t = 0; t < duration; t += STEP) times.push(t);
  times.push(duration);
  if (!times.includes(HANDOFF)) times.push(HANDOFF);
  times.sort((a, b) => a - b);

  for (const t of times) {
    const offset = t / duration;
    const e = envelopeAt(t);
    envelopeFrames.push({ offset, transform: `perspective(1400px) translateY(${r(e.y)}px) translateZ(${r(e.z)}px) rotateX(${r(e.a)}deg)`, opacity: r(e.o) });
    if (t <= HANDOFF) paperFrames.push({ offset, transform: `translateY(${r(-travel * progress(t))}px)`, opacity: 1 });
    const p = shellAt(t);
    shellFrames.push({
      offset,
      transform: `translate(${r(p.x)}px, ${r(p.y)}px) perspective(1400px) translateZ(${r(p.z)}px) rotateX(${r(p.a)}deg) scale(${r(p.k * 1000) / 1000})`,
      opacity: t < HANDOFF ? 0 : 1,
    });
  }
  /* 接手：同一个采样点上，信封里那张消失、外面那张出现（不透明度的阶跃落在两帧之间）。 */
  const at = HANDOFF / duration;
  const cut = Math.min(1, at + 0.0005);
  paperFrames.push({ offset: cut, transform: `translateY(${r(-travel)}px)`, opacity: 0 }, { offset: 1, transform: `translateY(${r(-travel)}px)`, opacity: 0 });
  const handoffIndex = shellFrames.findIndex((frame) => frame.offset === at);
  shellFrames.splice(handoffIndex + 1, 0, { ...shellFrames[handoffIndex], offset: cut, opacity: 1 });
  shellFrames[handoffIndex] = { ...shellFrames[handoffIndex], opacity: 0 };

  return {
    envelope: envelopeFrames,
    paper: paperFrames,
    shell: shellFrames,
    flap: {
      keyframes: [{ transform: 'perspective(1400px) rotateX(180deg)' }, { transform: 'perspective(1400px) rotateX(0deg)' }],
      delay: FLAP_AT,
      duration: FLAP_MS,
    },
    foldH,
    duration,
    total: Math.max(duration, FLAP_AT + FLAP_MS),
    handoff: HANDOFF,
  };
}

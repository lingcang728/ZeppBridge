/**
 * 拆信那一整段的路径（2026-10-21 用户第三轮录屏：抽出来、闪到顶上、再折角闪一下，一顿一顿像直角转弯；要一气呵成、像圆角）。
 *
 * 一条连续的时间线，所有东西按同一个时钟走：
 *   信封里那张对折的信往上抽，信封同时往下沉（一手抽、一手拿着信封）；抽到整张离开信封口的那一刻，
 *   外面那沓信纸在完全相同的位置、大小接手（两边印着同一页字，看不出换了）——接手时它已经在动，
 *   速度接着信纸原来的速度走，不停顿；然后顺着一条弧线放大、往人这边抬一点再落到位，
 *   下半页从折痕后面翻下来（转过竖直以后才看得见，不会盖在上半页上）；信封往后、往下退远淡掉。
 *
 * 层次（2026-10-21 用户第四轮：信纸和信封像连在一起、太扁）：抽信时两边就分开纵深——信纸一边往上抽一边往人这边抬
 * （translateZ，看上去略放大），信封一边下沉一边往后退（略缩小），信纸出口时离信封口留开一截；
 * 外面那沓飞起来时底下一团影子跟着抬高、变淡，落定前收掉。纵深只用 translateZ（透视下就是绕原点的等比缩放），
 * 接手前不转角度，所以接手那一刻的框仍然能精确算出来。
 *
 * 只出 transform / opacity 的关键帧（按 25ms 采样、段间线性），几个元素共用采样点，接手那一刻位置分毫不差。
 */

export interface Box { left: number; top: number; width: number; height: number }
export interface UnfoldInput {
  /** 翻到背面后的信封。 */
  envelope: Box;
  /** 整个信封那一格（.envelope-wrap，含底下的提示字；它的变换绕自己的中心）。 */
  wrap: Box;
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
  /** 外面那沓底下的影子（.lift-shadow，跟着它走）。 */
  shadow: Keyframe[];
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
const RISE_MS = 620;
const HANDOFF = RISE_AT + RISE_MS;
const FLY_MS = 700;
const RECEDE_MS = 620;
const FLAP_AT = HANDOFF + 220;
const FLAP_MS = 560;
/** 抽信时信封往下沉多少（剩下的距离由信纸往上走）。 */
const SINK = 160;
/** 抽出来以后信纸下沿离信封口还留多少（2026-10-21：以前 10px，看着像粘在信封口上）。 */
const CLEAR = 34;
const LIFT_Z = 150;
const TILT = -8;
/** 透视距离：和信封翻面、封盖一样。 */
export const PERSPECTIVE = 1400;
/** 抽信这段：信封往后退、信纸往前抬多少（px，透视下）。 */
const ENVELOPE_BACK = -110;
const PAPER_FORWARD = 70;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
/** 抽信的进度：从静止起步，到接手时还带着速度（终点斜率 1.5）。 */
const pull = (u: number) => 1.5 * u * u - 0.5 * u * u * u;
const PULL_END_SLOPE = 1.5;
const smooth = (w: number) => w * w * (3 - 2 * w);
/** 三次 Hermite：起点 p0、起点切线 m0，终点 p1、终点切线 0。 */
const hermite = (w: number, p0: number, m0: number, p1: number) =>
  (2 * w ** 3 - 3 * w ** 2 + 1) * p0 + (w ** 3 - 2 * w ** 2 + w) * m0 + (-2 * w ** 3 + 3 * w ** 2) * p1;
const r = (v: number) => Math.round(v * 100) / 100;
/** translateZ(z) 在透视下的放大倍数。 */
const depth = (z: number) => PERSPECTIVE / (PERSPECTIVE - z);

export function planUnfold({ envelope, wrap, paper, shell }: UnfoldInput): UnfoldPlan {
  const W = shell.width;
  const H = shell.height;
  /* 对折后外面那截和信封里那张同比例；放大以后正好是信纸的上半截（不超过整页）。 */
  const foldH = Math.round(Math.min(H, W / (paper.width / paper.height)));
  /* 信纸相对信封要走的路：下沿越过信封口再留一截。 */
  const travel = paper.top + paper.height - envelope.top + CLEAR;
  const sink = Math.min(SINK, travel * 0.6);
  const duration = HANDOFF + Math.max(FLY_MS, RECEDE_MS);

  const progress = (t: number) => pull(clamp((t - RISE_AT) / RISE_MS));
  const pullSpeed = PULL_END_SLOPE / RISE_MS;

  const envelopeAt = (t: number) => {
    const p = progress(t);
    if (t <= HANDOFF) return { y: sink * p, z: ENVELOPE_BACK * p, a: 0, o: 1 };
    const w = clamp((t - HANDOFF) / RECEDE_MS);
    const s = smooth(w);
    return {
      y: hermite(w, sink, sink * pullSpeed * RECEDE_MS, sink + 110),
      z: hermite(w, ENVELOPE_BACK, ENVELOPE_BACK * pullSpeed * RECEDE_MS, -360),
      a: 24 * s,
      o: 1 - smooth(clamp((w - 0.1) / 0.9)),
    };
  };
  const paperAt = (t: number) => ({ y: -travel * progress(t), z: PAPER_FORWARD * progress(t) });

  /* 信封里那张此刻在屏幕上的框：信纸绕自己的中心抬起（透视等比放大），再随信封一起绕信封那一格的中心退远。 */
  const ox = wrap.left + wrap.width / 2;
  const oy = wrap.top + wrap.height / 2;
  const paperOnScreen = (t: number) => {
    const e = envelopeAt(t);
    const p = paperAt(t);
    const ke = depth(e.z);
    const k = ke * depth(p.z);
    const cx = ox + ke * (paper.left + paper.width / 2 - ox);
    const cy = oy + ke * (paper.top + paper.height / 2 + depth(p.z) * p.y + e.y - oy);
    return { cx, top: cy - (paper.height * k) / 2, width: paper.width * k };
  };
  /* 接手时外面那沓的位置、缩放和速度（左导数），之后从这里接着走。 */
  const at = paperOnScreen(HANDOFF);
  const before = paperOnScreen(HANDOFF - 1);
  const x0 = at.cx - (shell.left + W / 2);
  const y0 = at.top - shell.top;
  const k0 = at.width / W;
  const vx = at.cx - before.cx;
  const vy = at.top - before.top;
  const vk = (at.width - before.width) / W;

  const shellAt = (t: number) => {
    const w = clamp((t - HANDOFF) / FLY_MS);
    const arc = Math.sin(Math.PI * w) ** 2;
    return {
      x: hermite(w, x0, vx * FLY_MS, 0),
      y: hermite(w, y0, vy * FLY_MS, 0),
      z: LIFT_Z * arc,
      a: TILT * arc,
      k: hermite(w, k0, vk * FLY_MS, 1),
      w,
      arc,
    };
  };

  const envelopeFrames: Keyframe[] = [];
  const paperFrames: Keyframe[] = [];
  const shellFrames: Keyframe[] = [];
  const shadowFrames: Keyframe[] = [];
  const times: number[] = [];
  for (let t = 0; t < duration; t += STEP) times.push(t);
  times.push(duration);
  if (!times.includes(HANDOFF)) times.push(HANDOFF);
  times.sort((a, b) => a - b);

  for (const t of times) {
    const offset = t / duration;
    const e = envelopeAt(t);
    envelopeFrames.push({ offset, transform: `perspective(${PERSPECTIVE}px) translateY(${r(e.y)}px) translateZ(${r(e.z)}px) rotateX(${r(e.a)}deg)`, opacity: r(e.o) });
    if (t <= HANDOFF) {
      const p = paperAt(t);
      paperFrames.push({ offset, transform: `perspective(${PERSPECTIVE}px) translateY(${r(p.y)}px) translateZ(${r(p.z)}px)`, opacity: 1 });
    }
    const s = shellAt(t);
    shellFrames.push({
      offset,
      transform: `translate(${r(s.x)}px, ${r(s.y)}px) perspective(${PERSPECTIVE}px) translateZ(${r(s.z)}px) rotateX(${r(s.a)}deg) scale(${r(s.k * 1000) / 1000})`,
      opacity: t < HANDOFF ? 0 : 1,
    });
    /* 影子：飞起来时往下错开、最浓，落定前收掉（落下以后信纸自己的细影接手）。 */
    shadowFrames.push({
      offset,
      transform: `translateY(${r(8 + 34 * s.arc)}px) scale(${r(1 + 0.04 * s.arc)})`,
      opacity: t < HANDOFF ? 0 : r(0.85 * Math.sin(Math.PI * s.w) ** 0.6),
    });
  }
  /* 接手：同一个采样点上，信封里那张消失、外面那张出现（不透明度的阶跃落在两帧之间）。 */
  const handoffAt = HANDOFF / duration;
  const cut = Math.min(1, handoffAt + 0.0005);
  const last = paperAt(HANDOFF);
  const parked = `perspective(${PERSPECTIVE}px) translateY(${r(last.y)}px) translateZ(${r(last.z)}px)`;
  paperFrames.push({ offset: cut, transform: parked, opacity: 0 }, { offset: 1, transform: parked, opacity: 0 });
  const handoffIndex = shellFrames.findIndex((frame) => frame.offset === handoffAt);
  shellFrames.splice(handoffIndex + 1, 0, { ...shellFrames[handoffIndex], offset: cut, opacity: 1 });
  shellFrames[handoffIndex] = { ...shellFrames[handoffIndex], opacity: 0 };

  return {
    envelope: envelopeFrames,
    paper: paperFrames,
    shell: shellFrames,
    shadow: shadowFrames,
    flap: {
      keyframes: [{ transform: `perspective(${PERSPECTIVE}px) rotateX(180deg)` }, { transform: `perspective(${PERSPECTIVE}px) rotateX(0deg)` }],
      delay: FLAP_AT,
      duration: FLAP_MS,
    },
    foldH,
    duration,
    total: Math.max(duration, FLAP_AT + FLAP_MS),
    handoff: HANDOFF,
  };
}


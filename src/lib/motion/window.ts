/**
 * 卡片 ↔ 整页（或设置大卡）的「窗口」形变，照 ColorOS 17 的做法（用户 2026-09-30 给的录屏逐帧看过）：
 *
 * - **从哪里来回哪里去**：窗口从那张卡的矩形长出来，收回时落回同一张卡的矩形——大卡落回大卡、
 *   小格落回小格，宽高比一路从卡变成页（或反过来），终点就是卡此刻在屏幕上的位置和圆角。
 * - **全程圆角**：展开时圆角一直留到快长满才收掉；收回时一开始就变圆。以前收回的前一百多毫秒
 *   是详情页自己在缩，它没有圆角，看上去「缩成一个方块」。
 * - **轻微的抛物线**：竖直方向先走、水平方向稍晚（关键帧中点竖直走了六成多、水平刚过一半），
 *   窗口的中心走的是一段弧，而不是直线平移。曲线先快后慢、没有回弹。
 * - **内容跟着窗口走**：窗口里放一份那张卡的拷贝，跟窗口一起等比缩放。展开时它在前 45% 里淡掉，
 *   露出新页；收回时它在 25%–65% 之间淡入，**落地前的最后一帧窗口里就是那张卡本身**，
 *   撤掉窗口时真卡原样接上——没有空色板、没有亮一下。放大前的第一帧也同样就是那张卡。
 * - **背景退后**：窗口在动的时候，底下那一页蒙一层磨砂变暗；展开时渐起，收回时渐散。
 *
 * 性能（见记忆「动效只动合成属性」）：逐帧改的只有三样——一块没有子树重排的板的 clip-path
 * （板里只有一张卡的拷贝），拷贝的 transform / opacity，遮罩的 opacity。模糊是遮罩上静态的一层
 * backdrop-filter，不做逐帧模糊半径过渡。
 *
 * **clip-path 的圆角在一段动画里必须是同一个值**（2026-10-01 在 Chrome / WebView2 154 上实测）：
 * inset() 的四边怎么变、关键帧有几个都能交给合成器，但只要 round 的半径在关键帧之间变了，整段动画就退回
 * 主线程——展开时新页挂载占着主线程，板就停在原地、等主线程空了再一下跳过去（「展开卡、收回顺」就是它：
 * 收回时来处页是缓存的，主线程是空的）。所以整段只用卡那一端的圆角；整页那一端（圆角 0）把裁切矩形往外
 * 多放一个圆角半径，圆弧落到板外面，四个角自然就方了，不用改半径。
 *
 * 板的底色是页面自己的底（--ambient + --canvas），不是卡片色：长满以后它看上去就是「新页还没
 * 画出内容的那一瞬」，而不是一整屏深色卡片。以前板带着卡片的底色，还把卡片自己的背景留在原位，
 * 长满后整屏深色里多出一块浅色矩形——用户看到的「黑块残影」就是它。
 */
import { exemptFromSettle } from './interrupt';

export interface WindowRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const r2 = (value: number) => Number(value.toFixed(2));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** `rect` 在 `frame` 上的 inset 裁切（纯函数，方便测）。`bleed`：矩形比板大时允许负的 inset（往板外伸）。 */
export function windowInset(rect: WindowRect, frame: WindowRect, radius: number, bleed = false): string {
  const clamp = (value: number) => (bleed ? value : Math.max(0, value));
  const top = clamp(rect.top - frame.top);
  const left = clamp(rect.left - frame.left);
  const right = clamp(frame.left + frame.width - (rect.left + rect.width));
  const bottom = clamp(frame.top + frame.height - (rect.top + rect.height));
  return `inset(${r2(top)}px ${r2(right)}px ${r2(bottom)}px ${r2(left)}px round ${r2(radius)}px)`;
}

/**
 * 整段形变用的那一个圆角：卡那一端的圆角（另一端是整页、圆角 0 时）；两端都是卡（设置的小卡 ↔ 大卡）时
 * 取小的那一端——形变落在小卡上时要严丝合缝地接上真卡，大卡那一端有交叉淡入盖着。纯函数，方便测。
 */
export function steadyRadius(from: WindowRect, fromRadius: number, to: WindowRect, toRadius: number): number {
  if (fromRadius <= 0) return Math.max(0, toRadius);
  if (toRadius <= 0) return fromRadius;
  return from.width * from.height <= to.width * to.height ? fromRadius : toRadius;
}

/** 圆角为 0 的那一端：矩形往外多放一个圆角半径，圆弧落到板外，四个角就是方的。 */
export function bleedRect(rect: WindowRect, radius: number): WindowRect {
  return { left: rect.left - radius, top: rect.top - radius, width: rect.width + radius * 2, height: rect.height + radius * 2 };
}

/** 弧线的中点：竖直方向走得快一些（t 是中点处的整体进度）。纯函数，方便测。 */
export function arcMidpoint(from: WindowRect, to: WindowRect, t = 0.5, lead = 0.14): WindowRect {
  const tv = Math.min(1, t + lead);
  return {
    left: lerp(from.left, to.left, t),
    width: lerp(from.width, to.width, t),
    top: lerp(from.top, to.top, tv),
    height: lerp(from.height, to.height, tv),
  };
}

/** 窗口在关键帧 0 / 0.5 / 0.9 / 1 处的矩形（和 morphWindow 的形状动画一一对应）。
    离场页要跟着窗口一起缩，用同一组矩形、同一条缓动算它的 transform。 */
export const WINDOW_OFFSETS = [0, 0.5, 0.9, 1] as const;
export function windowRects(from: WindowRect, to: WindowRect): WindowRect[] {
  return [
    from,
    arcMidpoint(from, to),
    {
      left: lerp(from.left, to.left, 0.94),
      top: lerp(from.top, to.top, 0.96),
      width: lerp(from.width, to.width, 0.94),
      height: lerp(from.height, to.height, 0.96),
    },
    to,
  ];
}

/**
 * 那张卡的一份拷贝：只是用来「看」的——去掉可交互性、固定成卡此刻的尺寸，
 * 放进窗口里跟着缩放。画布（ECharts）拷贝出来是空白的，这无妨：它只在窗口的一端短暂出现。
 */
export function cardReplica(card: HTMLElement): { el: HTMLElement; rect: WindowRect } {
  const box = card.getBoundingClientRect();
  const el = card.cloneNode(true) as HTMLElement;
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('inert', '');
  el.removeAttribute('href');
  el.classList.add('window-replica');
  Object.assign(el.style, {
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: `${box.width}px`,
    height: `${box.height}px`,
    margin: '0',
    boxSizing: 'border-box',
    pointerEvents: 'none',
    transformOrigin: '50% 50%',
    animation: 'none',
    transition: 'none',
    translate: 'none',
    scale: 'none',
    opacity: '1',
    willChange: 'transform, opacity',
  });
  return { el, rect: { left: box.left, top: box.top, width: box.width, height: box.height } };
}

/** 拷贝在「页」那一端的变换：中心对到窗口中心，按宽度等比放大（封顶，免得放得太夸张）。 */
function replicaTransform(card: WindowRect, window: WindowRect): string {
  const scale = Math.min(3, Math.max(0.2, window.width / card.width));
  const dx = window.left + window.width / 2 - (card.left + card.width / 2);
  const dy = window.top + window.height / 2 - (card.top + card.height / 2);
  return `translate(${r2(dx)}px, ${r2(dy)}px) scale(${r2(scale)})`;
}

export interface WindowMorphOptions {
  /** 窗口起点 / 终点矩形与圆角。 */
  from: WindowRect;
  to: WindowRect;
  fromRadius: number;
  toRadius: number;
  /** 板铺在哪块矩形上（页面可视区）：裁切都相对它算。 */
  frame: WindowRect;
  /** 板挂在哪一层（要在顶栏下面，所以挂进应用骨架而不是 body）。 */
  host: HTMLElement;
  duration: number;
  easing: string;
  /** 那张卡的拷贝，以及它在哪一端：'from' = 展开（从卡出发）、'to' = 收回（落到卡上）。 */
  replica?: { el: HTMLElement; rect: WindowRect; at: 'from' | 'to' } | null;
  /** 底下那一页的磨砂遮罩：展开时渐起（'in'），收回时渐散（'out'）。 */
  scrim?: 'in' | 'out' | null;
  /** 窗口的底：'page' = 页面底色（卡 ↔ 整页）；'card' = 卡片材质（设置里小卡 ↔ 打开的大卡）。 */
  surface?: 'page' | 'card';
  /** 收回时：窗口先在这么长里从透明变实（盖住正在淡出的详情页）；遮罩同一段里渐起、之后渐散。 */
  fadeIn?: number;
  zIndex?: number;
}

export interface WindowMorph {
  plate: HTMLElement;
  /** 形状动画（时长 = duration）。 */
  shape: Animation;
  /** 形状走完的时刻。 */
  arrived: Promise<void>;
  /** 板淡出、移除（遮罩一起）。默认等形状走完再淡；`now` = 立刻开始淡（和真内容交叉）。 */
  release: (fadeMs?: number, now?: boolean) => void;
  /** 立刻移除（收回落地：真卡已经和拷贝重合，直接接上）。 */
  remove: () => void;
  /** 原路倒回起点，然后淡出移除（展开到一半按 Esc）。 */
  retract: (fadeMs?: number) => Promise<void>;
  /** 终点换成另一块矩形（收回时真卡晚一点才找到）：时间轴不变，只换目标。 */
  retarget: (next: WindowRect, radius: number, replica?: { el: HTMLElement; rect: WindowRect } | null) => void;
  /** 板长满、新页还没到：板上扫过一道很淡的光，等待时没有一帧完全静止。 */
  waiting: () => void;
  /** 全部动画，Esc 快放时用。 */
  animations: () => Animation[];
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function morphWindow(options: WindowMorphOptions): WindowMorph {
  const { from, to, frame, host, duration, easing } = options;
  const zIndex = options.zIndex ?? 25;
  const plate = document.createElement('div');
  plate.setAttribute('aria-hidden', 'true');
  plate.className = 'motion-window';
  Object.assign(plate.style, {
    position: 'fixed',
    left: `${frame.left}px`,
    top: `${frame.top}px`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
    zIndex: String(zIndex),
    pointerEvents: 'none',
    overflow: 'hidden',
    contain: 'strict',
    background: options.surface === 'card' ? 'var(--mat-card)' : 'var(--ambient), var(--canvas)',
    boxShadow: 'var(--mat-rim)',
  });

  let scrim: HTMLElement | null = null;
  if (options.scrim && !reducedMotion()) {
    scrim = document.createElement('div');
    scrim.setAttribute('aria-hidden', 'true');
    scrim.className = 'motion-window-scrim';
    Object.assign(scrim.style, {
      position: 'fixed',
      left: `${frame.left}px`,
      top: `${frame.top}px`,
      width: `${frame.width}px`,
      height: `${frame.height}px`,
      zIndex: String(zIndex - 1),
      pointerEvents: 'none',
      background: 'color-mix(in srgb, var(--canvas) 14%, transparent)',
      backdropFilter: 'blur(6px)',
      webkitBackdropFilter: 'blur(6px)',
      willChange: 'opacity',
    });
    host.appendChild(scrim);
  }
  host.appendChild(plate);

  /* 圆角整段不变（见文件头：变了就退回主线程）。整页那一端往外多放一个半径，圆角在最后一小段自然消失——
     关键帧的偏移是「缓动后的进度」，0.9 那一帧窗口已经长到九成多，之后才把圆弧推出板外。 */
  const shapeFrames = (target: WindowRect, targetRadius: number): Keyframe[] => {
    const radius = steadyRadius(from, options.fromRadius, target, targetRadius);
    const [a, mid, near, b] = windowRects(from, target);
    const end = (rect: WindowRect, r: number) => (r <= 0 ? bleedRect(rect, radius) : rect);
    return [
      { clipPath: windowInset(end(a, options.fromRadius), frame, radius, true) },
      { clipPath: windowInset(mid, frame, radius), offset: 0.5 },
      { clipPath: windowInset(near, frame, radius), offset: 0.9 },
      { clipPath: windowInset(end(b, targetRadius), frame, radius, true) },
    ];
  };
  const timing: KeyframeAnimationOptions = { duration, easing, fill: 'both' };
  const shape = plate.animate(shapeFrames(to, options.toRadius), timing);

  let replicaAnim: Animation | null = null;
  let replicaEl: HTMLElement | null = null;
  const attachReplica = (replica: { el: HTMLElement; rect: WindowRect }, at: 'from' | 'to', target: WindowRect) => {
    replicaAnim?.cancel();
    replicaEl?.remove();
    replicaEl = replica.el;
    // 拷贝放在卡原来的位置（相对板），变换原点是它自己的中心。
    replica.el.style.left = `${r2(replica.rect.left - frame.left)}px`;
    replica.el.style.top = `${r2(replica.rect.top - frame.top)}px`;
    plate.appendChild(replica.el);
    const far = replicaTransform(replica.rect, at === 'from' ? target : from);
    const frames: Keyframe[] = at === 'from'
      ? [
        { transform: 'none', opacity: 1 },
        { opacity: 0, offset: 0.45 },
        { transform: far, opacity: 0 },
      ]
      : [
        { transform: far, opacity: 0 },
        { opacity: 0, offset: 0.25 },
        { opacity: 1, offset: 0.65 },
        { transform: 'none', opacity: 1 },
      ];
    replicaAnim = replica.el.animate(frames, timing);
    replicaAnim.currentTime = shape.currentTime;
  };
  if (options.replica) attachReplica(options.replica, options.replica.at, to);

  const fadeAt = options.fadeIn ? Math.min(0.5, options.fadeIn / duration) : 0;
  let plateFade: Animation | null = null;
  if (fadeAt) {
    plateFade = plate.animate([{ opacity: 0 }, { opacity: 1, offset: fadeAt }, { opacity: 1 }], { duration, easing: 'linear', fill: 'both' });
  }
  let scrimAnim: Animation | null = null;
  if (scrim) {
    const frames: Keyframe[] = options.scrim === 'in'
      ? [{ opacity: 0 }, { opacity: 1 }]
      : fadeAt ? [{ opacity: 0 }, { opacity: 1, offset: fadeAt }, { opacity: 0 }] : [{ opacity: 1 }, { opacity: 0 }];
    scrimAnim = scrim.animate(frames, { duration: options.scrim === 'in' ? duration : duration * 0.92, easing: 'ease-out', fill: 'both' });
  }

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    plate.remove();
    scrim?.remove();
  };
  shape.addEventListener('cancel', remove);
  const arrived = shape.finished.then(() => undefined, () => undefined);

  let released = false;
  const release = (fadeMs = 180, now = false) => {
    if (released) return;
    released = true;
    void (now ? Promise.resolve() : arrived).then(() => {
      if (removed) return;
      const fade = [plate, scrim].filter((el): el is HTMLElement => !!el)
        .map((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fadeMs, easing: 'ease-out', fill: 'forwards' }));
      Promise.all(fade.map((animation) => animation.finished)).then(remove, remove);
    });
  };

  const retract = async (fadeMs = 160) => {
    if (released) return;
    released = true;
    // 撤回本身就是对 Esc 的回应：紧接着的切页会调 settleMotion，不能再被它快进成一下跳。
    const all = [shape, replicaAnim, scrimAnim, plateFade].filter((a): a is Animation => !!a);
    for (const animation of all) {
      exemptFromSettle(animation);
      animation.updatePlaybackRate(-1.25);
      if (animation.playState !== 'running') animation.play();
    }
    try {
      await shape.finished;
    } catch {
      return;
    }
    const fade = exemptFromSettle(plate.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fadeMs, easing: 'ease-out', fill: 'forwards' }));
    scrim?.remove();
    await fade.finished.then(remove, remove);
  };

  const retarget = (next: WindowRect, radius: number, replica?: { el: HTMLElement; rect: WindowRect } | null) => {
    (shape.effect as KeyframeEffect | null)?.setKeyframes(shapeFrames(next, radius));
    if (replica) attachReplica(replica, 'to', next);
  };

  let sheen: HTMLElement | null = null;
  const waiting = () => {
    if (released || sheen) return;
    sheen = document.createElement('div');
    Object.assign(sheen.style, {
      position: 'absolute',
      inset: '0',
      background: 'linear-gradient(100deg, transparent 30%, color-mix(in srgb, var(--ink) 4%, transparent) 50%, transparent 70%)',
      willChange: 'transform, opacity',
    });
    plate.appendChild(sheen);
    exemptFromSettle(sheen.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out', fill: 'both' }));
    exemptFromSettle(sheen.animate(
      [{ transform: 'translateX(-70%)' }, { transform: 'translateX(70%)' }],
      { duration: 900, easing: 'ease-in-out', iterations: Infinity },
    ));
  };

  const animations = () => [shape, replicaAnim, scrimAnim, plateFade].filter((a): a is Animation => !!a);
  return { plate, shape, arrived, release, remove, retract, retarget, waiting, animations };
}

/**
 * 台前调度的窗口飞行（2026-11-13）：每张卡只动它自己这一个元素（FLIP，见记忆 page-morph-one-element）。
 *
 * 位置由 Vue 写在行内 transform 上（layout.ts 的 transformOf）。换位置时：
 *   1. 改之前拍一张快照（snapshotOf）：此刻画出来的样子——计算样式的 transform（飞到一半就是半路的值）、
 *      拖动时临时加的 translate / scale 属性、排版尺寸、透明度，以及（卡是平的时候）此刻露出来的矩形；
 *   2. Vue 写上新位置后从快照飞到新位置（flyFrom）。
 *
 * 外框（材质、内描边）画在窗口的 ::before 上，投影在 ::after 上，内容在 .window-body 里（StageWindow.css）。两种飞法：
 * - 外框飞行（起点终点都是平的：舞台内换位 / 换大小、平铺 ↔ 舞台）：窗口直接排到新位置，外框临时撑到途经范围的
 *   外接矩形，可见部分用 clip-path inset 从旧矩形插到新矩形（圆角恒定，不缩放）；投影层非等比缩放跟着走（软阴影看不出）；
 *   内容层只等比缩放（旧宽 / 新宽 → 1），底部裁到和外框一样高。2026-11-13 用户：小↔大卡切换变形、盖住别的卡——
 *   曾把整扇窗按宽等比缩放回旧盒子再底部裁切，途中卡比两个槽都高，压到第三张卡。
 *   WAAPI 里几层只能各自插值，曲线由逐帧采样的关键帧带（线性时间、按缓动取值），每一帧几层严丝合缝。
 * - 整窗飞行（有一头是斜着的缩略卡、画中画）：整扇窗等比缩放（缩略卡本来就是真卡缩小），高度差交给内容层和外框的
 *   底部裁切，新盒子比旧的矮就先用 --fly-h 临时撑高，落地再撤。宽高比差得再多也不非等比（曾把字和图拉扁到 1.7 倍）。
 * 飞到一半又换：快照读的是半路的值，从那儿接着飞，不跳回起点（记忆 motion-preferences：打断就原路折返）。
 * 只动 transform / opacity / clip-path（记忆 animation-compositor-only）。少动效：直接到位。
 *
 * 一批卡一起飞时（换排法、换档）别读一张写一张（2026-11-14 实测：「全部卡片」⇄ 舞台一次 85 ms 长任务，
 * 十张卡每张都逼浏览器把整块画布重算一遍样式和排版）：调用方先给所有卡拍快照、再一起 stopFlight，
 * 飞的时候把排版尺寸和圆角传进来（FlySize），flyFrom 就不再读 DOM。
 */
import { lessMotion } from './lessMotion';
import { OPEN_EASE, paced } from './timing';
import { easeOf, lerpBox, sameBox, unionBox, type Box } from '../stage/flightRect';

export const STAGE_MS = paced(400);
/** 拖动松手落位：带一点过冲，回收的动作看得出来（2026-11-13 用户：松开后的回收动作不明显）。 */
export const SETTLE_EASE = 'cubic-bezier(.3, 1.22, .4, 1)';

/** h 是此刻露出来的高（排版高减去底部裁切）；rect = 卡是平的时候此刻露出来的矩形（画布坐标）。 */
export interface Snapshot {
  matrix: string; tx: number; ty: number; k: number; w: number; h: number; opacity: number; rect: Box | null;
  /** 没在飞、没被拖时，Vue 写在行内的那串 transform（layout.ts 的 transformOf 拼的）：此刻画出来的就是它。 */
  inline: string | null;
}

interface FrameFlight { a: Box; b: Box; start: number; duration: number; ease: (t: number) => number }
/** 落点的排版尺寸和窗口圆角（调用方已知：layout 的 Placement、同一个 token）；不给就读 DOM。 */
export interface FlySize { w: number; h: number; radius: number }
interface Flight { animations: Animation[]; frame?: FrameFlight }
const running = new WeakMap<HTMLElement, Flight>();
const FRAME_VARS = ['--fly-h', '--fl-t', '--fl-r', '--fl-b', '--fl-l', '--fl-ab'];

const bodyOf = (el: HTMLElement) => el.querySelector<HTMLElement>(':scope > .window-body');
const numbers = (text: string) => text.trim().split(/\s+/).map((v) => parseFloat(v) || 0);
const px = (n: number) => `${Math.round(n * 10) / 10}px`;
const radiusOf = (el: HTMLElement) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;

/** 内容层此刻的底部裁切（飞到一半时是动画里的值）。 */
const clipBottom = (el: HTMLElement): number => {
  const body = bodyOf(el);
  const m = body ? getComputedStyle(body).clipPath.match(/^inset\(([^)]*?)(?: round|\))/) : null;
  if (!m) return 0;
  const edges = numbers(m[1]);
  return edges[2] ?? edges[0] ?? 0;
};

/** transform 把 (x, y) 投到哪（带透视除法）。 */
const project = (m: DOMMatrix, x: number, y: number) => {
  const p = m.transformPoint(new DOMPoint(x, y, 0, 1));
  return { x: p.x / (p.w || 1), y: p.y / (p.w || 1) };
};
/** 这个 transform 下 w × h 的盒子是不是平的（没斜、没缩放）：是就给出它的左上角。 */
const flatOrigin = (transform: string, w: number, h: number, allowScale = false): { x: number; y: number; k: number } | null => {
  let m: DOMMatrix;
  try { m = transform && transform !== 'none' ? new DOMMatrix(transform) : new DOMMatrix(); } catch { return null; }
  const o = project(m, 0, 0);
  const r = project(m, w, 0);
  const d = project(m, 0, h);
  const k = (r.x - o.x) / Math.max(1, w);
  const flat = Math.abs(r.y - o.y) < 0.5 && Math.abs(d.x - o.x) < 0.5 && Math.abs((d.y - o.y) - k * h) < 0.5 * Math.max(1, k);
  if (!flat || (!allowScale && Math.abs(k - 1) > 0.002)) return null;
  return { ...o, k };
};

const frameRectNow = (f: FrameFlight): Box => lerpBox(f.a, f.b, f.ease(Math.min(1, Math.max(0, (performance.now() - f.start) / f.duration))));

export const snapshotOf = (el: HTMLElement): Snapshot => {
  const style = getComputedStyle(el);
  // 读计算值：拖动时临时加的位移缩放、飞到一半的 transform 都在里面。
  const [tx = 0, ty = 0] = style.translate && style.translate !== 'none' ? numbers(style.translate) : [];
  const k = style.scale && style.scale !== 'none' ? parseFloat(style.scale) || 1 : 1;
  const flight = running.get(el);
  const h = Math.max(1, el.offsetHeight - clipBottom(el));
  let rect: Box | null = null;
  if (flight?.frame) rect = frameRectNow(flight.frame);
  else {
    const o = flatOrigin(style.transform, el.offsetWidth, h, true);
    if (o) rect = { x: tx + k * o.x, y: ty + k * o.y, w: k * o.k * el.offsetWidth, h: k * o.k * h };
  }
  const still = !flight && tx === 0 && ty === 0 && k === 1;
  return { matrix: style.transform === 'none' ? '' : style.transform, tx, ty, k, w: el.offsetWidth, h, opacity: Number(style.opacity), rect, inline: still ? el.style.transform : null };
};

/** transformOf 拼出来的那种：translate · perspective · rotateY · translate · scale。 */
const STRUCTURED = /^translate\(([-\d.]+)px, ([-\d.]+)px\) perspective\(([\d.]+)px\) rotateY\(([-\d.]+)deg\) translate\(0px, ([-\d.]+)px\) scale\(([\d.e-]+)\)$/;
/**
 * 起点也拼成和终点同一串函数（缩放乘上旧宽 / 新宽），浏览器就逐个函数插值：卡一边缩小一边斜过去。
 * 函数串不同时浏览器退回矩阵分解插值，半路透视被放大——2026-11-13 慢放里卡飞回侧栏途中字比原来大一倍、斜得夸张。
 */
const structuredStart = (inline: string | null, end: string, sx: number): string | null => {
  const a = inline?.match(STRUCTURED);
  if (!a || !STRUCTURED.test(end)) return null;
  const s = Math.round(parseFloat(a[6]) * sx * 10000) / 10000;
  return `translate(${a[1]}px, ${a[2]}px) perspective(${a[3]}px) rotateY(${a[4]}deg) translate(0px, ${a[5]}px) scale(${s})`;
};

/** 停掉正在飞的那一段（先拍快照再停，快照里是半路的值），撤掉临时撑高和外框的临时范围。 */
export const stopFlight = (el: HTMLElement): void => {
  for (const animation of running.get(el)?.animations ?? []) animation.cancel();
  running.delete(el);
  for (const name of FRAME_VARS) el.style.removeProperty(name);
  el.classList.remove('is-flying');
};
export const isFlying = (el: HTMLElement): boolean => running.has(el);

/** 拖动时临时的位移 / 缩放（不经过 Vue，松手前一直是它们在动）。 */
export const dragTo = (el: HTMLElement, tx: number, ty: number, k = 1): void => {
  el.style.translate = `${Math.round(tx * 10) / 10}px ${Math.round(ty * 10) / 10}px`;
  el.style.scale = k === 1 ? '' : String(Math.round(k * 10000) / 10000);
};
/** 撤掉拖动时临时加的位移缩放（不飞，直接回到 transform 写的位置）。 */
export const clearDrag = (el: HTMLElement): void => {
  el.style.translate = '';
  el.style.scale = '';
};

const finishWith = (el: HTMLElement, flight: Flight, last: Animation) => {
  running.set(el, flight);
  const done = () => {
    if (running.get(el) !== flight) return;
    running.delete(el);
    for (const name of FRAME_VARS) el.style.removeProperty(name);
    el.classList.remove('is-flying');
  };
  // finish 事件和 finished promise 都接：途中改了播放速率（DevTools 慢放、CDP）时 promise 会被换掉、旧的永不兑现，
  // 外框就卡在撑大的范围上（整块空白板）。
  last.addEventListener('finish', done, { once: true });
  last.finished.then(done, () => {});
};

/** 写完样式、待起飞：调用它才建动画（建动画要读样式，先把一批卡的写全做完再一起读）。 */
type Launch = () => void;

/** 外框飞行：窗口已经排在 B，外框 / 投影 / 内容各自从 A 插到 B。 */
const frameFlight = (el: HTMLElement, a: Box, b: Box, easing: string, fromOpacity: number, size: FlySize): Launch => {
  const body = bodyOf(el);
  const W = Math.max(1, size.w);
  const H = Math.max(1, size.h);
  const settle = easing !== OPEN_EASE;
  const duration = settle ? Math.round(STAGE_MS * 1.15) : STAGE_MS;
  const ease = easeOf(easing);
  const STEPS = 16;
  const boxes = Array.from({ length: STEPS + 1 }, (_, i) => {
    const r = lerpBox(a, b, ease(i / STEPS));
    return { x: r.x - b.x, y: r.y - b.y, w: r.w, h: r.h };
  });
  // 内容层等比缩放 s = w / W，要露出 h 就得有 h / s 那么高：不够就临时撑高窗口。
  const flyH = Math.max(H, ...boxes.map((r) => r.h / (r.w / W)));
  if (flyH > H + 0.5) el.style.setProperty('--fly-h', px(flyH));
  const hull = unionBox([...boxes, { x: 0, y: 0, w: W, h: H }]);
  el.style.setProperty('--fl-t', px(hull.y));
  el.style.setProperty('--fl-l', px(hull.x));
  el.style.setProperty('--fl-r', px(W - (hull.x + hull.w)));
  el.style.setProperty('--fl-b', px(flyH - (hull.y + hull.h)));
  el.style.setProperty('--fl-ab', px(flyH - H));
  el.classList.add('is-flying');
  return () => {
    const R = size.radius;
    const timing: KeyframeAnimationOptions = { duration, easing: 'linear' };
    const animations: Animation[] = [];
    const offset = (i: number) => i / STEPS;
    animations.push(el.animate(boxes.map((r, i) => ({
      offset: offset(i),
      clipPath: `inset(${px(r.y - hull.y)} ${px(hull.x + hull.w - (r.x + r.w))} ${px(hull.y + hull.h - (r.y + r.h))} ${px(r.x - hull.x)} round ${px(R)})`,
    })), { ...timing, pseudoElement: '::before' }));
    animations.push(el.animate(boxes.map((r, i) => ({
      offset: offset(i),
      transform: `translate(${px(r.x)}, ${px(r.y)}) scale(${(r.w / W).toFixed(4)}, ${(r.h / H).toFixed(4)})`,
    })), { ...timing, pseudoElement: '::after' }));
    if (body) {
      animations.push(body.animate(boxes.map((r, i) => {
        const s = r.w / W;
        return {
          offset: offset(i),
          transform: `translate(${px(r.x)}, ${px(r.y)}) scale(${s.toFixed(4)})`,
          clipPath: `inset(0px 0px ${px(Math.max(0, flyH - r.h / s))} 0px round ${px(R)})`,
        };
      }), timing));
    }
    const opacity = Number(el.style.opacity || 1);
    if (Math.abs(fromOpacity - opacity) > 0.001) animations.push(el.animate([{ opacity: fromOpacity }, { opacity }], { duration, easing: OPEN_EASE }));
    const flight: Flight = { animations, frame: { a, b, start: performance.now(), duration, ease } };
    finishWith(el, flight, animations[0]);
  };
};

/** 一张卡起飞前的全部写操作；返回建动画的那一步（不用飞时返回 null）。 */
const prepare = (el: HTMLElement, from: Snapshot, easing: string, known?: FlySize): Launch | null => {
  stopFlight(el);
  clearDrag(el);
  if (lessMotion()) return null;
  const size = known ?? { w: el.offsetWidth, h: el.offsetHeight, radius: radiusOf(el) };
  const W = Math.max(1, size.w);
  const H = Math.max(1, size.h);
  const target = flatOrigin(el.style.transform, W, H);
  if (from.rect && target) {
    const b = { x: target.x, y: target.y, w: W, h: H };
    if (sameBox(from.rect, b) && Math.abs(from.opacity - Number(el.style.opacity || 1)) < 0.001) return null;
    return frameFlight(el, from.rect, b, easing, from.opacity, size);
  }
  // 整窗飞行：等比缩放，高度差交给内容层和外框的底部裁切。
  const sx = from.w / W;
  const body = bodyOf(el);
  const animations: Animation[] = [];
  const settle = easing !== OPEN_EASE;
  const timing: KeyframeAnimationOptions = { duration: settle ? Math.round(STAGE_MS * 1.15) : STAGE_MS, easing };
  // 裁切和透明度不跟过冲走（过冲会让裁切短暂变负、透明度超出 0–1）。
  const plain: KeyframeAnimationOptions = { ...timing, easing: OPEN_EASE };
  const startH = from.h / sx;
  const tall = Math.max(H, startH);
  if (Math.abs(startH - H) > 0.5 && tall > H + 0.5) el.style.setProperty('--fly-h', px(tall));
  el.classList.add('is-flying');
  return () => {
    if (Math.abs(startH - H) > 0.5) {
      const R = size.radius;
      const inset = (bottom: number) => `inset(0px 0px ${px(Math.max(0, bottom))} 0px round ${px(R)})`;
      const clip = [{ clipPath: inset(tall - startH) }, { clipPath: inset(tall - H) }];
      if (body) animations.push(body.animate(clip, plain));
      animations.push(el.animate(clip, { ...plain, pseudoElement: '::before' }));
      animations.push(el.animate([{ transform: `scale(1, ${(startH / tall).toFixed(4)})` }, { transform: `scale(1, ${(H / tall).toFixed(4)})` }], { ...plain, pseudoElement: '::after' }));
    }
    const end = el.style.transform || 'none';
    const start = structuredStart(from.inline, end, sx) ?? `translate(${from.tx}px, ${from.ty}px) scale(${from.k}) ${from.matrix} scale(${sx})`;
    const opacity = Number(el.style.opacity || 1);
    const animation = el.animate([{ transform: start }, { transform: end }], timing);
    animations.push(animation);
    if (Math.abs(from.opacity - opacity) > 0.001) animations.push(el.animate([{ opacity: from.opacity }, { opacity }], plain));
    finishWith(el, { animations }, animation);
  };
};

export const flyFrom = (el: HTMLElement, from: Snapshot, easing = OPEN_EASE, known?: FlySize): void => {
  prepare(el, from, easing, known)?.();
};

/**
 * 一批卡一起飞：先把每张卡的写（停旧飞行、外框范围变量、is-flying）全做完，再一起建动画。
 * 逐张 flyFrom 时每张卡「写 → 建动画（读样式）」，十张卡就逼浏览器重算十遍整块画布的样式（2026-11-14 trace：约 30 次）。
 */
export const flyAll = (items: ReadonlyArray<{ el: HTMLElement; from: Snapshot; easing?: string; size?: FlySize }>): void => {
  const launches = items.map((item) => prepare(item.el, item.from, item.easing ?? OPEN_EASE, item.size));
  for (const launch of launches) launch?.();
};

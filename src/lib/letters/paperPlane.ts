/**
 * 寄出：整张信纸折成一只纸飞机飞走（写给作者的信纸、信封里的回信纸都用这一套）。
 *
 *   ⓪ 点下「寄出」，拷一份整张信纸摆在原处（原件藏起来），先轻轻抬起一点（像被手拿起来）；
 *   ① 再往后一倾、上下对折；字跟着淡掉，只剩一张纸；
 *   ② 纸接着往里收、转到机头要朝的方向，收成机身那么大——这时纸飞机在同一处、同一角度、合着翅膀接手，
 *      纸淡出、飞机张开翅膀，两者交叉淡化，看上去就是这张纸自己变成了飞机；
 *   ③ 张开翅膀后在原处悬停一拍，再先往下一沉（像手一推），顺着往右上抬的弧线越飞越快、越飞越小，飞出窗口。
 *
 * 节奏和应用里其它形变一样慢（lib/motion/timing.ts 的 paced）：折纸约 1.2 秒、飞行约 1.6 秒。
 * 弹窗要等飞机起飞再关（options.onTakeoff），遮罩才不会在纸还没折好时就一下子收走。
 *
 * 折纸、交接、飞行三段在同一帧建好（飞机用 delay 接在折纸后面），中间不靠 await 衔接，不会空一帧；
 * 飞行按缓动后的进度沿弧线采样、关键帧之间匀速，起步慢、越飞越快，速度是连续的。
 * 拷贝和飞机都挂在 body 上（fixed，压在弹窗遮罩之上）。只动 transform / opacity；放完就拆掉。
 */

import { paced } from '../motion/timing';

export type Point = { x: number; y: number };

/* 机头在纸飞机图里的朝向：从机尾 (0, 24) 指向机头 (64, 0)。 */
const NOSE_DEG = (Math.atan2(-24, 64) * 180) / Math.PI;
const W = 64;
const H = 48;

/** 从起点飞出窗口右上角的那条弧：先沉一下，再抬头。 */
export function flightPath(from: Point, viewport: { width: number; height: number }): [Point, Point, Point, Point] {
  const to = { x: viewport.width + W * 2, y: -H * 2 };
  return [
    from,
    { x: from.x + 70, y: from.y + 70 },
    { x: from.x + (to.x - from.x) * 0.55, y: Math.min(from.y, to.y) + (from.y - to.y) * 0.15 },
    to,
  ];
}

const cubic = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};
const slope = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t;
  return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c);
};

/** 飞行的进度：起步有一点初速（手推了一下），之后越来越快。 */
export const launchEase = (t: number): number => 0.25 * t + 0.75 * t * t;

/**
 * 沿路径采样：位置、机头角度（相对图里的朝向）、大小（越远越小）。
 * `t` 是时间进度（关键帧 offset），位置按 ease(t) 取——关键帧之间匀速放，整段的速度就跟着 ease 走。
 */
export function flightFrames(
  path: [Point, Point, Point, Point],
  steps = 28,
  ease: (t: number) => number = (t) => t,
): Array<Point & { angle: number; scale: number; t: number }> {
  const [p0, p1, p2, p3] = path;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const at = ease(t);
    const dx = slope(p0.x, p1.x, p2.x, p3.x, at);
    const dy = slope(p0.y, p1.y, p2.y, p3.y, at);
    const heading = (Math.atan2(dy, dx) * 180) / Math.PI;
    return { t, x: cubic(p0.x, p1.x, p2.x, p3.x, at), y: cubic(p0.y, p1.y, p2.y, p3.y, at), angle: heading - NOSE_DEG, scale: 1.25 - 0.6 * at };
  });
}

const PLANE = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
  <path d="M0 24L64 0L24 34Z" fill="#fbf7ee"/>
  <path d="M24 34L64 0L32 48Z" fill="#ddd3c1"/>
  <path d="M24 34L32 48L28 37Z" fill="#b9ad97"/>
  <path d="M0 24L64 0L24 34" fill="none" stroke="rgb(90 70 40 / .5)" stroke-width="1" stroke-linejoin="round"/>
</svg>`;

/** 折纸（含开头抬起那一下）多长；飞机在纸收好前 HANDOFF_MS 接手，张翅膀、悬停一拍、再飞。 */
const FOLD_MS = paced(900);
const HANDOFF_MS = paced(200);
const OPEN_WINGS_MS = paced(240);
const HOVER_MS = paced(140);
const FLIGHT_MS = paced(1250);
/** 从点下「寄出」到飞机起飞（开始沉下去）的时间。 */
export const TAKEOFF_MS = FOLD_MS - HANDOFF_MS + OPEN_WINGS_MS + HOVER_MS;

/** 拷一份信纸：textarea 的字不会跟着 cloneNode 走，要补上；id、焦点、对话框标记都去掉，免得和原件撞。 */
function ghostOf(sheet: HTMLElement, rect: DOMRect): HTMLElement {
  const ghost = sheet.cloneNode(true) as HTMLElement;
  const sources = sheet.querySelectorAll('textarea');
  ghost.querySelectorAll('textarea').forEach((area, i) => { area.value = sources[i]?.value ?? ''; });
  /* 附图的缩略图换成画好的画布：寄出后 blob 地址马上被收回，拷贝里的 <img> 再去读就是破图。 */
  const pictures = sheet.querySelectorAll('img');
  ghost.querySelectorAll('img').forEach((img, i) => {
    const source = pictures[i];
    if (!source?.complete || !source.naturalWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = source.naturalWidth;
    canvas.height = source.naturalHeight;
    canvas.getContext('2d')?.drawImage(source, 0, 0);
    const look = getComputedStyle(source);
    Object.assign(canvas.style, {
      display: 'block', width: '100%', height: '100%', objectFit: look.objectFit, borderRadius: look.borderRadius, boxShadow: look.boxShadow,
    });
    img.replaceWith(canvas);
  });
  for (const el of [ghost, ...ghost.querySelectorAll<HTMLElement>('*')]) {
    el.removeAttribute('id');
    el.removeAttribute('data-dialog-window');
    el.removeAttribute('data-dialog-content');
    if (el.hasAttribute('tabindex') || el.matches('button, textarea, input, a')) el.setAttribute('tabindex', '-1');
  }
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  Object.assign(ghost.style, {
    position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    margin: '0', maxHeight: 'none', zIndex: '2300', pointerEvents: 'none', transformOrigin: '50% 50%', willChange: 'transform, opacity',
    /* 一圈细边 + 浅影：信封里是纸叠在纸上，没有它折起来的那张就看不见；影子太重压扁后会变成一条黑杠。 */
    boxShadow: '0 0 0 1px rgb(90 70 40 / .16), 0 8px 20px rgb(0 0 0 / .2)', overflow: 'hidden',
  });
  return ghost;
}

export interface FoldIntoPlaneOptions {
  /** 飞机起飞后这么多毫秒，原件淡淡地回来（信封里的回信纸：表示已经寄走、不能改了）。不给就一直藏着（弹窗会关掉）。 */
  returnAfter?: number;
  /**
   * 只藏原件里面的字，纸本身留在原处（信封里那一叠信纸：整页藏起来会露出底下的上一页）。
   * 看上去是写好的那张从纸面上揭下来、折好飞走，原处剩一张空纸，字再淡淡地回来。
   */
  leaveBlank?: boolean;
  /** 飞机起飞那一刻调（TAKEOFF_MS 后）：写给作者的信纸这时才关弹窗。 */
  onTakeoff?: () => void;
}

/**
 * 把整张信纸折成纸飞机飞走。原件当场藏起来（visibility），拷贝接着演；飞机飞出窗口后 resolve。
 * 原件要不要回来由 options.returnAfter 决定。
 */
export async function foldIntoPlane(sheet: HTMLElement, options: FoldIntoPlaneOptions = {}): Promise<void> {
  const rect = sheet.getBoundingClientRect();
  const ghost = ghostOf(sheet, rect);
  const plane = document.createElement('div');
  plane.setAttribute('aria-hidden', 'true');
  plane.innerHTML = PLANE;
  Object.assign(plane.style, {
    position: 'fixed', left: '0', top: '0', width: `${W}px`, height: `${H}px`, zIndex: '2301', pointerEvents: 'none',
    filter: 'drop-shadow(0 10px 12px rgb(0 0 0 / .32))', willChange: 'transform, opacity', opacity: '0',
  });
  document.body.append(ghost, plane);
  const hidden = options.leaveBlank ? [...sheet.children].filter((el): el is HTMLElement => el instanceof HTMLElement) : [sheet];
  for (const el of hidden) el.style.visibility = 'hidden';

  const from = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const frames = flightFrames(flightPath(from, { width: window.innerWidth, height: window.innerHeight }), 40, launchEase);
  const first = frames[0]!;
  /* 纸收到的样子：长边顺着机身（机头朝向），大小和合着翅膀的飞机差不多。 */
  const heading = first.angle + NOSE_DEG;
  const bodyW = W * first.scale * 1.05;
  const bodyH = H * first.scale * 0.45;
  const squeeze = `rotate(${heading}deg) scale(${bodyW / rect.width}, ${bodyH / rect.height})`;
  const at = (p: Point, rest: string) => `translate(${p.x - W / 2}px, ${p.y - H / 2}px) ${rest}`;

  const animations: Animation[] = [];
  try {
    /* ⓪ ① ② 纸：先抬起一点，再往后一倾、对折，再收窄转向成机身；最后 HANDOFF_MS 淡出。每段自己的缓动，段与段之间不停。 */
    const handoff = 1 - HANDOFF_MS / FOLD_MS;
    animations.push(ghost.animate([
      { transform: 'perspective(900px) translateY(0) rotateX(0deg) rotate(0deg) scale(1)', opacity: 1, easing: 'cubic-bezier(.3, 0, .2, 1)' },
      { transform: 'perspective(900px) translateY(-8px) rotateX(-4deg) rotate(0deg) scale(1.02)', opacity: 1, offset: 0.16, easing: 'cubic-bezier(.45, 0, .35, 1)' },
      { transform: 'perspective(900px) translateY(0) rotateX(46deg) rotate(0deg) scale(.86, .56)', opacity: 1, offset: 0.52, easing: 'cubic-bezier(.4, 0, .25, 1)' },
      { transform: `perspective(900px) translateY(0) rotateX(10deg) ${squeeze}`, opacity: 1, offset: handoff, easing: 'ease-out' },
      { transform: `perspective(900px) translateY(0) rotateX(0deg) ${squeeze}`, opacity: 0 },
    ], { duration: FOLD_MS, fill: 'forwards' }));
    /* 字在抬起之后、对折途中淡掉，折到一半就只剩一张纸。 */
    for (const child of ghost.children) {
      animations.push((child as HTMLElement).animate([{ opacity: 1 }, { opacity: 0 }], { duration: paced(260), delay: FOLD_MS * 0.16, easing: 'ease-in-out', fill: 'forwards' }));
    }
    /* ② ③ 飞机：在纸收好的那一刻、同一处合着翅膀出现，张开，悬停一拍，然后沿弧线飞走——一整段关键帧，没有缝。 */
    const total = OPEN_WINGS_MS + HOVER_MS + FLIGHT_MS;
    const opened = OPEN_WINGS_MS / total;
    const hovered = (OPEN_WINGS_MS + HOVER_MS) / total;
    const lifted = { x: first.x, y: first.y - 4 };
    const keyframes: Keyframe[] = [
      { offset: 0, transform: at(first, `rotate(${first.angle}deg) scale(${first.scale * 1.05}, ${first.scale * 0.45})`), opacity: 0, easing: 'cubic-bezier(.3, .7, .3, 1)' },
      { offset: opened * 0.6, transform: at(first, `rotate(${first.angle}deg) scale(${first.scale * 1.03}, ${first.scale * 0.9})`), opacity: 1, easing: 'cubic-bezier(.3, .7, .3, 1)' },
      { offset: opened, transform: at(first, `rotate(${first.angle}deg) scale(${first.scale})`), opacity: 1, easing: 'ease-in-out' },
      /* 悬停：微微往上浮一点，再回到起点开始沉。 */
      { offset: (opened + hovered) / 2, transform: at(lifted, `rotate(${first.angle - 2}deg) scale(${first.scale})`), opacity: 1, easing: 'ease-in-out' },
      ...frames.map((frame) => ({
        offset: hovered + (1 - hovered) * frame.t,
        transform: at(frame, `rotate(${frame.angle}deg) scale(${frame.scale})`),
        opacity: frame.t > 0.86 ? Math.max(0, 1 - (frame.t - 0.86) / 0.14) : 1,
        easing: 'linear',
      })),
    ];
    const flight = plane.animate(keyframes, { duration: total, delay: FOLD_MS - HANDOFF_MS, fill: 'forwards' });
    animations.push(flight);
    if (options.onTakeoff) window.setTimeout(options.onTakeoff, TAKEOFF_MS);
    if (options.returnAfter !== undefined) {
      window.setTimeout(() => {
        for (const el of hidden) {
          if (!el.isConnected) continue;
          el.style.visibility = '';
          /* 回到样式表给的透明度（寄出后的回信纸是变浅的），不是一律回到 1。 */
          el.animate([{ opacity: 0 }, { opacity: getComputedStyle(el).opacity }], { duration: paced(520), easing: 'ease-out' });
        }
      }, TAKEOFF_MS + options.returnAfter);
    }
    await flight.finished;
  } catch { /* 被打断也要收拾掉 */ } finally {
    for (const animation of animations) animation.cancel();
    ghost.remove();
    plane.remove();
  }
}

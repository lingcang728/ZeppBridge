/**
 * 列表三档缩放的动效（DOM 一侧）：捏合 / 托盘换档时的交叉缩放。
 * 旧排版冻成幽灵板，继续朝新尺寸缩放、淡出；新排版从旧尺寸缩放回 1、淡入。视口正中那一条记录前后都钉在同一高度
 * （滚动跟着补），像照片应用那样「就地变密」；横向只绕整块的中线缩放，不跟着那一条左右平移。
 * 逐帧只动 transform / opacity。
 */
import type { WindowRect } from '../motion/window';
import { OPEN_EASE, paced } from '../motion/timing';
import { lessMotion } from '../motion/lessMotion';

export const scroller = (): HTMLElement | null => document.getElementById('main-content');

/** 顶栏下沿（内容滚到这条线以上就被顶栏盖住了）。 */
export const headLine = (): number => {
  const main = scroller();
  if (!main) return 0;
  const head = main.querySelector<HTMLElement>(':scope > .shell-head');
  return head ? head.getBoundingClientRect().bottom : main.getBoundingClientRect().top;
};

/** 主滚动区里看得见的那一块（顶栏以下）。 */
export const viewportBox = (): WindowRect => {
  const main = scroller();
  const box = main?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, bottom: window.innerHeight };
  const top = Math.max(box.top, headLine());
  return { left: box.left, top, width: box.width, height: Math.max(0, box.top + box.height - top) };
};

/* ---------- 幽灵板 ---------- */

export interface Ghost {
  el: HTMLElement;
  /** 内容滚了 `delta`（新 scrollTop − 旧 scrollTop）：板往下挪同样多，屏幕上不动。 */
  follow(delta: number): void;
  remove(): void;
}

/**
 * 把 `body` 此刻的样子冻成一张板，绝对定位在它原来的位置（同一个父元素里：祖先选择器、继承都还在）。
 * 只拷屏幕上（上下各多留一截）的那几条：屏幕外的条目和整块不在屏幕上的月份根本不拷，再按第一条留下的条目对齐。
 * 一千多条的列表拷整份，排版和样式重算要好几秒（降速 4× 实测）；先整份深拷再删屏外的，光克隆本身就是大头。
 * 所以边走边拷：含有单元的容器只做浅拷、逐个孩子往下走；单元在屏外就整棵跳过（连 rect 都不量它的子孙，
 * 免得逼着 content-visibility 跳过的月份排版）；不含单元的子树（卡头、图标）才整棵深拷。
 */
const FREEZE_UNITS = '[data-album-item], .tile-month, .heat-year, .period-group';
export const freeze = (body: HTMLElement): Ghost => {
  const view = viewportBox();
  let keep: { original: HTMLElement; copy: HTMLElement } | null = null;
  const onScreen = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.bottom > view.top - 240 && r.top < view.top + view.height + 240;
  };
  const cloneVisible = (el: Element): Element | null => {
    const unit = el.matches(FREEZE_UNITS);
    if (unit && !onScreen(el)) return null;
    if (!el.querySelector(FREEZE_UNITS)) {
      const whole = el.cloneNode(true) as Element;
      if (!keep && unit && el.matches('[data-album-item]') && el instanceof HTMLElement) keep = { original: el, copy: whole as HTMLElement };
      return whole;
    }
    const shell = el.cloneNode(false) as Element;
    if (!keep && unit && el.matches('[data-album-item]') && el instanceof HTMLElement) keep = { original: el, copy: shell as HTMLElement };
    for (const child of el.childNodes) {
      if (child instanceof Element) {
        const next = cloneVisible(child);
        if (next) shell.appendChild(next);
      } else {
        shell.appendChild(child.cloneNode(false));
      }
    }
    return shell;
  };
  const copy = (cloneVisible(body) ?? body.cloneNode(false)) as HTMLElement;
  // 板上的拷贝不能再被当成真的：锚点、滚动目标、年份滚动条都靠这些属性找元素。
  const MARKS = ['data-album-body', 'data-album-item', 'data-album-id', 'data-album-day', 'data-album-month', 'data-timeline', 'data-period', 'data-period-group', 'data-index'];
  [copy, ...copy.querySelectorAll<HTMLElement>(MARKS.map((m) => `[${m}]`).join(','))].forEach((el) => MARKS.forEach((m) => el.removeAttribute(m)));
  copy.removeAttribute('id');
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  copy.dataset.albumGhost = '';
  let top = body.offsetTop;
  Object.assign(copy.style, {
    position: 'absolute', left: `${body.offsetLeft}px`, top: `${top}px`, width: `${body.offsetWidth}px`, margin: '0',
    pointerEvents: 'none', zIndex: '0', transform: body.style.transform, transformOrigin: body.style.transformOrigin,
  } satisfies Partial<CSSStyleDeclaration>);
  body.parentElement?.appendChild(copy);
  // 前面那些条目去掉以后，留下的第一条往上挪了：整块板往下补回去，屏幕上每一条都还在原处。
  const kept = keep as { original: HTMLElement; copy: HTMLElement } | null;
  if (kept) {
    top += kept.original.getBoundingClientRect().top - kept.copy.getBoundingClientRect().top;
    copy.style.top = `${top}px`;
  }
  return {
    el: copy,
    follow(delta) { top += delta; copy.style.top = `${top}px`; },
    remove() { copy.getAnimations().forEach((a) => a.cancel()); copy.remove(); },
  };
};

/** 元素在滚动区内容里的版面高度（offsetTop 一路加上去，不含 transform）。 */
const layoutTop = (el: HTMLElement, root: HTMLElement): number => {
  let y = 0;
  for (let node: HTMLElement | null = el; node && node !== root && root.contains(node); node = node.offsetParent as HTMLElement | null) y += node.offsetTop;
  return y;
};

/** 条目的「大小」：面积开方（行是扁长的、方块是方的，按宽或按高比都会反）。 */
const sizeOf = (r: DOMRect | WindowRect) => Math.sqrt(Math.max(1, r.width * r.height));

export const ZOOM_MS = paced(420);

/**
 * 换一档密度：`swap` 换排版（Vue 渲染完再返回），`find` 在新排版里找回指针下那一条。
 * 旧画面冻成幽灵板朝新尺寸缩、淡出；新画面从旧尺寸缩回 1、淡入；锚点那一条前后钉在一处。
 */
export interface ZoomSwapOptions {
  /** 往粗（日 → 月 → 年）是 1，往细是 -1：锚点两头对不上时（运动的月 ↔ 年履历）按方向给一个默认的缩放比，照样就地变密 / 变疏。 */
  dir?: 1 | -1;
  /** 新排版里锚点那一条要落到的屏幕高度（它的上沿）。不给就钉在原来的高度（中线对中线）。 */
  pinTop?: (target: HTMLElement) => number;
}

/** 两头锚点对不上时的默认缩放比（往粗 = 旧画面缩小、新画面从大一圈落到 1）。 */
const FALLBACK_ZOOM = 1.3;

export async function zoomSwap(body: HTMLElement, anchor: HTMLElement | null, swap: () => Promise<void>, find: () => HTMLElement | null, body2: () => HTMLElement | null, options: ZoomSwapOptions = {}): Promise<void> {
  if (lessMotion()) { await swap(); return; }
  const main = scroller();
  const before = main?.scrollTop ?? 0;
  const old = anchor?.getBoundingClientRect() ?? null;
  const ghost = freeze(body);
  body.style.removeProperty('transform');
  body.style.removeProperty('transform-origin');
  await swap();
  const next = body2();
  const target = find();
  if (!next) { ghost.remove(); return; }
  let followed = before;
  const keepGhost = () => { const top = main?.scrollTop ?? 0; ghost.follow(top - followed); followed = top; };
  if (target && main && options.pinTop) {
    // 新排版里没画过的行按 content-visibility 的估计高度占位，滚过去以后它们才按真高度排开，那一条又被往下推一截。
    // 新画面先藏着（动画本来就从透明起），等一两帧排稳了再钉一次，钉准了才起飞；幽灵板一直跟着滚动留在原处。
    next.style.opacity = '0';
    for (let round = 0; round < 4; round += 1) {
      const delta = target.getBoundingClientRect().top - options.pinTop(target);
      if (round > 0 && Math.abs(delta) < 1) break;
      main.scrollTop += delta;
      keepGhost();
      await new Promise((resolve) => { requestAnimationFrame(resolve); });
    }
    next.style.removeProperty('opacity');
  } else if (old && target && main) {
    const now = target.getBoundingClientRect();
    main.scrollTop += now.top + now.height / 2 - (old.top + old.height / 2);
  }
  keepGhost();
  const now = target?.getBoundingClientRect() ?? null;
  const timing = { duration: ZOOM_MS, easing: OPEN_EASE };
  const anims: Animation[] = [];
  // 锚点两头都在：按它前后的大小比缩放、从旧位置挪到新位置。对不上（年档履历里没有那一条）：绕视口正中、按方向给一个默认比。
  const view = viewportBox();
  const center = view.top + view.height / 2;
  const pair = old && now ? { old, now } : options.dir ? { old: null, now: null } : null;
  if (pair) {
    const k = pair.old && pair.now
      ? Math.min(3, Math.max(1 / 3, sizeOf(pair.old) / sizeOf(pair.now)))
      : (options.dir === 1 ? FALLBACK_ZOOM : 1 / FALLBACK_ZOOM);
    const gbox = ghost.el.getBoundingClientRect();
    const nbox = next.getBoundingClientRect();
    const oc = { x: gbox.left + gbox.width / 2, y: pair.old ? pair.old.top + pair.old.height / 2 : center };
    const nc = { x: nbox.left + nbox.width / 2, y: pair.now ? pair.now.top + pair.now.height / 2 : center };
    ghost.el.style.transformOrigin = `${oc.x - gbox.left}px ${oc.y - gbox.top}px`;
    next.style.transformOrigin = `${nc.x - nbox.left}px ${nc.y - nbox.top}px`;
    const startScale = ghost.el.style.transform.match(/scale\(([\d.]+)\)/)?.[1];
    const s0 = startScale ? Number(startScale) : 1;
    anims.push(
      ghost.el.animate([{ transform: `translate(0px, 0px) scale(${s0})` }, { transform: `translate(${nc.x - oc.x}px, ${nc.y - oc.y}px) scale(${s0 / k})` }], { ...timing, fill: 'forwards' }),
      next.animate([{ transform: `translate(${oc.x - nc.x}px, ${oc.y - nc.y}px) scale(${k})` }, { transform: 'translate(0px, 0px) scale(1)' }], timing),
    );
  }
  anims.push(
    ghost.el.animate([{ opacity: 1 }, { opacity: 0, offset: 0.7 }, { opacity: 0 }], { ...timing, easing: 'linear', fill: 'forwards' }),
    next.animate([{ opacity: 0 }, { opacity: 0, offset: 0.12 }, { opacity: 1, offset: 0.7 }, { opacity: 1 }], { ...timing, easing: 'linear' }),
  );
  // 新画面一开始是缩小的，原先屏幕外、没画过的行 / 月份这时进了视口，按真高度排开（content-visibility 的估计高度不准），
  // 锚点那一条在版面里被往下推。每帧按它的版面位置（不含变换）补滚动，它就一直停在要落的地方，落地不再差一截。
  let tracking = Boolean(target && main);
  let laid = target && main ? layoutTop(target, main) : 0;
  const track = () => {
    if (!tracking || !target || !main) return;
    const now = layoutTop(target, main);
    if (Math.abs(now - laid) >= 0.5) { main.scrollTop += now - laid; keepGhost(); laid = now; }
    requestAnimationFrame(track);
  };
  requestAnimationFrame(track);
  await Promise.allSettled(anims.map((a) => a.finished));
  tracking = false;
  track();
  ghost.remove();
  next.style.removeProperty('transform-origin');
}

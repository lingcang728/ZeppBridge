import type { RouteLocationNormalized } from 'vue-router';
import { lessMotion } from '../../lib/motion/lessMotion';
import type { WindowRect } from '../../lib/motion/window';

/**
 * 卡 ↔ 页形变要认的东西（composables/usePageMorph.ts）：被点的是哪张卡、返回时去哪找回它、可视区多大。
 * 2026-11-12 从 usePageMorph.ts 拆出来（修复计划 A5）。
 */
export type Rect = WindowRect;

/** 太小的东西（行内的小链接、图标）不当作「卡」：从一个字那么大长成整页没有意义。 */
const MIN_WIDTH = 140;
const MIN_HEIGHT = 56;

export const rectOf = (el: Element): Rect => {
  const box = el.getBoundingClientRect();
  return { left: box.left, top: box.top, width: box.width, height: box.height };
};
export const main = () => document.getElementById('main-content');
export const bigEnough = (el: Element | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const box = el.getBoundingClientRect();
  return box.width >= MIN_WIDTH && box.height >= MIN_HEIGHT;
};
export const radiusOf = (el: Element) => Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 22;
export const reducedMotion = () => lessMotion();
export const noop = () => undefined;

/** 被点的链接所在的那张卡：链接本身够大就是它，否则往外找最近的一块板。 */
export const cardOfLink = (link: HTMLElement): HTMLElement | null => {
  // 同一层里平移（单天页的「前一天 / 后一天」）：不是从哪张卡打开，不形变。
  if (link.closest('[data-no-morph]')) return null;
  // 显式标了 data-morph-card 的一整条（概览底部的「数据来源」）：比一般的卡矮，也按卡算。
  const marked = link.closest<HTMLElement>('[data-morph-card]');
  if (marked) return marked;
  const box = bigEnough(link) ? link : link.closest<HTMLElement>('.metric-panel, .surface-card, .trend-card, li, section');
  return box && bigEnough(box) ? box : null;
};

/** 按下的是页面内容里的一个链接（顶栏、底部导航里的不算）。浮在页面外面、挂在 body 上的控件
    （交给 AI 的底栏）显式标了 data-morph-card 的也算：寄出前检查从那枚胶囊长出来。 */
export const linkOf = (target: EventTarget | null): HTMLElement | null => {
  const el = target instanceof Element ? target : null;
  const link = el?.closest<HTMLElement>('a[href]');
  if (!link || link.closest('.shell-head, .bottom-nav')) return null;
  if (main()?.contains(link)) return link;
  return link.closest('[data-morph-card]') ? link : null;
};

/** 当前页里指向 `href` 的所有链接，按文档顺序。同一页常有好几个（「本周」里的「训练」小格和
    下面的「训练状态」卡都去 /training），所以来回都按「第几个」认，而不是取第一个。 */
export const linksTo = (href: string, scope: string) => {
  const root = main();
  return root ? [...root.querySelectorAll<HTMLElement>(`${scope} a[href="${CSS.escape(href)}"]`)] : [];
};
export const STAYING = '.page-host > :not([class*="-leave"])';

/** `source`：不是从链接、而是从一张卡直接开的（armPageMorph）：返回时按这个标记找回那张卡。 */
export type Trail = { back: string; href: string; index: number; rect: Rect; radius: number; source?: string };

/**
 * 从一张卡直接形变进某一页（不是点卡里的链接）：指标卡上的「问 AI」选了问题以后从这张卡长进「交给 AI」，
 * 返回时缩回这张卡（2026-10-07 第二轮）。先 arm，再 router.push；下一次切页的 decide() 用掉它。
 * 卡上会留一个 data-morph-source 标记，返回时靠它找回卡（来处页是 KeepAlive 缓存的，卡还是那一张）。
 */
let armed: { card: HTMLElement; href: string; id: string; at: number; anySize: boolean } | null = null;
let armSeq = 0;
/** `anySize`：来处是被点的那枚按钮本身（年轮页右上角的「问 AI」——页面上只有一整块年轮，拿它当来处等于从整屏长到整屏，
    看上去是硬切，用户 2026-10-28）：不受「够大才形变」的门槛限制，页面从这枚胶囊里长出来、返回时缩回它。 */
export const armPageMorph = (card: HTMLElement | null, href: string, options: { anySize?: boolean } = {}): void => {
  if (!card) { armed = null; return; }
  const id = card.dataset.morphSource || `m${(armSeq += 1)}`;
  card.dataset.morphSource = id;
  armed = { card, href, id, at: performance.now(), anySize: !!options.anySize };
};
/** 被 arm 的卡：只在 arm 之后一小会儿内有效（选完问题就切页；别让一个过期的 arm 劫持之后不相干的切页）。 */
export const takeArmed = (to: RouteLocationNormalized) => {
  const hit = armed && performance.now() - armed.at < 1500 && (armed.href === to.fullPath || armed.href === to.path) && armed.card.isConnected ? armed : null;
  armed = null;
  return hit;
};
export type Origin = { card: HTMLElement; rect: Rect; radius: number; replica: { el: HTMLElement; rect: Rect } };

/** 主滚动区的可视区（不含滚动条）。 */
export const viewportOf = (): Rect | null => {
  const root = main();
  if (!root) return null;
  const box = rectOf(root);
  return { left: box.left, top: box.top, width: root.clientWidth, height: root.clientHeight };
};

/** 来处页此刻已经在场的话，当初那张卡。页面里没有就看顶栏或页面外面标了 data-morph-card 的（底栏）。 */
export const currentCard = (trail: Trail): HTMLElement | null => {
  if (trail.source) {
    const sel = `[data-morph-source="${CSS.escape(trail.source)}"]`;
    return main()?.querySelector<HTMLElement>(`${STAYING} ${sel}`)
      ?? document.querySelector<HTMLElement>(`.app-topbar ${sel}`)
      ?? null;
  }
  const link = linksTo(trail.href, STAYING)[trail.index]
    ?? document.querySelector<HTMLElement>(`body > :not(#app) a[data-morph-card][href="${CSS.escape(trail.href)}"]`)
    ?? null;
  return link ? cardOfLink(link) : null;
};

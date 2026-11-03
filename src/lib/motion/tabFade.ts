/**
 * 换入口（概览 / 交给 AI / 设置互切，以及从二级页直接点顶栏）：旧页淡出，淡完新页淡入。不位移、不缩放、不加装饰层。
 *
 * 10-29 的来回：先做了「顶栏涟漪」——把两页拆成几十块、按波前到达的时刻各自沉下去 / 浮上来。用户录屏说
 * 「乱滑、乱飞、错位，上下滑都卡」，毛病全出在拆块上：
 * - 块的位移用独立的 translate / scale 属性做，而 WAAPI 关键帧会**顶掉**块自己 CSS 里的同名属性——交给 AI 舞台中间的锁
 *   是 `translate: -50% 0` 定位的，切页第一帧整块横跳 130px，牌也跟着乱飞；
 * - 拆出来的块只是可视区里的一部分，晚到的、没拆到的照常显示，看上去就是错位；
 * - 离场块的 fill 动画在 KeepAlive 缓存页上一直挂着，回到那一页时整块透明（整屏空）。
 * 接着试了一层从标签扩出去的光环水波，用户看了说深浅主题都丑，不要。所以现在只剩淡入淡出（useTabFade.ts）。
 */
import { paced } from './timing';

export interface FadeRect { left: number; top: number; width: number; height: number }

/** out：旧页淡完；in：新页（旧页淡完以后）淡入。两页不同时半透明，不叠影。 */
export const TAB_FADE = { out: paced(150), in: paced(300) };

/**
 * 盖满整屏的一层（交给 AI 大卡 .ai-sheet：身后的模糊 + 大卡）。整层淡的话它自己成了取样边界，
 * 身后的舞台一下子变清楚——模糊「啪」地掉了；所以这种层往里拆一层，淡它的孩子（模糊层自己淡不碍事）。纯函数，方便测。
 */
export const coversView = (rect: FadeRect, view: FadeRect): boolean =>
  rect.width * rect.height >= view.width * view.height * 0.8;

/**
 * 一页里要淡的那几层：页面根的直属子元素。不淡页面根本身——根上的 opacity 会让页里所有毛玻璃失去取样
 * （记忆「动效与玻璃的 Chromium 坑」）；盖满整屏的固定层（大卡）再往里拆一层，见 coversView。只动 opacity，
 * 各层自己的 transform / translate 一概不碰。
 */
export function fadeLayers(page: HTMLElement, view: FadeRect): HTMLElement[] {
  const layers: HTMLElement[] = [];
  for (const child of Array.from(page.children)) {
    if (!(child instanceof HTMLElement) || child.dataset.morphLayer !== undefined || child.classList.contains('page-veil')) continue;
    const style = getComputedStyle(child);
    if (style.display === 'none') continue;
    if (style.display === 'contents' || (style.position === 'fixed' && coversView(child.getBoundingClientRect(), view))) {
      layers.push(...Array.from(child.children).filter((node): node is HTMLElement => node instanceof HTMLElement));
    } else layers.push(child);
  }
  return layers;
}

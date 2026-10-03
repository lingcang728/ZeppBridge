import type { Router } from 'vue-router';

/**
 * 指针移到页面里的链接上（或键盘聚焦到它）时，先把它要去那一页的代码块拉下来。
 *
 * 以前点下去才 `import()` 页面 chunk（首次打开训练状态还要连带 ECharts），形变要等它到了、新页挂载了才开始，
 * 用户看到的是「点了没反应 → 突然换页」。悬停到点击之间通常有一两百毫秒，足够把代码块取回来。
 * vue-router 自己加载时拿到的是同一个模块，不会重复下载。
 */
type Loader = () => Promise<unknown>;

/** vue-router 判断「不是懒加载函数」的同一套条件：组件对象、带 props / displayName 的函数式组件。 */
const isLoader = (value: unknown): value is Loader =>
  typeof value === 'function' && !('displayName' in value) && !('props' in value) && !('__vccOpts' in value);

export const installPrefetch = (router: Router): (() => void) => {
  const warmed = new Set<string>();
  const warm = (target: EventTarget | null) => {
    const link = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
    const href = link?.getAttribute('href');
    if (!link || !href || !href.startsWith('/') || warmed.has(href)) return;
    if (!document.getElementById('main-content')?.contains(link)) return;
    warmed.add(href);
    try {
      for (const record of router.resolve(href).matched) {
        for (const component of Object.values(record.components ?? {})) {
          if (isLoader(component)) void component().catch(() => warmed.delete(href));
        }
      }
    } catch {
      warmed.delete(href);
    }
  };
  const onOver = (event: Event) => warm(event.target);
  document.addEventListener('pointerover', onOver, true);
  document.addEventListener('focusin', onOver, true);
  return () => {
    document.removeEventListener('pointerover', onOver, true);
    document.removeEventListener('focusin', onOver, true);
  };
};

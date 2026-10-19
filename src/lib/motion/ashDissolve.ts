import { dustLayer } from './ashDust';
import { drawVisibleText, featherOf, grainsOf, TEXT_INK, type AshOrigin } from './ashGlyphs';
import { whenFramesSteady } from './steady';
import { LOCALE_REVEAL_MS, OPEN_EASE } from './timing';

/**
 * 一块浮层「化成灰飞走」（想法 1-2，2026-10-19）：更新卡点「知道了」，卡片从按钮那一角往对角一路碎成灰，
 * 灰顺着方向飘散，最后背后的暗色和模糊慢慢退掉，露出主页。第 6 批的信封信纸复用它。
 *
 * 和换语言的「响指」（ashSwitch.ts）同一套：取字形 → 灰粒（ashGlyphs）→ WebGL 一次画完（ashDust），
 * 同一条曲线、同样的时长和柔边，所以「扫到哪碎到哪」的节奏和换语言一致。不同的是这里没有新内容要露出来：
 * 卡片本身被一圈柔边遮罩从起点吃掉（--ash-r 由 WAAPI 推，material.css 里注册过），
 * 遮罩只挂在卡片的玻璃层和内容层上，不挂在卡片外壳上——外壳一带遮罩就成了玻璃的取样边界，毛玻璃会在第一帧糊掉。
 *
 * 返回 false 表示没放（减少动效、没有 WebGL、元素不在了），调用方照常关闭。
 * 放完之后元素是看不见的；`veil` 的 `data-dissolved` 告诉弹窗收起时别再把它挂回去缩一遍（dialogFlight.close）。
 */
export const ashDissolve = async (target: HTMLElement, origin: AshOrigin, veil?: HTMLElement | null): Promise<boolean> => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  if (!target.isConnected) return false;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const rect = target.getBoundingClientRect();
  const reach = Math.ceil(Math.max(
    ...[[rect.left, rect.top], [rect.right, rect.top], [rect.left, rect.bottom], [rect.right, rect.bottom]]
      .map(([x, y]) => Math.hypot(x! - origin.x, y! - origin.y)),
  ));
  const layer = dustLayer(width, height);
  if (!layer) return false;
  const grains = grainsOf([[drawVisibleText(width, height, target), TEXT_INK]], width, height, origin, reach);
  const batch = grains ? layer.add(grains, origin) : null;

  const feather = featherOf(reach);
  const parts = [...target.querySelectorAll<HTMLElement>(':scope > .dialog-glass, :scope > .dialog-scroll')];
  const masked = parts.length ? parts : [target];
  target.style.pointerEvents = 'none';
  for (const el of masked) {
    const box = el.getBoundingClientRect();
    const gradient = `radial-gradient(circle at ${Math.round(origin.x - box.left)}px ${Math.round(origin.y - box.top)}px, `
      + `transparent calc(var(--ash-r) - ${feather}px), #000 var(--ash-r))`;
    el.style.setProperty('-webkit-mask-image', gradient);
    el.style.setProperty('mask-image', gradient);
  }
  const sweep = target.animate(
    { '--ash-r': ['0px', `${reach + feather}px`] } as PropertyIndexedKeyframes,
    { duration: LOCALE_REVEAL_MS, easing: OPEN_EASE, fill: 'forwards' },
  );
  sweep.pause();
  layer.mount();
  // 和换语言一样：先停在起点，等画面跟得上再开跑，灰的起飞时刻跟着动画真正的开始时间走。
  await whenFramesSteady();
  sweep.play();
  if (batch) layer.start(batch, sweep);
  // 背后那层暗色 + 模糊：圆扫过大半后淡掉，主页由糊到清。
  const fade = veil?.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: 560, delay: LOCALE_REVEAL_MS * 0.55, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards', pseudoElement: '::before',
  });
  if (veil) veil.dataset.dissolved = '';
  await Promise.all([sweep.finished.catch(() => undefined), fade?.finished.catch(() => undefined)]);
  return true;
};

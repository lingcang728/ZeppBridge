/**
 * 落地页的动效小工具。原则（和应用一致，见记忆「动效只动合成属性」）：
 *   - 逐帧只动 transform / opacity；模糊、阴影都是静态的；
 *   - 循环动画只在看得见时跑（`.is-live` 由 `watchLive` 挂上 / 摘掉，CSS 用它切 animation-play-state）；
 *   - 「减少动态效果」时一切直接落在终态。
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** Anchors move both focus and the viewport, including when opened through the mobile menu. */
export const scrollToSection = (id: string, history: 'replace' | 'push' | 'none' = 'replace') => {
  const target = document.getElementById(id);
  if (!target) return;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  target.scrollIntoView({ behavior: prefersReducedMotion() ? 'instant' : 'smooth', block: 'start' });
  if (history === 'push') window.history.pushState(window.history.state, '', `#${id}`);
  else if (history === 'replace') window.history.replaceState(null, '', `#${id}`);
};

/**
 * 滚到哪一段，哪一段的 `[data-reveal]` 依次浮上来（加 `.is-in`，CSS 里按 `--i` 错开）。
 * 同时给带 `[data-live]` 的块在视口内时挂 `.is-live`，离开就摘掉——循环动画离屏不跑。
 */
export const useScrollMotion = (root: Ref<HTMLElement | null>) => {
  let reveal: IntersectionObserver | null = null;
  let live: IntersectionObserver | null = null;
  let preference: MediaQueryList | null = null;
  const configure = () => {
    reveal?.disconnect();
    live?.disconnect();
    const el = root.value;
    if (!el) return;
    const reveals = el.querySelectorAll<HTMLElement>('[data-reveal]');
    const lives = el.querySelectorAll<HTMLElement>('[data-live]');
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      el.classList.remove('lp-motion-ready');
      reveals.forEach((node) => node.classList.add('is-in'));
      lives.forEach((node) => node.classList.remove('is-live'));
      return;
    }
    el.classList.add('lp-motion-ready');
    reveal = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        reveal?.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px 120px 0px', threshold: 0 });
    reveals.forEach((node) => reveal?.observe(node));
    live = new IntersectionObserver((entries) => {
      for (const entry of entries) entry.target.classList.toggle('is-live', entry.isIntersecting);
    }, { threshold: 0 });
    lives.forEach((node) => live?.observe(node));
  };
  onMounted(() => {
    preference = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
    preference?.addEventListener('change', configure);
    configure();
  });
  onBeforeUnmount(() => {
    reveal?.disconnect();
    live?.disconnect();
    preference?.removeEventListener('change', configure);
  });
};

/** 一个元素此刻在不在视口里（持续跟踪）。轮播、打字这种循环用它暂停。 */
export const useInView = (target: Ref<HTMLElement | null>) => {
  const inView = ref(false);
  let observer: IntersectionObserver | null = null;
  onMounted(() => {
    const el = target.value;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { inView.value = true; return; }
    observer = new IntersectionObserver((entries) => {
      inView.value = entries.some((entry) => entry.isIntersecting);
    });
    observer.observe(el);
  });
  onBeforeUnmount(() => observer?.disconnect());
  return inView;
};

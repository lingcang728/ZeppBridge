/**
 * 落地页的动效小工具。原则（和应用一致，见记忆「动效只动合成属性」）：
 *   - 逐帧只动 transform / opacity；模糊、阴影都是静态的；
 *   - 循环动画只在看得见时跑（`.is-live` 由 `watchLive` 挂上 / 摘掉，CSS 用它切 animation-play-state）；
 *   - 「减少动态效果」时一切直接落在终态。
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/**
 * 滚到哪一段，哪一段的 `[data-reveal]` 依次浮上来（加 `.is-in`，CSS 里按 `--i` 错开）。
 * 同时给带 `[data-live]` 的块在视口内时挂 `.is-live`，离开就摘掉——循环动画离屏不跑。
 */
export const useScrollMotion = (root: Ref<HTMLElement | null>) => {
  let reveal: IntersectionObserver | null = null;
  let live: IntersectionObserver | null = null;
  onMounted(() => {
    const el = root.value;
    if (!el) return;
    const reveals = el.querySelectorAll<HTMLElement>('[data-reveal]');
    const lives = el.querySelectorAll<HTMLElement>('[data-live]');
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      reveals.forEach((node) => node.classList.add('is-in'));
      lives.forEach((node) => node.classList.add('is-live'));
      return;
    }
    reveal = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        reveal?.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    reveals.forEach((node) => reveal?.observe(node));
    live = new IntersectionObserver((entries) => {
      for (const entry of entries) entry.target.classList.toggle('is-live', entry.isIntersecting);
    }, { threshold: 0 });
    lives.forEach((node) => live?.observe(node));
  });
  onBeforeUnmount(() => {
    reveal?.disconnect();
    live?.disconnect();
  });
};

/** 一个元素进没进过视口（只触发一次）。演示用它决定什么时候开演。 */
export const useSeen = (target: Ref<HTMLElement | null>, threshold = 0.35) => {
  const seen = ref(false);
  let observer: IntersectionObserver | null = null;
  onMounted(() => {
    const el = target.value;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { seen.value = true; return; }
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        seen.value = true;
        observer?.disconnect();
      }
    }, { threshold });
    observer.observe(el);
  });
  onBeforeUnmount(() => observer?.disconnect());
  return seen;
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

/**
 * 磁吸：指针在按钮附近时按钮朝它挪一点（最多 `pull` px），离开弹回。
 * 只写 transform；触屏、减少动态时不做。用法：`v-magnetic` 不好带参数，这里给事件处理器。
 */
export const magnetic = (pull = 10) => ({
  onPointermove(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || prefersReducedMotion()) return;
    const el = event.currentTarget as HTMLElement;
    const box = el.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width - 0.5) * 2;
    const y = ((event.clientY - box.top) / box.height - 0.5) * 2;
    el.style.transform = `translate(${(x * pull).toFixed(1)}px, ${(y * pull * 0.6).toFixed(1)}px)`;
  },
  onPointerleave(event: PointerEvent) {
    (event.currentTarget as HTMLElement).style.transform = '';
  },
});

/** 卡片上的追光：把指针位置写进 `--mx` / `--my`，CSS 用它画一圈径向高光（只在悬停时）。 */
export const spotlight = (event: PointerEvent) => {
  const el = event.currentTarget as HTMLElement;
  const box = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${event.clientX - box.left}px`);
  el.style.setProperty('--my', `${event.clientY - box.top}px`);
};

export const sleep = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });

/**
 * 逐字打出 `text` 到 `out`。`alive()` 返回 false 时立刻停（组件卸载、换语言）。
 * 中文按字、拉丁按字符，速度按长度自适应：长句不会打很久。
 */
export const typeInto = async (out: Ref<string>, text: string, alive: () => boolean, perChar?: number) => {
  const chars = Array.from(text);
  const step = perChar ?? Math.max(14, Math.min(42, 1600 / Math.max(1, chars.length)));
  out.value = '';
  for (const char of chars) {
    if (!alive()) return false;
    out.value += char;
    await sleep(step);
  }
  return alive();
};

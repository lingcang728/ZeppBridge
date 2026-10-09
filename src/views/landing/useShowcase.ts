import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

// One active presentation on the page. A second iframe may prepare its first frame offscreen.
const candidates = new Map<symbol, number>();
const owner = ref<symbol | null>(null);
const elect = () => {
  let best = owner.value ? candidates.get(owner.value) ?? 0 : 0;
  let next: symbol | null = best > 0 ? owner.value : null;
  candidates.forEach((score, id) => { if (score > best) { next = id; best = score; } });
  owner.value = next;
};

export function useShowcase(root: Ref<HTMLElement | null>) {
  const id = Symbol('showcase');
  const near = ref(false), hidden = ref(false), reduced = ref(false), paused = ref(false), optedIn = ref(false), finished = ref(false);
  let score = 0;
  const running = computed(() => owner.value === id && !hidden.value && !paused.value && (!reduced.value || optedIn.value));
  let preload: IntersectionObserver | undefined, visibility: IntersectionObserver | undefined, query: MediaQueryList | undefined;
  const preference = () => { reduced.value = query?.matches ?? false; };
  const tabVisibility = () => { hidden.value = document.hidden; };
  const reset = () => { finished.value = false; candidates.set(id, score); elect(); };
  const finish = () => { finished.value = true; candidates.set(id, 0); elect(); };
  const play = () => { finished.value = false; optedIn.value = true; paused.value = false; candidates.set(id, score); if (score > 0) owner.value = id; };
  const toggle = () => { if (paused.value || (reduced.value && !optedIn.value)) play(); else paused.value = true; };
  onMounted(() => {
    query = matchMedia('(prefers-reduced-motion: reduce)'); preference(); tabVisibility();
    query.addEventListener('change', preference);
    document.addEventListener('visibilitychange', tabVisibility);
    preload = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { near.value = true; preload?.disconnect(); }
    }, { rootMargin: '420px 0px' });
    visibility = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const visible = entry.intersectionRect;
        score = entry.isIntersecting ? visible.width * visible.height : 0;
        candidates.set(id, finished.value ? 0 : score);
      }
      elect();
    }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20), rootMargin: '-72px 0px -4% 0px' });
    if (root.value) { preload.observe(root.value); visibility.observe(root.value); }
  });
  onBeforeUnmount(() => {
    preload?.disconnect(); visibility?.disconnect(); candidates.delete(id); elect();
    query?.removeEventListener('change', preference); document.removeEventListener('visibilitychange', tabVisibility);
  });
  return { near, running, paused, reduced, optedIn, play, toggle, reset, finish };
}

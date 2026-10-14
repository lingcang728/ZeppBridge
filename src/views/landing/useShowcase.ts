import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

export function useShowcase(root: Ref<HTMLElement | null>) {
  const near = ref(false), hidden = ref(false), reduced = ref(false), paused = ref(false), optedIn = ref(false), finished = ref(false);
  // Adjacent stories (sleep and workouts) play together. Each keeps its own clock.
  const visible = ref(false);
  const running = computed(() => visible.value && !finished.value && !hidden.value && !paused.value && (!reduced.value || optedIn.value));
  let preload: IntersectionObserver | undefined, visibility: IntersectionObserver | undefined, query: MediaQueryList | undefined;
  const preference = () => { reduced.value = query?.matches ?? false; };
  const tabVisibility = () => { hidden.value = document.hidden; };
  const reset = () => { finished.value = false; };
  const finish = () => { finished.value = true; };
  const play = () => { finished.value = false; optedIn.value = true; paused.value = false; };
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
        visible.value = entry.isIntersecting && entry.intersectionRect.height > 0;
      }
    }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20), rootMargin: '-72px 0px -4% 0px' });
    if (root.value) { preload.observe(root.value); visibility.observe(root.value); }
  });
  onBeforeUnmount(() => {
    preload?.disconnect(); visibility?.disconnect();
    query?.removeEventListener('change', preference); document.removeEventListener('visibilitychange', tabVisibility);
  });
  return { near, running, paused, reduced, optedIn, play, toggle, reset, finish };
}

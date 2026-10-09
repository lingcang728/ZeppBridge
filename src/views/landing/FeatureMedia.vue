<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { landingTheme } from './theme';
import type { LandingLocale } from '../../composables/useLandingLocale';
const props = defineProps<{ scene: string; locale: LandingLocale; title: string }>();
const root = ref<HTMLElement | null>(null), video = ref<HTMLVideoElement | null>(null);
const near = ref(false), visible = ref(false), reduced = ref(false), failed = ref(false);
const stem = computed(() => '/landing/media/feature-' + props.scene + '-' + props.locale + '-' + landingTheme.value);
const source = computed(() => near.value && !reduced.value ? stem.value + '.mp4' : undefined);
let observer: IntersectionObserver | null = null, query: MediaQueryList | null = null;
const sync = () => { if (visible.value && !document.hidden && !reduced.value && !failed.value) void video.value?.play().catch(() => undefined); else video.value?.pause(); };
const preference = () => { reduced.value = query?.matches ?? false; sync(); };
watch(source, () => { failed.value = false; sync(); }, { flush: 'post' });
onMounted(() => {
  query = matchMedia('(prefers-reduced-motion: reduce)'); preference(); query.addEventListener('change', preference);
  document.addEventListener('visibilitychange', sync);
  observer = new IntersectionObserver(entries => { visible.value = entries.some(e => e.isIntersecting); if (visible.value) near.value = true; sync(); }, { rootMargin: '160px' });
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => { observer?.disconnect(); query?.removeEventListener('change', preference); document.removeEventListener('visibilitychange', sync); video.value?.pause(); });
</script>
<template>
  <figure ref="root" class="feature-media">
    <video v-if="near && !failed && !reduced" :key="stem" ref="video" :src="source" :poster="stem + '.webp'" :aria-label="title" width="2560" height="1600" preload="metadata" muted playsinline loop disablepictureinpicture @loadeddata="sync" @error="failed = true" />
    <img v-else :src="stem + '.webp'" :alt="title" width="2560" height="1600" loading="lazy" decoding="async" />
  </figure>
</template>
<style scoped>
.feature-media { margin: 0; min-width: 0; overflow: hidden; border-radius: 24px; border: 1px solid var(--line); box-shadow: var(--lp-shadow); background: var(--bg); }
video, img { display: block; width: 100%; height: auto; aspect-ratio: 8/5; object-fit: contain; }
@media(max-width:720px) { .feature-media { border-radius: 15px; } }
</style>

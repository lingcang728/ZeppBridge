<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import BrandMark from '../../components/BrandMark.vue';
import { landingTheme } from './theme';
import type { LandingLocale } from '../../composables/useLandingLocale';
import type { LandingCopy } from './types';
const props = defineProps<{ route: string; locale: LandingLocale; copy: LandingCopy['hero']['stage']; retryLabel: string; activeLabel: string; expanded: boolean }>();
const emit = defineEmits<{ ready: []; engaged: []; expand: []; route: [path: string] }>();
const box = ref<HTMLElement | null>(null), frame = ref<HTMLIFrameElement | null>(null);
const width = ref(1280), ready = ref(false), failed = ref(false), active = ref(false), src = ref(''), attempt = ref(0);
const small = computed(() => width.value < 720);
const logicalWidth = computed(() => small.value ? Math.max(320, width.value) : 1440);
const logicalHeight = computed(() => small.value ? 720 : 900);
const scale = computed(() => width.value / logicalWidth.value);
const height = computed(() => Math.round(logicalHeight.value * scale.value));
const post = (payload: Record<string, unknown>) => frame.value?.contentWindow?.postMessage({ source: 'zeppbridge-site', ...payload }, location.origin);
let observer: IntersectionObserver | null = null, sizer: ResizeObserver | null = null, timer = 0;
const load = () => {
  ready.value = false; failed.value = false;
  src.value = '/?' + new URLSearchParams({ demo: '1', theme: landingTheme.value, lang: props.locale, route: props.route }).toString();
  clearTimeout(timer); timer = window.setTimeout(() => { if (!ready.value) failed.value = true; }, 20000);
};
const reset = () => { attempt.value++; active.value = false; load(); };
const activate = () => { active.value = true; if (small.value && !props.expanded) emit('expand'); emit('engaged'); frame.value?.focus({ preventScroll: true }); };
const onMessage = (event: MessageEvent) => {
  if (event.origin !== location.origin || event.source !== frame.value?.contentWindow || event.data?.source !== 'zeppbridge-demo') return;
  if (event.data.type === 'ready') { clearTimeout(timer); ready.value = true; failed.value = false; post({ type: 'theme', value: landingTheme.value }); post({ type: 'locale', value: props.locale }); emit('ready'); }
  if (event.data.type === 'ready' || event.data.type === 'route') emit('route', event.data.path);
};
watch(() => props.route, to => { if (ready.value) { post({ type: 'go', to }); activate(); } });
watch(() => props.locale, value => post({ type: 'locale', value }));
watch(landingTheme, value => post({ type: 'theme', value }));
watch(() => props.expanded, value => { if (value) activate(); });
const visibility = () => post({ type: 'visibility', value: document.hidden ? 'hidden' : 'visible' });
onMounted(() => {
  window.addEventListener('message', onMessage); document.addEventListener('visibilitychange', visibility);
  sizer = new ResizeObserver(entries => { width.value = entries[0].contentRect.width; }); if (box.value) sizer.observe(box.value);
  observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting) && !src.value) load(); }, { rootMargin: '500px' });
  if (box.value) observer.observe(box.value);
});
onBeforeUnmount(() => { observer?.disconnect(); sizer?.disconnect(); clearTimeout(timer); window.removeEventListener('message', onMessage); document.removeEventListener('visibilitychange', visibility); });
defineExpose({ reset, activate });
</script>
<template>
  <figure ref="box" :class="['demo-window', { 'demo-active': active, 'mobile-collapsed': small && !expanded }]">
    <div class="frame" :style="{ height: (small && !expanded ? 360 : height) + 'px' }">
      <iframe v-if="src" :key="attempt" ref="frame" :src="src" :title="'ZeppBridge · ' + copy.note" :tabindex="active ? 0 : -1" :inert="!active" :class="{ shown: ready }" :style="{ width: logicalWidth + 'px', height: logicalHeight + 'px', transform: 'scale(' + scale + ')', pointerEvents: active ? 'auto' : 'none' }"></iframe>
      <div v-if="!ready" class="demo-skeleton" role="status"><BrandMark :size="48" /><p>{{ failed ? copy.unavailable : copy.loading }}</p><button v-if="failed" class="lp-btn" type="button" @click="reset">{{ retryLabel }}</button></div>
      <button v-if="ready && (!active || small && !expanded)" class="demo-shield" type="button" @click="activate"><span class="glass-control">{{ activeLabel }}</span></button>
    </div>
  </figure>
</template>
<style scoped>
.demo-window { margin: 0; min-width: 0; width: 100%; }
.frame { position: relative; overflow: hidden; border: 1px solid var(--line-strong); border-radius: 26px; background: var(--bg); box-shadow: var(--lp-shadow); isolation: isolate; }
iframe { position: absolute; inset: 0; border: 0; transform-origin: 0 0; opacity: 0; transition: opacity .3s ease; }
iframe.shown { opacity: 1; }
.demo-skeleton { position: absolute; inset: 0; display: grid; align-content: center; justify-items: center; padding: 24px; gap: 20px; color: var(--lp-muted); }
.demo-skeleton p { max-width: 28em; text-align: center; }
.demo-shield { position: absolute; inset: 0; display: flex; align-items: end; justify-content: center; padding: 32px; background: transparent; border: 0; cursor: pointer; }
.demo-shield span { padding: 16px 26px; border-radius: 999px; font-size: 17px; color: var(--ink); transition: transform .3s ease; }
.demo-shield:hover span { transform: translateY(-4px); }
.mobile-collapsed .demo-shield { background: linear-gradient(transparent, var(--bg)); }
@media(max-width:720px) { .frame { border-radius: 18px; } .demo-shield { padding: 24px 12px; } }
</style>

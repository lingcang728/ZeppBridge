<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import BrandMark from '../../components/BrandMark.vue';
import { landingTheme } from './theme';
import { prefersReducedMotion, useInView } from './motion';
import type { LandingLocale } from '../../composables/useLandingLocale';
import type { LandingCopy } from './types';
const LOGICAL_W = 1280;
const LOGICAL_H = 800;
const SITE = 'zeppbridge-site';
const DEMO = 'zeppbridge-demo';
const props = defineProps<{ route: string; scrollTo?: string | null; locale: LandingLocale; copy: LandingCopy['hero']['stage']; sample: string; suspended?: boolean }>();
const emit = defineEmits<{ handoff: []; ready: [] }>();
const box = ref<HTMLElement | null>(null);
const frame = ref<HTMLIFrameElement | null>(null);
const shield = ref<HTMLButtonElement | null>(null);
const width = ref(0);
const src = ref<string | null>(null);
const ready = ref(false);
const failed = ref(false);
const playing = ref(false);
const appPath = ref<string | null>(null);
const inView = useInView(box);
const scale = computed(() => width.value > 0 ? width.value / LOGICAL_W : .5);
const height = computed(() => Math.round(LOGICAL_H * scale.value));
const post = (payload: Record<string, unknown>) => frame.value?.contentWindow?.postMessage({ source: SITE, ...payload }, window.location.origin);
let routeTimer = 0;
let loadTimer = 0;
const syncScroll = () => {
  const doc = frame.value?.contentDocument;
  const main = doc?.querySelector<HTMLElement>('.main-content');
  if (!main) return;
  const target = props.scrollTo ? doc?.querySelector<HTMLElement>(props.scrollTo) : null;
  const top = target ? main.scrollTop + target.getBoundingClientRect().top - main.getBoundingClientRect().top - 12 : 0;
  main.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
};
const sync = () => {
  if (!ready.value) return;
  window.clearTimeout(routeTimer);
  if (appPath.value !== props.route) post({ type: 'go', to: props.route }); else syncScroll();
};
const release = async (restoreFocus = true) => { playing.value = false; if (restoreFocus) { await nextTick(); shield.value?.focus({ preventScroll: true }); } };
const onKeydown = (event: KeyboardEvent) => { if (event.key === 'Escape' && playing.value && !props.suspended) { event.preventDefault(); void release(); } };
let boundDocument: Document | null = null;
let pausedAnimations: Animation[] = [];
const syncMotion = () => {
  const doc = frame.value?.contentDocument;
  if (!doc) return;
  const paused = !inView.value || document.hidden;
  doc.documentElement.toggleAttribute('data-site-paused', paused);
  if (paused) { for (const animation of doc.getAnimations()) if (animation.playState === 'running') { animation.pause(); pausedAnimations.push(animation); } }
  else { for (const animation of pausedAnimations) if (animation.playState === 'paused') animation.play(); pausedAnimations = []; }
};
const bindFrame = () => {
  const doc = frame.value?.contentDocument;
  if (!doc || doc === boundDocument) return;
  boundDocument?.defaultView?.removeEventListener('keydown', onKeydown, true); boundDocument = doc;
  doc.defaultView?.addEventListener('keydown', onKeydown, true);
  const style = doc.createElement('style');
  style.dataset.landingMotion = '';
  style.textContent = ':root[data-site-paused] *, :root[data-site-paused] *::before, :root[data-site-paused] *::after { animation-play-state: paused !important; } @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }';
  doc.head.append(style); syncMotion();
};
const onMessage = (event: MessageEvent) => {
  if (event.origin !== window.location.origin || event.source !== frame.value?.contentWindow) return;
  const data = event.data as { source?: string; type?: string; path?: string } | null;
  if (data?.source !== DEMO) return;
  if (data.type === 'ready') {
    ready.value = true; failed.value = false; window.clearTimeout(loadTimer);
    appPath.value = typeof data.path === 'string' ? data.path : null; bindFrame();
    post({ type: 'theme', value: landingTheme.value }); post({ type: 'locale', value: props.locale });
    emit('ready'); sync();
  } else if (data.type === 'route') {
    appPath.value = typeof data.path === 'string' ? data.path : null; window.clearTimeout(routeTimer);
    routeTimer = window.setTimeout(() => { if (appPath.value === props.route) syncScroll(); syncMotion(); }, prefersReducedMotion() ? 0 : 420);
  } else if ((data.type === 'handoff' || data.type === 'open-url') && playing.value && !props.suspended) emit('handoff');
};
watch(() => [props.route, props.scrollTo], () => { void release(false); sync(); });
watch(() => props.suspended, (value) => { if (value) void release(false); });
watch(landingTheme, (value) => post({ type: 'theme', value }));
watch(() => props.locale, (value) => post({ type: 'locale', value }));
watch(inView, (value) => { if (!value) void release(false); syncMotion(); });
let sizer: ResizeObserver | null = null;
let near: IntersectionObserver | null = null;
const load = () => {
  if (src.value) return;
  src.value = `/?demo=1&theme=${landingTheme.value}&lang=${props.locale}&route=${encodeURIComponent(props.route)}`;
  loadTimer = window.setTimeout(() => { if (!ready.value) failed.value = true; }, 12000);
};
const resize = () => { width.value = box.value?.getBoundingClientRect().width ?? 0; };
const activate = async () => { if (!ready.value || props.suspended) return; playing.value = true; await nextTick(); frame.value?.focus({ preventScroll: true }); };
onMounted(() => {
  window.addEventListener('message', onMessage); window.addEventListener('keydown', onKeydown, true); document.addEventListener('visibilitychange', syncMotion);
  resize();
  if (box.value && typeof ResizeObserver !== 'undefined') { sizer = new ResizeObserver(resize); sizer.observe(box.value); } else window.addEventListener('resize', resize);
  if (box.value && typeof IntersectionObserver !== 'undefined') { near = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { load(); near?.disconnect(); } }, { rootMargin: '500px' }); near.observe(box.value); } else load();
});
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage); window.removeEventListener('keydown', onKeydown, true); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', syncMotion);
  boundDocument?.defaultView?.removeEventListener('keydown', onKeydown, true); sizer?.disconnect(); near?.disconnect(); window.clearTimeout(loadTimer); window.clearTimeout(routeTimer);
});
defineExpose({ release });
</script>

<template>
  <figure ref="box" class="win" data-live>
    <div class="window-label"><span aria-hidden="true">ZeppBridge</span><span v-if="!playing" aria-hidden="true">{{ sample }} · v3</span><button v-if="playing" type="button" class="exit" @click="release()">{{ copy.exit }} <kbd>Esc</kbd></button></div>
    <div class="frame" :style="{ height: `${height}px` }">
      <iframe v-if="src" ref="frame" class="app" :src="src" :title="`ZeppBridge · ${copy.note}`" :tabindex="playing && !suspended ? 0 : -1" :inert="!playing || suspended" :style="{ width: `${LOGICAL_W}px`, height: `${LOGICAL_H}px`, transform: `scale(${scale})`, pointerEvents: playing && !suspended ? 'auto' : 'none' }" :class="{ shown: ready }" @load="bindFrame"></iframe>
      <div v-if="!ready" class="skeleton" aria-live="polite"><span class="mark"><BrandMark :size="36" /></span><p>{{ failed ? copy.unavailable : copy.loading }}</p></div>
      <button v-if="ready && !playing" ref="shield" type="button" class="shield" @click="activate"><span class="hint"><i aria-hidden="true"></i>{{ copy.hint }}</span></button>
    </div>
    <figcaption><span class="lp-sample">{{ sample }}</span><span>{{ copy.note }}</span></figcaption>
  </figure>
</template>

<style scoped>
.win { position: relative; margin: 0; width: 100%; }
.window-label { display: flex; align-items: center; justify-content: space-between; min-height: 40px; padding: 6px 12px 6px 18px; border: 1px solid var(--lp-line-2); border-bottom: 0; border-radius: 16px 16px 0 0; color: var(--lp-subtle); background: var(--lp-panel-2); font-family: var(--font-mono); font-size: 10px; letter-spacing: .05em; }
.window-label span:first-child { color: var(--lp-muted); }
.frame { position: relative; overflow: hidden; border: 1px solid var(--lp-line-2); border-radius: 0 0 16px 16px; background: var(--lp-bg-2); box-shadow: var(--lp-shadow); isolation: isolate; contain: layout paint; }
.app { position: absolute; top: 0; left: 0; border: 0; background: transparent; transform-origin: 0 0; opacity: 0; transition: opacity .35s var(--lp-ease); }
.app.shown { opacity: 1; }
.skeleton { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 16px; padding: 20px; color: var(--lp-subtle); text-align: center; }
.skeleton p { margin: 0; max-width: 28em; font-size: 13px; line-height: 1.7; }
.mark { display: grid; width: 64px; height: 64px; place-items: center; border-radius: 18px; background: var(--lp-panel); border: 1px solid var(--lp-line); }
.shield { position: absolute; inset: 0; z-index: 3; display: flex; align-items: flex-end; justify-content: center; padding: 0 16px 20px; border: 0; background: transparent; cursor: pointer; }
.hint { display: inline-flex; align-items: center; gap: 9px; padding: 11px 18px; border: 1px solid var(--lp-line-2); border-radius: 999px; background: var(--lp-panel); box-shadow: 0 10px 30px -18px rgba(30, 40, 24, .4); color: var(--lp-ink); font-size: 13px; font-weight: 650; transition: transform .25s var(--lp-ease); }
.shield:hover .hint { transform: translateY(-2px); }
.hint i { width: 6px; height: 6px; border-radius: 50%; background: var(--lp-green); }
.exit { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 32px; max-width: 75%; padding: 5px 12px; border: 1px solid var(--lp-line-2); border-radius: 999px; background: var(--lp-panel); color: var(--lp-ink); font-family: var(--font-sans); font-size: 12px; line-height: 1.4; cursor: pointer; }
kbd { padding: 1px 4px; border: 1px solid var(--lp-line-2); border-radius: 4px; color: var(--lp-subtle); font-size: 10px; }
figcaption { display: flex; align-items: start; gap: 10px; margin-top: 14px; color: var(--lp-subtle); font-size: 12px; line-height: 1.6; }
figcaption .lp-sample { flex-shrink: 0; }
@media (max-width: 720px) { .window-label { padding: 6px 10px; } .shield { padding-bottom: 12px; } .hint { padding: 8px 13px; font-size: 12px; } .exit { font-size: 11px; padding: 5px 9px; } }
@media (prefers-reduced-motion: reduce) { .app, .hint { transition: none; } }
</style>

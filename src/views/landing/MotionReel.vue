<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { landingTheme } from './theme';
import { reelRoute, runReel } from './reel';
import { PlaybackClock } from './playback';
import { useShowcase } from './useShowcase';
import type { LandingLocale } from '../../composables/useLandingLocale';

const props = defineProps<{ id: string; locale: LandingLocale; title: string; autoAdvance?: boolean }>();
const emit = defineEmits<{ complete: [] }>();
const root = ref<HTMLElement | null>(null), frame = ref<HTMLIFrameElement | null>(null);
const width = ref(0), ready = ref(false), src = ref(''), failed = ref(false), finished = ref(false);
const phase = ref('loading'), beat = ref('start'), attempt = ref(0);
const camera = ref({ x: 0, y: 0, zoom: 1 });
const cursor = ref({ x: 640, y: 400, pressed: false, visible: false });
const scale = computed(() => width.value / 1280);
const show = useShowcase(root);
const cn = computed(() => props.locale === 'zh');
let resize: ResizeObserver | undefined, controller: AbortController | undefined, clock: PlaybackClock | undefined;
let loadTimer = 0, generation = 0;
const post = (payload: Record<string, unknown>) => frame.value?.contentWindow?.postMessage({ source: 'zeppbridge-site', ...payload }, location.origin);
const load = () => {
  clearTimeout(loadTimer);
  src.value = '/?' + new URLSearchParams({ demo: '1', showcase: '1', route: reelRoute(props.id), theme: landingTheme.value, lang: props.locale }).toString();
  loadTimer = window.setTimeout(() => { if (!ready.value) failed.value = true; }, 20000);
};
const stop = () => { generation++; controller?.abort(); clock?.dispose(); cursor.value.visible = false; };
const sync = () => {
  clock?.setPaused(!show.running.value);
  frame.value?.contentWindow?.__ZB_PRESENTATION__?.pause(!show.running.value);
  if (!failed.value && ready.value) phase.value = finished.value ? 'complete' : show.running.value ? 'run' : 'paused';
};
const run = async () => {
  stop(); if (!ready.value) return;
  const token = generation;
  controller = new AbortController(); clock = new PlaybackClock(controller.signal);
  finished.value = false; failed.value = false; root.value?.removeAttribute('data-error'); sync();
  try {
    await clock.checkpoint();
    await runReel(frame.value!.contentWindow!, props.id, clock, {
      focus(el, zoom = 1) {
        if (!el || show.reduced.value) { camera.value = { x: 0, y: 0, zoom: 1 }; return; }
        const box = el.getBoundingClientRect();
        camera.value = { zoom, x: Math.min(0, Math.max(1280 * (1 - zoom), 640 - (box.x + box.width / 2) * zoom)),
          y: Math.min(0, Math.max(800 * (1 - zoom), 400 - (box.y + box.height / 2) * zoom)) };
      },
      pointer(x, y, pressed) { cursor.value = { x, y, pressed, visible: true }; },
      beat(name) { beat.value = name; if (name === 'conversation') cursor.value.visible = false; },
    });
    if (token !== generation) return;
    cursor.value.visible = false; finished.value = true; phase.value = 'complete';
    await clock.wait(1800);
    if (props.autoAdvance && !show.reduced.value) emit('complete');
    else show.finish();
  } catch (error) {
    if (token !== generation || controller.signal.aborted) return;
    failed.value = true; phase.value = 'error';
    root.value?.setAttribute('data-error', error instanceof Error ? error.message : String(error));
  }
};
const replay = () => { show.play(); if (!src.value) load(); else if (failed.value && !ready.value) { attempt.value++; load(); } else void run(); };
const toggle = () => { if (finished.value) replay(); else if (!show.running.value) show.play(); else show.toggle(); };
const message = (event: MessageEvent) => {
  if (event.origin !== location.origin || event.source !== frame.value?.contentWindow || event.data?.source !== 'zeppbridge-demo' || event.data.type !== 'ready') return;
  clearTimeout(loadTimer); ready.value = true; failed.value = false;
  post({ type: 'theme', value: landingTheme.value }); post({ type: 'locale', value: props.locale });
  void run();
};
watch(show.near, value => { if (value && !src.value) load(); });
watch(show.running, sync);
watch(() => props.id, () => { camera.value = { x: 0, y: 0, zoom: 1 }; beat.value = 'start'; show.reset(); void run(); });
watch(() => props.locale, value => post({ type: 'locale', value }));
watch(landingTheme, value => post({ type: 'theme', value }));
onMounted(() => {
  window.addEventListener('message', message);
  resize = new ResizeObserver(entries => { width.value = entries[0]?.contentRect.width ?? 0; });
  if (root.value) resize.observe(root.value);
});
onBeforeUnmount(() => { stop(); clearTimeout(loadTimer); resize?.disconnect(); window.removeEventListener('message', message); });
</script>

<template>
  <figure ref="root" class="motion-reel" :data-reel="id" :data-phase="phase" :data-beat="beat">
    <div class="reel-scaler">
      <div class="reel-device" :style="{ transform: `scale(${scale})` }">
        <div class="reel-camera" :style="{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }">
          <iframe v-if="src" :key="attempt" ref="frame" :src="src" :title="title" :class="{ shown: ready }" tabindex="-1" inert />
          <i v-if="cursor.visible" class="reel-pointer" :class="{ pressed: cursor.pressed }" :style="{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }" aria-hidden="true"></i>
        </div>
      </div>
      <div v-if="!ready" class="reel-placeholder" :aria-label="cn ? '正在准备演示' : 'Preparing demo'"><div></div><div></div><div></div></div>
      <div v-if="failed" class="reel-error" role="status"><span>{{ cn ? '演示暂时未能继续' : 'The demo could not continue' }}</span><button type="button" @click="replay">{{ cn ? '重试' : 'Retry' }}</button></div>
    </div>
    <figcaption class="reel-controls">
      <span class="reel-status"><i :class="{ playing: show.running.value && !finished }"></i>{{ title }}</span>
      <div><button type="button" class="playback-toggle" :aria-pressed="show.running.value" @click="toggle">{{ finished ? (cn ? '重播' : 'Replay') : show.running.value ? (cn ? '暂停' : 'Pause') : (cn ? '播放' : 'Play') }}</button><button v-if="!finished" type="button" class="playback-replay" @click="replay">{{ cn ? '重播' : 'Replay' }}</button></div>
    </figcaption>
  </figure>
</template>

<style scoped>
.motion-reel { margin: 0; min-width: 0; }
.reel-scaler { position: relative; overflow: hidden; aspect-ratio: 8 / 5; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); isolation: isolate; }
.reel-device { width: 1280px; height: 800px; transform-origin: 0 0; }
.reel-camera { width: 1280px; height: 800px; transform-origin: 0 0; transition: transform 1000ms cubic-bezier(.22,1,.36,1); }
iframe { position: absolute; inset: 0; width: 1280px; height: 800px; border: 0; opacity: 0; pointer-events: none; transition: opacity 550ms ease; }
iframe.shown { opacity: 1; }
.reel-pointer { position: absolute; top: -10px; left: -10px; width: 20px; height: 20px; border: 2px solid var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); border-radius: 50%; pointer-events: none; transition: transform 140ms linear, background 150ms ease; box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 12%, transparent); }
.reel-pointer.pressed { background: var(--accent); }
.reel-placeholder { position: absolute; inset: 12% 7%; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; opacity: .6; }
.reel-placeholder div { border: 1px solid var(--line); border-radius: 18px; background: var(--bg); }
.reel-placeholder div:first-child { grid-column: span 2; }
.reel-controls { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 4px; font-size: 12px; color: var(--muted); }
.reel-status { display: inline-flex; align-items: center; gap: 8px; }
.reel-status i { width: 5px; height: 5px; border-radius: 50%; background: var(--subtle); }
.reel-status i.playing { background: var(--accent); }
.reel-controls button, .reel-error button { min-height: 32px; padding: 4px 10px; border: 0; border-radius: 999px; color: var(--ink); background: transparent; font: inherit; cursor: pointer; }
.reel-controls button:hover { background: var(--surface); }
.reel-error { position: absolute; inset: auto 12px 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 14px; border-radius: 12px; background: var(--bg); font-size: 13px; }
@media(max-width:720px) { .reel-scaler { border-radius: 12px; } }
@media(prefers-reduced-motion:reduce) { .reel-camera, iframe, .reel-pointer { transition: none; } }
</style>

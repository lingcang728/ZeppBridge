<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef, watch } from 'vue';
import StarCard from './StarCard.vue';
import { RingsLuminaEngine, type RingPhase } from '../../lib/rings/lumina/engine';
import { lessMotion } from '../../lib/motion/lessMotion';
import { onMotionEscape } from '../../lib/motion/interrupt';
import { fontsReady } from '../../lib/fontsReady';
import { diveActive, stageReady } from '../../lib/rings/cosmosDive';
import { useRingsText } from './rings.i18n';
import type { RingYear } from '../../types/rings';

const props = defineProps<{ years: RingYear[]; selected: number; finaleText: string }>();
const emit = defineEmits<{ land: [phase: RingPhase] }>();
const t = useRingsText();
const stage = ref<RingPhase>('idle');
const landed = ref(false);
const host = ref<HTMLElement | null>(null);
const root = ref<HTMLElement | null>(null);
const engine = shallowRef<RingsLuminaEngine | null>(null);
const flash = ref(0);
let phaseTimer = 0;
function phase(next: RingPhase) {
  clearTimeout(phaseTimer);
  stage.value = next; landed.value = false;
  engine.value?.prepare();
  engine.value?.setPhase(next);
  if (next === 'finale') flash.value++;
}
function advance() {
  if (star.value !== null) return;
  if (stage.value === 'idle') engine.value?.skipIntro();
  else phase(stage.value === 'shape' ? 'finale' : 'shape');
}
function replay() {
  if (!engine.value) return;
  clearTimeout(phaseTimer); star.value = null; hover.value = null; starOpen.value = false; landed.value = false;
  if (lessMotion()) phase('year');
  else { engine.value.replay(); stage.value = 'idle'; }
}
watch(() => [props.years, props.selected, props.finaleText] as const, ([years, selected, text], old) => {
  const e = engine.value;
  if (!e) return;
  e.setData(years, selected, text);
  if (old && (old[1] !== selected || old[0] !== years)) {
    star.value = null; hover.value = null; starOpen.value = false;
    if (stage.value !== 'idle') phase('year');
  } else if (stage.value === 'finale') e.setPhase('finale');
});

const year = computed(() => props.years.find(y => y.year === props.selected));
const stars = computed(() => year.value?.stars ?? []);
const hover = ref<number | null>(null);
const star = ref<number | null>(null);
const starOpen = ref(false);
const activeStar = computed(() => star.value ?? hover.value);
const item = computed(() => activeStar.value === null ? null : stars.value[activeStar.value]);
const rank = computed(() => item.value?.duration_s ? 1 + stars.value.filter(s => (s.duration_s ?? 0) > item.value!.duration_s!).length : null);
const point = () => activeStar.value === null ? null : engine.value?.starPoint(activeStar.value) ?? null;
function openStar(index: number) { star.value = index; starOpen.value = true; engine.value?.focusStar(index); }
function closeStar() { starOpen.value = false; engine.value?.focusStar(null); host.value?.focus({ preventScroll: true }); }
function closedStar() { star.value = null; hover.value = null; engine.value?.setHover(null); }
let down: { x: number; y: number; at: number } | null = null;
const onPointerDown = (event: PointerEvent) => { if (event.button === 0 && star.value === null) down = { x: event.clientX, y: event.clientY, at: performance.now() }; };
function onPointerUp(event: PointerEvent) {
  const start = down; down = null;
  if (!start || event.button !== 0 || star.value !== null || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6 || performance.now() - start.at > 350) return;
  const hit = engine.value?.pickStar(event.clientX, event.clientY) ?? null;
  if (hit !== null) openStar(hit); else advance();
}
function onPointerMove(event: PointerEvent) {
  if (star.value !== null) return;
  hover.value = event.buttons ? null : engine.value?.pickStar(event.clientX, event.clientY) ?? null;
  engine.value?.setHover(hover.value);
}
function onPointerLeave() { down = null; if (star.value === null) { hover.value = null; engine.value?.setHover(null); } }
const onKey = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  if (!active || !root.value?.contains(target)) return;
  if (star.value !== null) { if (event.key === 'Escape') { event.preventDefault(); closeStar(); } return; }
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName))) return;
  const k = event.key.toLowerCase();
  if (k === ' ') { event.preventDefault(); advance(); }
  else if (k === 'f' || k === '0') phase('shape');
  else if (k === 'r') replay();
  else if (k === 'enter' && stage.value === 'shape' && stars.value.length) openStar(hover.value ?? 0);
  else if (['arrowleft', 'arrowright'].includes(k) && stage.value === 'shape' && stars.value.length) {
    event.preventDefault(); hover.value = ((hover.value ?? -1) + (k === 'arrowright' ? 1 : -1) + stars.value.length) % stars.value.length;
    engine.value?.setHover(hover.value);
  }
};
let visible = true, active = true, disposed = false, initFrame = 0;
const sync = () => { if (visible && active && document.visibilityState === 'visible') engine.value?.start(); else engine.value?.stop(); };
let observer: IntersectionObserver | null = null;
let forgetEscape: (() => void) | undefined;
onMounted(async () => {
  await Promise.all([nextTick(), fontsReady()]);
  const initialize = () => {
    if (disposed || !host.value) return;
    const flying = document.getAnimations().some(a => {
      const target = (a.effect as KeyframeEffect | null)?.target;
      return a.playState === 'running' && target instanceof Element && target.contains(host.value) && Number(a.effect?.getTiming().iterations) !== Infinity;
    });
    if (flying || !active) { initFrame = requestAnimationFrame(initialize); return; }
    const e = new RingsLuminaEngine(host.value, {
      reducedMotion: lessMotion(), onIntroDone: () => phase('year'),
      onLand: p => { landed.value = true; emit('land', p); },
    });
    e.setData(props.years, props.selected, props.finaleText); engine.value = e;
    if (lessMotion()) phase('year'); sync(); handOff();
  };
  initFrame = requestAnimationFrame(() => { initFrame = requestAnimationFrame(initialize); });
  observer = new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); sync(); });
  if (host.value) observer.observe(host.value);
  document.addEventListener('visibilitychange', sync); window.addEventListener('keydown', onKey);
  forgetEscape = onMotionEscape(() => { if (!active || !starOpen.value) return false; closeStar(); return true; });
});
/* 从履历卡飞进来的：飞行层在等舞台画好第一帧才淡掉。缓存着回来的舞台从头放开场，镜头照样往星云里飞。 */
function handOff() {
  if (!diveActive()) return;
  requestAnimationFrame(() => requestAnimationFrame(stageReady));
}
onActivated(() => {
  active = true;
  if (diveActive() && engine.value) { replay(); handOff(); }
  sync();
});
onDeactivated(() => { active = false; sync(); });
onBeforeUnmount(() => {
  disposed = true; clearTimeout(phaseTimer); cancelAnimationFrame(initFrame); observer?.disconnect(); forgetEscape?.();
  document.removeEventListener('visibilitychange', sync); window.removeEventListener('keydown', onKey);
  engine.value?.dispose(); engine.value = null;
});
defineExpose({
  capture: (width: number, height: number) => engine.value?.capture(width, height) ?? null,
  settle: async () => {
    if (!engine.value || stage.value === 'shape' || stage.value === 'finale') return;
    if (stage.value === 'idle') { engine.value.skipIntro(); await new Promise(resolve => setTimeout(resolve, 60)); }
    phase('shape'); if (!lessMotion()) await new Promise(resolve => setTimeout(resolve, 1100));
  }, stage,
});
</script>

<template>
  <div ref="root" class="rings-stage" :data-phase="stage" :data-landed="landed">
    <div ref="host" :class="['stage-canvas', { 'on-star': hover !== null }]" tabindex="0" :aria-label="t.yearAria(selected)"
      @pointerdown="onPointerDown" @pointerup="onPointerUp" @pointermove="onPointerMove" @pointerleave="onPointerLeave" />
    <div class="stage-ui">
      <Transition name="flash"><div v-if="stage === 'finale'" :key="flash" class="finale-flash" /></Transition>
      <div class="stage-actions"><button type="button" class="stage-button" :disabled="star !== null" @click="replay">{{ t.replay }}</button></div>
    </div>
    <Transition name="dim"><div v-if="starOpen" class="star-dim" @click="closeStar" /></Transition>
    <StarCard v-if="item" :star="item" :open="starOpen" :rank="rank" :point="point" :stage="host" @close="closeStar" @closed="closedStar" />
  </div>
</template>

<style scoped>
.rings-stage { position: relative; overflow: hidden; background: #050510; isolation: isolate; }
.stage-canvas { position: absolute; inset: 0; touch-action: none; cursor: grab; }
.stage-canvas:active { cursor: grabbing; } .stage-canvas.on-star { cursor: pointer; }
.stage-ui { position: absolute; inset: 0; pointer-events: none; }
.finale-flash { position: absolute; inset: 0; opacity: 0; background: radial-gradient(ellipse at center, #ffe9b7, transparent 65%); }
.flash-enter-active { animation: finale-flash .4s ease-out; }
@keyframes finale-flash { from { opacity: .35; } to { opacity: 0; } }
.stage-actions { position: absolute; right: 24px; bottom: 24px; pointer-events: auto; }
.stage-button { padding: 8px 18px; border: 1px solid #ffffff30; border-radius: 999px; background: #1d1b25; color: #e0d7c6; font: inherit; font-size: 16px; cursor: pointer; }
.stage-button:disabled { opacity: .4; cursor: default; }
.star-dim { position: absolute; inset: 0; z-index: 3; background: #00000073; }
.dim-enter-active, .dim-leave-active { transition: opacity 240ms ease; } .dim-enter-from, .dim-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
</style>

<script setup lang="ts">
import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { dialogWindowFrames, visibleWindow } from '../../lib/motion/dialogFlight';
import { OPEN_EASE } from '../../lib/motion/timing';
import { lessMotion } from '../../lib/motion/lessMotion';
import { journalDay, kmText } from '../../lib/logbook/display';
import { clockText } from '../../lib/logbook/clock';
import { workoutLabel } from '../../lib/labels';
import { useRingsText } from './rings.i18n';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';
import type { RingStar } from '../../types/rings';

const props = defineProps<{
  star: RingStar; open: boolean; rank: number | null;
  point: () => { x: number; y: number } | null;
  stage: HTMLElement | null;
}>();
const emit = defineEmits<{ close: []; closed: [] }>();
const t = useRingsText();
const workoutText = useMessages(workoutDetailMessages);
const card = ref<HTMLElement>();
const detailed = ref(false);
const left = ref(0), top = ref(0), width = ref(340);
let frame = 0, flight: Animation | null = null, fade: Animation | null = null, revision = 0;
let tipHeight = 76;
let side: 'left' | 'right' | null = null;
function track() {
  const host = props.stage, point = props.point();
  if (host && point) {
    const box = host.getBoundingClientRect();
    tipHeight = card.value?.querySelector('header')?.offsetHeight ?? 76;
    width.value = Math.min(340, Math.max(160, box.width - 24));
    const x = point.x - box.left, y = point.y - box.top;
    const fullHeight = card.value?.offsetHeight ?? tipHeight;
    const progress = Number(flight?.effect?.getComputedTiming().progress ?? 1);
    const height = flight ? tipHeight + (fullHeight - tipHeight) * (props.open ? progress : 1 - progress) : fullHeight;
    if (!props.open && !detailed.value) side = null;
    side ??= x + 16 + width.value > box.width - 12 ? 'left' : 'right';
    left.value = Math.max(12, Math.min(box.width - width.value - 12, side === 'left' ? x - width.value - 16 : x + 16));
    top.value = Math.max(12, Math.min(box.height - height - 12, y - tipHeight / 2));
  }
  frame = requestAnimationFrame(track);
}
async function change(open: boolean) {
  const mine = ++revision;
  const el = card.value;
  if (!el) return;
  const style = getComputedStyle(el);
  const pose = { transform: style.transform, clipPath: style.clipPath };
  const seen = visibleWindow(el);
  fade?.cancel(); fade = null;
  flight?.cancel();
  const from = el.getBoundingClientRect();
  if (open) detailed.value = true;
  await nextTick();
  if (mine !== revision) return;
  const final = el.getBoundingClientRect();
  const small = { left: final.left, top: final.top, width: final.width, height: tipHeight };
  const frames = dialogWindowFrames(pose.clipPath !== 'none' ? seen : open ? { ...small, top: from.top, left: from.left } : final, open ? final : small, final, 12);
  if (pose.clipPath !== 'none') frames[0] = { ...frames[0], ...pose };
  if (!lessMotion()) {
    flight = el.animate(frames, { duration: 480, easing: OPEN_EASE, fill: 'both' });
    try { await flight.finished; } catch { return; }
    if (mine !== revision) return;
    flight.cancel(); flight = null;
  }
  if (open) el.focus({ preventScroll: true });
  else {
    detailed.value = false;
    await nextTick();
    if (!lessMotion()) {
      fade = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' });
      try { await fade.finished; } catch { return; }
      if (mine !== revision) return;
    }
    emit('closed');
  }
}
function key(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); }
  if (event.key === 'Tab') {
    const items = [...card.value!.querySelectorAll<HTMLElement>('button, a[href]')];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = index < 0 ? (event.shiftKey ? items.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
    event.preventDefault(); items[next]?.focus();
  }
}
watch(() => props.open, change);
onMounted(() => { track(); if (props.open) void change(true); });
onActivated(() => { if (!frame) track(); });
onDeactivated(() => { cancelAnimationFrame(frame); frame = 0; });
onBeforeUnmount(() => { revision++; cancelAnimationFrame(frame); flight?.cancel(); fade?.cancel(); });
</script>

<template>
  <div class="star-position" :style="{ transform: `translate3d(${left}px, ${top}px, 0)`, width: `${width}px` }">
  <section ref="card" :class="['star-card', { detailed }]"
    :role="open ? 'dialog' : 'tooltip'" aria-labelledby="ring-star-title" tabindex="-1" data-morph-card @keydown="key" @pointerdown.stop @pointerup.stop @pointermove.stop>
    <header>
      <h2 id="ring-star-title">{{ workoutLabel(star.kind) }}</h2>
      <p>{{ journalDay(star.date) }}<template v-if="star.distance_m"> · {{ kmText(star.distance_m / 1000) }} km</template></p>
    </header>
    <div v-if="detailed" class="star-details" :inert="!open || undefined">
      <dl><div v-if="star.duration_s"><dt>{{ workoutText.metricDuration }}</dt><dd>{{ clockText(star.duration_s) }}</dd></div></dl>
      <p v-if="rank" class="star-rank">{{ t.starRank(rank) }}</p>
      <footer>
        <button type="button" class="stage-button" @click="emit('close')">{{ t.close }}</button>
        <RouterLink class="stage-button primary" :to="{ name: 'WorkoutDetail', params: { workoutId: star.workout_id } }">{{ t.starOpen }}</RouterLink>
      </footer>
    </div>
  </section>
  </div>
</template>

<style scoped>
.star-position { position: absolute; left: 0; top: 0; z-index: 4; pointer-events: none; }
.star-card { position: relative; width: 100%; box-sizing: border-box; border: 1px solid #6c5835; border-radius: 12px; background: #14131e; color: #fff4dc; pointer-events: none; overflow: hidden; outline: none; }
.star-card.detailed { pointer-events: auto; box-shadow: 0 16px 60px #0008; }
header { box-sizing: border-box; min-height: 76px; padding: 14px 16px; }
h2 { margin: 0; font-size: 18px; font-weight: 650; }
header p { margin: 4px 0 0; color: #c7bdab; font-size: 16px; line-height: 1.4; overflow-wrap: anywhere; }
.star-details { display: grid; gap: 16px; padding: 0 16px 16px; }
dl, dd, p { margin: 0; } dt { color: #c7bdab; font-size: 16px; } dd { font: 28px var(--font-mono); }
.star-rank { color: #e8cb8d; font-size: 16px; }
footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
.stage-button { border: 1px solid #6c5835; border-radius: 99px; padding: 8px 12px; background: #24202c; color: inherit; font: inherit; font-size: 16px; cursor: pointer; text-decoration: none; }
.primary { background: #493d26; }
</style>

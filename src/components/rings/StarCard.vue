<script setup lang="ts">
/* 点开一次运动（年轮上的一条刻线）：卡片从刻线外端长出来（缩放的原点就是那一点），关上时缩回去再消失。
   内容精简：运动、日期、距离、时长、「这一年第 N 长」；← → 去前一次 / 后一次（卡片跟着滑到那条刻线旁边），
   「看这次运动」从这张卡长成详情页（data-morph-card）。材质是应用自己的浮层玻璃。 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../Icon.vue';
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
  star: RingStar; rank: number | null; closing: boolean; hasPrev: boolean; hasNext: boolean;
  point: () => { x: number; y: number } | null;
  stage: HTMLElement | null;
}>();
const emit = defineEmits<{ close: []; closed: []; step: [delta: 1 | -1] }>();
const t = useRingsText();
const workoutText = useMessages(workoutDetailMessages);
const card = ref<HTMLElement | null>(null);
const WIDTH = 300;
const left = ref(0), top = ref(0);
let placed = false, frame = 0, flight: Animation | null = null;

/** 卡片该在哪：星的右边（贴边就左边），竖着居中对着星；换星时滑过去，不跳。 */
function aim() {
  const host = props.stage, p = props.point();
  if (!host || !p) return null;
  const box = host.getBoundingClientRect();
  const height = card.value?.offsetHeight ?? 200;
  const x = p.x - box.left, y = p.y - box.top;
  const right = x + 28 + WIDTH < box.width - 12;
  return {
    star: { x, y },
    left: Math.max(12, Math.min(box.width - WIDTH - 12, right ? x + 28 : x - 28 - WIDTH)),
    top: Math.max(12, Math.min(box.height - height - 12, y - height / 2)),
  };
}
function track() {
  frame = requestAnimationFrame(track);
  const next = aim();
  if (!next) return;
  const k = placed && !lessMotion() ? 0.22 : 1;
  left.value += (next.left - left.value) * k;
  top.value += (next.top - top.value) * k;
  placed = true;
}
/** 缩放的原点放在星上：长出来、缩回去都对着那颗星。 */
function fromStar() {
  const next = aim();
  if (!next) return { transform: 'scale(.04)', origin: '0 0' };
  return { transform: 'scale(.04)', origin: `${next.star.x - left.value}px ${next.star.y - top.value}px` };
}
async function grow() {
  await nextTick();
  const el = card.value;
  if (!el || lessMotion()) return;
  const { transform, origin } = fromStar();
  el.style.transformOrigin = origin;
  flight = el.animate([{ transform, opacity: 0 }, { opacity: 1, offset: 0.35 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: OPEN_EASE, fill: 'backwards' });
  el.focus({ preventScroll: true });
}
async function shrink() {
  const el = card.value;
  if (!el || lessMotion()) { emit('closed'); return; }
  flight?.cancel();
  const { transform, origin } = fromStar();
  el.style.transformOrigin = origin;
  flight = el.animate([{ transform: 'none', opacity: 1 }, { opacity: 1, offset: 0.6 }, { transform, opacity: 0 }], { duration: 320, easing: 'cubic-bezier(.4, 0, .7, .2)', fill: 'forwards' });
  try { await flight.finished; } catch { return; }
  emit('closed');
}
watch(() => props.closing, (now) => { if (now) void shrink(); });
onMounted(() => { track(); void grow(); });
onBeforeUnmount(() => { cancelAnimationFrame(frame); flight?.cancel(); });

function key(event: KeyboardEvent) {
  if (event.key !== 'Tab') return;
  const items = [...card.value!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')];
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next = index < 0 ? (event.shiftKey ? items.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
  event.preventDefault(); items[next]?.focus();
}
</script>

<template>
  <section ref="card" class="star-card" role="dialog" aria-labelledby="ring-star-title" tabindex="-1" data-morph-card
    :style="{ left: `${left}px`, top: `${top}px`, width: `${WIDTH}px`, }"
    @keydown="key" @pointerdown.stop @pointerup.stop @pointermove.stop>
    <header>
      <span class="dot" aria-hidden="true" />
      <h2 id="ring-star-title">{{ workoutLabel(star.kind) }}</h2>
      <button type="button" class="icon-button" :aria-label="t.close" @click="emit('close')"><Icon name="x" :size="14" /></button>
    </header>
    <p class="date">{{ journalDay(star.date) }}</p>
    <dl>
      <div><dt>{{ workoutText.metricDistance }}</dt><dd>{{ star.distance_m ? `${kmText(star.distance_m / 1000)} km` : '—' }}</dd></div>
      <div><dt>{{ workoutText.metricDuration }}</dt><dd>{{ star.duration_s ? clockText(star.duration_s) : '—' }}</dd></div>
    </dl>
    <p v-if="rank" class="rank">{{ t.starRank(rank) }}</p>
    <footer>
      <div class="steps">
        <button type="button" class="icon-button" :disabled="!hasPrev" :aria-label="t.starPrev" @click="emit('step', -1)"><Icon name="chevron-right" :size="16" class="flip" /></button>
        <button type="button" class="icon-button" :disabled="!hasNext" :aria-label="t.starNext" @click="emit('step', 1)"><Icon name="chevron-right" :size="16" /></button>
      </div>
      <RouterLink class="open" :to="{ name: 'WorkoutDetail', params: { workoutId: star.workout_id } }">{{ t.starOpen }}</RouterLink>
    </footer>
  </section>
</template>

<style scoped>
.star-card { position: absolute; z-index: 4; display: grid; gap: 10px; box-sizing: border-box; padding: 14px 16px; border-radius: 16px; outline: none; color: var(--ink);
  background: var(--mat-glass-strong); border: 1px solid var(--mat-glass-line); box-shadow: var(--mat-glass-shadow);
  -webkit-backdrop-filter: var(--mat-glass-blur); backdrop-filter: var(--mat-glass-blur); }
header { display: flex; align-items: center; gap: 8px; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); }
h2 { flex: 1; margin: 0; font-size: 17px; font-weight: 650; }
.date { margin: -4px 0 0; color: var(--muted); font-size: 14px; }
dl { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0; }
dt { color: var(--muted); font-size: 12px; } dd { margin: 2px 0 0; font: 22px/1.2 var(--font-mono); font-variant-numeric: tabular-nums; }
.rank { margin: 0; color: var(--accent); font-size: 14px; }
footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 2px; }
.steps { display: flex; gap: 4px; }
.icon-button { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 999px; background: var(--glass-press); color: inherit; cursor: pointer; transition: background 160ms ease, scale 120ms ease; }
.icon-button:hover:not(:disabled) { background: var(--mat-line-hover); }
.icon-button:active:not(:disabled) { scale: .9; }
.icon-button:disabled { opacity: .35; cursor: default; }
.flip { transform: rotate(180deg); }
.open { padding: 7px 14px; border-radius: 999px; background: var(--accent); color: var(--accent-ink); font-size: 14px; font-weight: 600; text-decoration: none; transition: background 160ms ease; }
.open:hover { background: var(--accent-hover); }
</style>

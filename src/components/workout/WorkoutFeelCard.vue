<script setup lang="ts">
/**
 * 运动详情右栏「你的感受」（批次 7 主观层）：自己打的 RPE（1–10，手表记的另外写着）、酸痛部位（人形图）、
 * 这次穿的鞋（自动 / 选一双 / 没穿登记的）。每改一处就存，不用找保存按钮。
 *
 * 鞋只在穿鞋的运动上问（跑步、越野、走路、徒步）；「自动」时写明现在算在哪双上、为什么。
 */
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import BodyMap from '../journal/BodyMap.vue';
import GlyphTile from '../GlyphTile.vue';
import { useFeelText } from './feel.i18n';
import { backend, isDesktop, toUserMessage } from '../../lib/bridge';
import type { ShoeMode, WorkoutFeel } from '../../types/logbook';

const props = defineProps<{ workoutId: string }>();
const t = useFeelText();
const feel = ref<WorkoutFeel | null>(null);
const error = ref<string | null>(null);
const savedAt = ref(0);
const mapOpen = ref(false);
let seq = 0;

async function load() {
  if (!isDesktop() || !props.workoutId) return;
  const mine = ++seq;
  try {
    const next = await backend.workoutFeelGet(props.workoutId);
    if (mine === seq) { feel.value = next; error.value = null; }
  } catch (e) { if (mine === seq) error.value = toUserMessage(e, ''); }
}
watch(() => props.workoutId, () => { feel.value = null; mapOpen.value = false; void load(); }, { immediate: true });

let soreTimer: number | undefined;
async function save(patch: Partial<Pick<WorkoutFeel, 'rpe' | 'soreness' | 'shoe_mode' | 'shoe_id'>>) {
  if (!feel.value) return;
  Object.assign(feel.value, patch);
  const { workout_id, rpe, soreness, shoe_mode, shoe_id } = feel.value;
  try {
    await backend.workoutFeelSave({ workout_id, rpe, soreness, shoe_mode, shoe_id });
    savedAt.value = Date.now();
    error.value = null;
    if ('shoe_mode' in patch || 'shoe_id' in patch) await load();
  } catch (e) { error.value = toUserMessage(e, ''); await load(); }
}
const setRpe = (value: number) => save({ rpe: feel.value?.rpe === value ? null : value });
/* 人形图连点几处时别每点一下存一次：停手半秒再存。 */
const setSoreness = (parts: string[]) => {
  if (!feel.value) return;
  feel.value.soreness = parts;
  window.clearTimeout(soreTimer);
  soreTimer = window.setTimeout(() => { void save({ soreness: parts }); }, 500);
};
const setMode = (mode: ShoeMode) => {
  if (mode === 'chosen') { const first = feel.value?.choices.find(c => !c.retired) ?? feel.value?.choices[0]; if (first) void save({ shoe_mode: 'chosen', shoe_id: first.id }); }
  else void save({ shoe_mode: mode, shoe_id: null });
};

const assignedName = computed(() => {
  const id = feel.value?.assigned?.shoe_id;
  return id ? feel.value?.choices.find(c => c.id === id)?.name ?? null : null;
});
const rpeTone = (value: number) => `color-mix(in srgb, var(--heart) ${Math.round(18 + value * 8)}%, var(--pace))`;
</script>

<template>
  <section v-if="feel" class="surface-card feel-card" :aria-label="t.title">
    <div class="feel-head">
      <GlyphTile name="recovery" tone="heart" :size="40" />
      <div><p class="eyebrow">{{ t.eyebrow }}</p><h2>{{ t.title }}</h2></div>
      <small v-if="savedAt" :key="savedAt" class="saved" role="status">{{ t.saved }}</small>
    </div>

    <div class="block">
      <div class="block-head"><span>{{ t.rpe }}</span><small v-if="feel.watch_rpe !== null">{{ t.watchRpe(feel.watch_rpe) }}</small>
        <button v-if="feel.rpe !== null" type="button" class="link" @click="save({ rpe: null })">{{ t.clear }}</button></div>
      <div class="rpe" role="radiogroup" :aria-label="t.rpe">
        <button v-for="value in 10" :key="value" type="button" role="radio" :aria-checked="feel.rpe === value"
          :class="{ on: feel.rpe === value, below: feel.rpe !== null && value < feel.rpe }" :style="{ '--rpe': rpeTone(value) }" @click="setRpe(value)">{{ value }}</button>
      </div>
      <div class="rpe-ends" aria-hidden="true"><span>{{ t.rpeEasy }}</span><span>{{ t.rpeHard }}</span><span>{{ t.rpeMax }}</span></div>
    </div>

    <div class="block">
      <div class="block-head"><span>{{ t.soreness }}</span>
        <button type="button" class="link" @click="mapOpen = !mapOpen">{{ mapOpen ? t.fold : t.markSore }}</button></div>
      <BodyMap v-if="mapOpen" :model-value="feel.soreness" @update:model-value="setSoreness" />
      <BodyMap v-else-if="feel.soreness.length" :model-value="feel.soreness" readonly class="chips-only" @update:model-value="setSoreness" />
    </div>

    <div v-if="feel.footwear" class="block">
      <div class="block-head"><span>{{ t.shoe }}</span></div>
      <template v-if="feel.choices.length">
        <div class="modes">
          <button type="button" :class="{ on: feel.shoe_mode === 'auto' }" @click="setMode('auto')">{{ t.auto }}</button>
          <button type="button" :class="{ on: feel.shoe_mode === 'chosen' }" @click="setMode('chosen')">{{ t.pick }}</button>
          <button type="button" :class="{ on: feel.shoe_mode === 'none' }" @click="setMode('none')">{{ t.none }}</button>
        </div>
        <div v-if="feel.shoe_mode === 'chosen'" class="choices">
          <button v-for="shoe in feel.choices" :key="shoe.id" type="button" :class="{ on: feel.shoe_id === shoe.id, retired: shoe.retired }"
            @click="save({ shoe_mode: 'chosen', shoe_id: shoe.id })">{{ shoe.name }}<small v-if="shoe.retired"> · {{ t.retired }}</small></button>
        </div>
        <p v-else-if="feel.shoe_mode === 'auto'" class="note">{{ assignedName ? t.autoNow(assignedName, t.how[feel.assigned?.how ?? 'unknown']) : t.autoUnknown }}</p>
      </template>
      <p v-else class="note">{{ t.noShoes }} <RouterLink to="/journal">{{ t.register }} →</RouterLink></p>
    </div>
    <p v-if="error" class="note bad" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.feel-card { display: grid; gap: 14px; padding: 16px 18px 18px; border-radius: var(--radius-lg); }
.feel-head { display: flex; align-items: center; gap: 10px; }
.feel-head h2 { margin: 1px 0 0; font-size: var(--fs-2xl); letter-spacing: -.02em; }
.eyebrow { margin: 0; color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); font-weight: 700; letter-spacing: .16em; }
.saved { margin-left: auto; color: var(--accent); font-size: var(--fs-xs); animation: saved-fade 1.6s ease forwards; }
@keyframes saved-fade { 0%, 60% { opacity: 1; } 100% { opacity: 0; } }
.block { display: grid; gap: 8px; }
.block-head { display: flex; align-items: baseline; gap: 10px; color: var(--muted); font-size: var(--fs-sm); }
.block-head small { color: var(--subtle); font-size: var(--fs-xs); }
.link { margin-left: auto; padding: 0; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.link:hover { color: var(--ink); }
.rpe { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 4px; }
.rpe button { aspect-ratio: 1; min-width: 0; padding: 0; border: 0; border-radius: 50%; background: var(--cap-track); box-shadow: var(--cap-track-shadow);
  color: var(--muted); font: inherit; font-size: var(--fs-xs); font-variant-numeric: tabular-nums; cursor: pointer; transition: background .16s ease, color .16s ease; }
.rpe button:hover { color: var(--ink); }
.rpe button.below { background: color-mix(in srgb, var(--rpe) 28%, var(--cap-track)); color: var(--ink); }
.rpe button.on { background: var(--rpe); color: var(--bg); font-weight: 700; }
.rpe button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.rpe-ends { display: flex; justify-content: space-between; color: var(--subtle); font-size: var(--fs-2xs); }
.modes, .choices { display: flex; flex-wrap: wrap; gap: 6px; }
.modes button, .choices button { min-height: 30px; padding: 0 12px; border: 0; border-radius: 999px; background: color-mix(in srgb, var(--ink) 7%, transparent); color: var(--muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.modes button.on, .choices button.on { background: color-mix(in srgb, var(--pace) 22%, transparent); color: var(--ink); }
.choices button.retired { opacity: .7; }
.note { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.6; }
.note a { color: var(--accent); }
.note.bad { color: var(--warning); }
.chips-only :deep(.figures) { display: none; }
@media (prefers-reduced-motion: reduce) { .rpe button { transition: none; } .saved { animation: none; } }
</style>

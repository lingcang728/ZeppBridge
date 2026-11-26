<script setup lang="ts">
/**
 * 结构样本的预览：从信纸上那枚标签里长出来的玻璃面板（ModalDialog，关时原路缩回标签）。
 * 上面一排是最近几次运动，点一次就换成那一次；下面是将要寄出的那份样本原文（太长只显示前面一段，寄出的是完整一份）。
 * 「附上这一份」记下运动编号，「不附了」去掉样本。Esc、点遮罩、× 都是关掉不改。
 */
import { computed, onMounted, ref, watch } from 'vue';
import ModalDialog from '../ModalDialog.vue';
import GlyphTile from '../GlyphTile.vue';
import { backend } from '../../lib/bridge';
import { formatDate } from '../../lib/format';
import { workoutLabel } from '../../lib/labels';
import type { StructureSample } from '../../types/letters';
import { useSampleText } from './sample.i18n';

const props = defineProps<{ origin: HTMLElement | null; workoutId: string | null }>();
const emit = defineEmits<{ (event: 'pick', workoutId: string): void; (event: 'remove'): void; (event: 'close'): void }>();
const t = useSampleText();

/** 预览里最多显示这么多字：几十万字的 pre 排版会卡一下。 */
const PREVIEW_CHARS = 40_000;
const RECENT = 8;

interface Choice { id: string; label: string }
const choices = ref<Choice[]>([]);
const selected = ref<string | null>(props.workoutId);
const sample = ref<StructureSample | null>(null);
const state = ref<'loading' | 'ready' | 'missing' | 'none'>('loading');
const cache = new Map<string, StructureSample | null>();

const choiceLabel = (start: string, type: string) => `${formatDate(start, 'short')} · ${workoutLabel(type)}`;

const load = async (id: string | null) => {
  state.value = 'loading';
  const key = id ?? '';
  let result = cache.get(key);
  if (result === undefined) {
    try { result = await backend.workoutStructureSample(id); } catch { result = null; }
    cache.set(key, result);
  }
  if (id !== selected.value && !(id === null && selected.value === null)) return;
  sample.value = result;
  if (result && !selected.value) selected.value = result.workout_id;
  state.value = result ? 'ready' : 'missing';
};

onMounted(async () => {
  try {
    const recent = await backend.getRecentWorkouts(RECENT);
    choices.value = recent.map((w) => ({ id: w.workout_id, label: choiceLabel(w.start_time, w.effective_type || w.workout_type) }));
  } catch { choices.value = []; }
  await load(selected.value);
  // 从运动详情进来的那一次不在最近几次里，也放进来。
  const current = sample.value;
  if (current && !choices.value.some((choice) => choice.id === current.workout_id)) {
    choices.value = [{ id: current.workout_id, label: choiceLabel(current.start_time, current.workout_type) }, ...choices.value];
  }
  if (!choices.value.length && !current) state.value = 'none';
});
watch(selected, (id, before) => { if (id && id !== before && id !== sample.value?.workout_id) void load(id); });

const preview = computed(() => sample.value?.json.slice(0, PREVIEW_CHARS) ?? '');
const truncated = computed(() => (sample.value?.json.length ?? 0) > PREVIEW_CHARS);
const kb = computed(() => (sample.value ? (sample.value.bytes / 1024).toFixed(sample.value.bytes < 10_240 ? 1 : 0) : '0'));

const keep = () => {
  if (state.value !== 'ready' || !sample.value) return;
  emit('pick', sample.value.workout_id);
  emit('close');
};
const cancel = () => { emit('remove'); emit('close'); };
</script>

<template>
  <ModalDialog labelledby="sample-preview-title" :max-width="720" :origin="origin" @close="emit('close')">
    <div class="sample-preview">
      <header>
        <GlyphTile name="database" tone="altitude" :size="36" aria-hidden="true" />
        <h2 id="sample-preview-title">{{ t.title }}</h2>
        <button type="button" class="x" :aria-label="t.close" @click="emit('close')">×</button>
      </header>
      <div v-if="choices.length" class="choices" role="radiogroup" :aria-label="t.pick">
        <button v-for="choice in choices" :key="choice.id" type="button" role="radio" :aria-checked="choice.id === selected"
          :class="['choice', { on: choice.id === selected }]" @click="selected = choice.id">{{ choice.label }}</button>
      </div>
      <div v-if="state === 'ready' && sample" class="facts">
        <span class="fact">{{ t.dropped(sample.dropped_fields.length) }}</span>
        <span class="fact">{{ t.masked(sample.masked_values) }}</span>
        <span class="fact">{{ t.size(kb) }}</span>
      </div>
      <div class="body" :aria-busy="state === 'loading'">
        <pre v-if="state === 'ready'" class="json" tabindex="0">{{ preview }}</pre>
        <p v-else-if="state === 'loading'" class="status skeleton" aria-live="polite">{{ t.loading }}</p>
        <p v-else class="status" role="status">{{ state === 'none' ? t.none : t.missing }}</p>
        <p v-if="state === 'ready' && truncated" class="more">{{ t.truncated }}</p>
      </div>
      <footer>
        <button type="button" class="button secondary" @click="cancel">{{ t.cancel }}</button>
        <button type="button" class="button primary" :disabled="state !== 'ready'" @click="keep">{{ t.keep }}</button>
      </footer>
    </div>
  </ModalDialog>
</template>

<style scoped>
.sample-preview { display: grid; gap: 14px; min-width: 0; }
header { display: flex; align-items: center; gap: 10px; min-width: 0; }
h2 { flex: 1 1 auto; min-width: 0; margin: 0; font-size: var(--fs-lg); font-weight: 700; overflow-wrap: anywhere; }
.x {
  display: inline-grid; place-items: center; flex: none; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 50%;
  background: none; color: var(--muted); font: 400 20px / 1 var(--font-sans); cursor: pointer; transition: background-color 160ms ease, color 160ms ease;
}
.x:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 8%, transparent); }
.choices { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.choice {
  max-width: 100%; min-height: 30px; padding: 4px 12px; border: 1px solid var(--line); border-radius: 999px; background: none;
  color: var(--muted); font-size: var(--fs-sm); line-height: 1.25; text-align: start; overflow-wrap: anywhere; cursor: pointer;
  transition: color 160ms ease, border-color 160ms ease, background-color 160ms ease;
}
.choice:hover { color: var(--ink); }
.choice.on { color: var(--ink); border-color: color-mix(in srgb, var(--accent) 60%, transparent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
.facts { display: flex; flex-wrap: wrap; gap: 6px 12px; }
.fact { color: var(--muted); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.fact + .fact::before { content: '·'; margin-inline-end: 12px; color: var(--subtle); }
.body { display: grid; gap: 6px; min-width: 0; }
.json {
  max-height: min(46vh, 420px); margin: 0; padding: 12px 14px; overflow: auto; border-radius: 12px;
  background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--ink);
  font: 400 var(--fs-xs) / 1.5 var(--font-mono); white-space: pre; tab-size: 2; overscroll-behavior: contain;
}
.json:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.status { margin: 0; padding: 28px 14px; border-radius: 12px; background: color-mix(in srgb, var(--ink) 5%, transparent); color: var(--muted); font-size: var(--fs-sm); text-align: center; }
.skeleton { animation: sample-pulse 1.4s ease-in-out infinite alternate; }
@keyframes sample-pulse { from { opacity: .55; } to { opacity: 1; } }
.more { margin: 0; color: var(--subtle); font-size: var(--fs-xs); }
footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
footer .button { min-height: 36px; }
@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } .choice, .x { transition: none; } }
</style>

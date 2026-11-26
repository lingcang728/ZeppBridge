<script setup lang="ts">
/**
 * 信纸底行的「结构样本」小标签：和「诊断报告」并排，同一套细框墨水色。
 *
 * 没附时点一下：附上最近一次运动的结构样本（库里没有可附的就打开预览，里面说清楚）。
 * 附上以后标签写「已附 N 份结构样本」，再点就从标签里长出预览（ModalDialog，玻璃面板、原路缩回），
 * 能多勾几次运动（最多 LETTER_SAMPLES_MAX 次）、先看样本内容再寄。旁边的 × 去掉样本。样本本身由后端按脱敏规则现做，界面只记运动编号。
 */
import { computed, defineAsyncComponent, ref } from 'vue';
import Icon from '../Icon.vue';
import { backend } from '../../lib/bridge';
import { useSampleText } from './sample.i18n';

const SamplePreview = defineAsyncComponent(() => import('./SamplePreview.vue'));

const props = defineProps<{ sample: { workoutIds: string[] } | null; busy: boolean }>();
const emit = defineEmits<{ (event: 'update:sample', sample: { workoutIds: string[] } | null): void }>();
const t = useSampleText();

const tag = ref<HTMLElement | null>(null);
const previewing = ref(false);
const loading = ref(false);

const press = async () => {
  if (props.busy || loading.value) return;
  if (props.sample) {
    previewing.value = true;
    return;
  }
  loading.value = true;
  try {
    const latest = await backend.workoutStructureSample(null);
    if (latest) emit('update:sample', { workoutIds: [latest.workout_id] });
    else previewing.value = true;
  } catch {
    previewing.value = true;
  } finally {
    loading.value = false;
  }
};
const pick = (workoutIds: string[]) => emit('update:sample', workoutIds.length ? { workoutIds } : null);
const count = computed(() => props.sample?.workoutIds.length ?? 0);
const label = computed(() => (count.value > 1 ? t.value.attachedMany(count.value) : count.value ? t.value.attached : t.value.short));
const drop = () => emit('update:sample', null);
</script>

<template>
  <div class="sample">
    <button ref="tag" type="button" :class="['sample-tag', { picked: sample }]" :title="t.hint" :aria-label="sample ? label : t.attach"
      aria-haspopup="dialog" :aria-busy="loading" :disabled="busy" @click="press">
      <Icon name="table" :size="14" />
      <span class="sample-label">{{ label }}</span>
    </button>
    <button v-if="sample" type="button" class="sample-drop" :aria-label="t.remove" :title="t.remove" :disabled="busy" @click="drop">×</button>
    <SamplePreview v-if="previewing" :origin="tag" :workout-ids="sample?.workoutIds ?? []" @pick="pick" @remove="drop" @close="previewing = false" />
  </div>
</template>

<style scoped>
.sample { position: relative; display: inline-flex; align-items: center; min-width: 0; max-width: 100%; }
.sample-tag {
  display: inline-flex; align-items: center; gap: 5px; min-width: 0; max-width: 100%; height: 26px; padding: 0 10px;
  border: 1px solid rgb(60 50 40 / .22); border-radius: 13px; background: none; cursor: pointer; white-space: nowrap;
  color: rgb(60 50 40 / .62); font: 500 var(--fs-xs) / 1 var(--font-sans);
  transition: color 160ms ease, border-color 160ms ease, background-color 160ms ease;
}
.sample-tag:hover:not(:disabled) { color: var(--letter-ink, #24467e); border-color: color-mix(in srgb, var(--letter-ink, #24467e) 45%, transparent); }
.sample-tag.picked { color: var(--letter-ink, #24467e); border-color: color-mix(in srgb, var(--letter-ink, #24467e) 55%, transparent); background: color-mix(in srgb, var(--letter-ink, #24467e) 6%, transparent); }
.sample-tag:disabled { opacity: .55; cursor: default; }
.sample-tag[aria-busy="true"] { cursor: progress; }
.sample-label { overflow: hidden; text-overflow: ellipsis; }
.sample-drop {
  display: inline-grid; place-items: center; width: 22px; height: 22px; margin-inline-start: 2px; padding: 0; border: 0; border-radius: 50%;
  background: none; color: var(--paper-muted); font: 400 16px / 1 var(--font-sans); cursor: pointer; transition: color 160ms ease, background-color 160ms ease;
}
.sample-drop:hover:not(:disabled) { color: var(--paper-ink); background: rgb(120 95 60 / .1); }
.sample-tag:focus-visible, .sample-drop:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .sample-tag, .sample-drop { transition: none; } }
</style>

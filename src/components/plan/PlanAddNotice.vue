<script setup lang="ts">
/**
 * 加训练的结果一句话，以及导入文件时缺的那个数（FTP / 阈值配速）就地问一句。
 * 和页里别的通知同一种样式（ai-message），不弹窗。
 */
import { computed, nextTick, ref, watch } from 'vue';
import Icon from '../Icon.vue';
import type { ImportNeed } from '../../lib/trainingPlan/importWorkout';
import type { PlanAddOutcome } from '../../composables/usePlanAdd';
import { useLibraryText } from './library.i18n';
import { usePlanText } from './usePlanText';

const props = defineProps<{ outcome: PlanAddOutcome | null; need: ImportNeed | null }>();
const emit = defineEmits<{ supply: [value: number]; cancel: []; dismiss: [] }>();
const l = useLibraryText();
const { t: pt } = usePlanText();
const input = ref<HTMLInputElement | null>(null);
const draft = ref('');

watch(() => props.need, async (need) => {
  draft.value = '';
  if (need) { await nextTick(); input.value?.focus(); }
});

/** FTP：50–600 瓦；阈值配速：每公里 2:00–15:00，写成 `4:30`。 */
const parsed = computed<number | null>(() => {
  const text = draft.value.trim();
  if (props.need === 'ftp') {
    const watts = Number(text);
    return Number.isFinite(watts) && watts >= 50 && watts <= 600 ? Math.round(watts) : null;
  }
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(text);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds >= 120 && seconds <= 900 ? seconds : null;
});
const submit = () => { if (parsed.value !== null) emit('supply', parsed.value); };

const text = computed(() => {
  const m = props.outcome;
  if (!m) return '';
  switch (m.kind) {
    case 'saved': return l.value.saved;
    case 'save_failed': return l.value.saveFailed;
    case 'added': {
      const notes = m.notes.map((note) => ({ single_value_band: l.value.noteBand, targets_dropped: l.value.noteDropped, short_steps_padded: l.value.notePadded })[note]);
      return [l.value.added(m.name), ...notes].join(' · ');
    }
    case 'failed': return {
      unreadable: l.value.failUnreadable, not_a_workout: l.value.failNotWorkout, unsupported_sport: l.value.failSport,
      zone_targets: l.value.failZones, unsupported_step: l.value.failStep, empty: l.value.failEmpty,
    }[m.failure];
  }
  return '';
});
</script>

<template>
  <form v-if="need" class="ai-message need" @submit.prevent="submit">
    <Icon name="info" :size="14" />
    <label for="plan-need-input">{{ need === 'ftp' ? l.needFtp : l.needPace }}</label>
    <input id="plan-need-input" ref="input" v-model="draft" class="ai-input" :inputmode="need === 'ftp' ? 'numeric' : 'text'" :placeholder="need === 'ftp' ? '250' : '4:30'" autocomplete="off" @keydown.esc.stop="emit('cancel')" />
    <button type="submit" class="pill-button" :disabled="parsed === null">{{ l.needGo }}</button>
    <button type="button" class="pill-button quiet" @click="emit('cancel')">{{ l.needCancel }}</button>
  </form>
  <div v-else-if="text" class="ai-message" :class="{ bad: outcome?.kind === 'failed' || outcome?.kind === 'save_failed' }" role="status">
    <Icon :name="outcome?.kind === 'failed' ? 'warning' : 'info'" :size="14" /><span>{{ text }}</span>
    <button type="button" class="pill-button quiet" @click="emit('dismiss')">{{ pt.dismiss }}</button>
  </div>
</template>

<style scoped>
.need { flex-wrap: wrap; }
.need .ai-input { width: 7em; min-height: 32px; }
.bad { color: var(--danger); }
</style>

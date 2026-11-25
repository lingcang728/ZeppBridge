<script setup lang="ts">
/**
 * 五张小脸：难过 → 很好。点一张选上、再点取消；选了一张时其余变灰。
 * `labeled`：脸下面写字（首页打卡）；不写字时名字放进 title / aria-label。
 */
import { MOODS } from './journalCodes';
import MoodFace from './MoodFace.vue';
import { useSleepJournalText } from './sleepJournal.i18n';
import type { WakeMood } from '../../types/sleepJournal';

withDefaults(defineProps<{ modelValue: WakeMood | null; size?: number; labeled?: boolean; disabled?: boolean }>(), { size: 32, labeled: false, disabled: false });
const emit = defineEmits<{ 'update:modelValue': [WakeMood | null] }>();
const t = useSleepJournalText();
</script>

<template>
  <span :class="['mood-row', { picked: modelValue, labeled }]" role="radiogroup" :aria-label="t.moodLabel">
    <button
      v-for="mood in MOODS" :key="mood.code" type="button" role="radio"
      :class="['mood-pick', { on: modelValue === mood.code }]" :aria-checked="modelValue === mood.code"
      :aria-label="t.mood[mood.key]" :title="labeled ? undefined : t.mood[mood.key]" :disabled="disabled"
      @click="emit('update:modelValue', modelValue === mood.code ? null : mood.code)"
    >
      <MoodFace :code="mood.code" :size="size" />
      <span v-if="labeled" class="mood-name">{{ t.mood[mood.key] }}</span>
    </button>
  </span>
</template>

<style scoped>
.mood-row { display: flex; gap: 2px; }
.mood-row.labeled { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; padding: 6px; border-radius: 18px;
  background: color-mix(in srgb, var(--ink) 5%, transparent); }
.mood-pick { display: grid; justify-items: center; gap: 6px; min-width: 0; padding: 2px; border: 0; border-radius: 999px; background: none; color: var(--muted); font: inherit; cursor: pointer; }
.labeled .mood-pick { padding: 10px 4px 9px; border-radius: 14px; transition: background var(--dur-fast, 140ms) ease; }
.mood-pick :deep(.mood-face) { transition: transform 320ms cubic-bezier(.3, 1.6, .5, 1), filter 260ms ease; }
.mood-pick:hover:not(:disabled) :deep(.mood-face) { transform: translateY(-2px) scale(1.06); }
.picked .mood-pick:not(.on) :deep(.mood-face) { filter: grayscale(.85) opacity(.45); }
.mood-pick.on :deep(.mood-face) { transform: scale(1.14); }
.labeled .mood-pick.on { background: var(--mat-raised, var(--mat-card)); box-shadow: 0 2px 10px rgb(0 0 0 / .08); }
.mood-name { max-width: 100%; overflow: hidden; font-size: var(--fs-sm); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.mood-pick.on .mood-name { color: var(--ink); }
.mood-pick:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.mood-pick:disabled { cursor: default; }
@media (prefers-reduced-motion: reduce) { .mood-pick :deep(.mood-face) { transition: none; } }
</style>

<script setup lang="ts">
/**
 * 今日一问「昨晚睡得怎么样」展开后、问题上面的一条：昨晚 · 五张小脸 · 常见的几个睡前标签。
 * 点一下就记（和首页打卡、睡眠列表是同一份），记的内容自动接在问题后面一起交给 AI。
 */
import { computed, onMounted } from 'vue';
import Icon from '../Icon.vue';
import MoodRow from './MoodRow.vue';
import TagChips from './TagChips.vue';
import { FREQUENT, sortCodes } from './journalCodes';
import { useSleepJournalText } from './sleepJournal.i18n';
import { useSleepJournal } from '../../composables/useSleepJournal';
import type { BedtimeCode, WakeMood } from '../../types/sleepJournal';

const props = defineProps<{ date: string }>();
const t = useSleepJournalText();
const journal = useSleepJournal();
onMounted(() => { void journal.loadRange(props.date, props.date); });

const entry = computed(() => journal.entries.value.get(props.date) ?? null);
const mood = computed(() => entry.value?.mood ?? null);
const tags = computed(() => entry.value?.behaviors ?? []);
/** 常见的 6 个，加上已经勾了但不在里面的。 */
const codes = computed(() => {
  const base = FREQUENT.slice(0, 6);
  return [...base, ...tags.value.filter((code) => !base.includes(code))];
});

const setMood = (next: WakeMood | null) => { journal.saveSoon(props.date, tags.value, next); };
const toggle = (code: BedtimeCode) => {
  const next = tags.value.includes(code) ? tags.value.filter((c) => c !== code) : sortCodes([...tags.value, code]);
  journal.saveSoon(props.date, next, mood.value);
};
</script>

<template>
  <div class="last-night" role="group" :aria-label="t.aria">
    <span class="ln-who"><Icon name="moon" :size="16" />{{ t.lastNight }}</span>
    <MoodRow :model-value="mood" :size="28" @update:model-value="setMood" />
    <span class="ln-sep" aria-hidden="true"></span>
    <TagChips :selected="tags" :codes="codes" class="ln-tags" @toggle="toggle" />
  </div>
</template>

<style scoped>
.last-night { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; padding: 10px 12px; border-radius: 16px;
  background: color-mix(in srgb, var(--ink) 5%, transparent); }
.ln-who { display: inline-flex; align-items: center; gap: 7px; color: var(--ink); font-size: var(--fs-sm); font-weight: 700; white-space: nowrap; }
.ln-who :deep(svg) { color: var(--sleep); }
.ln-sep { width: 1px; height: 22px; background: var(--mat-line); }
.ln-tags { flex: 1 1 260px; }
.ln-tags :deep(.tag-chip) { min-height: 30px; padding-block: 3px; background: var(--mat-card); }
.ln-tags :deep(.tag-chip.on) { background: var(--mat-raised); }
</style>

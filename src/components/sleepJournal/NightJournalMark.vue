<script setup lang="ts">
/**
 * 睡眠列表每一晚的小标记（钉在那一行时间轴横线的正中，见 SleepNightMark）：醒来的脸 + 最多 3 个睡前标签图标；没记是一枚虚线「+」。
 * 带实底，盖住下面那段线。
 * 点它就地弹出浮层改这一晚（点一下就存，和首页打卡、今日一问是同一份），不进详情页。
 */
import { computed, ref } from 'vue';
import GlassPopover from '../GlassPopover.vue';
import BedtimeIcon from './BedtimeIcon.vue';
import MoodFace from './MoodFace.vue';
import MoodRow from './MoodRow.vue';
import TagChips from './TagChips.vue';
import { sortCodes } from './journalCodes';
import { useSleepJournalText } from './sleepJournal.i18n';
import { isBlank, useSleepJournal } from '../../composables/useSleepJournal';
import type { BedtimeCode, WakeMood } from '../../types/sleepJournal';

const props = defineProps<{ date: string; label: string }>();
const t = useSleepJournalText();
const journal = useSleepJournal();
const button = ref<HTMLElement | null>(null);
const open = ref(false);
const titleId = `night-journal-${props.date}`;

const entry = computed(() => journal.entries.value.get(props.date) ?? null);
const blank = computed(() => isBlank(entry.value));
const mood = computed(() => entry.value?.mood ?? null);
const tags = computed(() => entry.value?.behaviors ?? []);

const show = (event: Event) => { event.preventDefault(); event.stopPropagation(); open.value = true; };
const setMood = (next: WakeMood | null) => { journal.saveSoon(props.date, tags.value, next); };
const toggle = (code: BedtimeCode) => {
  const next = tags.value.includes(code) ? tags.value.filter((c) => c !== code) : sortCodes([...tags.value, code]);
  journal.saveSoon(props.date, next, mood.value);
};
</script>

<template>
  <button
    ref="button" type="button" :class="['journal-mark', { blank }]" :aria-label="blank ? t.markAdd : t.markEdit" :title="blank ? t.markAdd : t.markEdit"
    :aria-expanded="open" @click="show" @pointerdown.stop @keydown.enter.stop @keydown.space.stop
  >
    <template v-if="blank"><span aria-hidden="true" class="nm-plus">+</span></template>
    <template v-else>
      <MoodFace v-if="mood" :code="mood" :size="24" />
      <BedtimeIcon v-for="code in tags.slice(0, 3)" :key="code" :code="code" :size="22" />
    </template>
  </button>
  <GlassPopover v-if="open" :anchor="button" :labelledby="titleId" :width="380" @close="open = false">
    <div class="nm-pop" data-pop-item>
      <h4 :id="titleId">{{ label }}</h4>
      <MoodRow :model-value="mood" :size="34" @update:model-value="setMood" />
      <TagChips :selected="tags" @toggle="toggle" />
    </div>
  </GlassPopover>
</template>

<style scoped>
.journal-mark { display: inline-flex; flex: none; align-items: center; justify-content: center; gap: 3px; min-width: 30px; height: 32px; padding: 2px 9px 2px 5px; border: 0; border-radius: 999px;
  background: var(--mat-card-solid); box-shadow: inset 0 0 0 1px var(--mat-line), 0 2px 6px -2px rgb(0 0 0 / .18);
  color: var(--subtle); font: inherit; cursor: pointer; transition: box-shadow var(--dur-fast, 140ms) ease, color var(--dur-fast, 140ms) ease, transform var(--dur-fast, 140ms) ease; }
.journal-mark:hover { box-shadow: inset 0 0 0 1px var(--line-strong), 0 4px 10px -3px rgb(0 0 0 / .22); transform: translateY(-1px); }
.journal-mark:focus-visible, .journal-mark.blank:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.journal-mark.blank { width: 26px; min-width: 0; height: 26px; padding: 0; box-shadow: none; outline: 1.5px dashed color-mix(in srgb, var(--subtle) 70%, transparent); outline-offset: -1.5px; }
.journal-mark.blank:hover { color: var(--ink); outline-color: var(--ink); box-shadow: none; }
.nm-plus { font-size: 17px; font-weight: 700; line-height: 1; }
.nm-pop { display: grid; gap: 12px; }
.nm-pop h4 { margin: 0; color: var(--ink); font-size: var(--fs-sm); font-weight: 700; }
</style>

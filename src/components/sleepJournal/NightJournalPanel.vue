<script setup lang="ts">
/**
 * 睡眠详情页时长卡中间那一块：这一晚几点睡着、几点醒（月亮 → 太阳，两头时间），下面是这晚的睡前日志
 * （醒来的脸和心情、带名字的睡前标签）。没记就是一枚虚线「+ 记一下」。
 * 点日志那一块就地弹出浮层改（点一下就存，和首页打卡、睡眠列表上的标记是同一份）。
 */
import { computed, ref, watch } from 'vue';
import GlassPopover from '../GlassPopover.vue';
import Icon from '../Icon.vue';
import BedtimeIcon from './BedtimeIcon.vue';
import MoodFace from './MoodFace.vue';
import MoodRow from './MoodRow.vue';
import TagChips from './TagChips.vue';
import { MOODS, sortCodes, TAG_BY_CODE } from './journalCodes';
import { useSleepJournalText } from './sleepJournal.i18n';
import { isBlank, useSleepJournal } from '../../composables/useSleepJournal';
import type { BedtimeCode, WakeMood } from '../../types/sleepJournal';

const props = defineProps<{
  /** 醒来那天（睡前日志按它记）。 */
  date: string;
  /** 浮层标题。 */
  label: string;
  asleep: string;
  awake: string;
  /** 两头时间合起来的一句（读屏用）。 */
  spanLabel: string;
  /** 只有主睡眠才记睡前日志（小睡不问）。 */
  journal?: boolean;
}>();
const t = useSleepJournalText();
const store = useSleepJournal();
const button = ref<HTMLElement | null>(null);
const open = ref(false);
const titleId = `night-panel-${props.date}`;

watch(() => [props.date, props.journal] as const, ([day, on]) => { if (on) void store.loadRange(day, day); }, { immediate: true });

const entry = computed(() => store.entries.value.get(props.date) ?? null);
const blank = computed(() => isBlank(entry.value));
const mood = computed(() => entry.value?.mood ?? null);
const tags = computed(() => entry.value?.behaviors ?? []);
const moodName = computed(() => {
  const key = MOODS.find((m) => m.code === mood.value)?.key;
  return key ? t.value.mood[key] : '';
});
const tagList = computed(() => tags.value.map((code) => TAG_BY_CODE.get(code)!).filter(Boolean));

const setMood = (next: WakeMood | null) => { store.saveSoon(props.date, tags.value, next); };
const toggle = (code: BedtimeCode) => {
  const next = tags.value.includes(code) ? tags.value.filter((c) => c !== code) : sortCodes([...tags.value, code]);
  store.saveSoon(props.date, next, mood.value);
};
</script>

<template>
  <div class="night-panel">
    <p class="np-span" role="img" :aria-label="spanLabel">
      <span class="np-end"><Icon name="moon" :size="16" /><b>{{ asleep }}</b></span>
      <span class="np-line" aria-hidden="true" />
      <span class="np-end"><b>{{ awake }}</b><Icon name="sun" :size="16" /></span>
    </p>
    <button
      v-if="journal" ref="button" type="button" :class="['np-journal', { blank }]" :aria-label="blank ? t.markAdd : t.markEdit"
      :aria-expanded="open" @click="open = true"
    >
      <template v-if="blank"><span class="np-plus" aria-hidden="true">+</span><span>{{ t.markAdd }}</span></template>
      <template v-else>
        <span v-if="mood" class="np-mood"><MoodFace :code="mood" :size="30" /><b>{{ moodName }}</b></span>
        <span v-for="tag in tagList" :key="tag.code" class="np-tag" :style="{ '--chip-tone': tag.color }"><BedtimeIcon :code="tag.code" :size="20" />{{ t.tag[tag.key] }}</span>
      </template>
    </button>
    <GlassPopover v-if="open" :anchor="button" :labelledby="titleId" :width="380" @close="open = false">
      <div class="np-pop" data-pop-item>
        <h4 :id="titleId">{{ label }}</h4>
        <MoodRow :model-value="mood" :size="34" @update:model-value="setMood" />
        <TagChips :selected="tags" @toggle="toggle" />
      </div>
    </GlassPopover>
  </div>
</template>

<style scoped>
.night-panel { display: grid; gap: 12px; align-content: center; min-width: 0; }
/* 两头时间：月亮 —— 太阳，中间一道睡眠色的细线。 */
.np-span { display: flex; align-items: center; gap: 10px; margin: 0; color: var(--ink); font-variant-numeric: tabular-nums; }
.np-end { display: inline-flex; flex: none; align-items: center; gap: 6px; font-size: var(--fs-md); }
.np-end b { font-weight: 700; }
.np-end :deep(svg) { color: var(--sleep); }
.np-line { flex: 1; min-width: 24px; height: 3px; border-radius: 999px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--sleep) 70%, transparent), color-mix(in srgb, var(--sleep) 25%, transparent)); }
.np-journal { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; padding: 8px 10px; border: 0; border-radius: 14px;
  background: color-mix(in srgb, var(--ink) 4%, transparent); color: var(--ink); font: inherit; text-align: start; cursor: pointer;
  transition: background var(--dur-fast, 140ms) ease, box-shadow var(--dur-fast, 140ms) ease; }
.np-journal:hover { background: color-mix(in srgb, var(--ink) 7%, transparent); }
.np-journal:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.np-journal.blank { justify-content: center; color: var(--subtle); font-size: var(--fs-sm); font-weight: 600;
  background: transparent; outline: 1.5px dashed color-mix(in srgb, var(--subtle) 60%, transparent); outline-offset: -1.5px; }
.np-journal.blank:hover { color: var(--ink); outline-color: var(--ink); }
.np-journal.blank:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.np-plus { font-size: 17px; font-weight: 700; line-height: 1; }
.np-mood { display: inline-flex; align-items: center; gap: 7px; padding-right: 4px; font-size: var(--fs-sm); }
.np-mood b { font-weight: 700; }
.np-tag { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px 3px 5px; border-radius: 999px;
  background: color-mix(in srgb, var(--chip-tone) 12%, transparent); font-size: var(--fs-sm); font-weight: 600; white-space: nowrap; }
.np-pop { display: grid; gap: 12px; }
.np-pop h4 { margin: 0; color: var(--ink); font-size: var(--fs-sm); font-weight: 700; }
</style>

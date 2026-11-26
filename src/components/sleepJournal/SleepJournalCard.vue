<script setup lang="ts">
/**
 * 首页早安打卡：「昨晚睡了 7 小时 9 分，醒来感觉怎么样？」
 *
 * 先点一张脸，下面展开「睡前做了什么」（常见的 8 个 + 更多）；「记好了」才存，存完收成一行：脸和心情 + 勾的标签 + 改。
 * 问 ↔ 记好的一行之间整张卡的高度平滑过渡（量前后高度，只动 height）。
 * 码和 Zepp App 里那两项一样：在 Zepp 里记的同步时拉回来；这里记的只存本机，不写回 Zepp。
 *
 * 不纠缠：只问今天醒来的那一晚、醒来 18 小时内；记过、关掉、「这周别问」都不再出现。没有就整张不画。
 */
import { computed, nextTick, onMounted, ref } from 'vue';
import Icon from '../Icon.vue';
import MoodRow from './MoodRow.vue';
import MoodFace from './MoodFace.vue';
import BedtimeIcon from './BedtimeIcon.vue';
import TagChips from './TagChips.vue';
import { useSleepJournalText } from './sleepJournal.i18n';
import { useSleepJournal } from '../../composables/useSleepJournal';
import { useRevisionReload } from '../../composables/useRevisionReload';
import { formatDuration } from '../../lib/format';
import { MOODS, sortCodes, TAG_BY_CODE } from './journalCodes';
import { reducedMotion } from '../../lib/motion/cards';
import type { BedtimeCode, WakeMood } from '../../types/sleepJournal';

const t = useSleepJournalText();
const journal = useSleepJournal();
const { prompt } = journal;
const mood = ref<WakeMood | null>(null);
const tags = ref<BedtimeCode[]>([]);
const busy = ref(false);
/** 刚记好的那一晚：收成一行，直到点 × 或下次重读。 */
const done = ref<{ date: string } | null>(null);
const editing = ref(false);
const root = ref<HTMLElement | null>(null);

/** 换一种样子（问 ↔ 记好的一行）：整张卡的高度从旧值平滑过到新值。 */
const reshape = async (change: () => void) => {
  const el = root.value;
  const from = el?.getBoundingClientRect().height ?? 0;
  change();
  await nextTick();
  if (!el || !el.isConnected || reducedMotion()) return;
  const to = el.getBoundingClientRect().height;
  if (Math.abs(to - from) < 1) return;
  el.style.overflow = 'hidden';
  const grow = el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 420, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  const inner = el.firstElementChild;
  inner?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 80, easing: 'ease', fill: 'backwards' });
  await grow.finished.catch(() => undefined);
  el.style.overflow = '';
};

const reset = () => { mood.value = null; tags.value = []; };
const load = () => { if (!done.value && !mood.value) void journal.loadPrompt(); };
onMounted(load);
useRevisionReload(load);

const duration = computed(() => (prompt.value ? formatDuration(prompt.value.duration_minutes) : ''));
/** 标题里把时长染成睡眠色：按时长把句子劈成两半（各语言里时长都只出现一次）。 */
const title = computed(() => {
  const text = t.value.askTitle(duration.value);
  const at = text.indexOf(duration.value);
  return at < 0 ? { pre: text, em: '', post: '' } : { pre: text.slice(0, at), em: duration.value, post: text.slice(at + duration.value.length) };
});
const showAsk = computed(() => prompt.value && (!done.value || editing.value));

const toggle = (code: BedtimeCode) => {
  tags.value = tags.value.includes(code) ? tags.value.filter((c) => c !== code) : sortCodes([...tags.value, code]);
};

const save = async () => {
  const night = prompt.value;
  if (!night || busy.value) return;
  busy.value = true;
  try {
    await journal.save(night.date, tags.value, mood.value);
    await reshape(() => { done.value = { date: night.date }; editing.value = false; });
  } catch {
    // 没存上：卡留着，用户可以再点一次。
  } finally {
    busy.value = false;
  }
};

const edit = () => { void reshape(() => { editing.value = true; }); };
const close = () => { done.value = null; editing.value = false; prompt.value = null; reset(); };
const moodName = computed(() => {
  const key = MOODS.find((m) => m.code === mood.value)?.key;
  return key ? t.value.mood[key] : '';
});
const doneTags = computed(() => tags.value.map((code) => TAG_BY_CODE.get(code)!).filter(Boolean));
</script>

<template>
  <section v-if="prompt && (showAsk || done)" ref="root" :class="['journal-card', { compact: !showAsk }]" role="group" :aria-label="t.aria">
    <template v-if="showAsk">
      <header class="jc-head">
        <strong class="jc-ask">{{ title.pre }}<em v-if="title.em">{{ title.em }}</em>{{ title.post }}</strong>
        <span v-if="!editing" class="jc-tools">
          <button type="button" class="pill-button quiet" @click="journal.snooze()">{{ t.snooze }}</button>
          <button type="button" class="jc-close" :aria-label="t.dismiss" :title="t.dismiss" @click="journal.dismiss()"><Icon name="x" :size="15" /></button>
        </span>
      </header>
      <MoodRow v-model="mood" :size="44" labeled :disabled="busy" />
      <div :class="['jc-more', { open: mood !== null || tags.length > 0 || editing }]">
        <div class="jc-more-inner">
          <p class="jc-sub"><Icon name="moon" :size="16" />{{ t.beforeBed }}</p>
          <TagChips :selected="tags" collapsible large :disabled="busy" @toggle="toggle" />
          <div class="jc-foot">
            <button type="button" class="pill-button jc-save" :disabled="busy" @click="save">{{ t.save }}</button>
          </div>
        </div>
      </div>
    </template>
    <div v-else-if="done" class="jc-done">
      <span v-if="mood" class="jc-mood"><MoodFace :code="mood" :size="44" /><span><small>{{ t.moodLabel }}</small><b>{{ moodName }}</b></span></span>
      <span v-if="doneTags.length" class="jc-tags">
        <span v-for="tag in doneTags" :key="tag.code" class="jc-tag" :style="{ '--chip-tone': tag.color }"><BedtimeIcon :code="tag.code" :size="22" />{{ t.tag[tag.key] }}</span>
      </span>
      <button type="button" class="pill-button quiet jc-edit" @click="edit">{{ t.edit }}</button>
      <button type="button" class="jc-close" :aria-label="t.dismiss" @click="close"><Icon name="x" :size="15" /></button>
    </div>
  </section>
</template>

<style scoped>
/* 和跑后打分那张轻卡同一种中性小板：不抬卡板，概览的主角仍是下面的卡。 */
.journal-card { display: grid; gap: 12px; padding: 14px 16px; border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--ink) 4%, transparent); box-shadow: inset 0 0 0 1px var(--mat-line); }
.jc-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.jc-ask { flex: 1; min-width: 0; color: var(--ink); font-size: var(--fs-md); font-weight: 600; overflow-wrap: anywhere; }
.jc-ask em { color: var(--sleep); font-style: normal; font-variant-numeric: tabular-nums; }
.jc-tools { display: inline-flex; align-items: center; gap: 4px; flex: none; }
.jc-close { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border: 0; border-radius: 50%; background: transparent; color: var(--subtle); cursor: pointer; }
.jc-close:hover { background: var(--glass-press); color: var(--ink); }
.jc-close:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
/* 选了脸才长出下半截：高度用 grid 行 0fr → 1fr 过渡，不量高度。 */
.jc-more { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 480ms cubic-bezier(.2, .8, .2, 1), opacity 360ms ease 80ms; }
.jc-more.open { grid-template-rows: 1fr; opacity: 1; }
.jc-more-inner { display: grid; gap: 10px; min-height: 0; overflow: hidden; }
.jc-more:not(.open) .jc-more-inner { visibility: hidden; }
/* 和标题同字号同字重：两问是同一张卡上的两句。 */
.jc-sub { display: flex; align-items: center; gap: 8px; margin: 6px 2px 0; color: var(--ink); font-size: var(--fs-md); font-weight: 600; }
.jc-sub :deep(svg) { color: var(--sleep); }
.jc-foot { display: flex; justify-content: flex-end; }
.jc-save { background: var(--accent); color: var(--accent-ink, #fff); border-color: transparent; }
/* 记好的一行：大脸 + 心情名、带名字的标签，和打分卡收起后的那一行一样高，不缩成细条。 */
.journal-card.compact { padding: 12px 16px; }
.jc-done { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; min-width: 0; min-height: 52px; }
.jc-mood { display: inline-flex; align-items: center; gap: 10px; flex: none; }
.jc-mood > span { display: grid; gap: 1px; }
.jc-mood small { color: var(--subtle); font-size: var(--fs-xs); font-weight: 600; }
.jc-mood b { color: var(--ink); font-size: var(--fs-md); font-weight: 700; }
.jc-tags { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; padding-left: 16px; border-left: 1px solid var(--mat-line); }
.jc-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px 4px 6px; border-radius: 999px;
  background: color-mix(in srgb, var(--chip-tone) 12%, transparent); color: var(--ink); font-size: var(--fs-sm); font-weight: 600; white-space: nowrap; }
.jc-edit { margin-left: auto; }
@media (prefers-reduced-motion: reduce) { .jc-more { transition: none; } }
</style>

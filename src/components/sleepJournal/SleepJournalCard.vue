<script setup lang="ts">
/**
 * 首页早安打卡：「昨晚睡了 7 小时 9 分，醒来感觉怎么样？」
 *
 * 先点一张脸，下面展开「睡前做了什么」（常见的 8 个 + 更多）；「记好了」才存，存完收成一行：脸 + 勾的图标 + 写回 Zepp 没有 + 改。
 * 和 Zepp App 里那两项是同一份：这里记的同步时会写回 Zepp，在 Zepp 里记的也会拉回来。
 *
 * 不纠缠：只问今天醒来的那一晚、醒来 18 小时内；记过、关掉、「这周别问」都不再出现。没有就整张不画。
 */
import { computed, onMounted, ref } from 'vue';
import Icon from '../Icon.vue';
import MoodRow from './MoodRow.vue';
import MoodFace from './MoodFace.vue';
import BedtimeIcon from './BedtimeIcon.vue';
import TagChips from './TagChips.vue';
import { useSleepJournalText } from './sleepJournal.i18n';
import { useSleepJournal } from '../../composables/useSleepJournal';
import { useRevisionReload } from '../../composables/useRevisionReload';
import { formatDuration } from '../../lib/format';
import { sortCodes } from './journalCodes';
import type { BedtimeCode, SleepJournalSaved, WakeMood } from '../../types/sleepJournal';

const t = useSleepJournalText();
const journal = useSleepJournal();
const { prompt } = journal;
const mood = ref<WakeMood | null>(null);
const tags = ref<BedtimeCode[]>([]);
const busy = ref(false);
/** 刚记好的那一晚：收成一行，直到点 × 或下次重读。 */
const done = ref<{ date: string; zepp: SleepJournalSaved['zepp'] } | null>(null);
const editing = ref(false);

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
    const saved = await journal.save(night.date, tags.value, mood.value);
    done.value = { date: night.date, zepp: saved.zepp };
    editing.value = false;
  } catch {
    // 没存上：卡留着，用户可以再点一次。
  } finally {
    busy.value = false;
  }
};

const edit = () => { editing.value = true; };
const close = () => { done.value = null; editing.value = false; prompt.value = null; reset(); };
const statusText = computed(() => {
  const state = done.value?.zepp;
  return state === 'written' ? t.value.written : state === 'pending' ? t.value.pending : t.value.localOnly;
});
</script>

<template>
  <section v-if="prompt && (showAsk || done)" class="journal-card" role="group" :aria-label="t.aria">
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
          <TagChips :selected="tags" collapsible :disabled="busy" @toggle="toggle" />
          <div class="jc-foot">
            <button type="button" class="pill-button jc-save" :disabled="busy" @click="save">{{ t.save }}</button>
          </div>
        </div>
      </div>
    </template>
    <div v-else-if="done" class="jc-done">
      <MoodFace v-if="mood" :code="mood" :size="32" />
      <span v-if="tags.length" class="jc-icons"><BedtimeIcon v-for="code in tags" :key="code" :code="code" :size="24" /></span>
      <span :class="['jc-status', done.zepp]"><Icon :name="done.zepp === 'written' ? 'check' : 'info'" :size="14" />{{ statusText }}</span>
      <button type="button" class="pill-button quiet" @click="edit">{{ t.edit }}</button>
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
.jc-sub { display: flex; align-items: center; gap: 7px; margin: 4px 2px 0; color: var(--ink); font-size: var(--fs-sm); font-weight: 700; }
.jc-sub :deep(svg) { color: var(--sleep); }
.jc-foot { display: flex; justify-content: flex-end; }
.jc-save { background: var(--accent); color: var(--accent-ink, #fff); border-color: transparent; }
.jc-done { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; min-width: 0; }
.jc-icons { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.jc-status { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; color: var(--muted); font-size: var(--fs-sm); font-weight: 650; }
.jc-status.written { color: var(--accent); }
@media (prefers-reduced-motion: reduce) { .jc-more { transition: none; } }
</style>

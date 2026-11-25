<script setup lang="ts">
/**
 * 睡眠页的「睡前因素」：每个记过的睡前标签，有它的晚上和记过但没它的晚上比，评分 / 深睡 / 夜醒差多少。
 *
 * - 一行一个标签：图标 + 名字、几晚（小点）、从中线往两边长的条、差值。绿 = 睡得更好，红 = 更差（夜醒少才算好）。
 * - 两边都够数（后端 `min_nights`）才给差值；不够的放在下面一圈环里，「再记 N 晚」。
 * - 底下一行小字：只是一起出现，不一定是原因。一晚都没记过就整块不画。
 */
import { computed, onMounted, ref, watch } from 'vue';
import Icon from '../Icon.vue';
import SegmentTrack, { type SegmentItem } from '../SegmentTrack.vue';
import BedtimeIcon from './BedtimeIcon.vue';
import { TAG_BY_CODE } from './journalCodes';
import { useSleepJournalText } from './sleepJournal.i18n';
import { useSleepJournal } from '../../composables/useSleepJournal';
import { useRevisionReload } from '../../composables/useRevisionReload';
import type { SleepFactor } from '../../types/sleepJournal';

type Metric = 'score' | 'deep' | 'wake';
const t = useSleepJournalText();
const journal = useSleepJournal();
const metric = ref<Metric>('score');
onMounted(() => { void journal.loadFactors(); });
useRevisionReload(() => { void journal.loadFactors(); });
watch(journal.saves, () => { void journal.loadFactors(); });

const items = computed<SegmentItem<Metric>[]>(() => [
  { value: 'score', label: t.value.metricScore },
  { value: 'deep', label: t.value.metricDeep },
  { value: 'wake', label: t.value.metricWake },
]);
/** 条的满格：差这么多就画满半边。 */
const SCALE: Record<Metric, number> = { score: 10, deep: 25, wake: 3 };
const valueOf = (factor: SleepFactor, m: Metric) =>
  (m === 'score' ? factor.score_delta : m === 'deep' ? factor.deep_minutes_delta : factor.wake_count_delta);
/** 越大越好：夜醒反过来。 */
const goodness = (value: number, m: Metric) => (m === 'wake' ? -value : value);

const number = (value: number) => {
  const abs = Math.abs(value);
  const text = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${value > 0 ? '+' : value < 0 ? '−' : '±'}${text}`;
};
const unit = (value: number, m: Metric) => {
  const text = number(value);
  return m === 'score' ? t.value.scoreDelta(text) : m === 'deep' ? t.value.deepDelta(text) : t.value.wakeDelta(text);
};

const rows = computed(() => {
  const m = metric.value;
  const list = (journal.factors.value?.factors ?? [])
    .map((factor) => ({ factor, tag: TAG_BY_CODE.get(factor.behavior), value: valueOf(factor, m) }))
    .filter((row): row is { factor: SleepFactor; tag: NonNullable<typeof row.tag>; value: number } => row.tag !== undefined && row.value !== null);
  return list
    .sort((a, b) => goodness(a.value, m) - goodness(b.value, m))
    .map(({ factor, tag, value }) => {
      const good = goodness(value, m);
      const width = Math.min(Math.abs(value) / SCALE[m], 1) * 50;
      return {
        code: factor.behavior, key: tag.key, nights: factor.nights, text: unit(value, m),
        tone: good > 0 ? 'good' : good < 0 ? 'bad' : 'even',
        bar: { left: `${good >= 0 ? 50 : 50 - width}%`, width: `${Math.max(width, 1.2)}%` },
      };
    });
});
/** 还不够数的标签：有它的晚上少于 min_nights（基线不够的不列：那是记得还太少，不是这个标签的事）。 */
const waiting = computed(() => {
  const data = journal.factors.value;
  if (!data) return [];
  const min = data.min_nights;
  return data.factors
    .filter((factor) => factor.nights < min && TAG_BY_CODE.has(factor.behavior))
    .map((factor) => {
      const tag = TAG_BY_CODE.get(factor.behavior)!;
      const r = 8;
      const c = 2 * Math.PI * r;
      return { code: factor.behavior, key: tag.key, color: tag.color, need: min - factor.nights, dash: `${(c * factor.nights) / min} ${c}`, r };
    });
});
const visible = computed(() => (journal.factors.value?.journaled_nights ?? 0) > 0 && (rows.value.length > 0 || waiting.value.length > 0));
const dotsOf = (n: number) => Math.min(n, 9);
</script>

<template>
  <section v-if="visible" class="bedtime-factors" aria-labelledby="bedtime-factors-title">
    <header class="bf-head">
      <h3 id="bedtime-factors-title"><span class="bf-ic" aria-hidden="true"><Icon name="moon" :size="17" /></span>{{ t.factorsTitle }}</h3>
      <SegmentTrack v-if="rows.length" v-model="metric" :items="items" compact :aria-label="t.factorsTitle" />
    </header>
    <p v-if="rows.length" class="bf-sub">{{ t.factorsSub }}</p>
    <ul v-if="rows.length" class="bf-rows">
      <li v-for="row in rows" :key="row.code" class="bf-row">
        <span class="bf-name"><BedtimeIcon :code="row.code" :size="28" /><span>{{ t.tag[row.key] }}</span></span>
        <span class="bf-n" :title="t.nights(row.nights)"><i v-for="n in dotsOf(row.nights)" :key="n"></i><small>{{ row.nights }}</small></span>
        <span class="bf-bar" aria-hidden="true"><span :class="row.tone" :style="row.bar"></span></span>
        <b :class="['bf-v', row.tone]">{{ row.text }}</b>
      </li>
    </ul>
    <div v-if="waiting.length" :class="['bf-wait', { alone: !rows.length }]">
      <span v-for="item in waiting" :key="item.code" class="bf-wait-item">
        <BedtimeIcon :code="item.code" :size="22" />{{ t.tag[item.key] }}
        <svg class="bf-ring" viewBox="0 0 22 22" aria-hidden="true">
          <circle cx="11" cy="11" :r="item.r" fill="none" stroke="var(--mat-line)" stroke-width="3" />
          <circle cx="11" cy="11" :r="item.r" fill="none" :stroke="item.color" stroke-width="3" stroke-linecap="round" :stroke-dasharray="item.dash" transform="rotate(-90 11 11)" />
        </svg>
        <span class="bf-need">{{ t.needMore(item.need) }}</span>
      </span>
    </div>
    <p v-if="rows.length" class="bf-note">{{ t.caveat }}</p>
  </section>
</template>

<style scoped>
.bedtime-factors { display: grid; gap: 4px; margin-bottom: 14px; padding: 18px 20px; border-radius: var(--radius-lg);
  background: var(--mat-card); box-shadow: var(--mat-rim, inset 0 0 0 1px var(--mat-line)), var(--mat-shadow, none); }
.bf-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.bf-head h3 { display: flex; align-items: center; gap: 10px; margin: 0; color: var(--ink); font-size: var(--fs-lg); }
.bf-ic { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: color-mix(in srgb, var(--sleep) 14%, transparent); color: var(--sleep); }
.bf-sub { margin: 0 0 8px 42px; color: var(--subtle); font-size: var(--fs-xs); font-weight: 600; }
.bf-rows { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.bf-row { display: grid; grid-template-columns: minmax(120px, 190px) 108px minmax(80px, 1fr) minmax(72px, auto); align-items: center; gap: 14px; padding: 8px 6px; border-radius: 12px; }
.bf-row:hover { background: color-mix(in srgb, var(--ink) 4%, transparent); }
.bf-name { display: flex; align-items: center; gap: 10px; min-width: 0; color: var(--ink); font-size: var(--fs-sm); font-weight: 700; }
.bf-name > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bf-n { display: flex; align-items: center; gap: 3px; white-space: nowrap; }
.bf-n i { width: 6px; height: 6px; border-radius: 50%; background: var(--subtle); opacity: .45; }
.bf-n small { margin-left: 4px; color: var(--subtle); font-size: var(--fs-xs); font-weight: 700; font-variant-numeric: tabular-nums; }
.bf-bar { position: relative; height: 14px; }
.bf-bar::before { content: ""; position: absolute; top: -4px; bottom: -4px; left: 50%; width: 1.5px; background: var(--mat-line); }
.bf-bar > span { position: absolute; top: 2px; height: 10px; border-radius: 6px; background: var(--subtle);
  transition: left 480ms cubic-bezier(.2, .8, .2, 1), width 480ms cubic-bezier(.2, .8, .2, 1); }
.bf-bar > span.good { background: var(--accent); }
.bf-bar > span.bad { background: var(--danger); }
.bf-v { color: var(--muted); font-size: var(--fs-sm); font-weight: 800; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.bf-v.good { color: var(--accent); }
.bf-v.bad { color: var(--danger); }
.bf-wait { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; padding-top: 12px; border-top: 1px dashed var(--mat-line); }
.bf-wait.alone { margin-top: 6px; padding-top: 0; border-top: 0; }
.bf-wait-item { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px 5px 6px; border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 5%, transparent); color: var(--muted); font-size: var(--fs-xs); font-weight: 700; }
.bf-ring { width: 20px; height: 20px; }
.bf-need { color: var(--subtle); }
.bf-note { margin: 8px 0 0; color: var(--subtle); font-size: var(--fs-xs); font-weight: 600; text-align: right; }
@container (max-width: 560px) {
  .bf-row { grid-template-columns: minmax(0, 1fr) minmax(60px, 1fr) auto; }
  .bf-n { display: none; }
}
@media (prefers-reduced-motion: reduce) { .bf-bar > span { transition: none; } }
</style>

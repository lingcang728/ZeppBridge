<script setup lang="ts">
/**
 * 睡眠页的「睡前因素」：每个记过的睡前标签，有它的晚上和记过但没它的晚上比，评分 / 深睡 / 夜里醒来差多少。
 *
 * 睡眠页的主角是下面每一晚的记录，这块默认收成一行：标题 + 最好、最差的那一项；点一下展开（记住开合）。
 * - 展开后一行一个标签：图标 + 名字、几晚（小点）、从中线往两边长的条、差值。绿 = 睡得更好，红 = 更差（醒得少才算好）。
 * - 两边都够数（后端 `min_nights`）才给差值；不够的放在下面一圈环里，「再记 N 晚」。一晚都没记过就整块不画。
 * - 开合：网格行 0fr ↔ 1fr 过渡，不量高度。
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
const OPEN_KEY = 'zb.sleep.factorsOpen';
const t = useSleepJournalText();
const journal = useSleepJournal();
const metric = ref<Metric>('score');
const open = ref((() => { try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; } })());
watch(open, (value) => { try { localStorage.setItem(OPEN_KEY, value ? '1' : '0'); } catch { /* 记不住就算了 */ } });
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
/** 越大越好：夜里醒来反过来。 */
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

const rowsFor = (m: Metric) => (journal.factors.value?.factors ?? [])
  .map((factor) => ({ factor, tag: TAG_BY_CODE.get(factor.behavior), value: valueOf(factor, m) }))
  .filter((row): row is { factor: SleepFactor; tag: NonNullable<typeof row.tag>; value: number } => row.tag !== undefined && row.value !== null)
  .sort((a, b) => goodness(a.value, m) - goodness(b.value, m))
  .map(({ factor, tag, value }) => {
    const good = goodness(value, m);
    const width = Math.min(Math.abs(value) / SCALE[m], 1) * 50;
    return {
      code: factor.behavior, key: tag.key, nights: factor.nights, text: unit(value, m), good,
      tone: good > 0 ? 'good' : good < 0 ? 'bad' : 'even',
      bar: { left: `${good >= 0 ? 50 : 50 - width}%`, width: `${Math.max(width, 1.2)}%` },
    };
  });
const rows = computed(() => rowsFor(metric.value));
/** 收起时那一行：按评分，最差的一项和最好的一项（只有一边就只出那一边）。 */
const summary = computed(() => {
  const list = rowsFor('score');
  const worst = list[0]?.good !== undefined && list[0].good < 0 ? list[0] : null;
  const best = list.length && list[list.length - 1]!.good > 0 ? list[list.length - 1]! : null;
  return [worst, best].filter((row): row is NonNullable<typeof row> => row !== null);
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
  <section v-if="visible" :class="['bedtime-factors', { open }]" aria-labelledby="bedtime-factors-title">
    <header class="bf-head">
      <button type="button" class="bf-toggle" :aria-expanded="open" aria-controls="bedtime-factors-body" @click="open = !open">
        <span class="bf-ic" aria-hidden="true"><Icon name="moon" :size="16" /></span>
        <h3 id="bedtime-factors-title">{{ t.factorsTitle }}</h3>
        <span v-if="!open" class="bf-summary">
          <span v-for="row in summary" :key="row.code" :class="['bf-pill', row.tone]">
            <BedtimeIcon :code="row.code" :size="20" /><span>{{ t.tag[row.key] }}</span><b>{{ row.text }}</b>
          </span>
        </span>
        <Icon class="bf-chev" name="chevron-down" :size="16" />
      </button>
      <SegmentTrack v-if="open && rows.length" v-model="metric" :items="items" compact :aria-label="t.factorsTitle" />
    </header>
    <div id="bedtime-factors-body" class="bf-body" :inert="!open || undefined">
      <div class="bf-inner">
        <p v-if="rows.length" class="bf-sub">{{ t.factorsSub }}</p>
        <ul v-if="rows.length" class="bf-rows">
          <li v-for="row in rows" :key="row.code" class="bf-row">
            <span class="bf-name"><BedtimeIcon :code="row.code" :size="24" /><span>{{ t.tag[row.key] }}</span></span>
            <span class="bf-n" :title="t.nights(row.nights)"><i v-for="n in dotsOf(row.nights)" :key="n"></i><small>{{ row.nights }}</small></span>
            <span class="bf-bar" aria-hidden="true"><span :class="row.tone" :style="row.bar"></span></span>
            <b :class="['bf-v', row.tone]">{{ row.text }}</b>
          </li>
        </ul>
        <div v-if="waiting.length" :class="['bf-wait', { alone: !rows.length }]">
          <span v-for="item in waiting" :key="item.code" class="bf-wait-item">
            <BedtimeIcon :code="item.code" :size="20" />{{ t.tag[item.key] }}
            <svg class="bf-ring" viewBox="0 0 22 22" aria-hidden="true">
              <circle cx="11" cy="11" :r="item.r" fill="none" stroke="var(--mat-line)" stroke-width="3" />
              <circle cx="11" cy="11" :r="item.r" fill="none" :stroke="item.color" stroke-width="3" stroke-linecap="round" :stroke-dasharray="item.dash" transform="rotate(-90 11 11)" />
            </svg>
            <span class="bf-need">{{ t.needMore(item.need) }}</span>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 收起时是一条轻板（和列表行一样高），不抢下面每一晚的记录；展开才是一张卡的分量。 */
.bedtime-factors { display: grid; margin-bottom: 14px; padding: 6px 8px; border-radius: var(--radius-lg);
  background: var(--mat-card); box-shadow: var(--mat-rim, inset 0 0 0 1px var(--mat-line)), var(--mat-shadow, none);
  transition: padding 420ms cubic-bezier(.2, .8, .2, 1); }
.bedtime-factors.open { padding: 8px 12px 14px; }
.bf-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.bf-toggle { display: flex; flex: 1; align-items: center; gap: 10px; min-width: 0; min-height: 48px; padding: 6px 10px; border: 0; border-radius: 14px;
  background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: background 140ms ease; }
.bf-toggle:hover { background: color-mix(in srgb, var(--ink) 4%, transparent); }
.bf-toggle:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.bf-toggle h3 { flex: none; margin: 0; font-size: var(--fs-md); font-weight: 700; }
.bf-ic { display: grid; flex: none; place-items: center; width: 30px; height: 30px; border-radius: 10px; background: color-mix(in srgb, var(--sleep) 14%, transparent); color: var(--sleep); }
.bf-summary { display: flex; flex: 1; flex-wrap: wrap; gap: 6px; min-width: 0; margin-left: 6px; }
.bf-pill { display: inline-flex; align-items: center; gap: 6px; min-width: 0; padding: 3px 11px 3px 6px; border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 5%, transparent); color: var(--muted); font-size: var(--fs-sm); font-weight: 600; white-space: nowrap; }
.bf-pill > span { overflow: hidden; text-overflow: ellipsis; }
.bf-pill b { font-weight: 800; font-variant-numeric: tabular-nums; }
.bf-pill.good b { color: var(--accent); }
.bf-pill.bad b { color: var(--danger); }
.bf-chev { flex: none; margin-left: auto; color: var(--subtle); transition: rotate 320ms cubic-bezier(.2, .8, .2, 1); }
.open .bf-chev { rotate: 180deg; }
.bf-body { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 460ms cubic-bezier(.2, .8, .2, 1), opacity 300ms ease; }
.open .bf-body { grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows 460ms cubic-bezier(.2, .8, .2, 1), opacity 340ms ease 100ms; }
.bf-inner { min-height: 0; overflow: hidden; }
.bf-sub { margin: 2px 0 6px 50px; color: var(--subtle); font-size: var(--fs-xs); font-weight: 600; }
/* 条那一栏有上限：屏幕再宽也不拉成横跨整页的一长条，差值紧跟在条后面。 */
.bf-rows { display: grid; gap: 0; margin: 0; padding: 0 8px; list-style: none; }
.bf-row { display: grid; grid-template-columns: minmax(110px, 170px) 96px minmax(80px, 440px) minmax(72px, auto); justify-content: start; align-items: center; gap: 14px; padding: 5px 6px; border-radius: 10px; }
.bf-row:hover { background: color-mix(in srgb, var(--ink) 4%, transparent); }
.bf-name { display: flex; align-items: center; gap: 9px; min-width: 0; color: var(--ink); font-size: var(--fs-sm); font-weight: 650; }
.bf-name > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bf-n { display: flex; align-items: center; gap: 3px; white-space: nowrap; }
.bf-n i { width: 5px; height: 5px; border-radius: 50%; background: var(--subtle); opacity: .45; }
.bf-n small { margin-left: 4px; color: var(--subtle); font-size: var(--fs-xs); font-weight: 700; font-variant-numeric: tabular-nums; }
.bf-bar { position: relative; height: 12px; }
.bf-bar::before { content: ""; position: absolute; top: -4px; bottom: -4px; left: 50%; width: 1.5px; background: var(--mat-line); }
.bf-bar > span { position: absolute; top: 3px; height: 6px; border-radius: 4px; background: var(--subtle);
  transition: left 480ms cubic-bezier(.2, .8, .2, 1), width 480ms cubic-bezier(.2, .8, .2, 1); }
.bf-bar > span.good { background: var(--accent); }
.bf-bar > span.bad { background: var(--danger); }
.bf-v { color: var(--muted); font-size: var(--fs-sm); font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
.bf-v.good { color: var(--accent); }
.bf-v.bad { color: var(--danger); }
.bf-wait { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 8px 0; padding-top: 12px; border-top: 1px dashed var(--mat-line); }
.bf-wait.alone { margin-top: 6px; padding-top: 0; border-top: 0; }
.bf-wait-item { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px 5px 6px; border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 5%, transparent); color: var(--muted); font-size: var(--fs-xs); font-weight: 700; }
.bf-ring { width: 20px; height: 20px; }
.bf-need { color: var(--subtle); }
@container (max-width: 560px) {
  .bf-row { grid-template-columns: minmax(0, 1fr) minmax(60px, 1fr) auto; }
  .bf-n { display: none; }
  .bf-summary { display: none; }
}
@media (prefers-reduced-motion: reduce) { .bf-bar > span, .bf-body, .bf-chev, .bedtime-factors { transition: none; } }
</style>

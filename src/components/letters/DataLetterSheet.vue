<script setup lang="ts">
/**
 * 「你的信」拆开后写在信纸上的那一页（LetterEnvelope 的 #sheet 插槽里画）：
 * 每周来信——信头是那一周，下面一行一个数，后面跟着和前四周比；
 * 时间胶囊——信头是写下那天，然后是当时写的话（蓝墨水，是自己的字），再是写下时和开封时的对照。
 * 每一行都压在信纸的横线上（行高都是 --paper-line）。
 */
import { useDataLetterFormat } from './useDataLetterFormat';
import type { DataLetter } from '../../types/letters';

defineProps<{ letter: DataLetter }>();
const f = useDataLetterFormat();
const t = f.t;
</script>

<template>
  <div class="data-sheet">
    <template v-if="letter.kind === 'weekly' && letter.weekly">
      <p class="sheet-head no-indent">{{ t.weekRange(f.shortDate(letter.weekly.recent_start), f.shortDate(letter.weekly.recent_end)) }}</p>
      <p v-for="fact in f.weeklyFacts(letter)" :key="fact.fact_id" class="fact no-indent">
        <span class="fact-label">{{ f.facts.metricLabel(fact.fact_id, fact.metric) }}</span>
        <strong>{{ f.facts.formatValue(fact) }}</strong>
        <em :class="['fact-delta', fact.comparison ? f.tone(fact) : 'muted']">{{ f.deltaText(fact) }}</em>
      </p>
    </template>
    <template v-else>
      <p class="sheet-head no-indent">{{ t.sealedOn(f.longDate(letter.written_at)) }}</p>
      <p class="note no-indent">{{ letter.note }}</p>
      <template v-if="f.pairs(letter).length">
        <p class="compare-row compare-head no-indent"><span></span><span>{{ t.then }}</span><span>{{ t.now }}</span></p>
        <p v-for="pair in f.pairs(letter)" :key="pair.then.metric" class="compare-row no-indent">
          <span class="fact-label">{{ f.valueLabel(pair.then) }}</span>
          <strong>{{ f.valueText(pair.then) }}</strong>
          <strong>{{ f.valueText(pair.now) }}</strong>
        </p>
        <p class="aside no-indent">{{ t.windowNote }}</p>
      </template>
      <p v-if="letter.opened_at" class="aside no-indent">{{ t.openedOn(f.longDate(letter.opened_at)) }}</p>
    </template>
  </div>
</template>

<style scoped>
/* 每一段都占整行（不空行），字压在线上。 */
.data-sheet p { margin: 0; }
.sheet-head { margin-bottom: var(--paper-line) !important; color: var(--paper-muted); font-family: var(--font-sans); font-size: var(--fs-xs); letter-spacing: .06em; }
.fact { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 12px; }
.fact-label { color: var(--paper-muted); }
.fact strong, .compare-row strong { font-weight: 700; font-variant-numeric: tabular-nums; }
.fact-delta { margin-left: auto; color: var(--paper-muted); font: 400 var(--fs-xs) / var(--paper-line) var(--font-sans); font-style: normal; }
/* 信纸是纸色，不跟主题变；好坏用墨色区分，中性指标只给箭头。 */
.fact-delta.good { color: #2f6b45; }
.fact-delta.bad { color: var(--paper-rubric); }
/* 胶囊里自己写的话用蓝墨水（和回信一样）。 */
.note { margin-bottom: var(--paper-line) !important; color: #24467e; white-space: pre-wrap; overflow-wrap: anywhere; }
.compare-row { display: grid; grid-template-columns: minmax(0, 1.4fr) 1fr 1fr; gap: 12px; }
.compare-head { color: var(--paper-muted); font: 400 var(--fs-xs) / var(--paper-line) var(--font-sans); }
.aside { color: var(--paper-muted); font: 400 var(--fs-xs) / var(--paper-line) var(--font-sans); }
</style>

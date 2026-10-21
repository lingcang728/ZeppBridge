<script setup lang="ts">
/* 金继月历（3.1）：一年一行、一月一格。本机有的是完整的瓷片，补拉补上的月份用金线接起来，
 * 还缺的月份是一道裂缝，行尾「补上它」从这一年最早的缺口补起；点裂缝那一格就从那个月补起。
 * 云端说没有的月份只留虚线框——那段时间本来就没数据，不是裂缝。线条是静态的，不逐帧动。 */
import { computed } from 'vue';
import type { MonthSeam } from '../../types';
import { isGap, kintsugiYears, seamPolyline, type SeamCell } from '../../lib/kintsugi';

const props = defineProps<{
  months: MonthSeam[];
  /** 补拉最早能补到的那天（`YYYY-MM-DD`）。 */
  earliest: string;
  busy: boolean;
  t: {
    fill: string;
    legendLocal: string;
    legendGold: string;
    legendGap: string;
    legendEmpty: string;
    cellAria: (month: string, state: string) => string;
  };
}>();

const emit = defineEmits<{ fill: [month: string] }>();

const years = computed(() => kintsugiYears(props.months, new Date(), props.earliest));

const stateLabel = (state: SeamCell): string => {
  if (state === 'gold') return props.t.legendGold;
  if (state === 'empty') return props.t.legendEmpty;
  if (state === 'local') return props.t.legendLocal;
  return props.t.legendGap;
};
</script>

<template>
  <div class="kintsugi">
    <div v-for="row in years" :key="row.year" class="k-row">
      <span class="k-year">{{ row.year }}</span>
      <div class="k-strip">
        <template v-for="cell in row.cells" :key="cell.month">
          <button
            v-if="isGap(cell.state)"
            type="button"
            class="k-cell gap"
            :class="cell.state"
            :disabled="busy"
            :title="t.cellAria(cell.month, stateLabel(cell.state))"
            :aria-label="t.cellAria(cell.month, stateLabel(cell.state))"
            @click="emit('fill', cell.month)"
          ></button>
          <span
            v-else
            class="k-cell"
            :class="cell.state"
            :title="cell.state === 'out' ? undefined : t.cellAria(cell.month, stateLabel(cell.state))"
          ></span>
        </template>
        <svg class="k-seams" viewBox="0 0 12 1" preserveAspectRatio="none" aria-hidden="true">
          <template v-for="run in row.runs" :key="`${run.kind}${run.from}`">
            <polyline v-if="run.kind === 'gold'" class="glow" :points="seamPolyline(run.points)" />
            <polyline :class="run.kind" :points="seamPolyline(run.points)" />
          </template>
        </svg>
      </div>
      <button v-if="row.firstGap" class="k-fill" type="button" :disabled="busy" @click="emit('fill', row.firstGap)">{{ t.fill }}</button>
      <span v-else class="k-fill" aria-hidden="true"></span>
    </div>
    <ul class="k-legend">
      <li><i class="k-cell local"></i>{{ t.legendLocal }}</li>
      <li><i class="k-cell gold"><b></b></i>{{ t.legendGold }}</li>
      <li><i class="k-cell unasked"><b></b></i>{{ t.legendGap }}</li>
      <li><i class="k-cell empty"></i>{{ t.legendEmpty }}</li>
    </ul>
  </div>
</template>

<style scoped>
.kintsugi { display: grid; gap: 6px; min-width: 0; }
.k-row { display: grid; grid-template-columns: 3.2em minmax(0, 1fr) auto; align-items: center; gap: 12px; }
.k-year { color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
/* 格子之间不留 gap：瓷片的间隔画在格子里面（::before 内缩），折线的横坐标才能按「第几格」直接对齐。 */
.k-strip { position: relative; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); height: 22px; }
.k-cell { position: relative; display: block; min-width: 0; margin: 0; padding: 0; border: 0; background: none; font: inherit; }
.k-cell::before { content: ''; position: absolute; inset: 2px 1.5px; border-radius: 4px; }
.k-cell.local::before, .k-cell.gold::before { background: color-mix(in srgb, var(--ink) 15%, transparent); }
.k-cell.gap::before, .k-cell.unasked::before { background: color-mix(in srgb, var(--ink) 6%, transparent); }
.k-cell.crack::before { background: color-mix(in srgb, var(--danger) 14%, transparent); }
.k-cell.empty::before { border: 1px dashed color-mix(in srgb, var(--ink) 22%, transparent); }
button.k-cell { cursor: pointer; }
button.k-cell:hover:not(:disabled)::before { background: color-mix(in srgb, var(--kintsugi) 18%, transparent); }
button.k-cell:focus-visible { outline: 2px solid var(--focus); outline-offset: -1px; border-radius: 5px; }
button.k-cell:disabled { cursor: default; }
.k-seams { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.k-seams polyline { fill: none; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
.k-seams .gold { stroke: var(--kintsugi); stroke-width: 1.6; }
.k-seams .glow { stroke: color-mix(in srgb, var(--kintsugi) 30%, transparent); stroke-width: 4; }
.k-seams .gap { stroke: color-mix(in srgb, var(--ink) 34%, transparent); stroke-width: 1; stroke-dasharray: 3 2; }
.k-fill {
  min-width: 4.5em;
  padding: 0;
  border: 0;
  background: none;
  color: var(--kintsugi);
  font: inherit;
  font-size: var(--fs-xs);
  text-align: right;
  white-space: nowrap;
  cursor: pointer;
}
span.k-fill { cursor: default; }
.k-fill:hover:not(:disabled) { text-decoration: underline; text-underline-offset: 3px; }
.k-fill:disabled { color: var(--subtle); cursor: default; }
.k-legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 4px 0 0; padding: 0 0 0 calc(3.2em + 12px); list-style: none; color: var(--subtle); font-size: var(--fs-2xs); }
.k-legend li { display: inline-flex; align-items: center; gap: 6px; }
.k-legend .k-cell { width: 16px; height: 14px; }
.k-legend b { position: absolute; left: 3px; right: 3px; top: 50%; height: 0; border-top: 1.6px solid var(--kintsugi); transform: rotate(-12deg); }
.k-legend .unasked b { border-top: 1px dashed color-mix(in srgb, var(--ink) 34%, transparent); }
</style>

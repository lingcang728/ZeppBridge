<script setup lang="ts">
/**
 * 每小时步数。后端以旧通道的逐分钟记录为主（按小时加总，和当天总步数对得上），官方授权的
 * 按小时汇总只补旧通道没有的日子。跟着页面顶上的 7 天 / 1 个月 / 6 个月走：
 *
 *   - 上面 24 根柱子：整段范围里「有记录的天」的日均分布；点下面某一行就换成那一天（那一周）；
 *   - 下面一张热力图：一行一天（6 个月时一行一周），一行 24 格，颜色越深步数越多。
 *
 * 官方只回「有步数的小时」：没回的小时是空格，不画成 0（规则见 lib/hourlySteps.ts）。
 * 柱子和格子都是纯 CSS——一张图表引擎画这几百个数不值得；换范围时柱高和格子颜色是过渡过去的。
 * 一次取最长那档（6 个月），换范围只在本地重排，不再每切一次查一次库。
 * 指针停在柱子或格子上立刻浮出读数（和心率图一样），不用原生 title——那个要停一秒多才出来。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useSyncController } from '../../composables/useSyncController';
import { backend, isDesktop } from '../../lib/bridge';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { averageRow, hourRows, rangeBounds, type HourRow } from '../../lib/hourlySteps';
import { SERIES_FETCH_DAYS } from '../../lib/metricSeries';
import type { HourlySteps } from '../../types';
import { useMessages } from '../../i18n';
import { hourlyStepsMessages as messages } from './HourlyStepsCard.i18n';

const props = defineProps<{ days: number }>();

const t = useMessages(messages);
const { dataRevision } = useSyncController();

const rows = ref<HourlySteps[]>([]);
const failed = ref(false);
const loaded = ref(false);
/** 点中的那一行（按它的首日认）；null = 看整段平均。 */
const picked = ref<string | null>(null);

const bounds = computed(() => rangeBounds(props.days));
const perWeek = computed(() => props.days > 31);

let seq = 0;
const load = async () => {
  if (!isDesktop()) return;
  const mine = ++seq;
  try {
    const whole = rangeBounds(Math.max(SERIES_FETCH_DAYS, props.days));
    const next = await backend.getHourlySteps(whole.start, whole.end);
    if (mine !== seq) return;
    rows.value = next;
    failed.value = false;
  } catch {
    if (mine !== seq) return;
    rows.value = [];
    failed.value = true;
  } finally {
    if (mine === seq) loaded.value = true;
  }
};
onMounted(() => { void load(); });
watch(() => props.days, () => { picked.value = null; hover.value = null; });
watch(dataRevision, () => { void load(); });

const heat = computed(() => hourRows(rows.value, bounds.value.start, bounds.value.end, perWeek.value));
const average = computed(() => averageRow(rows.value, bounds.value.start, bounds.value.end));
const shown = computed<HourRow>(() => heat.value.find((row) => row.start === picked.value) ?? average.value);
/** 「这一行是单独一天」：柱子的数是那天的实数；否则是日均。 */
const shownIsDay = computed(() => picked.value !== null && !perWeek.value);

const heatPeak = computed(() => Math.max(1, ...heat.value.flatMap((row) => row.cells.map((cell) => cell ?? 0))));
const barPeak = computed(() => Math.max(1, ...shown.value.cells.map((cell) => cell ?? 0)));
const total = computed(() => shown.value.cells.reduce<number>((sum, cell) => sum + (cell ?? 0), 0));
const busiest = computed(() => shown.value.cells.reduce<{ hour: number; steps: number } | null>(
  (best, cell, hour) => (cell !== null && (!best || cell > best.steps) ? { hour, steps: cell } : best), null));
const bars = computed(() => shown.value.cells.map((steps, hour) => ({
  hour,
  steps,
  height: steps === null ? 0 : Math.max(3, Math.round((steps / barPeak.value) * 100)),
})));

const dayLabel = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const rowLabel = (row: HourRow) => (perWeek.value ? t.value.weekOf(dayLabel(row.start)) : dayLabel(row.start));
/** 行多的时候不是每行都写日期：一天一行时每 7 行写一次，一周一行时每 4 行写一次。 */
const labelEvery = computed(() => (perWeek.value ? 4 : props.days > 7 ? 7 : 1));
const shownNote = computed(() => {
  if (!picked.value) return t.value.averageNote(average.value.covered);
  const row = heat.value.find((item) => item.start === picked.value);
  return row ? (perWeek.value ? t.value.weekNote(rowLabel(row), row.covered) : t.value.dayNote(rowLabel(row))) : '';
});
const format = (value: number) => Math.round(value).toLocaleString();
/* —— 悬停读数 —— */
const card = ref<HTMLElement | null>(null);
const hover = ref<{ x: number; y: number; text: string; hour: number; row: string | null } | null>(null);
/** 元素相对卡片的位置（沿 offsetParent 累加：界面缩放下 getBoundingClientRect 和布局像素不是一回事）。 */
const offsetWithin = (el: HTMLElement) => {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== card.value) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x: x + el.offsetWidth / 2, y };
};
const barText = (hour: number, steps: number | null) => {
  if (steps === null) return t.value.noRecord(hour);
  return shownIsDay.value ? t.value.barTitle(hour, format(steps)) : t.value.averageBarTitle(hour, format(steps));
};
const onBarsOver = (event: PointerEvent) => {
  const li = (event.target as Element | null)?.closest<HTMLElement>('li[data-hour]');
  if (!li) return;
  const hour = Number(li.dataset.hour);
  const bar = bars.value[hour];
  if (!bar) return;
  const at = offsetWithin(li);
  const top = at.y + li.offsetHeight * (1 - bar.height / 100);
  hover.value = { x: at.x, y: top, text: barText(hour, bar.steps), hour, row: null };
};
const onHeatOver = (event: PointerEvent) => {
  const cell = (event.target as Element | null)?.closest<HTMLElement>('i[data-hour]');
  if (!cell) return;
  const hour = Number(cell.dataset.hour);
  const row = heat.value.find((item) => item.start === cell.dataset.row);
  if (!row) return;
  const steps = row.cells[hour] ?? null;
  const text = steps === null
    ? t.value.noRecord(hour)
    : perWeek.value ? t.value.averageBarTitle(hour, format(steps)) : t.value.barTitle(hour, format(steps));
  const at = offsetWithin(cell);
  hover.value = { x: at.x, y: at.y, text: `${rowLabel(row)} · ${text}`, hour, row: row.start };
};
const clearHover = () => { hover.value = null; };

const pick = (row: HourRow) => {
  if (!row.covered) return;
  picked.value = picked.value === row.start ? null : row.start;
};
</script>

<template>
  <section ref="card" class="hourly-card" :aria-label="t.title">
    <header>
      <span class="hourly-head">
        <strong>{{ t.title }}</strong>
        <small>{{ shownNote }}</small>
      </span>
      <button v-if="picked" type="button" class="button button-secondary hourly-back" @click="picked = null">{{ t.showAverage }}</button>
    </header>
    <p v-if="failed" class="hourly-empty" role="alert">{{ t.failed }}</p>
    <p v-else-if="loaded && !rows.length" class="hourly-empty">{{ t.empty }}</p>
    <template v-else-if="rows.length">
      <p class="hourly-facts">
        <b>{{ format(total) }}</b> {{ shownIsDay ? t.stepsUnit : t.perDayUnit }}
        <span v-if="busiest"> · {{ shownIsDay ? t.busiest(busiest.hour, format(busiest.steps)) : t.busiestAverage(busiest.hour, format(busiest.steps)) }}</span>
      </p>
      <ol class="hourly-bars" role="list" @pointerover="onBarsOver" @pointerleave="clearHover">
        <li v-for="bar in bars" :key="bar.hour" :data-hour="bar.hour" :aria-label="barText(bar.hour, bar.steps)">
          <span class="bar" :class="{ empty: bar.steps === null, hot: hover && hover.row === null && hover.hour === bar.hour }" :style="{ height: `${bar.height}%` }" />
          <small v-if="bar.hour % 6 === 0">{{ bar.hour }}</small>
        </li>
      </ol>
      <div class="hourly-heat" :class="{ dense: heat.length > 7 }" role="list" :aria-label="t.heatAria" @pointerover="onHeatOver" @pointerleave="clearHover">
        <button
          v-for="(row, index) in heat"
          :key="row.start"
          type="button"
          role="listitem"
          :class="['heat-row', { picked: row.start === picked, blank: !row.covered }]"
          :disabled="!row.covered"
          :aria-pressed="row.start === picked"
          :aria-label="row.covered ? t.pickRow(rowLabel(row)) : t.noRow(rowLabel(row))"
          @click="pick(row)"
        >
          <span class="heat-label">{{ index % labelEvery === 0 ? rowLabel(row) : '' }}</span>
          <span class="heat-cells">
            <i
              v-for="(cell, hour) in row.cells"
              :key="hour"
              :data-row="row.start"
              :data-hour="hour"
              :class="{ empty: cell === null, hot: hover && hover.row === row.start && hover.hour === hour }"
              :style="{ '--v': cell === null ? 0 : Math.min(1, cell / heatPeak).toFixed(3) }"
            />
          </span>
        </button>
      </div>
      <div v-if="hover" class="hourly-tip" :style="{ left: `${hover.x}px`, top: `${hover.y}px` }" aria-hidden="true">{{ hover.text }}</div>
    </template>
  </section>
</template>

<style scoped>
.hourly-card { position: relative; display: grid; gap: 12px; padding: 18px 20px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); }
header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.hourly-head { display: grid; gap: 2px; }
header strong { font-size: var(--fs-md); }
header small, .hourly-empty { color: var(--muted); font-size: var(--fs-xs); }
.hourly-back { min-height: 30px; padding: 4px 12px; font-size: var(--fs-xs); }
.hourly-empty { margin: 0; padding: 22px 0; text-align: center; }
.hourly-facts { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.hourly-facts b { color: var(--ink); font-size: 22px; font-variant-numeric: tabular-nums; }
.hourly-bars { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); align-items: end; gap: 3px; height: 120px; margin: 0; padding: 0 0 16px; list-style: none; }
.hourly-bars li { position: relative; display: flex; align-items: flex-end; height: 100%; }
.bar { width: 100%; border-radius: 4px 4px 2px 2px; background: color-mix(in srgb, var(--accent) 78%, transparent); transition: height 420ms var(--ease-out); }
.bar.hot { background: var(--accent); }
.bar.empty { height: 2px !important; background: color-mix(in srgb, var(--ink) 10%, transparent); }
.hourly-bars small { position: absolute; bottom: -16px; left: 0; color: var(--subtle); font-size: 10px; font-variant-numeric: tabular-nums; }

.hourly-heat { display: grid; gap: 3px; }
.hourly-heat.dense { gap: 2px; }
.heat-row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 16px;
  margin: 0;
  padding: 1px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--subtle);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--dur-fast) ease;
}
.dense .heat-row { min-height: 9px; padding-block: 0; }
.heat-row:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 5%, transparent); }
.heat-row.picked { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--ink); }
.heat-row:disabled { cursor: default; }
.heat-label { overflow: hidden; font-size: 10px; font-variant-numeric: tabular-nums; line-height: 1; white-space: nowrap; }
.heat-cells { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 3px; height: 12px; }
.dense .heat-cells { height: 7px; }
.heat-cells i {
  border-radius: 3px;
  background: color-mix(in srgb, var(--accent) calc(var(--v) * 86% + 14%), transparent);
  transition: background-color 360ms ease;
}
.heat-cells i.hot { box-shadow: 0 0 0 1.5px var(--ink); }
.heat-cells i.empty { background: color-mix(in srgb, var(--ink) 6%, transparent); }
.heat-row.blank .heat-cells i { background: transparent; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 5%, transparent); }
.hourly-tip {
  position: absolute;
  z-index: 3;
  padding: 7px 11px;
  border: 1px solid var(--mat-line-hover);
  border-radius: 8px;
  background: var(--mat-card-solid);
  box-shadow: var(--mat-shadow);
  color: var(--ink);
  font-size: var(--fs-sm);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
  transform: translate(-50%, calc(-100% - 8px));
}
</style>

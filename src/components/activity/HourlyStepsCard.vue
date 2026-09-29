<script setup lang="ts">
/**
 * 每小时步数（Zepp 官方授权才有，旧通道没有这一项）。跟着页面顶上的 7 天 / 1 个月 / 6 个月走：
 *
 *   - 上面 24 根柱子：整段范围里「有记录的天」的日均分布；点下面某一行就换成那一天（那一周）；
 *   - 下面一张热力图：一行一天（6 个月时一行一周），一行 24 格，颜色越深步数越多。
 *
 * 官方只回「有步数的小时」：没回的小时是空格，不画成 0（规则见 lib/hourlySteps.ts）。
 * 柱子和格子都是纯 CSS——一张图表引擎画这几百个数不值得；换范围时柱高和格子颜色是过渡过去的。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useSyncController } from '../../composables/useSyncController';
import { backend, isDesktop } from '../../lib/bridge';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { averageRow, hourRows, rangeBounds, type HourRow } from '../../lib/hourlySteps';
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
    const next = await backend.getHourlySteps(bounds.value.start, bounds.value.end);
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
watch(() => props.days, () => { picked.value = null; void load(); });
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
const pick = (row: HourRow) => {
  if (!row.covered) return;
  picked.value = picked.value === row.start ? null : row.start;
};
</script>

<template>
  <section class="hourly-card" :aria-label="t.title">
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
      <ol class="hourly-bars" role="list">
        <li v-for="bar in bars" :key="bar.hour" :title="bar.steps === null ? t.noRecord(bar.hour) : (shownIsDay ? t.barTitle(bar.hour, format(bar.steps)) : t.averageBarTitle(bar.hour, format(bar.steps)))">
          <span class="bar" :class="{ empty: bar.steps === null }" :style="{ height: `${bar.height}%` }" />
          <small v-if="bar.hour % 6 === 0">{{ bar.hour }}</small>
        </li>
      </ol>
      <div class="hourly-heat" :class="{ dense: heat.length > 7 }" role="list" :aria-label="t.heatAria">
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
              :class="{ empty: cell === null }"
              :style="{ '--v': cell === null ? 0 : Math.min(1, cell / heatPeak).toFixed(3) }"
            />
          </span>
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.hourly-card { display: grid; gap: 12px; padding: 18px 20px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); }
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
.heat-cells i.empty { background: color-mix(in srgb, var(--ink) 6%, transparent); }
.heat-row.blank .heat-cells i { background: transparent; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 5%, transparent); }
</style>

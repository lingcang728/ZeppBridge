<script setup lang="ts">
/**
 * 距离热力图（GitHub 贡献图的样子）：一列一周、一行一个星期几，颜色越深那天走得越远。
 *
 * 跟着页面的 7 天 / 1 个月 / 6 个月走。范围外的格子（首周前面几天）留空；
 * 范围内没有记录的日子画成浅色空格，不画成 0（和其他图一致）。
 * 档位按范围内的最大值分五档，不按固定公里数：一个人的「远」不是别人的「远」。
 */
import { computed, ref } from 'vue';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { formatNumber } from '../../lib/format';
import { dateSpan, rangeBounds } from '../../lib/hourlySteps';
import { distanceUnitLabel, toBigDistance } from '../../lib/units';
import { localDateString } from '../../lib/format';
import type { MetricSeries } from '../../types';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{ days: number; seriesMap: Record<string, MetricSeries | undefined> }>();

const messages = defineMessages(
  {
    title: '每日热力图',
    distance: '距离',
    steps: '步数',
    calories: '活动热量',
    minutes: '活动分钟',
    stepsUnit: '步',
    caloriesUnit: '千卡',
    minutesUnit: '分钟',
    summary: (days: number) => `${days} 天有记录；颜色越深数值越高`,
    total: (value: string, unit: string) => `合计 ${value} ${unit}`,
    best: (day: string, value: string, unit: string) => `最高：${day}，${value} ${unit}`,
    dayTitle: (day: string, value: string, unit: string) => `${day}：${value} ${unit}`,
    noRecord: (day: string) => `${day}：没有记录`,
    less: '少',
    more: '多',
    empty: '这段范围还没有距离记录。',
    aria: '每天的距离',
  },
  {
    title: 'Daily heatmap',
    distance: 'Distance',
    steps: 'Steps',
    calories: 'Active calories',
    minutes: 'Active minutes',
    stepsUnit: 'steps',
    caloriesUnit: 'kcal',
    minutesUnit: 'min',
    summary: (days: number) => `${days} days with records; darker means higher`,
    total: (value: string, unit: string) => `${value} ${unit} in total`,
    best: (day: string, value: string, unit: string) => `Highest: ${day}, ${value} ${unit}`,
    dayTitle: (day: string, value: string, unit: string) => `${day}: ${value} ${unit}`,
    noRecord: (day: string) => `${day}: nothing recorded`,
    less: 'Less',
    more: 'More',
    empty: 'No distance records in this range yet.',
    aria: 'Distance for each day',
  },
  {
    title: 'Mapa de calor diario',
    distance: 'Distancia',
    steps: 'Pasos',
    calories: 'Calorías activas',
    minutes: 'Minutos activos',
    stepsUnit: 'pasos',
    caloriesUnit: 'kcal',
    minutesUnit: 'min',
    summary: (days: number) => `${days} días con registros; más oscuro = más alto`,
    total: (value: string, unit: string) => `${value} ${unit} en total`,
    best: (day: string, value: string, unit: string) => `Más alto: ${day}, ${value} ${unit}`,
    dayTitle: (day: string, value: string, unit: string) => `${day}: ${value} ${unit}`,
    noRecord: (day: string) => `${day}: sin registro`,
    less: 'Menos',
    more: 'Más',
    empty: 'Todavía no hay distancias en este rango.',
    aria: 'Distancia de cada día',
  },
  'components/activity/DistanceHeatmapCard',
);
const t = useMessages(messages);

const bounds = computed(() => rangeBounds(props.days));
const metric = ref<'distance' | 'steps' | 'active_calories' | 'active_minutes'>('distance');
const metricKeys = [['distance', 'distance'], ['steps', 'steps'], ['active_calories', 'calories'], ['active_minutes', 'minutes']] as const;
const series = computed(() => props.seriesMap[metric.value] ?? null);
const unit = computed(() => {
  if (metric.value === 'distance') return distanceUnitLabel();
  return metric.value === 'steps' ? t.value.stepsUnit : metric.value === 'active_calories' ? t.value.caloriesUnit : t.value.minutesUnit;
});
/** 距离库里是米，按当前单位换算；其余是整数。 */
const fmt = (raw: number) => (metric.value === 'distance'
  ? formatNumber(Math.round(toBigDistance(raw) * 10) / 10)
  : formatNumber(Math.round(raw)));
const fullDay = (date: string) => displayDateTimeFormatter({ weekday: 'short', month: 'short', day: 'numeric' }).format(parseDisplayDate(date));

const byDate = computed(() => new Map((series.value?.points ?? []).map((point) => [point.date, point.value])));
const inRange = computed(() => (series.value?.points ?? [])
  .filter((point) => point.date >= bounds.value.start && point.date <= bounds.value.end));
const peak = computed(() => Math.max(0, ...inRange.value.map((point) => point.value)));
const total = computed(() => inRange.value.reduce((sum, point) => sum + point.value, 0));
const best = computed(() => inRange.value.reduce<{ date: string; value: number } | null>(
  (top, point) => (!top || point.value > top.value ? point : top), null));

/** 0 = 没有记录，1–4 = 按范围内最大值分四档。 */
const levelOf = (value: number | undefined) => {
  if (value === undefined || value <= 0 || peak.value <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / peak.value) * 4)));
};

interface Cell { date: string; inside: boolean; level: number; value: number | undefined }

/** 一列一周（周一在上）；首周往前补到周一，末周往后补到周日，补出来的格子 inside = false。 */
const weeks = computed<Cell[][]>(() => {
  const { start, end } = bounds.value;
  const first = parseDisplayDate(start);
  const last = parseDisplayDate(end);
  const gridStart = localDateString(new Date(first.getFullYear(), first.getMonth(), first.getDate() - ((first.getDay() + 6) % 7)));
  const gridEnd = localDateString(new Date(last.getFullYear(), last.getMonth(), last.getDate() + (6 - ((last.getDay() + 6) % 7))));
  const cells = dateSpan(gridStart, gridEnd).map<Cell>((date) => {
    const value = byDate.value.get(date);
    const inside = date >= start && date <= end;
    return { date, inside, level: inside ? levelOf(value) : 0, value: inside ? value : undefined };
  });
  const out: Cell[][] = [];
  for (let index = 0; index < cells.length; index += 7) out.push(cells.slice(index, index + 7));
  return out;
});

const weekdayLabels = computed(() => {
  const format = displayDateTimeFormatter({ weekday: 'short' });
  const monday = new Date(2024, 0, 1); // 2024-01-01 是周一
  return Array.from({ length: 7 }, (_, row) => (row % 2 === 0
    ? format.format(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + row))
    : ''));
});
const monthLabel = (week: Cell[], index: number) => {
  const month = (cell: Cell) => parseDisplayDate(cell.date).getMonth();
  if (index > 0 && month(week[0]!) === month(weeks.value[index - 1]![0]!)) return '';
  return displayDateTimeFormatter({ month: 'short' }).format(parseDisplayDate(week[0]!.date));
};
const showMonths = computed(() => props.days > 7);

const textOf = (cell: Cell) => (cell.value === undefined
  ? t.value.noRecord(fullDay(cell.date))
  : t.value.dayTitle(fullDay(cell.date), fmt(cell.value), unit.value));
const hovered = ref<string | null>(null);
const hoverText = computed(() => {
  for (const week of weeks.value) {
    const cell = week.find((item) => item.date === hovered.value && item.inside);
    if (cell) return textOf(cell);
  }
  return '';
});
</script>

<template>
  <section class="dist-card" :aria-label="t.title">
    <header>
      <span class="dist-head"><strong>{{ t.title }}</strong><small>{{ t.summary(inRange.length) }}</small></span>
      <span class="dist-switch" role="group" :aria-label="t.title">
        <button v-for="[key, word] in metricKeys" :key="key" type="button" :aria-pressed="metric === key" @click="metric = key">{{ t[word] }}</button>
      </span>
    </header>
    <p v-if="!inRange.length" class="dist-empty">{{ t.empty }}</p>
    <template v-else>
      <p class="dist-facts">
        <b>{{ fmt(total) }}</b> {{ unit }}
        <span v-if="best"> · {{ t.best(fullDay(best.date), fmt(best.value), unit) }}</span>
      </p>
      <p class="dist-hover" aria-hidden="true">{{ hoverText || ' ' }}</p>
      <div class="dist-grid" :style="{ '--weeks': weeks.length }" role="list" :aria-label="t.aria" @pointerleave="hovered = null">
        <div class="dist-days" aria-hidden="true"><span v-for="(label, row) in weekdayLabels" :key="row">{{ label }}</span></div>
        <div class="dist-cols">
          <div class="dist-months" aria-hidden="true">
            <span v-for="(week, index) in weeks" :key="week[0]!.date">{{ showMonths ? monthLabel(week, index) : "" }}</span>
          </div>
          <div class="dist-weeks">
            <div v-for="week in weeks" :key="week[0]!.date" class="dist-week">
              <i
                v-for="cell in week"
                :key="cell.date"
                role="listitem"
                :aria-label="cell.inside ? textOf(cell) : undefined"
                :aria-hidden="cell.inside ? undefined : true"
                :class="['cell', `l${cell.level}`, { off: !cell.inside, hot: hovered === cell.date }]"
                @pointerenter="cell.inside && (hovered = cell.date)"
              />
            </div>
          </div>
        </div>
      </div>
      <p class="dist-legend" aria-hidden="true">
        {{ t.less }}<span class="ramp"><i v-for="level in [0, 1, 2, 3, 4]" :key="level" :class="['cell', `l${level}`]" /></span>{{ t.more }}
      </p>
    </template>
  </section>
</template>

<style scoped>
/* 极简：和每日步数同一张平面卡片；五档灰绿，只有最深一档是满色。 */
.dist-card { display: grid; gap: 14px; padding: 20px 22px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim); }
header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.dist-head { display: grid; gap: 2px; }
.dist-switch { display: inline-flex; gap: 2px; padding: 2px; border-radius: var(--radius-sm); box-shadow: inset 0 0 0 1px var(--mat-line); }
.dist-switch button { padding: 3px 10px; border: 0; border-radius: 4px; background: transparent; color: var(--muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.dist-switch button[aria-pressed='true'] { background: color-mix(in srgb, var(--ink) 10%, transparent); color: var(--ink); }
header strong { font-size: var(--fs-sm); font-weight: 600; }
header small, .dist-empty { color: var(--subtle); font-size: var(--fs-xs); }
.dist-empty { margin: 0; padding: 22px 0; text-align: center; }
.dist-facts { margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.dist-facts b { color: var(--ink); font-size: 30px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.dist-hover { margin: 0; min-height: 1.4em; color: var(--ink); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }

.dist-grid { --cell: 20px; --gap: 4px; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: start; overflow-x: auto; }
.dist-card.yearly .dist-grid { --cell: 13px; --gap: 3px; }
.dist-days { display: grid; grid-template-rows: repeat(7, var(--cell)); gap: var(--gap); margin-top: 16px; color: var(--subtle); font-size: 10px; line-height: var(--cell); }
.dist-cols { display: grid; gap: 4px; min-width: 0; }
.dist-months, .dist-weeks { display: flex; gap: var(--gap); }
.dist-months { height: 12px; }
.dist-months span { flex: 0 0 var(--cell); overflow: visible; color: var(--subtle); font-size: 10px; line-height: 12px; white-space: nowrap; }
.dist-week { display: grid; grid-template-rows: repeat(7, var(--cell)); gap: var(--gap); flex: 0 0 var(--cell); }

.cell { display: block; width: 100%; height: 100%; min-width: 0; border-radius: 3px; background: color-mix(in srgb, var(--ink) 7%, transparent); transition: box-shadow 100ms ease; }
.cell.l1 { background: color-mix(in srgb, var(--accent) 25%, transparent); }
.cell.l2 { background: color-mix(in srgb, var(--accent) 45%, transparent); }
.cell.l3 { background: color-mix(in srgb, var(--accent) 70%, transparent); }
.cell.l4 { background: var(--accent); }
.cell.off { background: transparent; }
.cell.hot { box-shadow: 0 0 0 1px var(--ink); }

.dist-legend { display: flex; align-items: center; justify-content: flex-end; gap: 6px; margin: 0; color: var(--subtle); font-size: 10px; }
.ramp { display: inline-grid; grid-template-columns: repeat(5, 11px); gap: 3px; }
.ramp .cell { height: 11px; }
</style>

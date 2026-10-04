<script setup lang="ts">
import { computed } from 'vue';
import { useLifeEvents } from '../composables/useLifeEvents';
import { useQueuedOption } from '../composables/useQueuedOption';
import { eventChartTone, lifeEventMessages, validEventDate, overlapsEvent } from '../lib/lifeEvents';
const { open: openEvent, events: lifeEvents, chipFocus, chartFocus, ensureLoaded } = useLifeEvents();
ensureLoaded();
const eventWords = useMessages(lifeEventMessages);
type ChartEvent = { name?: string; data?: unknown; componentType?: string };
const eventIdOf = (event: ChartEvent): number | null => {
  const id = event.data && typeof event.data === 'object' && 'eventId' in event.data ? event.data.eventId : null;
  return typeof id === 'number' ? id : null;
};
/* 悬停图上的事件区带 → 页头那枚胶囊亮起（反方向见 LifeEventShortcut）。 */
const chartHover = (event: ChartEvent) => {
  if (event.componentType === 'markArea' || event.componentType === 'markLine') chartFocus.value = eventIdOf(event);
};
const chartLeave = () => { chartFocus.value = null; };
const chartClick = (event: ChartEvent) => {
  const eventId = eventIdOf(event);
  const matching = lifeEvents.value.find(e => e.id === eventId);
  if (matching) openEvent(matching);
  else if (event.name && validEventDate(event.name)) openEvent(undefined, event.name);
};
import { chartPalette } from '../lib/echartsSetup';
import { formatMetric } from '../lib/format';
import { buildSeriesOption, coverageLabel } from '../lib/metricSeries';
import { rangeLabel, type RangeDays } from '../lib/rangeOptions';
import { useTrendRange } from '../composables/useTrendRange';
import SwapChart from './SwapChart.vue';
import type { MetricSeries } from '../types';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    latestTag: '最新',
    measuredOn: (date: string) => `测于 ${date}`,
    widened: (asked: string, shown: string) => `${asked}内记录不足 · 这里显示 ${shown}`,
    trendAria: (label: string) => `${label}趋势曲线`,
    onlyOneDay: '这段范围只有 1 天记录，画不出趋势。',
    defaultEmpty: '同步后展示这项指标的趋势。',
    average: '平均',
    minimum: '最低',
    maximum: '最高',
  },
  {
    latestTag: 'Latest',
    measuredOn: (date: string) => `measured ${date}`,
    widened: (asked: string, shown: string) => `Too few records in ${asked} · showing ${shown}`,
    trendAria: (label: string) => `${label} trend line`,
    onlyOneDay: 'Only one day of data in this range — no trend to draw yet.',
    defaultEmpty: 'Trend appears here after a sync.',
    average: 'Avg',
    minimum: 'Min',
    maximum: 'Max',
  },
  {
    latestTag: 'Último',
    measuredOn: (date: string) => `medido el ${date}`,
    widened: (asked: string, shown: string) => `Pocos registros en ${asked} · mostrando ${shown}`,
    trendAria: (label: string) => `Línea de tendencia de ${label}`,
    onlyOneDay: 'Solo hay 1 día de datos en este rango; no hay tendencia que trazar.',
    defaultEmpty: 'Esta métrica muestra su tendencia una vez sincronizada.',
    average: 'Prom.',
    minimum: 'Mín.',
    maximum: 'Máx.',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'components/MetricTrendCard',
);
const t = useMessages(messages);

/** 事件名是用户自己写的，进 tooltip 的 HTML 前转义。 */
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const props = withDefaults(defineProps<{
  label: string;
  hint?: string;
  series?: MetricSeries | null;
  color: string;
  unit?: string;
  decimals?: number;
  /** Draw the day's measured spread behind the line. */
  showSpread?: boolean;
  /** Render a value for display; defaults to a fixed-decimal number. */
  format?: (value: number) => string;
  /** One short qualitative line under the value, when the metric has one. */
  band?: string | null;
  /** Shown in place of the chart when nothing has been measured. */
  emptyText?: string;
  /** Bars instead of a line, for values counted per day rather than sampled. */
  chart?: 'line' | 'bar';
  /** Keep the days with no reading on the axis. See `buildSeriesOption`. */
  calendarAxis?: boolean;
  /** Leave out the average / min / max row (a card whose chart has more than one series). */
  hideStats?: boolean;
}>(), {
  decimals: 0,
  showSpread: false,
  // 空串表示「用默认文案」。默认值不能直接写成 t.value.defaultEmpty：
  // withDefaults 的默认值在 props 解析时求值，那时还没有组件上下文。
  emptyText: '',
});

/* 空卡只说一句话（U27）：页面给了专门的原因就用它；否则还没同步过这项说「同步后展示」，
   同步过但这段范围没有就说「近 N 天无记录」。覆盖行在空卡上不再重复同一件事。 */
const emptyMessage = computed(() => props.emptyText
  || (props.series ? coverageLabel(props.series) : t.value.defaultEmpty));

// 和概览置顶磁贴同一个格式（千分位跟着界面语言）：同一个数在两处不能一处「1,156」一处「1156」。
const render = computed(() => props.format ?? ((value: number) => formatMetric(value, props.decimals)));
const hasPoints = computed(() => (props.series?.points.length ?? 0) > 0);
// One point is a reading, not a trend: show the number and say so rather than
// drawing a one-pixel line that implies a shape.
const hasTrend = computed(() => (props.series?.points.length ?? 0) > 1);
const latest = computed(() => {
  const value = props.series?.latest?.value;
  return typeof value === 'number' && Number.isFinite(value) ? render.value(value) : '—';
});
const latestDate = computed(() => props.series?.latest?.date ?? null);
const coverage = computed(() => coverageLabel(props.series));
/* 页面范围里画不出曲线、自动换成了更长一档（lib/metricSeries.ts 的 sliceIndexed）：写明这里是哪一段，
   别让人以为它跟着页面的范围。 */
const range = useTrendRange();
const widened = computed(() => {
  const shown = props.series?.window_days ?? 0;
  if (!hasPoints.value || shown <= range.value) return null;
  return t.value.widened(rangeLabel(range.value as RangeDays), rangeLabel(shown as RangeDays));
});

const stats = computed(() => {
  const series = props.series;
  if (!series || !series.points.length) return [];
  const rows: { label: string; value: string }[] = [];
  if (typeof series.average === 'number') rows.push({ label: t.value.average, value: render.value(series.average) });
  if (typeof series.minimum === 'number') rows.push({ label: t.value.minimum, value: render.value(series.minimum) });
  if (typeof series.maximum === 'number') rows.push({ label: t.value.maximum, value: render.value(series.maximum) });
  return rows;
});

const option = computed(() => {
  const series = props.series;
  if (!series || !hasTrend.value) return null;
  const result = buildSeriesOption(series, {
    color: props.color,
    decimals: props.decimals,
    showSpread: props.showSpread,
    format: render.value,
    unit: props.unit,
    chart: props.chart,
    calendarAxis: props.calendarAxis,
  });
  /* 生活事件画成竖向浅色区带（一天的画成一根竖线），颜色跟事件分类走、和页头胶囊同色；点一下打开编辑。
     以前是 9px 无标签的品牌绿圆点，新用户会当成数据点样式（U24）。
     事件名写进悬停浮出的那块读数里（日期、数值下面），不再画在图上：竖线的标签落在画布顶边外，
     字被裁掉一半（用户 2026-10-04 截图「模拟：进入半马准备期」）。 */
  const palette = chartPalette.value;
  const axisDates = ((result.xAxis as { data?: string[] }).data ?? []);
  const areas: unknown[] = [];
  const lines: unknown[] = [];
  const marked: { event: (typeof lifeEvents.value)[number]; color: string }[] = [];
  for (const event of lifeEvents.value) {
    const covered = axisDates.filter((date) => overlapsEvent(event, date, date));
    if (!covered.length) continue;
    const color = eventChartTone(event.category, palette);
    marked.push({ event, color });
    const lit = chipFocus.value === event.id;
    const label = { show: false };
    const emphasis = { label: { show: false } };
    if (covered.length === 1) {
      lines.push({ xAxis: covered[0], name: event.title, eventId: event.id, label, emphasis,
        lineStyle: { color, width: lit ? 3 : 2, type: 'solid', opacity: lit ? 0.85 : 0.5 } });
    } else {
      areas.push([
        { xAxis: covered[0], name: event.title, eventId: event.id, label, emphasis,
          itemStyle: { color, opacity: lit ? 0.3 : 0.12 } },
        { xAxis: covered[covered.length - 1] },
      ]);
    }
  }
  const chartSeries = result.series as Array<Record<string, unknown>>;
  const last = chartSeries[chartSeries.length - 1];
  if (areas.length) Object.assign(last, { markArea: { silent: false, data: areas } });
  if (lines.length) Object.assign(last, { markLine: { silent: false, symbol: 'none', data: lines } });
  const tooltip = result.tooltip as { formatter?: (params: Array<{ axisValue: string }>) => string } | undefined;
  const base = tooltip?.formatter;
  if (tooltip && base && marked.length) {
    tooltip.formatter = (params) => {
      const text = base(params);
      const day = Array.isArray(params) ? params[0]?.axisValue : undefined;
      if (!text || !day) return text;
      const names = marked.filter(({ event }) => overlapsEvent(event, day, day))
        .map(({ event, color }) => `<br><span style="display:inline-block;width:7px;height:11px;margin-right:6px;border-radius:2px;background:${color};vertical-align:-1px"></span>${escapeHtml(event.title)}`);
      return text + names.join('');
    };
  }
  return result;
});
/* 切范围时十来张图同时换数据：排队，一帧只换一张（见 useQueuedOption）。 */
const shownOption = useQueuedOption(option);
/* 图上有事件区带时，覆盖行末尾给一个图例（颜色跟着分类，这里只说明「色带 = 生活事件」）。 */
const hasEventMarks = computed(() => {
  const points = props.series?.points ?? [];
  if (points.length < 2) return false;
  const first = points[0].date;
  const last = points[points.length - 1].date;
  return lifeEvents.value.some((event) => overlapsEvent(event, first, last));
});
</script>

<template>
  <!-- 四块自上而下：卡头（标题 / 最新读数 / 说明）、覆盖说明、曲线、统计。
       卡片是父网格的 subgrid，同一行几张卡的这四块各自对齐（见 material.css 的 .trend-grid）。
       以前标题和说明挤在左边、最新读数占着右上角：葡语这种长标题被压成一列一个词竖着排，
       右边却空着一大块。现在标题独占一行、读数在它下面、说明铺满整宽。 -->
  <section class="trend-card" :aria-label="label" :data-focus-key="series?.metric">
    <header class="trend-head">
      <strong class="trend-title">{{ label }}</strong>
      <!-- 这个大数字是**最近一次读数**，不是这个范围的汇总，所以切 7 天 / 1 个月
           / 6 个月时它本来就不该变（最近一次还是同一次）。跟着范围变的是下面
           的平均/最低/最高和覆盖天数。以前它没有标签，读起来像「这个范围的
           值」，于是看着就像坏了。 -->
      <span class="trend-latest">
        <em class="trend-latest-tag">{{ t.latestTag }}</em>
        <slot name="latest">
          <strong :style="{ color }">{{ latest }}</strong>
          <small v-if="unit">{{ unit }}</small>
        </slot>
      </span>
      <small v-if="hint" class="trend-hint">{{ hint }}</small>
    </header>

    <!-- 悬停读数只在图上浮出的那块里（日期、数值、当天的生活事件）。以前这一行还会叠一份同样的
         「9/20：110 克」，两处说同一件事（用户 2026-10-04）。 -->
    <p class="trend-meta">
      <span v-if="widened" class="trend-widened">{{ widened }}</span>
      <span v-if="hasPoints">{{ coverage }}</span>
      <span v-if="latestDate" class="trend-date">{{ t.measuredOn(latestDate) }}</span>
      <span v-if="band" class="trend-band">{{ band }}</span>
      <span v-if="hasEventMarks" class="trend-event-key"><i aria-hidden="true"></i>{{ eventWords.chartKey }}</span>
    </p>

    <div v-if="$slots.chart" class="trend-slot"><slot name="chart" /></div>
    <SwapChart
      v-else-if="shownOption"
      class="trend-chart"
      :option="shownOption"
      :aria-label="t.trendAria(label)"
      @click="chartClick"
      @mouseover="chartHover"
      @mouseout="chartLeave"
    />
    <p v-else-if="hasPoints" class="trend-empty">{{ t.onlyOneDay }}</p>
    <p v-else class="trend-empty">{{ emptyMessage }}</p>


    <dl v-if="stats.length && !hideStats" class="trend-stats">
      <div v-for="row in stats" :key="row.label">
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}<i v-if="unit">{{ unit }}</i></dd>
      </div>
    </dl>
    <!-- 没有统计也占住第四行：subgrid 要求每张卡的行数一样。 -->
    <span v-else class="trend-stats-empty" aria-hidden="true"></span>
  </section>
</template>

<style scoped>
/* 和概览卡同一种有厚度的板：不描边，边界靠顶边高光、底边暗线和投影。 */
.trend-card {
  display: grid;
  /* 在 .trend-grid 里：四块各占父网格的一行（subgrid），同一行的卡互相对齐；
     单独放在别处时退回普通的四行网格。 */
  grid-row: span 4;
  grid-template-rows: subgrid;
  row-gap: var(--space-2);
  align-content: start;
  min-width: 0;
  padding: 18px 18px 16px;
  border-radius: var(--radius-lg);
  background: var(--mat-card);
  box-shadow: var(--mat-rim), var(--mat-shadow);
}
.trend-head { display: grid; align-content: start; gap: 4px; min-width: 0; }
.trend-title { min-width: 0; color: var(--ink); font-size: var(--fs-md); font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
.trend-latest { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 6px; min-width: 0; }
.trend-latest :deep(strong), .trend-latest strong { font-family: var(--font-mono); font-size: 26px; font-variant-numeric: tabular-nums; line-height: 1.15; }
.trend-latest :deep(small), .trend-latest small { color: var(--subtle); font-size: var(--fs-xs); }
.trend-latest :deep(small + strong) { margin-left: 8px; }
.trend-latest-tag { margin-right: 2px; color: var(--subtle); font-size: var(--fs-xs); font-style: normal; }
.trend-hint { color: var(--subtle); font-size: var(--fs-xs); line-height: 1.45; }
.trend-meta {
  display: flex;
  flex-wrap: wrap;
  align-content: start;
  gap: var(--space-1) var(--space-3);
  margin: 0;
  color: var(--subtle);
  font-size: var(--fs-xs);
}
.trend-date { font-variant-numeric: tabular-nums; }
.trend-band { color: var(--muted); }
.trend-widened { color: var(--muted); font-weight: 600; }
.trend-event-key { display: inline-flex; align-items: center; gap: 5px; color: var(--subtle); }
.trend-event-key i { width: 7px; height: 11px; border-radius: 2px; background: color-mix(in srgb, var(--subtle) 45%, transparent); }
.trend-chart, .trend-slot { width: 100%; height: 150px; align-self: end; }
.trend-slot > :deep(*) { width: 100%; height: 100%; }
.trend-empty {
  display: flex;
  align-items: center;
  min-height: 150px;
  margin: 0;
  color: var(--subtle);
  font-size: var(--fs-sm);
}
.trend-stats {
  display: flex;
  flex-wrap: wrap;
  align-self: start;
  gap: var(--space-2) var(--space-4);
  margin: 0;
  padding-top: var(--space-2);
  border-top: 1px solid var(--line);
}
.trend-stats > div { display: flex; align-items: baseline; gap: var(--space-1); }
.trend-stats dt { color: var(--subtle); font-size: var(--fs-xs); }
.trend-stats dd {
  margin: 0;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  font-variant-numeric: tabular-nums;
}
.trend-stats dd i { margin-left: 4px; color: var(--subtle); font-family: var(--font-sans, inherit); font-size: var(--fs-2xs); font-style: normal; }
</style>

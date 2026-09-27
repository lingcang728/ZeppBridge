<script setup lang="ts">
/* 概览的「最近心率」卡：只画最近几个小时，完整的 24 小时留给心率二级页。 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { resolvedTheme } from '../../composables/useTheme';
import { chartPalettes } from '../../lib/echartsTheme';
import { HR_GAP_BREAK_MS } from '../../lib/chartGaps';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { formatMetric, formatWhen, isFiniteNumber } from '../../lib/format';
import type { HeartRatePoint } from '../../types';
import GlyphTile from '../GlyphTile.vue';
import Icon from '../Icon.vue';
import HrMiniChart from './HrMiniChart.vue';
import { defineMessages, useMessages } from '../../i18n';

defineOptions({ name: 'OverviewHeartRateCard' });

const messages = defineMessages(
  {
    hrPanelAria: '打开心率详情，查看完整 24 小时',
    hrTitle: '最近心率',
    hrWindow: (hours: number) => `最近 ${hours} 小时`,
    latest: '最新',
    bpm: '次/分',
    hrChartAria: '24 小时心率曲线',
    hrZonesAria: '心率区间（绝对阈值）',
    hrEmpty: '同步后展示真实的心率波动。',
    hrStale: (hours: number, when: string) => `最近 ${hours} 小时云端还没有心率，最新一条在${when}。`,
    cloudLag: '手表的数据要先经 Zepp App 传到云端，ZeppBridge 才拉得到——拉取时间不等于数据时间。',
    latestAt: (when: string) => `最新一条 · ${when}`,
    hrMore: '完整 24 小时',
    zoneRest: '休息 0–99',
    zoneFat: '燃脂 100–139',
    zoneAerobic: '有氧 140–169',
    zoneAnaerobic: '无氧 170+',
  },
  {
    hrPanelAria: 'Open heart rate detail for the full 24 hours',
    hrTitle: 'Recent heart rate',
    hrWindow: (hours: number) => `Last ${hours} hours`,
    latest: 'Latest',
    bpm: 'bpm',
    hrChartAria: '24-hour heart rate curve',
    hrZonesAria: 'Heart rate zones (absolute thresholds)',
    hrEmpty: 'Real heart rate movement shows up here after a sync.',
    hrStale: (hours: number, when: string) => `No heart rate in the cloud for the last ${hours} hours yet; the newest reading is from ${when}.`,
    cloudLag: 'Watch data has to reach the cloud through the Zepp app before ZeppBridge can fetch it — the fetch time is not the data time.',
    latestAt: (when: string) => `Newest reading · ${when}`,
    hrMore: 'Full 24 hours',
    zoneRest: 'Rest 0–99',
    zoneFat: 'Fat burn 100–139',
    zoneAerobic: 'Aerobic 140–169',
    zoneAnaerobic: 'Anaerobic 170+',
  },
  {
    hrPanelAria: 'Abrir el detalle de frecuencia cardíaca de las 24 horas',
    hrTitle: 'Frecuencia cardíaca reciente',
    hrWindow: (hours: number) => `Últimas ${hours} horas`,
    latest: 'Última',
    bpm: 'lpm',
    hrChartAria: 'Curva de frecuencia cardíaca de 24 horas',
    hrZonesAria: 'Zonas de frecuencia cardíaca (umbrales absolutos)',
    hrEmpty: 'Tu frecuencia cardíaca real aparece aquí después de sincronizar.',
    hrStale: (hours: number, when: string) => `Aún no hay frecuencia cardíaca en la nube de las últimas ${hours} horas; la lectura más reciente es de ${when}.`,
    cloudLag: 'Los datos del reloj tienen que llegar a la nube a través de la app Zepp antes de que ZeppBridge pueda descargarlos: la hora de descarga no es la hora de los datos.',
    latestAt: (when: string) => `Lectura más reciente · ${when}`,
    hrMore: '24 horas completas',
    zoneRest: 'Reposo 0–99',
    zoneFat: 'Quema de grasa 100–139',
    zoneAerobic: 'Aeróbica 140–169',
    zoneAnaerobic: 'Anaeróbica 170+',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'components/overview/HeartRateCard',
);
const t = useMessages(messages);

/* 曲线由 HrMiniChart 用 SVG 画，不经过 ECharts：首页因此不用加载图表引擎。
   色值仍取自 echartsTheme，和二级页的图表同一套。 */
const chartPalette = computed(() => chartPalettes[resolvedTheme.value]);

const props = defineProps<{
  /** `getHeartRateSeries(6)` 的原始点；卡片自己截取窗口和算均值。 */
  points: HeartRatePoint[];
  /** `overview.current_hr`，没有就从序列末尾取。 */
  currentHr?: number | null;
  /** `overview.latest_heart_rate_at`：库里最新一条心率样本的时间（不是云端拉取时间）。 */
  latestAt?: string | null;
}>();

/* 窗口里一个点都没有、但库里有更早的心率：说清楚数据停在哪一刻，而不是一句
   「同步后展示」——用户刚同步过，看到这句只会以为同步坏了。 */
const latestWhen = computed(() => formatWhen(props.latestAt));

/**
 * 首页这张卡只画**最近几个小时**。
 *
 * 把整整 24 小时压进一张小卡，几百个点挤在两百来像素里，看到的是一团锯齿，
 * 既看不出「刚才怎么样」，也看不出趋势。完整的 24 小时留给心率二级页，那里
 * 有足够的宽度。
 */
const OVERVIEW_HR_WINDOW_HOURS = 5;

const allPoints = computed(() => props.points
  .map((point) => ({ ts: new Date(point.timestamp).getTime(), value: point.value }))
  .filter((point) => Number.isFinite(point.ts) && isFiniteNumber(point.value)));

const hrPoints = computed(() => {
  const points = allPoints.value;
  const newest = points[points.length - 1]?.ts;
  if (!newest) return points;
  const cutoff = newest - OVERVIEW_HR_WINDOW_HOURS * 3_600_000;
  return points.filter((point) => point.ts >= cutoff);
});
const hrLatest = computed(() => {
  if (isFiniteNumber(props.currentHr)) return props.currentHr;
  return hrPoints.value[hrPoints.value.length - 1]?.value ?? null;
});
const HR_ZONES = computed(() => [
  { key: 'rest', label: t.value.zoneRest },
  { key: 'fat', label: t.value.zoneFat },
  { key: 'aero', label: t.value.zoneAerobic },
  { key: 'an', label: t.value.zoneAnaerobic },
]);
const hrAverage = computed(() => {
  if (!hrPoints.value.length) return null;
  const sum = hrPoints.value.reduce((total, point) => total + point.value, 0);
  return Math.round(sum / hrPoints.value.length);
});

const num = (value: unknown) => isFiniteNumber(value) ? formatMetric(value) : '—';

const clock = (value: number) =>
  displayDateTimeFormatter({ hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
</script>

<template>
  <RouterLink class="metric-panel hr-panel" to="/heart" :aria-label="t.hrPanelAria">
    <div class="panel-head">
      <span class="panel-title"><span class="chart-icon"><GlyphTile name="heart-rate" :size="38" /></span><span><strong>{{ t.hrTitle }}</strong><small>{{ t.hrWindow(OVERVIEW_HR_WINDOW_HOURS) }}</small></span></span>
      <span class="panel-go" :title="t.hrMore" aria-hidden="true"><Icon name="chevron-right" :size="16" /></span>
    </div>
    <p class="panel-figure">
      <span class="figure-value">{{ num(hrLatest) }}<i>{{ t.bpm }}</i></span>
      <span v-if="latestWhen" class="figure-meta">{{ t.latestAt(latestWhen) }}</span>
    </p>
    <HrMiniChart v-if="hrPoints.length > 1" :points="hrPoints" :color="chartPalette.series.heart" :chrome="chartPalette"
      :gap-ms="HR_GAP_BREAK_MS" :average="hrAverage" :clock="clock" :unit="t.bpm" :label="t.hrChartAria" />
    <ul v-if="hrPoints.length > 1" class="hr-zones" :aria-label="t.hrZonesAria">
      <li v-for="zone in HR_ZONES" :key="zone.key">{{ zone.label }}</li>
    </ul>
    <div v-else class="panel-empty">
      <GlyphTile name="heart-rate" :size="56" />
      <span v-if="latestWhen" class="empty-copy"><span>{{ t.hrStale(OVERVIEW_HR_WINDOW_HOURS, latestWhen) }}</span><small>{{ t.cloudLag }}</small></span>
      <span v-else>{{ t.hrEmpty }}</span>
    </div>
  </RouterLink>
</template>

<style scoped>
/* 网格位置由父级的 .hr-card-slot 持有：本卡是异步 chunk，
   外壳要在它到达之前先占住同一个格子。 */
.hr-panel { display: flex; flex-direction: column; min-height: 286px; padding: 20px 20px 16px; }
.hr-panel .panel-figure { margin-bottom: 4px; }
.latest-when { display: block; flex-basis: 100%; margin-top: 2px; color: var(--subtle); font-size: var(--fs-2xs); font-style: normal; text-align: right; }
.empty-copy { display: grid; gap: 6px; max-width: 380px; }
.empty-copy small { color: var(--subtle); font-size: var(--fs-xs); line-height: 1.5; }
.hr-zones { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: auto 0 0; padding: 8px 0 0; list-style: none; color: var(--subtle); font-size: var(--fs-2xs); }
</style>

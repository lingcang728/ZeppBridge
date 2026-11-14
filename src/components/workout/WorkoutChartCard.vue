<script setup lang="ts">
/* 一张逐点折线图（心率 / 配速 / 海拔 / 步频）。台前调度（2026-11-13）起一图一卡，可以单独上舞台、并排、收进侧栏。
   图的配置在 lib/workoutCharts.ts，统计在 useWorkoutPresentation。

   卡拉大了不是把同一张图放大（2026-11-13 / 11-14 用户）：
   - 头部统计参照 Zepp 海拔页：大数字在上、小标签在下、竖线隔开；字号是固定 token，不随卡宽长
     （以前跟着 cqi 长，轴上的字却不长，两边大小对不上）；放不下一排就折成两 / 三列，数字不截断；
   - 图按卡的宽 × 高分三档加细节（withDetail：刻度更密、平均线标数、暂停铺灰、最高最低点、心率区间色带），整场一直都画；
   - 大档再在图下加一条占比：海拔是坡度分布（ElevationFacts），心率是各区间时长；
   - 窗口拉高时图吃掉多出来的高（卡根节点在窗口里被撑满，图 flex 伸开）。 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { DesignIconName } from '../DesignIcon.vue';
import GlyphTile from '../GlyphTile.vue';
import ElevationFacts from './ElevationFacts.vue';
import ShareBar, { type ShareSegment } from './ShareBar.vue';
import type { SlopeShare } from '../../lib/elevationProfile';
import type { ChartStat } from '../../composables/useWorkoutPresentation';
import type { GlyphTone } from '../../lib/glyphs';
import { CHART_THEME, VChart } from '../../lib/echartsSetup';
import { chartTier, fitTicks, withDetail, type ChartDetail, type ChartTier, type lineOption } from '../../lib/workoutCharts';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';

const props = defineProps<{
  card: {
    key: string; title: string; unit: string; option: NonNullable<ReturnType<typeof lineOption>>; detail?: ChartDetail;
    stats: ChartStat[] | null; icon: DesignIconName; tone: GlyphTone;
    /** 海拔卡：坡度分布（大档画在图下）。 */
    slope?: SlopeShare | null;
    /** 心率卡：各区间时长（大档画在图下）。 */
    zoneShare?: ShareSegment[] | null;
  };
}>();
const t = useMessages(workoutDetailMessages);
const root = ref<HTMLElement | null>(null);
const chart = ref<{ $el?: HTMLElement } | null>(null);
const tier = ref<ChartTier>('sm');
/** 图本身的高（刻度疏密跟着它走，lib/workoutCharts.fitTicks）。 */
const plotH = ref(0);
const option = computed(() => {
  const detailed = props.card.detail ? withDetail(props.card.option, tier.value, props.card.detail) : props.card.option;
  return plotH.value ? fitTicks(detailed, plotH.value - 40) : detailed;
});
const showSlope = computed(() => tier.value === 'lg' && !!props.card.slope);
const showZones = computed(() => tier.value === 'lg' && !!props.card.zoneShare?.length);
/** 数字长（配速 5'30"、四位数海拔）时降一档字号，免得一排挤不下被截。 */
const longStats = computed(() => (props.card.stats ?? []).some((stat) => stat.value.length > 5));

let observer: ResizeObserver | null = null;
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target === root.value) {
        // 按卡的宽 × 高分档（2026-11-14：只按宽分，拉高了什么都不加）。
        const next = chartTier(entry.contentRect.width, entry.contentRect.height);
        if (next !== tier.value) tier.value = next;
      } else {
        // 取整到 20 像素：拖边途中别每一帧都重算配置。
        const h = Math.round(entry.contentRect.height / 20) * 20;
        if (h !== plotH.value) plotH.value = h;
      }
    }
  });
  if (root.value) observer.observe(root.value);
  if (chart.value?.$el) observer.observe(chart.value.$el);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <section ref="root" :class="['surface-card', 'chart-card', `tone-${card.tone}`, `tier-${tier}`]" :aria-label="card.title">
    <div class="chart-head">
      <GlyphTile :name="card.icon" :tone="card.tone" :size="36" />
      <p class="card-title">{{ card.title }} <em>{{ card.unit }}</em></p>
    </div>
    <dl v-if="card.stats" :class="['chart-stats', { long: longStats }]" :style="{ '--stat-count': card.stats.length }">
      <div v-for="stat in card.stats" :key="stat.label"><dt>{{ stat.label }}</dt><dd>{{ stat.value }}</dd></div>
    </dl>
    <VChart ref="chart" class="series-chart" :key="CHART_THEME" :theme="CHART_THEME" :option="option" autoresize role="img" :aria-label="t.chartAria(card.title)" />
    <ElevationFacts v-if="showSlope" class="chart-extra" :slope="card.slope ?? null" :facts="false" />
    <ShareBar v-if="showZones" class="chart-extra" :title="t.chartZoneShare" :segments="card.zoneShare!" />
  </section>
</template>

<style scoped>
.chart-card {
  --chart-tone: var(--accent);
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 14px 16px 12px;
  border-radius: var(--radius-lg);
  container-type: inline-size;
}
/* 顶上一条同色的细光，替代以前那条写死的彩色边。 */
.chart-card::before { position: absolute; inset: 0 18px auto; height: 2px; content: ''; border-radius: 0 0 2px 2px; background: linear-gradient(90deg, var(--chart-tone), transparent); }
.chart-card.tone-heart { --chart-tone: var(--heart); }
.chart-card.tone-pace { --chart-tone: var(--pace); }
.chart-card.tone-altitude { --chart-tone: var(--altitude); }
.chart-card.tone-activity { --chart-tone: var(--activity); }
.chart-head { display: flex; flex: none; align-items: center; gap: 10px; min-width: 0; }
.card-title { flex: 1 1 auto; min-width: 0; margin: 0; color: var(--ink); font-size: var(--fs-lg); font-weight: 700; }
.card-title em { color: var(--subtle); font-size: var(--fs-sm); font-style: normal; font-weight: 400; }
/* 头部统计：一排最多五格、等宽、竖线隔开；大数字在上，小标签在下（dt 在前是为了 dl 语义，视觉上用 column-reverse 翻过来）。 */
.chart-stats {
  display: grid;
  flex: none;
  grid-template-columns: repeat(var(--stat-count), minmax(0, 1fr));
  margin: 12px 0 6px;
  font-variant-numeric: tabular-nums;
}
.chart-stats div { display: flex; flex-direction: column-reverse; gap: 2px; min-width: 0; padding: 1px 12px; }
.chart-stats div:first-child { padding-left: 2px; }
.chart-stats div + div { border-left: 1px solid var(--mat-line); }
.chart-stats dt { overflow: hidden; color: var(--subtle); font-size: var(--fs-2xs); text-overflow: ellipsis; white-space: nowrap; }
.chart-stats dd { margin: 0; color: var(--ink); font-family: 'Inter', var(--font-sans); font-size: var(--fs-3xl); font-weight: 600; line-height: 1.2; white-space: nowrap; }
.chart-stats.long dd { font-size: var(--fs-2xl); }
/* 窄卡：五格的折成三列，三四格的折成两列；折行后每行第一格去掉竖线。 */
@container (max-width: 440px) {
  .chart-stats { grid-template-columns: repeat(min(var(--stat-count), 3), minmax(0, 1fr)); row-gap: 10px; }
  .chart-stats dd, .chart-stats.long dd { font-size: var(--fs-xl); }
  .chart-stats div:nth-child(3n + 1) { padding-left: 2px; border-left: 0; }
}
@container (max-width: 300px) {
  .chart-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .chart-stats div:nth-child(3n + 1) { padding-left: 12px; border-left: 1px solid var(--mat-line); }
  .chart-stats div:nth-child(2n + 1) { padding-left: 2px; border-left: 0; }
}
.chart-extra { flex: none; margin: 10px 2px 2px; }
/* 卡宽了图也高一点（舞台上单独一张时不是一条扁线）；窗口拉高时图吃掉多出来的高；
   舞台铺满时（--fill-extra，StageWindow 给）图加上那截高，档位跟着卡的高往上走；一列放不下时它是负的，图变矮（最矮 120）。 */
.series-chart { flex: 1 0 auto; width: 100%; height: max(120px, calc(clamp(170px, 34cqw, 300px) + var(--fill-extra, 0px))); }
</style>

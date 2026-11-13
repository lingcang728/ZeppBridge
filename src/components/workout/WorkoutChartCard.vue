<script setup lang="ts">
/* 一张逐点折线图（心率 / 配速 / 海拔 / 步频）。台前调度（2026-11-13）起一图一卡，可以单独上舞台、并排、收进侧栏。
   图的配置在 lib/workoutCharts.ts，统计在 useWorkoutPresentation。

   卡拉大了（2026-11-13 用户：图变大字反而显得更小；大卡应该多给数据）：
   - 标题、最小 / 平均 / 最大跟着卡宽一起长（clamp + cqi），不再是固定字号；
   - 图按卡宽分三档加细节（withDetail：刻度更密、平均线标数、最高最低点、心率区间色带），整场一直都画；
   - 用户拉过下边时图吃掉多出来的高（卡根节点在窗口里被撑满，图 flex 伸开）。 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { DesignIconName } from '../DesignIcon.vue';
import GlyphTile from '../GlyphTile.vue';
import type { ChartStat } from '../../composables/useWorkoutPresentation';
import type { GlyphTone } from '../../lib/glyphs';
import { CHART_THEME, VChart } from '../../lib/echartsSetup';
import { chartTier, withDetail, type ChartDetail, type ChartTier, type lineOption } from '../../lib/workoutCharts';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';

const props = defineProps<{
  card: {
    key: string; title: string; unit: string; option: NonNullable<ReturnType<typeof lineOption>>; detail?: ChartDetail;
    stats: ChartStat[] | null; icon: DesignIconName; tone: GlyphTone;
  };
}>();
const t = useMessages(workoutDetailMessages);
const root = ref<HTMLElement | null>(null);
const tier = ref<ChartTier>('sm');
const option = computed(() => (props.card.detail ? withDetail(props.card.option, tier.value, props.card.detail) : props.card.option));

let observer: ResizeObserver | null = null;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    const next = chartTier(entry?.contentRect.width ?? 0);
    if (next !== tier.value) tier.value = next;
  });
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <section ref="root" :class="['surface-card', 'chart-card', `tone-${card.tone}`, `tier-${tier}`]" :aria-label="card.title">
    <div class="chart-head">
      <GlyphTile :name="card.icon" :tone="card.tone" :size="36" />
      <p class="card-title">{{ card.title }} <em>{{ card.unit }}</em></p>
      <ul v-if="card.stats" class="chart-stats">
        <li v-for="stat in card.stats" :key="stat.label"><em>{{ stat.label }}</em><strong>{{ stat.value }}</strong></li>
      </ul>
    </div>
    <VChart class="series-chart" :key="CHART_THEME" :theme="CHART_THEME" :option="option" autoresize role="img" :aria-label="t.chartAria(card.title)" />
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
.chart-head { display: flex; flex: none; align-items: center; gap: 10px 14px; min-width: 0; }
/* 字跟着卡宽长：最小是原来的 token，卡越宽越大，封顶。 */
.card-title { flex: 1 1 auto; min-width: 72px; margin: 0; color: var(--ink); font-size: clamp(var(--fs-lg), 2.4cqi, 26px); font-weight: 700; }
.card-title em { color: var(--subtle); font-size: clamp(var(--fs-sm), 1.5cqi, 17px); font-style: normal; font-weight: 400; }
.chart-stats {
  display: grid;
  grid-template-columns: repeat(3, max-content);
  justify-content: end;
  gap: 8px clamp(16px, 3cqi, 40px);
  margin: 1px 0 0 auto;
  min-width: 0;
  padding: 0;
  list-style: none;
  font-variant-numeric: tabular-nums;
}
.chart-stats li { display: grid; gap: 1px; min-width: 0; }
.chart-stats em { color: var(--subtle); font-size: clamp(var(--fs-2xs), 1.45cqi, 16px); font-style: normal; line-height: 1.2; }
.chart-stats strong { color: var(--ink); font-family: 'Inter', var(--font-sans); font-size: clamp(var(--fs-md), 3cqi, 32px); font-weight: 600; line-height: 1.25; white-space: nowrap; }
@container (max-width: 440px) {
  .chart-head { flex-wrap: wrap; }
  .chart-stats { width: 100%; margin-top: 6px; grid-template-columns: repeat(3, minmax(0, 1fr)); justify-content: stretch; gap: 8px 12px; }
}
/* 卡宽了图也高一点（舞台上单独一张时不是一条扁线）；窗口拉高时图吃掉多出来的高。 */
.series-chart { flex: 1 0 auto; width: 100%; height: clamp(170px, 34cqw, 300px); }
</style>

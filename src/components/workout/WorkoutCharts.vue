<script setup lang="ts">
/* 四张小折线图 + 心率区间分布。图的配置在 lib/workoutCharts.ts，统计在 useWorkoutPresentation。 */
import type { DesignIconName } from '../DesignIcon.vue';
import GlyphTile from '../GlyphTile.vue';
import type { ChartStat } from '../../composables/useWorkoutPresentation';
import type { GlyphTone } from '../../lib/glyphs';
import { CHART_THEME, VChart } from '../../lib/echartsSetup';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';

defineProps<{
  cards: { key: string; title: string; unit: string; option: Record<string, unknown>; stats: ChartStat[] | null; icon: DesignIconName; tone: GlyphTone }[];
  seriesError: string | null;
  hrZones: {
    totalLabel: string;
    rows: { index: number; range: string; duration: string; percent: number; percentLabel: string }[];
  } | null;
}>();
const emit = defineEmits<{ retry: [] }>();
const t = useMessages(workoutDetailMessages);
</script>

<template>
  <div class="chart-grid">
    <section v-for="card in cards" :key="card.key" :class="['surface-card', 'chart-card', `tone-${card.tone}`]" :aria-label="card.title">
      <div class="chart-head">
        <GlyphTile :name="card.icon" :tone="card.tone" :size="36" />
        <p class="card-title">{{ card.title }} <em>{{ card.unit }}</em></p>
        <ul v-if="card.stats" class="chart-stats">
          <li v-for="stat in card.stats" :key="stat.label"><em>{{ stat.label }}</em><strong>{{ stat.value }}</strong></li>
        </ul>
      </div>
      <VChart class="series-chart" :key="CHART_THEME" :theme="CHART_THEME" :option="card.option" autoresize role="img" :aria-label="t.chartAria(card.title)" />
    </section>
  </div>
  <section v-if="seriesError" class="surface-card chart-empty" role="alert">
    <GlyphTile name="structured-data" :size="42" />
    <div>
      <strong>{{ t.seriesFailedTitle }}</strong>
      <p>{{ seriesError }}</p>
      <button class="button button-secondary" type="button" @click="emit('retry')">{{ t.retry }}</button>
    </div>
  </section>
  <section v-else-if="!cards.length" class="surface-card chart-empty"><GlyphTile name="structured-data" :size="42" /><div><strong>{{ t.chartsEmptyTitle }}</strong><p>{{ t.chartsEmptyBody }}</p></div></section>

  <section v-if="hrZones" class="surface-card hr-zone-card" :aria-label="t.hrZonesAria">
    <div class="section-head">
      <GlyphTile name="heart-rate" :size="40" />
      <div><p class="section-eyebrow">{{ t.eyebrowHrZones }}</p><h2>{{ t.hrZonesTitle }}</h2></div>
      <span class="route-note">{{ t.hrZoneTotal(hrZones.totalLabel) }}</span>
    </div>
    <div class="hr-zone-bar" role="img" :aria-label="t.hrZoneBarAria">
      <span v-for="row in hrZones.rows" :key="row.index" :class="['hr-zone-fill', `zone-${row.index}`]" :style="{ width: `${row.percent}%` }"></span>
    </div>
    <ul class="hr-zone-list">
      <li v-for="row in hrZones.rows" :key="row.index">
        <i :class="['hr-zone-dot', `zone-${row.index}`]"></i>
        <span class="hr-zone-range">{{ row.range }}</span>
        <strong>{{ row.duration }}</strong>
        <em>{{ row.percentLabel }}</em>
      </li>
    </ul>
    <p class="mapping-note"><GlyphTile name="verified" :size="18" />{{ t.hrZonesNote }}</p>
  </section>
</template>

<style scoped>
.chart-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.chart-card { --chart-tone: var(--accent); position: relative; padding: 14px 16px 12px; border-radius: 18px; container-type: inline-size; }
/* 顶上一条同色的细光，替代以前那条写死的彩色边。 */
.chart-card::before { position: absolute; inset: 0 18px auto; height: 2px; content: ''; border-radius: 0 0 2px 2px; background: linear-gradient(90deg, var(--chart-tone), transparent); }
.chart-card.tone-heart { --chart-tone: var(--heart); }
.chart-card.tone-pace { --chart-tone: var(--pace); }
.chart-card.tone-altitude { --chart-tone: var(--altitude); }
.chart-card.tone-activity { --chart-tone: var(--activity); }
.chart-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.card-title { flex: 1 1 auto; min-width: 72px; margin: 0; color: var(--ink); font-size: var(--fs-lg); font-weight: 700; }
.card-title em { color: var(--subtle); font-size: var(--fs-sm); font-style: normal; font-weight: 400; }
.chart-stats { display: grid; grid-template-columns: repeat(3, max-content); justify-content: end; gap: 8px 16px; margin: 1px 0 0 auto; min-width: 0; padding: 0; list-style: none; font-variant-numeric: tabular-nums; }
.chart-stats li { display: grid; gap: 1px; min-width: 0; }
.chart-stats em { color: var(--subtle); font-size: var(--fs-2xs); font-style: normal; line-height: 1.2; }
.chart-stats strong { color: var(--ink); font-family: 'Inter', var(--font-sans); font-size: var(--fs-md); font-weight: 600; line-height: 1.4; white-space: nowrap; }
@container (max-width: 440px) {
  .chart-head { flex-wrap: wrap; }
  .chart-stats { width: 100%; margin-top: 6px; grid-template-columns: repeat(3, minmax(0, 1fr)); justify-content: stretch; gap: 8px 12px; }
}
.series-chart { width: 100%; height: 170px; }
.chart-empty { display: flex; align-items: center; gap: 12px; padding: 20px; color: var(--muted); font-size: var(--fs-sm); }
.chart-empty strong { color: var(--ink); }
.chart-empty p { margin: 2px 0 0; }
.hr-zone-card { padding: 22px; }
.section-head { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 20px; }
.section-head h2 { margin: 1px 0 0; font-size: var(--fs-2xl); letter-spacing: -.02em; }
.section-eyebrow { margin: 0; color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); font-weight: 700; letter-spacing: .16em; }
.route-note { margin-left: auto; color: var(--subtle); font-size: var(--fs-xs); }
.hr-zone-bar { display: flex; overflow: hidden; height: 15px; border-radius: 999px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.hr-zone-fill { min-width: 0; }
.hr-zone-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 14px 24px; margin: 20px 0 0; padding: 0; list-style: none; font-variant-numeric: tabular-nums; }
.hr-zone-list li { display: grid; grid-template-columns: 9px minmax(0, 1fr) auto 4.5em; align-items: center; gap: 10px; font-size: var(--fs-sm); }
.hr-zone-range { color: var(--muted); }
.hr-zone-list strong { color: var(--ink); font-family: 'Inter', var(--font-sans); font-weight: 600; white-space: nowrap; }
.hr-zone-list em { min-width: 46px; color: var(--subtle); font-style: normal; text-align: right; }
.hr-zone-dot { width: 9px; height: 9px; border-radius: 3px; }
/* 六段由凉到热，和心率本身的强度方向一致。手表最多下发六段。 */
.zone-0 { background: var(--pace); } .zone-1 { background: var(--route-mint); } .zone-2 { background: var(--training); }
.zone-3 { background: var(--altitude); } .zone-4 { background: var(--calories); } .zone-5 { background: var(--heart); }
.mapping-note { display: flex; align-items: flex-start; gap: 7px; margin: 20px 0 0; padding: 12px 14px; border-radius: 10px; background: var(--accent-soft); color: var(--muted); font-size: var(--fs-2xs); line-height: 1.7; }
@media (max-width: 760px) { .chart-grid { grid-template-columns: minmax(0, 1fr); } }
</style>

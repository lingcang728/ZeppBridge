<script setup lang="ts">
/* 运动详情的「概要」卡（原头图，2026-11-13 起是台前调度里的一张卡，能拖能缩）：设备、类型依据和一排指标。
 * 运动名、时间、纠正类型和问 AI 这些作用于整条运动的东西挪到了页面最上面一行（WorkoutDetail 的 #title / #actions）。 */
import DeviceVisual from '../DeviceVisual.vue';
import GlyphTile from '../GlyphTile.vue';
import type { HeroMetric } from '../../composables/useWorkoutPresentation';
import type { WorkoutMetrics } from '../../composables/useWorkoutDetail';
import { computed } from 'vue';
import { dataScopeLabel, workoutLabel } from '../../lib/labels';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';

const props = defineProps<{
  workout: WorkoutMetrics;
  displayType: string;
  deviceName: string;
  deviceImage: string | null | undefined;
  deviceKind: string;
  metrics: HeroMetric[];
  /** 海拔从哪来：挂在海拔那格的悬停提示上。 */
  altitudeNote?: string;
}>();
const t = useMessages(workoutDetailMessages);
/* 这次没给的指标不再各占一格「未提供」，收到网格末尾一行（U09），有数的格子按实际项数均分。 */
const isMissing = (metric: HeroMetric) => metric.value === t.value.notProvided || metric.value === '—';
const shownMetrics = computed(() => props.metrics.filter((metric) => !isMissing(metric)));
const missingLine = computed(() => {
  const missing = props.metrics.filter(isMissing).map((metric) => metric.label);
  return missing.length ? t.value.missingMetrics(missing.join(' · ')) : null;
});
</script>

<template>
  <section class="workout-hero" :aria-label="t.heroAria">
    <div class="hero-copy">
      <div class="hero-device">
        <DeviceVisual v-if="deviceImage" :src="deviceImage" :alt="deviceName" :kind="deviceKind" />
      </div>
      <div class="hero-title-group">
        <p class="hero-device-name">{{ deviceName }}</p>
        <div class="type-evidence">
          <!-- 追溯用的依据一次展开就全看到；平时不占主阅读区（U16）。 -->
          <details class="type-details">
            <summary>{{ t.evidenceSummary }}</summary>
            <div class="type-details-body" :aria-label="t.typeEvidenceAria">
              <span class="source-chip"><GlyphTile name="verified" :size="18" />{{ t.decodedLocally }} · {{ dataScopeLabel(workout.source_scope) }}</span>
              <span class="chip">{{ t.zeppRawCode(workout.zepp_type === undefined || workout.zepp_type === null ? t.notProvided : String(workout.zepp_type)) }}</span>
              <span class="chip">{{ t.zeppBridgeMatch(workoutLabel(workout.normalized_type)) }}</span>
              <span v-if="workout.custom_label" class="chip">{{ t.customName(String(workout.zepp_type), workout.custom_label) }}</span>
            </div>
          </details>
        </div>
      </div>
    </div>

    <div class="metric-list" :aria-label="t.metricListAria" :style="{ '--tiles': shownMetrics.length }">
      <div v-for="metric in shownMetrics" :key="metric.label" :class="['metric-tile', `tone-${metric.tone}`]" :title="metric.tone === 'altitude' ? altitudeNote : undefined">
        <GlyphTile :name="metric.icon" :tone="metric.tone" :role="metric.role" :size="36" />
        <div><p class="metric-label">{{ metric.label }}</p><p class="metric-value"><strong>{{ metric.value }}</strong><span v-if="metric.unit">{{ metric.unit }}</span></p></div>
      </div>
    </div>
    <p v-if="missingLine" class="metric-missing">{{ missingLine }}</p>
  </section>
</template>

<style scoped>
/* 头图是一张带类别微光的材质卡；指标卡是凹下去的小格，底色带一点各自类别的颜色。
   颜色全部来自 token，深浅两套主题不用再单独打补丁。 */
.workout-hero {
  position: relative;
  overflow: hidden;
  display: grid;
  gap: 18px;
  padding: 22px;
  border: 1px solid var(--mat-line);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--activity) 14%, transparent), transparent 32%),
    var(--mat-card);
  box-shadow: var(--mat-rim), var(--mat-shadow);
}
.hero-copy { position: relative; z-index: 1; display: flex; align-items: center; gap: 20px; min-width: 0; }
.hero-device { display: grid; justify-items: center; gap: 7px; flex: 0 0 auto; }
.hero-device :deep(.device-visual) { width: 84px; height: 84px; flex-basis: 84px; border-radius: 18px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.hero-device :deep(.device-visual img) { padding: 8px; }
.hero-title-group { min-width: 0; }
.source-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 27px; padding: 3px 10px 3px 5px; border: 1px solid transparent; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: var(--fs-xs); }
.hero-device-name { margin: 0; color: var(--ink); font-size: var(--fs-md); font-weight: 600; }
.type-evidence { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 10px; margin-top: 6px; color: var(--muted); font-size: var(--fs-xs); }
.type-details summary { display: inline-flex; align-items: center; min-height: 28px; color: var(--subtle); cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; }
.type-details summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 6px; }
.type-details[open] summary { color: var(--muted); }
.type-details-body { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 10px; margin-top: 6px; }
.metric-missing { position: relative; z-index: 1; margin: -6px 0 0; color: var(--subtle); font-size: var(--fs-xs); }
/* 一行能放下就按实际项数均分；放不下再退回自动换行。 */
.metric-list { position: relative; z-index: 1; display: grid; grid-template-columns: repeat(auto-fit, minmax(max(min(100%, 124px), calc((100% - (var(--tiles, 6) - 1) * 9px) / var(--tiles, 6))), 1fr)); gap: 9px; }
.metric-tile {
  --tile-tone: var(--accent);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  min-height: 116px;
  padding: 16px;
  border-radius: 15px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tile-tone) 11%, transparent), transparent 70%),
    var(--mat-inset);
  box-shadow: var(--mat-inset-shadow);
}
.metric-tile.tone-heart { --tile-tone: var(--heart); }
.metric-tile.tone-pace { --tile-tone: var(--pace); }
.metric-tile.tone-altitude { --tile-tone: var(--altitude); }
.metric-tile.tone-training { --tile-tone: var(--training); }
.metric-tile.tone-activity { --tile-tone: var(--activity); }
.metric-tile.tone-sleep { --tile-tone: var(--sleep); }
.metric-tile.tone-calories { --tile-tone: var(--calories); }
/* 名字折成两行的牌（波兰语「Obciążenie treningowe」）数值仍和同一排的对齐：数值贴牌底。 */
.metric-tile > div { display: flex; flex: 1; flex-direction: column; min-width: 0; max-width: 100%; }
.metric-label { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.metric-value { display: flex; align-items: baseline; gap: 5px; margin: auto 0 0; padding-top: 3px; flex-wrap: wrap; }
.metric-value strong { color: var(--ink); font-family: 'Inter', var(--font-sans); font-size: var(--fs-xl); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; font-weight: 700; letter-spacing: -.02em; }
.metric-value span { color: var(--muted); font-size: var(--fs-xs); }

@media (max-width: 760px) {
  .workout-hero { padding: 16px; border-radius: var(--radius-lg); }
  .hero-copy { align-items: flex-start; gap: 12px; }
  .hero-device :deep(.device-visual) { width: 64px; height: 64px; flex-basis: 64px; }
  .source-chip { font-size: var(--fs-2xs); }
  .metric-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .metric-tile { min-height: 70px; }
}
</style>

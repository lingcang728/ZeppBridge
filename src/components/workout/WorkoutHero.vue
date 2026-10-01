<script setup lang="ts">
/* 运动详情的头图：设备、运动名、时间、类型依据（含手动纠正）和一排指标卡。 */
import type { DesignIconName } from '../DesignIcon.vue';
import DeviceVisual from '../DeviceVisual.vue';
import GlyphTile from '../GlyphTile.vue';
import Icon from '../Icon.vue';
import TypePicker from './TypePicker.vue';
import type { HeroMetric } from '../../composables/useWorkoutPresentation';
import type { WorkoutMetrics } from '../../composables/useWorkoutDetail';
import { computed } from 'vue';
import { dataScopeLabel, workoutLabel } from '../../lib/labels';
import { formatDate, formatTime } from '../../lib/format';
import { workoutDisplayLabel } from '../../lib/workouts';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';

const props = defineProps<{
  workout: WorkoutMetrics;
  displayType: string;
  deviceName: string;
  deviceImage: string | null | undefined;
  deviceKind: string;
  workoutArt: DesignIconName;
  durationLabel: string;
  metrics: HeroMetric[];
  overrideChoices: { value: string; label: string }[];
  overrideBusy: boolean;
}>();
const emit = defineEmits<{ override: [value: string | number] }>();
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
        <span class="device-live"><i></i>{{ deviceName }}</span>
      </div>
      <div class="hero-title-group">
        <div class="sport-line">
          <GlyphTile :name="workoutArt" :size="60" />
          <h1 id="workout-detail-title">{{ workoutDisplayLabel(workout) || workoutLabel(displayType) }}</h1>
        </div>
        <p class="sport-time"><Icon name="clock" :size="14" />{{ formatDate(workout.start_time, 'short') }} {{ formatTime(workout.start_time) }} · {{ durationLabel }}</p>
        <div class="type-evidence">
          <span class="type-correct">
            {{ t.myCorrection }}
            <TypePicker
              :model-value="workout.user_override || ''"
              :items="overrideChoices"
              :disabled="overrideBusy"
              :label="t.correctionAria"
              @update:model-value="(value) => emit('override', value)"
            />
          </span>
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
      <div v-for="metric in shownMetrics" :key="metric.label" :class="['metric-tile', `tone-${metric.tone}`]">
        <GlyphTile :name="metric.icon" :tone="metric.tone" :size="36" />
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
.hero-device :deep(.device-visual) { width: 112px; height: 112px; flex-basis: 112px; border-radius: 22px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.hero-device :deep(.device-visual img) { padding: 8px; }
.device-live { display: inline-flex; align-items: center; gap: 5px; max-width: 132px; overflow: hidden; color: var(--muted); font-size: var(--fs-2xs); text-overflow: ellipsis; white-space: nowrap; }
.device-live i { width: 6px; height: 6px; border-radius: 50%; background: var(--readiness); box-shadow: 0 0 0 4px color-mix(in srgb, var(--readiness) 14%, transparent); }
.hero-title-group { min-width: 0; }
.source-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 27px; padding: 3px 10px 3px 5px; border: 1px solid transparent; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: var(--fs-xs); }
.sport-line { display: flex; align-items: center; gap: 12px; }
.sport-line h1 { margin: 0; color: var(--ink); font-size: clamp(25px, 3vw, 38px); line-height: 1.1; letter-spacing: -.04em; }
.sport-time { display: inline-flex; align-items: center; gap: 6px; margin: 9px 0 0; color: var(--muted); font-size: var(--fs-sm); }
.type-evidence { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 10px; margin-top: 10px; color: var(--muted); font-size: var(--fs-xs); }
.type-correct { display: inline-flex; align-items: center; gap: 7px; }
.type-details summary { display: inline-flex; align-items: center; min-height: 28px; color: var(--subtle); cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; }
.type-details summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 6px; }
.type-details[open] summary { color: var(--muted); }
.type-details-body { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 10px; margin-top: 6px; }
.metric-missing { position: relative; z-index: 1; margin: -6px 0 0; color: var(--subtle); font-size: var(--fs-xs); }
/* 一行能放下就按实际项数均分；放不下再退回自动换行。 */
.metric-list { position: relative; z-index: 1; display: grid; grid-template-columns: repeat(auto-fit, minmax(max(min(100%, 150px), calc((100% - (var(--tiles, 6) - 1) * 9px) / var(--tiles, 6))), 1fr)); gap: 9px; }
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
.metric-tile > div { min-width: 0; max-width: 100%; }
.metric-label { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.metric-value { display: flex; align-items: baseline; gap: 5px; margin: 3px 0 0; flex-wrap: wrap; }
.metric-value strong { color: var(--ink); font-family: 'Inter', var(--font-sans); font-size: var(--fs-xl); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; font-weight: 700; letter-spacing: -.02em; }
.metric-value span { color: var(--muted); font-size: var(--fs-xs); }

@media (max-width: 760px) {
  .workout-hero { padding: 16px; border-radius: var(--radius-lg); }
  .hero-copy { align-items: flex-start; gap: 12px; }
  .hero-device :deep(.device-visual) { width: 78px; height: 78px; flex-basis: 78px; }
  .device-live { display: none; }
  .sport-line h1 { font-size: 24px; }
  .source-chip { font-size: var(--fs-2xs); }
  .metric-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .metric-tile { min-height: 70px; }
}
</style>

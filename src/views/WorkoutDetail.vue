<script setup lang="ts">
/* 运动详情：整页就是台前调度（2026-11-13）。最上面一行是运动名和作用于整条运动的按钮（纠正类型、在本机隐藏、问 AI），
 * 下面舞台中间 1–3 张卡（默认「概要」卡在上、两张在下），其余卡斜排在左侧栏，点一下换上舞台；能组合、拆开、无级调大小、
 * 全屏、隐藏，按运动大类记住布局；「全部卡片」退回老版两栏（components/workout/stage/）。
 *
 * 数据和动作在 composables/useWorkoutDetail.ts，显示计算在 useWorkoutPresentation.ts，力量训练的联动在
 * useStrengthDetail.ts，轨迹几何和图表配置在 lib/workoutRoute.ts、lib/workoutCharts.ts，各张卡在 components/workout/。
 * 有哪些卡由这里按数据决定：没有数据的卡直接不出现，不放空卡。 */
import { computed, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import WorkoutTools from '../components/WorkoutTools.vue';
import { workoutToolsMessages } from '../components/WorkoutTools.i18n';
import EmptyState from '../components/EmptyState.vue';
import GlyphTile from '../components/GlyphTile.vue';
import Icon from '../components/Icon.vue';
import TypePicker from '../components/workout/TypePicker.vue';
import InsightCard from '../components/InsightCard.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import StageShell from '../components/workout/stage/StageShell.vue';
import WorkoutChartCard from '../components/workout/WorkoutChartCard.vue';
import WorkoutClimbsCard from '../components/workout/WorkoutClimbsCard.vue';
import WorkoutDecodedCard from '../components/workout/WorkoutDecodedCard.vue';
import WorkoutExportCard from '../components/workout/WorkoutExportCard.vue';
import WorkoutHero from '../components/workout/WorkoutHero.vue';
import WorkoutHrZonesCard from '../components/workout/WorkoutHrZonesCard.vue';
import WorkoutRouteCard from '../components/workout/WorkoutRouteCard.vue';
import WorkoutSeriesStatusCard from '../components/workout/WorkoutSeriesStatusCard.vue';
import WorkoutStrengthCard from '../components/workout/WorkoutStrengthCard.vue';
import WorkoutStrengthMapCard from '../components/workout/WorkoutStrengthMapCard.vue';
import WorkoutFeelCard from '../components/workout/WorkoutFeelCard.vue';
import WorkoutProvenanceCard from '../components/workout/WorkoutProvenanceCard.vue';
import AskAiButton from '../components/ask/AskAiButton.vue';
import { CARD_GLYPHS, WORKOUT_CARDS, type StageCard } from '../components/workout/workoutCards';
import { stageMessages } from '../components/workout/stage/stage.i18n';
import { workoutLabel } from '../lib/labels';
import { workoutDisplayLabel } from '../lib/workouts';
import { formatDate, formatTime } from '../lib/format';
import { expectsRoute } from '../lib/workoutGps';
import { sportClass } from '../lib/stage/prefs';
import { useWorkoutDetail } from '../composables/useWorkoutDetail';
import { useWorkoutFitCorrection } from '../composables/useWorkoutFitCorrection';
import { useWorkoutPresentation } from '../composables/useWorkoutPresentation';
import { useStrengthDetail } from '../composables/useStrengthDetail';
import type { StrengthWorkoutDetail } from '../types';
import { useMessages } from '../i18n';
import { holdInPlace } from '../lib/motion/holdInPlace';
import { workoutDetailMessages as messages } from './WorkoutDetail.i18n';

defineOptions({ name: 'WorkoutDetail' });
const router = useRouter();
const tools = useMessages(workoutToolsMessages);
const stageText = useMessages(stageMessages);

const t = useMessages(messages);
const route = useRoute();
const workoutId = computed(() => String(route.params.workoutId || ''));

const {
  workout, series, device, loading, error, actionError, exportedNote, activeFormat, exportBusy, displayType,
  insight, insightLoading, insightError, seriesError,
  typeOverrideBusy, typeOverrideChoices, changeWorkoutOverride,
  loadDetail, exportRecord,
} = useWorkoutDetail(workoutId);
/* reactive 包一层：模板里不用写 .value，状态（刚才那句提示）跟着卡走。 */
const fit = reactive(useWorkoutFitCorrection(workoutId));

const {
  durationMinutes, formatClock, workoutArt, deviceName, deviceImage, deviceKind,
  heroMetrics, routeCanvas, chartCards, hrZones, decodedMetrics, syncBadge, slope,
} = useWorkoutPresentation(workout, series, device, displayType);
/* 海拔的出处说明挂在「累计爬升」那格的悬停提示上，不在页面里再占一行小字。 */
const hasAltitude = computed(() => Boolean(series.value?.samples.some(sample => sample.altitude_m != null) || series.value?.summary.elevation_gain_m != null || workout.value?.elevation_gain_m != null));
/* 爬升卡顶上的起伏概览：最低 / 最高取逐点海拔（和海拔图的统计同一份），累计上升 / 下降取记录汇总。 */
const relief = computed(() => {
  const heights = (series.value?.samples ?? []).map(sample => sample.altitude_m).filter((v): v is number => v != null && v >= -500 && v <= 10_000);
  const gain = workout.value?.elevation_gain_m ?? series.value?.summary.elevation_gain_m ?? null;
  const loss = workout.value?.elevation_loss_m ?? series.value?.summary.elevation_loss_m ?? null;
  return { min: heights.length ? Math.min(...heights) : null, max: heights.length ? Math.max(...heights) : null, gain, loss };
});
/* 没有距离的运动（力量训练、瑜伽……）和室内运动本来就没有 GPS：不放「没有轨迹」那张提示，页脚也不提轨迹（2026-11-13）。 */
const routeExpected = computed(() => !!routeCanvas.value || expectsRoute(displayType.value, workout.value?.distance_meters));
const sportName = computed(() => (workout.value ? workoutDisplayLabel(workout.value) || workoutLabel(displayType.value) : ''));

/* 力量训练：逐组明细和肌肉人形两张卡共用一份联动状态。 */
const NO_STRENGTH: StrengthWorkoutDetail = { total_sets: 0, total_reps: 0, sets: [], exercise_groups: [] };
const strength = computed(() => series.value?.strength ?? NO_STRENGTH);
const strengthDetail = useStrengthDetail(strength);

const charts = computed(() => new Map(chartCards.value.map((card) => [`chart-${card.key}`, card])));
const stageCards = computed<StageCard[]>(() => {
  const names = stageText.value.cards;
  const on = new Map<string, Omit<StageCard, 'id'>>();
  const put = (id: string, title: string, glyph = CARD_GLYPHS[id]) => on.set(id, { title, icon: glyph.icon, tone: glyph.tone });
  put('summary', names.summary, { ...CARD_GLYPHS.summary, icon: workoutArt.value });
  if (insightLoading.value || insightError.value || insight.value?.supported) put('insight', names.insight);
  if (series.value?.strength) {
    put('strength-sets', names['strength-sets']);
    if (strengthDetail.hasMap.value) put('strength-map', names['strength-map']);
  }
  if (routeExpected.value) put('route', names.route, { ...CARD_GLYPHS.route, icon: workoutArt.value === 'outdoor-cycling' ? 'outdoor-cycling' : 'outdoor-run' });
  if (series.value?.climbs) put('climbs', names.climbs);
  for (const [id, card] of charts.value) put(id, card.title, { icon: card.icon, tone: card.tone });
  if (hrZones.value) put('hr-zones', names['hr-zones']);
  if (seriesError.value || !chartCards.value.length) put('series-status', names['series-status']);
  for (const id of ['decoded', 'export', 'feel', 'provenance'] as const) put(id, names[id]);
  return WORKOUT_CARDS.filter((id) => on.has(id)).map((id) => ({ id, ...on.get(id)! }));
});
const sport = computed(() => sportClass(displayType.value, !!series.value?.strength));

</script>

<template>
  <section class="page workout-page" aria-labelledby="workout-detail-title">
    <!-- 骨架换成内容时交叉淡化（从卡展开进来时，换的那一下等形变放完）。 -->
    <Transition name="skeleton-out" @before-leave="holdInPlace">
      <div v-if="loading" class="detail-loading" aria-live="polite"><SkeletonBlock height="118px" /><SkeletonBlock height="280px" /></div>
    </Transition>
    <template v-if="!loading">
    <EmptyState v-if="error" tone="error" icon="warning" :title="t.loadFailedTitle" :message="error"><button class="button button-secondary" type="button" @click="loadDetail">{{ t.retry }}</button></EmptyState>
    <EmptyState v-else-if="!workout" icon="steps" :title="t.notFoundTitle" :message="t.notFoundMessage" />

    <template v-else>
      <StageShell :cards="stageCards" :sport="sport">
        <template #title>
          <div class="detail-title">
            <GlyphTile :name="workoutArt" tone="activity" :size="46" />
            <div class="detail-name">
              <h1 id="workout-detail-title">{{ sportName }}</h1>
              <p class="detail-time"><Icon name="clock" :size="14" />{{ formatDate(workout.start_time, 'short') }} {{ formatTime(workout.start_time) }} · {{ formatClock(durationMinutes) }}</p>
            </div>
          </div>
          <p v-if="workout.effective_type === 'strength' && !series?.strength?.sets?.length" class="footnote">{{ tools.strengthHint }}</p>
        </template>
        <!-- 作用于整条运动、和哪张卡无关的按钮：纠正类型、在本机隐藏、问 AI（问 AI 从概要卡长出去）。 -->
        <template #actions>
          <span class="type-correct">
            {{ t.myCorrection }}
            <TypePicker
              :model-value="workout.user_override || ''"
              :items="typeOverrideChoices"
              :disabled="typeOverrideBusy"
              :label="t.correctionAria"
              @update:model-value="changeWorkoutOverride"
            />
          </span>
          <WorkoutTools single :ids="[workout.workout_id]" @changed="hidden => hidden ? router.push('/workouts') : loadDetail()" />
          <AskAiButton :workout="{ id: workout.workout_id, label: sportName }" :label="sportName" card=".workout-hero" />
        </template>

        <template #summary>
          <WorkoutHero
            :workout="workout"
            :display-type="displayType"
            :device-name="deviceName"
            :device-image="deviceImage"
            :device-kind="deviceKind"
            :metrics="heroMetrics"
            :altitude-note="hasAltitude ? tools.altitudeHint : undefined"
          />
        </template>

        <!-- 不支持这类运动的洞察时整张不出现：一张只会说「暂不支持」的卡片除了占地方和让人困惑之外没有别的作用。 -->
        <template #insight><InsightCard :insight="insight" :loading="insightLoading" :error="insightError" /></template>
        <template #strength-sets><WorkoutStrengthCard v-if="series?.strength" :strength="series.strength" :detail="strengthDetail" /></template>
        <template #strength-map><WorkoutStrengthMapCard :detail="strengthDetail" /></template>
        <template #route><WorkoutRouteCard :canvas="routeCanvas" /></template>
        <template #climbs><WorkoutClimbsCard v-if="series?.climbs" :climbs="series.climbs" :cycling="workoutArt === 'outdoor-cycling'" :relief="relief" :slope="slope" /></template>
        <template v-for="[id, card] in charts" #[id]><WorkoutChartCard :card="card" /></template>
        <template #hr-zones><WorkoutHrZonesCard v-if="hrZones" :zones="hrZones" /></template>
        <template #series-status><WorkoutSeriesStatusCard :error="seriesError" @retry="loadDetail" /></template>
        <template #decoded><WorkoutDecodedCard :decoded="decodedMetrics" /></template>
        <template #export>
          <WorkoutExportCard v-model:format="activeFormat" :export-busy="exportBusy" :exported-note="exportedNote" :action-error="actionError" @export="exportRecord" />
        </template>
        <template #feel><WorkoutFeelCard :workout-id="workoutId" /></template>
        <template #provenance>
          <WorkoutProvenanceCard :workout="workout" :device-name="deviceName" :sync-badge="syncBadge" :fit="fit" @replace-fit="fit.replace" @restore-fit="fit.restore" />
        </template>
      </StageShell>
      <p class="page-foot"><GlyphTile name="secure" :size="18" />{{ routeExpected ? t.pageFoot : t.pageFootNoRoute }}</p>
    </template>
    </template>
  </section>
</template>

<style scoped>
.workout-page { width: 100%; display: grid; gap: 16px; align-content: start; }
.detail-loading { display: grid; gap: 12px; }
.page-foot { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 2px 0 0; color: var(--subtle); font-size: var(--fs-xs); }
.detail-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
.detail-name { min-width: 0; }
.detail-name h1 { margin: 0; overflow: hidden; color: var(--ink); font-size: clamp(22px, 2.4vw, 32px); line-height: 1.15; letter-spacing: -.03em; text-overflow: ellipsis; white-space: nowrap; }
.detail-time { display: inline-flex; align-items: center; gap: 6px; margin: 4px 0 0; color: var(--muted); font-size: var(--fs-sm); }
.type-correct { display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: var(--fs-xs); }
.footnote { margin: 6px 0 0; }
</style>

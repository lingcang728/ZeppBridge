<script setup lang="ts">
/* 运动详情：头图 → 洞察 → 轨迹 / 折线图 / 心率区间 → 右侧解析明细、导出、交给 AI、来源。
 *
 * 数据和动作在 composables/useWorkoutDetail.ts，显示计算在 useWorkoutPresentation.ts，
 * 轨迹几何和图表配置在 lib/workoutRoute.ts、lib/workoutCharts.ts，各块界面在 components/workout/。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import EmptyState from '../components/EmptyState.vue';
import GlyphTile from '../components/GlyphTile.vue';
import InsightCard from '../components/InsightCard.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import WorkoutCharts from '../components/workout/WorkoutCharts.vue';
import WorkoutHero from '../components/workout/WorkoutHero.vue';
import WorkoutRouteCard from '../components/workout/WorkoutRouteCard.vue';
import WorkoutSidePanels from '../components/workout/WorkoutSidePanels.vue';
import WorkoutProvenanceCard from '../components/workout/WorkoutProvenanceCard.vue';
import { useWorkoutDetail } from '../composables/useWorkoutDetail';
import { useWorkoutPresentation } from '../composables/useWorkoutPresentation';
import { useMessages } from '../i18n';
import { workoutDetailMessages as messages } from './WorkoutDetail.i18n';

defineOptions({ name: 'WorkoutDetail' });

const t = useMessages(messages);
const route = useRoute();
const workoutId = computed(() => String(route.params.workoutId || ''));

const {
  workout, series, device, loading, error, actionError, exportedNote, activeFormat, exportBusy, displayType,
  insight, insightLoading, insightError, seriesError,
  handoffState, handoffError, aiProviderId, aiProvider, aiProviderChoices, aiNote, sendWorkoutToAi,
  typeOverrideBusy, typeOverrideChoices, changeWorkoutOverride,
  loadDetail, exportRecord,
} = useWorkoutDetail(workoutId);

const {
  durationMinutes, formatClock, workoutArt, deviceName, deviceImage, deviceKind,
  heroMetrics, routeCanvas, chartCards, hrZones, decodedMetrics, syncBadge,
} = useWorkoutPresentation(workout, series, device, displayType);

/* 两列底部尽量齐平：「来源信息」放进（不算它自己时）更矮的那一列。没有轨迹的运动
   左列很短，以前右列的解析明细、导出、交给 AI、来源一路排下去，左下角空出一大片。 */
const lower = ref<HTMLElement | null>(null);
const metaInMain = ref(false);
const GAP = 16;
const balance = () => {
  const root = lower.value;
  if (!root) return;
  const [main, side] = [root.querySelector<HTMLElement>('.main-col'), root.querySelector<HTMLElement>('.side-col')];
  const meta = root.querySelector<HTMLElement>('.meta-card');
  if (!main || !side || !meta) return;
  // 窄窗口是单列，放哪都一样，留在右列原位。
  if (getComputedStyle(root).gridTemplateColumns.split(' ').length < 2) { metaInMain.value = false; return; }
  const own = meta.offsetHeight + GAP;
  const mainH = main.offsetHeight - (metaInMain.value ? own : 0);
  const sideH = side.offsetHeight - (metaInMain.value ? 0 : own);
  const next = mainH < sideH;
  if (next !== metaInMain.value) metaInMain.value = next;
};
let observer: ResizeObserver | null = null;
let frame = 0;
const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(balance); };
watch(lower, (el, old) => {
  if (old) observer?.disconnect();
  if (!el) return;
  observer ??= new ResizeObserver(schedule);
  void nextTick(() => {
    el.querySelectorAll('.main-col, .side-col').forEach((col) => observer?.observe(col));
    observer?.observe(el);
    schedule();
  });
});
onMounted(schedule);
onBeforeUnmount(() => { observer?.disconnect(); cancelAnimationFrame(frame); });
</script>

<template>
  <section class="page workout-page" aria-labelledby="workout-detail-title">
    <div v-if="loading" class="detail-loading" aria-live="polite"><SkeletonBlock height="118px" /><SkeletonBlock height="280px" /></div>
    <EmptyState v-else-if="error" tone="error" icon="warning" :title="t.loadFailedTitle" :message="error"><button class="button button-secondary" type="button" @click="loadDetail">{{ t.retry }}</button></EmptyState>
    <EmptyState v-else-if="!workout" icon="steps" :title="t.notFoundTitle" :message="t.notFoundMessage" />

    <template v-else>
      <WorkoutHero
        :workout="workout"
        :display-type="displayType"
        :device-name="deviceName"
        :device-image="deviceImage"
        :device-kind="deviceKind"
        :workout-art="workoutArt"
        :duration-label="formatClock(durationMinutes)"
        :metrics="heroMetrics"
        :override-choices="typeOverrideChoices"
        :override-busy="typeOverrideBusy"
        @override="changeWorkoutOverride"
      />

      <!-- 不支持这类运动的洞察时整块不渲染：一张只会说「暂不支持」的卡片
           除了占地方和让人困惑之外没有别的作用。 -->
      <InsightCard
        v-if="insightLoading || insightError || insight?.supported"
        :insight="insight"
        :loading="insightLoading"
        :error="insightError"
        @handoff="sendWorkoutToAi"
      />

      <div ref="lower" class="lower">
        <div class="main-col">
          <WorkoutRouteCard :canvas="routeCanvas" />
          <WorkoutCharts :cards="chartCards" :series-error="seriesError" :hr-zones="hrZones" @retry="loadDetail" />
          <WorkoutProvenanceCard v-if="metaInMain" :workout="workout" :device-name="deviceName" :sync-badge="syncBadge" />
        </div>
        <WorkoutSidePanels
          v-model:format="activeFormat"
          v-model:provider="aiProviderId"
          :workout="workout"
          :decoded="decodedMetrics"
          :export-busy="exportBusy"
          :exported-note="exportedNote"
          :action-error="actionError"
          :ai-provider-choices="aiProviderChoices"
          :ai-provider-label="aiProvider.label"
          :handoff-busy="handoffState === 'preparing'"
          :ai-note="aiNote"
          :handoff-error="handoffError"
          :device-name="deviceName"
          :sync-badge="syncBadge"
          @export="exportRecord"
          @handoff="sendWorkoutToAi"
        >
          <template #after>
            <WorkoutProvenanceCard v-if="!metaInMain" :workout="workout" :device-name="deviceName" :sync-badge="syncBadge" />
          </template>
        </WorkoutSidePanels>
      </div>
      <p class="page-foot"><GlyphTile name="secure" :size="18" />{{ t.pageFoot }}</p>
    </template>
  </section>
</template>

<style scoped>
.workout-page { width: 100%; display: grid; gap: 16px; align-content: start; }
.detail-loading { display: grid; gap: 12px; }
.lower { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(310px, .72fr); align-items: start; gap: 16px; }
.main-col { display: grid; gap: 16px; min-width: 0; }
.page-foot { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 2px 0 0; color: var(--subtle); font-size: var(--fs-xs); }
@media (max-width: 1180px) { .lower { grid-template-columns: minmax(0, 1fr); } }
</style>

<script setup lang="ts">
defineOptions({ name: 'WorkoutList' });
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../components/Icon.vue';
import PageHeader from '../components/PageHeader.vue';
import RecordRow from '../components/RecordRow.vue';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { useSyncController } from '../composables/useSyncController';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { formatDate, formatDuration, isFiniteNumber } from '../lib/format';
import { displayableWorkouts, workoutDisplayLabel, workoutDisplayType, workoutDurationMinutes } from '../lib/workouts';
import type { Workout } from '../types';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    backToRecent: '返回最近记录',
    backToOverview: '返回概览',
    title: '运动',
    intro: '本机已同步的运动记录。没有轨迹时不画地图。',
    loadFailedTitle: '无法读取运动记录',
    loadFailed: '运动列表暂时不可用',
    retry: '重试',
    emptyTitle: '没有可展示的运动记录',
    emptyMessage: '同步后，只有包含类型、时间和至少一项有效指标的记录会显示在这里。没有 GPS 或逐点样本时不会画空图。',
    kilometres: (value: string) => `${value} 公里`,
    metres: (value: number) => `${value} 米`,
    labelDistance: '距离',
    labelBurn: '消耗',
    labelDuration: '时长',
    notProvided: '未提供',
    footnote: (count: number) => `${count} 条可展示记录`,
    shown: (loaded: number, total: number) => `已读取 ${loaded} / 共 ${total} 条`,
    loadMore: '加载更多',
    loadingMore: '正在加载…',
  },
  {
    backToRecent: 'Back to recent records',
    backToOverview: 'Back to overview',
    title: 'Workouts',
    intro: 'Workouts synced to this machine. No track, no map.',
    loadFailedTitle: 'Could not read the workouts',
    loadFailed: 'The workout list is unavailable right now',
    retry: 'Try again',
    emptyTitle: 'Nothing to show yet',
    emptyMessage: 'After a sync, only records carrying a type, a time and at least one real metric appear here. Without GPS or per-point samples, no empty chart is drawn.',
    kilometres: (value: string) => `${value} km`,
    metres: (value: number) => `${value} m`,
    labelDistance: 'Distance',
    labelBurn: 'Burn',
    labelDuration: 'Duration',
    notProvided: 'Not provided',
    footnote: (count: number) => `${count} records shown`,
    shown: (loaded: number, total: number) => `Loaded ${loaded} of ${total}`,
    loadMore: 'Load more',
    loadingMore: 'Loading…',
  },
);
const t = useMessages(messages);

const { dataRevision } = useSyncController();
const workouts = ref<Workout[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const displayableList = computed(() => displayableWorkouts(workouts.value));
/*
 * 分页，不是上限。见 SleepList.vue 里的同一段说明（Reddit p6zxyo7）。
 *
 * 注意这里有两个数字，不能混：`total` 是库里的**全部**运动记录数，
 * `displayableList.length` 是过滤掉不可展示项之后**这一屏**的条数。所以
 * 「已读取 X / 共 N」用的是取回来的原始条数，「N 条可展示记录」保持原样。
 * 把两者混成一句会让人以为应用丢了记录。
 */
const PAGE_SIZE = 200;
const total = ref(0);
const loadingMore = ref(false);
const hasMore = computed(() => workouts.value.length < total.value);

function workoutTypeBg(type: string): string {
  const map: Record<string, string> = {
    run: 'var(--route-mint)',
    running: 'var(--route-mint)',
    trail: 'var(--route-mint)',
    walk: 'var(--route-cyan)',
    walking: 'var(--route-cyan)',
    hiking: 'var(--route-cyan)',
    treadmill: 'var(--route-amber)',
    indoor_run: 'var(--route-amber)',
    ride: 'var(--route-cyan)',
    cycling: 'var(--route-cyan)',
    swimming: 'var(--route-cyan)',
  };
  return map[type?.trim().toLowerCase()] ?? 'var(--route-mint)';
}

const workoutFact = (workout: Workout): { fact: string; label: string } => {
  const meters = workout.distance_meters;
  if (isFiniteNumber(meters) && meters > 0) {
    return {
      fact: meters >= 1000
        ? t.value.kilometres((meters / 1000).toFixed(2))
        : t.value.metres(Math.round(meters)),
      label: t.value.labelDistance,
    };
  }
  if (isFiniteNumber(workout.calories)) return { fact: `${Math.round(workout.calories)} kcal`, label: t.value.labelBurn };
  return { fact: formatDuration(workoutDurationMinutes(workout), t.value.notProvided), label: t.value.labelDuration };
};

const loadList = async () => {
  loading.value = true;
  error.value = null;
  if (!isTauri()) {
    loading.value = false;
    workouts.value = [];
    total.value = 0;
    return;
  }
  try {
    const page = await tauriApi.getWorkoutPage(PAGE_SIZE, 0);
    // 过滤留给 `displayableList`：这里保留原始条数，否则 offset 会和后端
    // 的行号对不上，越翻越漏。
    workouts.value = page.items;
    total.value = page.total;
  } catch (cause) {
    error.value = toUserMessage(cause, t.value.loadFailed);
  } finally {
    loading.value = false;
  }
};

const loadMore = async () => {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const page = await tauriApi.getWorkoutPage(PAGE_SIZE, workouts.value.length);
    const seen = new Set(workouts.value.map((item) => item.workout_id));
    workouts.value = [...workouts.value, ...page.items.filter((item) => !seen.has(item.workout_id))];
    total.value = page.total;
  } catch (cause) {
    error.value = toUserMessage(cause, t.value.loadFailed);
  } finally {
    loadingMore.value = false;
  }
};

onMounted(() => void loadList());
watch(dataRevision, () => void loadList());
</script>

<template>
  <section class="page list-page" aria-labelledby="workout-list-title">
    <RouterLink class="back-link" to="/recent"><Icon name="arrow-left" :size="14" />{{ t.backToRecent }}</RouterLink>
    <PageHeader back="/" :back-label="t.backToOverview" title-id="workout-list-title" :title="t.title" :intro="t.intro" />

    <div v-if="loading" class="surface-card" aria-live="polite">
      <SkeletonBlock height="56px" />
      <SkeletonBlock height="56px" />
      <SkeletonBlock height="56px" />
    </div>
    <EmptyState v-else-if="error" tone="error" icon="warning" :title="t.loadFailedTitle" :message="error">
      <button class="button button-secondary" type="button" @click="loadList">{{ t.retry }}</button>
    </EmptyState>
    <EmptyState v-else-if="!displayableList.length" icon="steps" :title="t.emptyTitle" :message="t.emptyMessage" />
    <div v-else class="surface-card">
      <RecordRow
        v-for="workout in displayableList"
        :key="workout.workout_id"
        :to="{ name: 'WorkoutDetail', params: { workoutId: workout.workout_id } }"
        category="activity"
        icon="run"
        :icon-bg="workoutTypeBg(workoutDisplayType(workout))"
        :kicker="formatDate(workout.start_time)"
        :title="workoutDisplayLabel(workout)"
        :fact="workoutFact(workout).fact"
        :fact-label="workoutFact(workout).label"
      />
    </div>
    <div v-if="hasMore" class="load-more">
      <button class="button button-secondary" type="button" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? t.loadingMore : t.loadMore }}
      </button>
    </div>
    <p v-if="displayableList.length" class="footnote">
      {{ t.shown(workouts.length, total) }} · {{ t.footnote(displayableList.length) }}
    </p>
  </section>
</template>

<style scoped>
.list-page { width: 100%; }
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 12px;
  text-decoration: none;
}
.back-link:hover { color: var(--accent); }
.load-more { display: flex; justify-content: center; margin-top: 12px; }
.footnote {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 12px;
}
</style>

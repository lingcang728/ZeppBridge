<script setup lang="ts">
defineOptions({ name: 'RecentRecords' });
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../components/Icon.vue';
import PageHeader from '../components/PageHeader.vue';
import RecordRow from '../components/RecordRow.vue';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { useSyncController } from '../composables/useSyncController';
import { workoutLabel } from '../lib/labels';
import { formatDate, formatDuration, isFiniteNumber } from '../lib/format';
import { displayableWorkouts, workoutDisplayLabel, workoutDisplayType, workoutDurationMinutes, workoutTypeKey } from '../lib/workouts';
import type { SleepSession, Workout } from '../types';
import { defineMessages, intlLocale, useMessages } from '../i18n';

const messages = defineMessages(
  {
    backToOverview: '返回概览',
    title: '最近记录',
    intro: '最近同步的睡眠与运动记录，合并查看。',
    loadingLabel: '正在加载最近记录',
    loadFailedTitle: '最近记录加载失败',
    retry: '重试',
    partialUnavailable: '部分数据暂时不可用',
    filterAll: '全部',
    recentSleep: '最近睡眠',
    recentWorkouts: '最近运动',
    countBadge: (count: number) => `共 ${count} 条`,
    seeAll: '查看全部',
    noSleep: '暂无睡眠记录',
    noWorkouts: '没有可展示的运动记录。',
    noWorkoutsOfType: '该运动类型没有可展示记录。',
    hiddenIncomplete: (count: number) => `${count} 条数据不完整已隐藏`,
    notProvided: '未提供',
    kilometres: (value: string) => `${value} 公里`,
    metres: (value: number) => `${value} 米`,
    dateUnknown: '日期未知',
    today: '今天',
    yesterday: '昨天',
    listDate: (month: number, day: number, weekday: string) => `${month}月${day}日（${weekday}）`,
  },
  {
    backToOverview: 'Back to overview',
    title: 'Recent records',
    intro: 'Recently synced sleep and workouts, side by side.',
    loadingLabel: 'Loading recent records',
    loadFailedTitle: 'Could not load the recent records',
    retry: 'Try again',
    partialUnavailable: 'Some data is unavailable right now',
    filterAll: 'All',
    recentSleep: 'Recent sleep',
    recentWorkouts: 'Recent workouts',
    countBadge: (count: number) => `${count} total`,
    seeAll: 'See all',
    noSleep: 'No sleep records yet',
    noWorkouts: 'Nothing to show here.',
    noWorkoutsOfType: 'Nothing to show for this workout type.',
    hiddenIncomplete: (count: number) => `${count} incomplete records hidden`,
    notProvided: 'Not provided',
    kilometres: (value: string) => `${value} km`,
    metres: (value: number) => `${value} m`,
    dateUnknown: 'Date unknown',
    today: 'Today',
    yesterday: 'Yesterday',
    listDate: (month: number, day: number, weekday: string) => `${weekday}, ${month}/${day}`,
  },
);
const t = useMessages(messages);

const loading = ref(true);
const error = ref<string | null>(null);
const partialWarning = ref<string | null>(null);
const recentSleep = ref<SleepSession[]>([]);
const recentWorkouts = ref<Workout[]>([]);
const { dataRevision } = useSyncController();

const activeFilter = ref('all');

const displayableRecentWorkouts = computed(() => displayableWorkouts(recentWorkouts.value));
const hiddenWorkoutsCount = computed(() => {
  return Math.max(0, recentWorkouts.value.length - displayableRecentWorkouts.value.length);
});

const workoutFilters = computed(() => {
  const seen = new Set<string>();
  const types = displayableRecentWorkouts.value
    .map(workoutTypeKey)
    .filter((type) => {
      if (!type || seen.has(type)) return false;
      seen.add(type);
      return true;
    });
  return [
    { label: t.value.filterAll, value: 'all', icon: 'grid' as const },
    ...types.map((type) => ({ label: workoutLabel(type), value: type, icon: 'run' as const })),
  ];
});

const filteredWorkouts = computed(() => activeFilter.value === 'all'
  ? displayableRecentWorkouts.value
  : displayableRecentWorkouts.value.filter((workout) => workoutTypeKey(workout) === activeFilter.value));

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

const loadRecent = async () => {
  loading.value = true;
  error.value = null;
  partialWarning.value = null;
  if (!isTauri()) {
    loading.value = false;
    recentSleep.value = [];
    recentWorkouts.value = [];
    return;
  }
  const [sleep, workouts] = await Promise.allSettled([
    tauriApi.getRecentSleep(500),
    tauriApi.getRecentWorkouts(500),
  ]);
  recentSleep.value = sleep.status === 'fulfilled' ? sleep.value : [];
  recentWorkouts.value = workouts.status === 'fulfilled' ? workouts.value : [];
  const rejected = [sleep, workouts].filter((result) => result.status === 'rejected');
  if (rejected.length) {
    partialWarning.value = toUserMessage(rejected[0].reason, t.value.partialUnavailable);
  }
  loading.value = false;
};

onMounted(() => void loadRecent());
watch(dataRevision, () => void loadRecent());
watch(workoutFilters, (filters) => {
  if (!filters.some((filter) => filter.value === activeFilter.value)) activeFilter.value = 'all';
});

const workoutFact = (workout: Workout): string => {
  const distance = shortDistance(workout.distance_meters);
  if (distance) return distance;
  if (isFiniteNumber(workout.calories)) return `${Math.round(workout.calories)} kcal`;
  const minutes = workoutDurationMinutes(workout);
  return formatDuration(minutes, t.value.notProvided);
};

function listDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t.value.dateUnknown;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = new Intl.DateTimeFormat(intlLocale(), { weekday: 'short' }).format(date);
  return t.value.listDate(month, day, weekday);
}

function shortDistance(meters?: number): string {
  if (!isFiniteNumber(meters) || meters <= 0) return '';
  return meters >= 1000
    ? t.value.kilometres((meters / 1000).toFixed(2))
    : t.value.metres(Math.round(meters));
}

function formatDateHint(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  const nowDate = new Date();
  const startOfToday = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  const startOfThat = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((startOfToday - startOfThat) / 86400000);
  if (diff === 0) return t.value.today;
  if (diff === 1) return t.value.yesterday;
  return listDate(value);
}
</script>

<template>
  <section class="page recent-page" aria-labelledby="recent-title">
    <PageHeader
      back="/"
      :back-label="t.backToOverview"
      title-id="recent-title"
      :title="t.title"
      :intro="t.intro"
    />

    <div v-if="partialWarning" class="partial-warning" role="status">
      <Icon name="info" :size="15" />
      <span>{{ partialWarning }}</span>
    </div>

    <div v-if="loading" class="recent-skeleton" :aria-label="t.loadingLabel" aria-live="polite">
      <div class="recent-grid">
        <SkeletonBlock height="100%" />
        <SkeletonBlock height="100%" />
      </div>
    </div>

    <EmptyState
      v-else-if="error"
      tone="error"
      icon="warning"
      :title="t.loadFailedTitle"
      :message="error"
    >
      <button class="button button-secondary" type="button" @click="loadRecent"><Icon name="refresh" :size="15" />{{ t.retry }}</button>
    </EmptyState>

    <div v-else class="recent-grid">
      <!-- 睡眠列 -->
      <section class="recent-col" aria-labelledby="recent-sleep-title">
        <div class="group-head">
          <h2 id="recent-sleep-title" class="col-label">
            <Icon name="moon" :size="15" /><span>{{ t.recentSleep }}</span>
            <em v-if="recentSleep.length">{{ t.countBadge(recentSleep.length) }}</em>
          </h2>
          <RouterLink class="see-all" to="/sleep">{{ t.seeAll }}<Icon name="arrow-right" :size="13" /></RouterLink>
        </div>
        <div class="surface-card list-card">
          <RecordRow
            v-for="session in recentSleep"
            :key="session.sleep_id"
            compact
            :to="{ name: 'SleepDetail', params: { sleepId: session.sleep_id } }"
            category="sleep"
            icon="moon"
            :kicker="formatDateHint(session.start_time)"
            :title="formatDuration(session.duration_minutes)"
            :fact="isFiniteNumber(session.score) ? String(Math.round(session.score)) : t.notProvided"
          />
          <div v-if="!recentSleep.length" class="empty-row">{{ t.noSleep }}</div>
        </div>
      </section>

      <!-- 运动列 -->
      <section class="recent-col" aria-labelledby="recent-workout-title">
        <div class="group-head">
          <h2 id="recent-workout-title" class="col-label">
            <Icon name="run" :size="15" /><span>{{ t.recentWorkouts }}</span>
            <em v-if="displayableRecentWorkouts.length">{{ t.countBadge(displayableRecentWorkouts.length) }}</em>
          </h2>
          <RouterLink class="see-all" to="/workouts">{{ t.seeAll }}<Icon name="arrow-right" :size="13" /></RouterLink>
        </div>
        <div class="filter-tabs">
          <button
            v-for="tab in workoutFilters"
            :key="tab.value"
            :class="['tab-button', { active: activeFilter === tab.value }]"
            type="button"
            @click="activeFilter = tab.value"
          >
            <Icon :name="tab.icon" :size="14" />
            <span>{{ tab.label }}</span>
          </button>
        </div>
        <div class="surface-card list-card">
          <div v-if="hiddenWorkoutsCount > 0" class="filter-note">
            <Icon name="info" :size="12" />
            <span>{{ t.hiddenIncomplete(hiddenWorkoutsCount) }}</span>
          </div>
          <RecordRow
            v-for="workout in filteredWorkouts"
            :key="workout.workout_id"
            compact
            :to="{ name: 'WorkoutDetail', params: { workoutId: workout.workout_id } }"
            category="activity"
            icon="run"
            :icon-bg="workoutTypeBg(workoutDisplayType(workout))"
            :kicker="formatDateHint(workout.start_time)"
            :title="workoutDisplayLabel(workout)"
            :fact="workoutFact(workout)"
          />
          <div v-if="!filteredWorkouts.length" class="empty-row">{{ activeFilter === 'all' ? t.noWorkouts : t.noWorkoutsOfType }}</div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.recent-page.page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.recent-skeleton { flex: 1; min-height: 0; }
.recent-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.recent-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  flex: 0 0 auto;
}
.col-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
}
.col-label svg { color: var(--sleep); }
.recent-col:last-child .col-label svg { color: var(--activity); }
.col-label em {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--muted);
  font-size: 11px;
  font-style: normal;
  font-weight: 400;
  font-family: var(--font-mono);
}
.see-all {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: 12px;
  text-decoration: none;
}
.see-all:hover { color: var(--accent); }
.list-card {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}
.filter-note {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  margin-bottom: 4px;
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--subtle);
  font-size: 11px;
}
.empty-row {
  padding: 18px 16px;
  color: var(--muted);
  font-size: 13px;
}
.partial-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--warning);
  font-size: 12px;
}
.partial-warning svg { color: var(--warning); }
.filter-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  padding: 4px;
  background: var(--surface-raised);
  border-radius: var(--radius-sm);
}
.tab-button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.tab-button:hover {
  background: var(--surface);
  color: var(--ink);
}
.tab-button.active {
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
}
@media (max-width: 860px) {
  .recent-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>

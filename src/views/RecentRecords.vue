<script setup lang="ts">
/* 最近记录：睡眠和运动排在同一条竖着的时间线上，按天分组，最上面是最新的。
 *
 * 以前是两列贴片（睡眠一列、运动一列），看不出它们在时间上的先后——昨晚睡得短、
 * 今早跑得慢，这两件事隔着一整屏。现在它们挨在一起。上面一枚胶囊切「全部 / 睡眠 /
 * 运动」，选运动时再多一个运动类型的滚轮；完整历史在「全部睡眠」「全部运动」。 */
defineOptions({ name: 'RecentRecords' });
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useFirstLoad } from '../composables/useFirstLoad';
import CapsuleWheel from '../components/CapsuleWheel.vue';
import EmptyState from '../components/EmptyState.vue';
import GlyphTile from '../components/GlyphTile.vue';
import Icon from '../components/Icon.vue';
import PageHeader from '../components/PageHeader.vue';
import SegmentTrack from '../components/SegmentTrack.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import type { DesignIconName } from '../components/DesignIcon.vue';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { useRevisionReload } from '../composables/useRevisionReload';
import { createLoadSeq } from '../lib/loadSeq';
import { holdInPlace } from '../lib/motion/holdInPlace';
import { today as currentToday } from '../lib/currentDay';
import { workoutLabel } from '../lib/labels';
import { formatDate, formatDistance, formatDuration, formatTime, isFiniteNumber, type HealthCategory } from '../lib/format';
import { displayableWorkouts, workoutDisplayLabel, workoutDurationMinutes, workoutIcon, workoutTypeKey } from '../lib/workouts';
import type { SleepSession, Workout } from '../types';
import { useMessages } from '../i18n';
import { recentRecordsMessages as messages } from './RecentRecords.i18n';

const t = useMessages(messages);

const loading = ref(true);
const initialLoading = useFirstLoad(loading);
const error = ref<string | null>(null);
const partialWarning = ref<string | null>(null);
const recentSleep = ref<SleepSession[]>([]);
const recentWorkouts = ref<Workout[]>([]);
const loadSeq = createLoadSeq();

type Kind = 'all' | 'sleep' | 'workout';
const kind = ref<Kind>('all');
const workoutType = ref('all');

const displayableRecentWorkouts = computed(() => displayableWorkouts(recentWorkouts.value));
const hiddenWorkoutsCount = computed(() => Math.max(0, recentWorkouts.value.length - displayableRecentWorkouts.value.length));

const kindItems = computed(() => [
  { value: 'all' as const, label: t.value.filterAll },
  { value: 'sleep' as const, label: t.value.filterSleep(recentSleep.value.length), icon: 'moon' as const },
  { value: 'workout' as const, label: t.value.filterWorkouts(displayableRecentWorkouts.value.length), icon: 'run' as const },
]);
const typeItems = computed(() => {
  const seen = new Set<string>();
  const types = displayableRecentWorkouts.value.map(workoutTypeKey).filter((type) => {
    if (!type || seen.has(type)) return false;
    seen.add(type);
    return true;
  });
  return [{ value: 'all', label: t.value.filterAll }, ...types.map((type) => ({ value: type, label: workoutLabel(type) }))];
});
// 列表还没回来（重查途中为空）时不动筛选：只有确实没有这一类了才退回「全部」。
watch(typeItems, (items) => {
  if (!recentWorkouts.value.length) return;
  if (!items.some((item) => item.value === workoutType.value)) workoutType.value = 'all';
});
watch(kind, () => { workoutType.value = 'all'; });

interface Entry {
  key: string;
  to: object;
  category: HealthCategory;
  icon: DesignIconName;
  /** 用来排序和分组的时刻：睡眠按醒来那一刻（归到醒来那天），运动按开始。 */
  at: number;
  day: string;
  time: string;
  title: string;
  fact: string;
  extra: string | null;
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const dayLabel = (date: Date) => {
  const today = currentToday();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(today) - start(date)) / 86_400_000);
  if (diff === 0) return t.value.today;
  if (diff === 1) return t.value.yesterday;
  return formatDate(date.toISOString(), 'long');
};

const workoutFact = (workout: Workout): string => {
  if (isFiniteNumber(workout.distance_meters) && workout.distance_meters > 0) return formatDistance(workout.distance_meters);
  const minutes = workoutDurationMinutes(workout);
  if (minutes) return formatDuration(minutes);
  if (isFiniteNumber(workout.calories)) return `${Math.round(workout.calories)} kcal`;
  return t.value.notProvided;
};

const entries = computed<Entry[]>(() => {
  const list: Entry[] = [];
  if (kind.value !== 'workout') {
    for (const sleep of recentSleep.value) {
      const at = new Date(sleep.end_time || sleep.start_time);
      if (Number.isNaN(at.getTime())) continue;
      list.push({
        key: `s-${sleep.sleep_id}`, to: { name: 'SleepDetail', params: { sleepId: sleep.sleep_id } }, category: 'sleep', icon: 'sleep',
        at: at.getTime(), day: dayKey(at), time: formatTime(sleep.start_time), title: t.value.sleepTitle,
        fact: formatDuration(sleep.duration_minutes, t.value.notProvided),
        extra: isFiniteNumber(sleep.score) ? t.value.sleepScore(Math.round(sleep.score)) : null,
      });
    }
  }
  if (kind.value !== 'sleep') {
    for (const workout of displayableRecentWorkouts.value) {
      if (workoutType.value !== 'all' && workoutTypeKey(workout) !== workoutType.value) continue;
      const at = new Date(workout.start_time);
      if (Number.isNaN(at.getTime())) continue;
      list.push({
        key: `w-${workout.workout_id}`, to: { name: 'WorkoutDetail', params: { workoutId: workout.workout_id } }, category: 'activity',
        icon: workoutIcon(workout), at: at.getTime(), day: dayKey(at), time: formatTime(workout.start_time), title: workoutDisplayLabel(workout),
        fact: workoutFact(workout), extra: isFiniteNumber(workout.avg_hr) ? t.value.avgHr(Math.round(workout.avg_hr)) : null,
      });
    }
  }
  return list.sort((a, b) => b.at - a.at);
});

const STEP = 30;
const visible = ref(STEP);
watch([kind, workoutType], () => { visible.value = STEP; });
const groups = computed(() => {
  const out: { day: string; label: string; items: Entry[] }[] = [];
  for (const entry of entries.value.slice(0, visible.value)) {
    const last = out[out.length - 1];
    if (last && last.day === entry.day) last.items.push(entry);
    else out.push({ day: entry.day, label: dayLabel(new Date(entry.at)), items: [entry] });
  }
  return out;
});

const loadRecent = async () => {
  const seq = loadSeq.next();
  loading.value = true;
  error.value = null;
  partialWarning.value = null;
  if (!isTauri()) {
    if (!loadSeq.isCurrent(seq)) return;
    recentSleep.value = [];
    recentWorkouts.value = [];
    loading.value = false;
    error.value = t.value.desktopOnly;
    return;
  }
  /* 各取最近 150 条：这一页是「最近」而不是全集，完整历史在 /sleep 与
     /workouts（那里有分页，见 getSleepPage）。 */
  const [sleep, workouts] = await Promise.allSettled([
    tauriApi.getRecentSleep(150),
    tauriApi.getRecentWorkouts(150),
  ]);
  if (!loadSeq.isCurrent(seq)) return;
  // 取失败的那一半保留上一次的结果：同步后库忙、重放进行中，一次失败不该把
  // 已经显示着的多年记录说成「没有记录」。
  if (sleep.status === 'fulfilled') recentSleep.value = sleep.value;
  if (workouts.status === 'fulfilled') recentWorkouts.value = workouts.value;
  const rejected = [sleep, workouts].filter((result) => result.status === 'rejected');
  const hadData = recentSleep.value.length > 0 || recentWorkouts.value.length > 0;
  if (rejected.length === 2 && !hadData) error.value = toUserMessage(rejected[0].reason, t.value.loadFailedTitle);
  else if (rejected.length) partialWarning.value = toUserMessage(rejected[0].reason, t.value.partialUnavailable);
  loading.value = false;
};

onMounted(() => void loadRecent());
useRevisionReload(() => void loadRecent());
</script>

<template>
  <section class="page recent-page" aria-labelledby="recent-title">
    <PageHeader title-id="recent-title" :title="t.title" :intro="t.introTimeline" />

    <div v-if="partialWarning" class="partial-warning" role="status"><Icon name="info" :size="15" /><span>{{ partialWarning }}</span></div>

    <div v-if="initialLoading" class="recent-skeleton" :aria-label="t.loadingLabel" aria-live="polite">
      <SkeletonBlock v-for="index in 4" :key="index" height="72px" />
    </div>

    <EmptyState v-else-if="error" tone="error" icon="warning" :title="t.loadFailedTitle" :message="error">
      <button v-if="isTauri()" class="button button-secondary" type="button" @click="loadRecent"><Icon name="refresh" :size="15" />{{ t.retry }}</button>
    </EmptyState>

    <template v-else>
      <div class="recent-toolbar">
        <SegmentTrack v-model="kind" :items="kindItems" :aria-label="t.title" />
        <CapsuleWheel v-if="kind === 'workout' && typeItems.length > 2" v-model="workoutType" loop :span="220"
          :items="typeItems" :aria-label="t.workoutTypeAria" />
      </div>
      <p v-if="kind !== 'sleep' && hiddenWorkoutsCount > 0" class="hidden-note"><Icon name="info" :size="13" />{{ t.hiddenIncomplete(hiddenWorkoutsCount) }}</p>

      <!-- 换筛选（睡眠 / 运动 / 全部、运动类型）时旧列表原地钉住淡出、新列表同时淡入，不再整块一帧换掉。 -->
      <Transition name="list-swap" @before-leave="holdInPlace">
      <div :key="`${kind}:${workoutType}`" class="recent-list">
      <p v-if="!entries.length" class="hidden-note">{{ kind === 'sleep' ? t.noSleep : kind === 'workout' ? (workoutType === 'all' ? t.noWorkouts : t.noWorkoutsOfType) : t.noRecords }}</p>

      <div v-else class="timeline">
        <section v-for="group in groups" :key="group.day" class="tl-day">
          <h2 class="tl-day-label"><span>{{ group.label }}</span></h2>
          <RouterLink v-for="entry in group.items" :key="entry.key" :to="entry.to" :class="['tl-row', `tone-${entry.category}`]">
            <span class="tl-time">{{ entry.time }}</span>
            <span class="tl-node" aria-hidden="true"><GlyphTile :name="entry.icon" :size="34" :tone="entry.category" /></span>
            <span class="tl-card">
              <strong>{{ entry.title }}</strong>
              <span class="tl-facts"><b>{{ entry.fact }}</b><template v-if="entry.extra"> · {{ entry.extra }}</template></span>
            </span>
            <Icon name="chevron-right" :size="16" class="tl-go" />
          </RouterLink>
        </section>
        <div v-if="entries.length > visible" class="tl-more">
          <button type="button" class="pill-button" @click="visible += STEP"><Icon name="chevron-down" :size="14" />{{ t.showMore(Math.min(STEP, entries.length - visible)) }}</button>
        </div>
      </div>
      </div>
      </Transition>
    </template>
  </section>
</template>

<style scoped src="./RecentRecords.css"></style>

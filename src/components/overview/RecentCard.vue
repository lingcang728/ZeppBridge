<script setup lang="ts">
/* 概览的「最近记录」卡：睡眠与运动混排的两列列表。 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import DesignIcon, { type DesignIconName } from '../DesignIcon.vue';
import RecordRow from '../RecordRow.vue';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { formatDistance, formatDuration, formatTime, isFiniteNumber, type HealthCategory } from '../../lib/format';
import { displayableWorkouts, workoutDisplayLabel, workoutDurationMinutes, workoutTypeKey } from '../../lib/workouts';
import type { SleepSession, Workout } from '../../types';
import { defineMessages, useMessages } from '../../i18n';

defineOptions({ name: 'OverviewRecentCard' });

const messages = defineMessages(
  {
    recentAria: '最近记录',
    recentTitle: '最近记录',
    recentSub: '睡眠、跑步与力量训练',
    seeAll: '查看全部',
    recentEmpty: '暂无记录，完成一次同步后展示。',
    sleepRecordTitle: '睡眠',
    sleepScore: (score: number) => `睡眠评分 ${score}`,
    avgHr: (value: number) => `均心率 ${value}`,
    timeUnknown: '时间未知',
  },
  {
    recentAria: 'Recent records',
    recentTitle: 'Recent records',
    recentSub: 'Sleep, runs and strength work',
    seeAll: 'See all',
    recentEmpty: 'Nothing recorded yet. Run a sync and it shows up here.',
    sleepRecordTitle: 'Sleep',
    sleepScore: (score: number) => `Sleep score ${score}`,
    avgHr: (value: number) => `Avg HR ${value}`,
    timeUnknown: 'Time unknown',
  },
  {
    recentAria: 'Registros recientes',
    recentTitle: 'Registros recientes',
    recentSub: 'Sueño, carreras y fuerza',
    seeAll: 'Ver todo',
    recentEmpty: 'Aún no hay registros. Sincroniza y aparecerán aquí.',
    sleepRecordTitle: 'Sueño',
    sleepScore: (score: number) => `Puntuación de sueño ${score}`,
    avgHr: (value: number) => `FC media ${value}`,
    timeUnknown: 'Hora desconocida',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'components/overview/RecentCard',
);
const t = useMessages(messages);

const props = defineProps<{
  sleep: SleepSession[];
  workouts: Workout[];
}>();

interface RecentItem {
  key: string;
  to: string;
  category: HealthCategory;
  icon: 'moon' | 'run';
  designIcon: DesignIconName;
  time: number;
  kicker: string;
  title: string;
  fact: string;
  factLabel?: string;
}
const shortDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t.value.timeUnknown;
  // 日月顺序跟着界面语言：西语读到 09/10 会理解成 9 月 10 日的反面。
  const short = displayDateTimeFormatter({ month: '2-digit', day: '2-digit' }).format(date);
  return `${short} ${formatTime(value)}`;
};
/* 只按运动的 key 分图标，不看显示名。
   显示名跟着界面语言变，拿它做分支判断，一换语言分类就悄悄失效。 */
const workoutPresentation = (workout: Workout): Pick<RecentItem, 'category' | 'designIcon'> => {
  const key = workoutTypeKey(workout);
  if (/strength|weight|core|hiit|gym/.test(key)) return { category: 'heart', designIcon: 'body-activity' };
  if (/cycl|ride|bike|bmx|spinning/.test(key)) return { category: 'activity', designIcon: 'outdoor-cycling' };
  return { category: 'activity', designIcon: 'outdoor-run' };
};
const recentItems = computed<RecentItem[]>(() => {
  const items: RecentItem[] = props.sleep.map((sleep) => ({
    key: `sleep-${sleep.sleep_id}`, to: `/sleep/${sleep.sleep_id}`, category: 'sleep', icon: 'moon', designIcon: 'sleep',
    time: new Date(sleep.end_time || sleep.start_time).getTime(), kicker: shortDateTime(sleep.start_time), title: t.value.sleepRecordTitle,
    fact: formatDuration(sleep.duration_minutes, '—'), factLabel: isFiniteNumber(sleep.score) ? t.value.sleepScore(sleep.score) : undefined,
  }));
  for (const workout of displayableWorkouts(props.workouts)) {
    const presentation = workoutPresentation(workout);
    items.push({
      key: `workout-${workout.workout_id}`, to: `/workouts/${workout.workout_id}`, ...presentation, icon: 'run',
      time: new Date(workout.start_time).getTime(), kicker: shortDateTime(workout.start_time), title: workoutDisplayLabel(workout),
      fact: isFiniteNumber(workout.distance_meters) && workout.distance_meters > 0 ? formatDistance(workout.distance_meters) : formatDuration(workoutDurationMinutes(workout), '—'),
      factLabel: isFiniteNumber(workout.avg_hr) ? t.value.avgHr(Math.round(workout.avg_hr)) : undefined,
    });
  }
  return items.sort((a, b) => b.time - a.time).slice(0, 5);
});
</script>

<template>
  <section class="metric-panel recent-panel" :aria-label="t.recentAria">
    <div class="panel-head"><span class="panel-title"><DesignIcon name="document" :size="38" /><span><strong>{{ t.recentTitle }}</strong><small>{{ t.recentSub }}</small></span></span><RouterLink class="text-link" to="/recent">{{ t.seeAll }} <DesignIcon name="chevron-right" :size="22" /></RouterLink></div>
    <div v-if="recentItems.length" class="recent-list"><RecordRow v-for="item in recentItems" :key="item.key" :to="item.to" :category="item.category" :icon="item.icon" :design-icon="item.designIcon" :kicker="item.kicker" :title="item.title" :fact="item.fact" :fact-label="item.factLabel" /></div>
    <div v-else class="panel-empty recent-empty"><DesignIcon name="document" :size="58" /><span>{{ t.recentEmpty }}</span></div>
  </section>
</template>

<style scoped>
.recent-panel { grid-column: 1 / -1; padding: 18px; }
.recent-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 12px; overflow: hidden; border: 1px solid var(--line); border-radius: 16px; }
.recent-list :deep(.record-row:nth-child(odd)) { border-right: 1px solid var(--line); }
.recent-list :deep(.record-row) { min-height: 72px; transition: background .2s ease, transform .2s ease; }
.recent-list :deep(.record-row:hover) { transform: translateX(2px); }
.recent-empty { min-height: 120px; }
@media (max-width: 820px) {
  .recent-panel { grid-column: 1; }
  .recent-list { grid-template-columns: minmax(0, 1fr); }
  .recent-list :deep(.record-row:nth-child(odd)) { border-right: 0; }
}
</style>

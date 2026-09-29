<script setup lang="ts">
/* 概览的「最近记录」卡：一条横着的时间线。
 *
 * 最近五条睡眠和运动从左到右由新到旧（最左是最新的一条，和最近记录页同一方向），每条是线上的一个节点
 * 加一枚小卡：什么时候、是什么、多长 / 多远。以前是两列贴片，看不出先后，也看不出
 * 它们在时间上隔了多久；现在一眼就是「这几天做了什么」。 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { DesignIconName } from '../DesignIcon.vue';
import GlyphTile from '../GlyphTile.vue';
import Icon from '../Icon.vue';
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
    newest: '最新',
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
    newest: 'Latest',
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
    newest: 'Más reciente',
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
  // 取最近五条，由新到旧：一眼先看到最新的。
  return items.sort((a, b) => b.time - a.time).slice(0, 5);
});
</script>

<template>
  <section class="metric-panel recent-panel" :aria-label="t.recentAria">
    <div class="panel-head"><span class="panel-title"><GlyphTile name="document" :size="38" /><span><strong>{{ t.recentTitle }}</strong><small>{{ t.recentSub }}</small></span></span><RouterLink class="pill-button" to="/recent">{{ t.seeAll }}<Icon name="chevron-right" :size="14" /></RouterLink></div>
    <ol v-if="recentItems.length" class="timeline">
      <li v-for="(item, index) in recentItems" :key="item.key" :class="['tl-item', `tone-${item.category}`, { newest: index === 0 }]">
        <RouterLink :to="item.to" class="tl-link">
          <span class="tl-when">{{ item.kicker }}<em v-if="index === 0">{{ t.newest }}</em></span>
          <span class="tl-node" aria-hidden="true"><GlyphTile :name="item.designIcon" :size="40" :tone="item.category" /></span>
          <strong class="tl-title">{{ item.title }}</strong>
          <span class="tl-fact">{{ item.fact }}<template v-if="item.factLabel"> · {{ item.factLabel }}</template></span>
        </RouterLink>
      </li>
    </ol>
    <div v-else class="panel-empty recent-empty"><GlyphTile name="document" :size="58" /><span>{{ t.recentEmpty }}</span></div>
  </section>
</template>

<style scoped>
.recent-panel { padding: 18px 20px 20px; }

/* 横着的时间线：一根从右到左渐亮的细线（最新在左）穿过每个节点，节点上方是时间，下方是内容。 */
.timeline { position: relative; display: grid; grid-auto-columns: minmax(150px, 1fr); grid-auto-flow: column; gap: 8px; margin: 16px 0 0; padding: 0 0 4px; overflow-x: auto; list-style: none; }
.timeline::before { content: ''; position: absolute; top: 50px; right: 6%; left: 6%; height: 2px; border-radius: 2px;
  background: linear-gradient(270deg, transparent, color-mix(in srgb, var(--ink) 16%, transparent) 12%, color-mix(in srgb, var(--accent) 55%, transparent)); }
.tl-link { position: relative; display: grid; justify-items: center; gap: 6px; padding: 4px 8px 12px; border-radius: var(--radius-md); color: inherit; text-align: center; text-decoration: none;
  transition: background var(--dur-base) ease, translate var(--dur-base) var(--ease-out); }
.tl-link:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); translate: 0 -2px; }
.tl-link:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.tl-when { display: inline-flex; min-height: 20px; align-items: center; gap: 6px; color: var(--subtle); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; }
.tl-when em { padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); font-style: normal; font-weight: 600; }
/* 节点压在线上：底下垫一圈卡片底色，线从节点背后穿过去而不是从中间切开它。 */
.tl-node { display: grid; padding: 3px; border-radius: 16px; background: var(--mat-card-solid); }
.tl-item.newest .tl-node { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent), 0 0 18px -2px color-mix(in srgb, var(--accent) 45%, transparent); }
.tl-title { max-width: 100%; overflow: hidden; color: var(--ink); font-size: var(--fs-sm); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.tl-fact { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.recent-empty { min-height: 120px; }
</style>

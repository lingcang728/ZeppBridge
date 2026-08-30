<script setup lang="ts">
/**
 * 本地周报：最近 7 天对比你自己此前 28 天。
 *
 * 全部在本机确定性计算，不调用 AI。每条结论都带样本数、来源和置信度，
 * 不足就说不足。**只和你自己的历史比**——项目没有人群基准数据，也不打算有；
 * 这里不做诊断、治疗或风险预测。
 */
import { computed, onMounted, ref, watch } from 'vue';
import Icon from './Icon.vue';
import SkeletonBlock from './SkeletonBlock.vue';
import { useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import type { InsightFact, WeeklyReport } from '../types';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    title: '这一周',
    window: (recentStart: string, recentEnd: string, baseStart: string, baseEnd: string) =>
      `${recentStart} ~ ${recentEnd} · 对比你自己 ${baseStart} ~ ${baseEnd}`,
    legendGood: '绿色 = 对这项指标来说更好',
    legendBad: '红色 = 更差',
    legendNote: '只和你自己此前 28 天比，不和任何人群基准比',
    desktopOnly: '周报需要从 ZeppBridge 桌面应用打开。',
    nothingComparable: '这一周还没有可比较的记录。完成一次同步后再看。',
    loadFailed: '无法生成本地周报',
    barsAria: (recent: string, baseline: string) => `本周 ${recent}，此前 28 天 ${baseline}`,
    barThisWeek: '本周',
    barBaseline: '此前 28 天',
    noBaseline: '此前的数据不够，这次只报现状',
    notProvided: '未提供',
    sleepDuration: (hours: number, minutes: number) => `${hours} 小时 ${minutes} 分`,
    regularity: (minutes: number) => `±${minutes} 分`,
    workoutCount: (count: number) => `${count} 次`,
    metric: {
      'weekly.resting_hr': '静息心率',
      'weekly.hrv': 'HRV',
      'weekly.stress': '压力',
      'weekly.sleep_duration': '睡眠时长',
      'weekly.sleep_start_regularity': '入睡时间波动',
      'weekly.workout_count': '训练次数',
      'weekly.training_load': '训练负荷',
    },
  },
  {
    title: 'This week',
    window: (recentStart: string, recentEnd: string, baseStart: string, baseEnd: string) =>
      `${recentStart} ~ ${recentEnd} · against your own ${baseStart} ~ ${baseEnd}`,
    legendGood: 'Green = better for this metric',
    legendBad: 'Red = worse',
    legendNote: 'Compared only to your own previous 28 days, never to a population baseline',
    desktopOnly: 'The weekly report needs the ZeppBridge desktop app.',
    nothingComparable: 'Nothing comparable this week yet. Come back after a sync.',
    loadFailed: 'Could not build the local weekly report',
    barsAria: (recent: string, baseline: string) => `This week ${recent}, previous 28 days ${baseline}`,
    barThisWeek: 'This week',
    barBaseline: 'Prev. 28 days',
    noBaseline: 'Not enough history behind it, so this is the current figure only',
    notProvided: 'Not provided',
    sleepDuration: (hours: number, minutes: number) => `${hours} hr ${minutes} min`,
    regularity: (minutes: number) => `±${minutes} min`,
    workoutCount: (count: number) => `${count} sessions`,
    metric: {
      'weekly.resting_hr': 'Resting HR',
      'weekly.hrv': 'HRV',
      'weekly.stress': 'Stress',
      'weekly.sleep_duration': 'Sleep duration',
      'weekly.sleep_start_regularity': 'Bedtime spread',
      'weekly.workout_count': 'Workouts',
      'weekly.training_load': 'Training load',
    },
  },
);
const t = useMessages(messages);

const metricLabel = (factId: string, fallback: string): string =>
  (t.value.metric as Record<string, string | undefined>)[factId] ?? fallback;

const { dataRevision } = useSyncController();

const report = ref<WeeklyReport | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

/** 数字变小对这个指标意味着「更好」吗？只影响配色，不改变事实。 */
const LOWER_IS_BETTER = new Set([
  'weekly.resting_hr',
  'weekly.stress',
  'weekly.sleep_start_regularity',
]);

const load = async () => {
  if (!isDesktop()) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    report.value = await backend.getWeeklyReport();
  } catch (cause) {
    error.value = toUserMessage(cause, t.value.loadFailed);
  } finally {
    loading.value = false;
  }
};

onMounted(() => void load());
watch(dataRevision, () => void load());

const formatValue = (fact: InsightFact): string =>
  (fact.value === null ? t.value.notProvided : formatNumber(fact, fact.value));

const tone = (fact: InsightFact): 'good' | 'bad' | 'flat' => {
  if (!fact.comparison || fact.comparison.direction === 'same') return 'flat';
  const lower = fact.comparison.direction === 'lower';
  return LOWER_IS_BETTER.has(fact.fact_id) === lower ? 'good' : 'bad';
};

/**
 * 只显示这一周真的有数的指标。
 *
 * 早先没有数据的项也会占一格，写上「未提供」。判断本来就在本机做完了，
 * 把结论摆出来就行——一整排「未提供」既不能让人多知道什么，又把有数的那
 * 几项挤到了后面。能比较的排前面，只有现状的排后面。
 */
const facts = computed(() => (report.value?.facts ?? [])
  .filter((fact) => fact.value !== null)
  .sort((a, b) => Number(Boolean(b.comparison)) - Number(Boolean(a.comparison))));

/**
 * 「本周 vs 你自己此前 28 天」画成两条并排的条。
 *
 * 一串「48 bpm −2.9%」要在脑子里换算才知道是变好还是变差；两条并排的条一眼
 * 就能看出谁长谁短、差多少。画的就是事实里已有的那两个数（本周值和基线值），
 * 没有插值，也没有编造逐日曲线——周报本来就只有这两个数。
 *
 * 只有拿得到比较的指标才画。证据不足的指标保持纯文字：与其画一根没有对照的
 * 孤条让人误以为「有对比」，不如老实说这周还比不了。
 */
const BAR_MIN_PERCENT = 6;

const chartFor = (fact: InsightFact) => {
  if (!fact.comparison || fact.value === null) return null;
  const recent = Math.abs(fact.value);
  const baseline = Math.abs(fact.comparison.baseline_value);
  const peak = Math.max(recent, baseline);
  if (!Number.isFinite(peak) || peak <= 0) return null;
  const scale = (value: number) => Math.max(BAR_MIN_PERCENT, Math.round((value / peak) * 100));
  return {
    recentPercent: scale(recent),
    baselinePercent: scale(baseline),
    baselineText: formatNumber(fact, fact.comparison.baseline_value),
  };
};

/** 把一个数字按这个指标的口径写出来。formatValue 也走这里，两处口径不会跑偏。 */
function formatNumber(fact: InsightFact, value: number): string {
  if (fact.metric === 'sleep_duration') {
    const total = Math.round(value);
    return t.value.sleepDuration(Math.floor(total / 60), total % 60);
  }
  if (fact.metric === 'sleep_start_regularity') return t.value.regularity(Math.round(value));
  if (fact.metric === 'workout_count') return t.value.workoutCount(Math.round(value));
  return `${Math.round(value)} ${fact.unit}`;
}
</script>

<template>
  <section class="weekly-card" aria-labelledby="weekly-title">
    <header>
      <h2 id="weekly-title"><Icon name="activity" :size="15" />{{ t.title }}</h2>
      <span v-if="report" class="weekly-window">
        {{ t.window(report.recent_start, report.recent_end, report.baseline_start, report.baseline_end) }}
      </span>
    </header>

    <!-- 「静息心率 −3.4% 是绿的、压力 +1.6% 是红的」这件事必须解释一句：
         数字的正负是事实，好坏是按指标含义判断的，两者不是一回事。 -->
    <p v-if="report && facts.length" class="weekly-legend">
      <span><i class="legend-dot good"></i>{{ t.legendGood }}</span>
      <span><i class="legend-dot bad"></i>{{ t.legendBad }}</span>
      <span class="legend-note">{{ t.legendNote }}</span>
    </p>
    <SkeletonBlock v-if="loading" height="120px" />
    <p v-else-if="error" class="weekly-error" role="alert">{{ error }}</p>
    <p v-else-if="!report" class="weekly-note">{{ t.desktopOnly }}</p>

    <p v-else-if="!facts.length" class="weekly-note">{{ t.nothingComparable }}</p>

    <template v-else>
      <div class="weekly-grid">
        <div v-for="fact in facts" :key="fact.fact_id" class="weekly-item">
          <span class="weekly-label">{{ metricLabel(fact.fact_id, fact.metric) }}</span>
          <strong>{{ formatValue(fact) }}</strong>

          <template v-if="chartFor(fact)">
            <div class="weekly-bars" role="img"
              :aria-label="t.barsAria(formatValue(fact), chartFor(fact)!.baselineText)">
              <div class="bar-row">
                <span class="bar-tag">{{ t.barThisWeek }}</span>
                <span class="bar-track">
                  <i :class="['bar-fill', tone(fact)]" :style="{ width: `${chartFor(fact)!.recentPercent}%` }"></i>
                </span>
              </div>
              <div class="bar-row">
                <span class="bar-tag">{{ t.barBaseline }}</span>
                <span class="bar-track">
                  <i class="bar-fill baseline" :style="{ width: `${chartFor(fact)!.baselinePercent}%` }"></i>
                </span>
                <span class="bar-value">{{ chartFor(fact)!.baselineText }}</span>
              </div>
            </div>
            <span :class="['weekly-delta', tone(fact)]">
              {{ fact.comparison!.delta_percent > 0 ? '+' : '' }}{{ fact.comparison!.delta_percent.toFixed(1) }}%
            </span>
          </template>

          <span v-else class="weekly-delta muted">{{ fact.reason || t.noBaseline }}</span>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.weekly-card {
  display: grid;
  gap: 10px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}
.weekly-card header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; }
.weekly-card h2 { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--ink); font-size: 14px; font-weight: 500; }
.weekly-window { color: var(--muted); font-size: 11px; }
.weekly-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; color: var(--muted); font-size: 11px; }
.weekly-legend span { display: inline-flex; align-items: center; gap: 5px; }
.legend-dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 2px; }
.legend-dot.good { background: var(--accent); }
.legend-dot.bad { background: var(--danger); }
.legend-note { color: var(--subtle); }

.weekly-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; align-items: stretch; }
.weekly-item { display: grid; gap: 2px; align-content: start; padding: 10px 12px; border-radius: 12px; background: var(--surface-raised); }
.weekly-label { color: var(--muted); font-size: 11px; }
.weekly-item strong { color: var(--ink); font-size: 16px; font-weight: 500; }
.weekly-delta { font-size: 11px; line-height: 1.5; }
.weekly-delta.good { color: var(--accent); }
.weekly-delta.bad { color: var(--danger); }
.weekly-delta.flat, .weekly-delta.muted { color: var(--muted); }

.weekly-bars { display: grid; gap: 5px; margin: 6px 0 2px; }
.bar-row { display: grid; grid-template-columns: 58px minmax(0, 1fr) auto; align-items: center; gap: 7px; }
.bar-tag { color: var(--subtle); font-size: 10px; white-space: nowrap; }
.bar-track { height: 6px; border-radius: 3px; background: rgba(232,238,244,.08); overflow: hidden; }
.bar-fill { display: block; height: 100%; border-radius: 3px; background: var(--muted); transition: width .4s cubic-bezier(.16,1,.3,1); }
.bar-fill.good { background: var(--accent); }
.bar-fill.bad { background: var(--danger); }
.bar-fill.flat { background: var(--muted); }
.bar-fill.baseline { background: rgba(232,238,244,.22); }
.bar-value { color: var(--subtle); font-size: 10px; white-space: nowrap; }

.weekly-note { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.6; }
.weekly-error { margin: 0; color: var(--danger); font-size: 12px; }
</style>

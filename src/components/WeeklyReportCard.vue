<script setup lang="ts">
/**
 * 本地周报：最近 7 天对比你自己此前 28 天。
 *
 * 全部在本机确定性计算，不调用 AI。每条结论都带样本数、来源和置信度，
 * 不足就说不足。**只和你自己的历史比**——项目没有人群基准数据，也不打算有；
 * 这里不做诊断、治疗或风险预测。
 */
import { RouterLink } from 'vue-router';
import { trendGridStyle } from '../lib/trendGrid';
import { computed } from 'vue';
import { useFirstLoad } from '../composables/useFirstLoad';
import Icon from './Icon.vue';
import ComparisonBars from './ComparisonBars.vue';
import SkeletonBlock from './SkeletonBlock.vue';
import { useWeeklyReport } from '../composables/useWeeklyReport';

import type { InsightFact } from '../types';
import { useMessages } from '../i18n';
import { weeklyReportMessages as messages } from './WeeklyReportCard.i18n';
import { finiteOrNull } from '../lib/missingValues';
import { changeArrow, reportTone as tone } from '../lib/changeTone';


const t = useMessages(messages);

/* 没有比较的原因按后端发来的码渲染，参数取自同一条事实里已有的字段。
   后端那份中文原文是给 CLI / MCP / 导出的，不跟界面语言走。 */
const reasonText = (fact: InsightFact): string => {
  if (fact.reason_code === 'weekly_no_recent_data') return t.value.noRecentData;
  if (fact.reason_code === 'weekly_zero_baseline') return t.value.zeroBaseline;
  if (fact.reason_code === 'weekly_thin_baseline' && fact.baseline_window) {
    const found = finiteOrNull(fact.baseline_count);
    if (found === null) return t.value.baselineCountUnknown;
    return t.value.thinBaseline(
      fact.baseline_window.days,
      found,
      fact.baseline_window.min_samples,
    );
  }
  return fact.reason || t.value.noBaseline;
};

/* 每一格都能点进对应的详情页：有悬停反馈的东西就该能点进去。 */
const DETAIL_ROUTE: Record<string, string> = {
  'weekly.resting_hr': '/heart',
  'weekly.hrv': '/body',
  'weekly.stress': '/body',
  'weekly.sleep_duration': '/sleep',
  'weekly.sleep_start_regularity': '/sleep',
  'weekly.workout_count': '/workouts',
  'weekly.training_load': '/training',
};
const detailRoute = (factId: string): string => DETAIL_ROUTE[factId] ?? '/recent';

const metricLabel = (factId: string, fallback: string): string =>
  (t.value.metric as Record<string, string | undefined>)[factId] ?? fallback;

/* 和概览顶上的「这一周」摘要读同一份（useWeeklyReport），只查一次库。 */
const { report, loading, error } = useWeeklyReport(() => t.value.loadFailed);
const initialLoading = useFirstLoad(loading);

const formatValue = (fact: InsightFact): string =>
  (fact.value === null ? t.value.notProvided : formatNumber(fact, fact.value));

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
  const word = t.value.unitWord(fact.unit);
  return word ? `${Math.round(value)} ${word}` : `${Math.round(value)}`;
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
      <span>{{ t.legendNeutral }}</span>
      <span class="legend-note">{{ t.legendNote }}</span>
    </p>
    <SkeletonBlock v-if="initialLoading" height="120px" />
    <p v-else-if="error" class="weekly-error" role="alert">{{ error }}</p>
    <p v-else-if="!report" class="weekly-note">{{ t.desktopOnly }}</p>

    <p v-else-if="!facts.length" class="weekly-note">{{ t.nothingComparable }}</p>

    <template v-else>
      <div class="weekly-grid" :style="trendGridStyle(facts.length)">
        <RouterLink v-for="fact in facts" :key="fact.fact_id" class="weekly-item" :to="detailRoute(fact.fact_id)">
          <span class="weekly-label">{{ metricLabel(fact.fact_id, fact.metric) }}</span>
          <strong>{{ formatValue(fact) }}</strong>

          <template v-if="chartFor(fact)">
            <ComparisonBars :current="fact.value!" :baseline="fact.comparison!.baseline_value"
              :current-label="t.barThisWeek" :baseline-label="t.barBaseline"
              :current-text="formatValue(fact)" :baseline-text="chartFor(fact)!.baselineText" :tone="tone(fact)" />
            <span :class="['weekly-delta', tone(fact)]">
              <template v-if="tone(fact) === 'up' || tone(fact) === 'down'">{{ changeArrow(fact) }}&nbsp;</template>{{ fact.comparison!.delta_percent > 0 ? '+' : '' }}{{ fact.comparison!.delta_percent.toFixed(1) }}%
            </span>
          </template>

          <span v-else class="weekly-delta muted">{{ reasonText(fact) }}</span>
        </RouterLink>
      </div>
    </template>
  </section>
</template>

<style scoped>
.weekly-card {
  display: grid;
  gap: 12px;
  padding: 18px 20px 20px;
  border-radius: var(--radius-lg);
  background: var(--mat-card);
  box-shadow: var(--mat-rim), var(--mat-shadow);
}
.weekly-card header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; }
.weekly-card h2 { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--ink); font-size: var(--fs-lg); font-weight: 600; }
.weekly-window { color: var(--muted); font-size: var(--fs-xs); }
.weekly-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.weekly-legend span { display: inline-flex; align-items: center; gap: 5px; }

/* 好/坏不能只靠绿/红：红绿色觉障碍下这两个状态完全一样。
   统一加一个前置符号，颜色只作为强化。 */
.legend-dot {
  display: grid;
  place-items: center;
  width: 13px;
  height: 13px;
  flex: 0 0 13px;
  border-radius: 3px;
  color: var(--accent-ink);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}
.legend-dot.good { background: var(--accent); }
.legend-dot.good::before { content: '✓'; }
.legend-dot.bad { background: var(--danger); }
.legend-dot.bad::before { content: '!'; }
.legend-note { color: var(--subtle); }

/* 每格里现在有「上一个 28 天」这种长标签加进度条，210px 一行挤六个放不下，
   标签会顶到进度条上。加宽下限，常见窗口宽度下自然落成五列。 */
/* 一行几格按张数挑（7 格排成 4 + 3），最后一行的格子拉宽把行铺满——以前 auto-fit 排成 5 + 2，
   第二行右边空出三格宽的一大块。 */
.weekly-grid { --cols: 4; display: flex; flex-wrap: wrap; gap: 10px; align-items: stretch; }
.weekly-grid > .weekly-item { flex: 1 1 calc((100% - (var(--cols) - 1) * 10px) / var(--cols)); min-width: min(100%, 220px); }
/* 每一项是一块凸起的小板（以前是凹下去的平面磁贴）：亮一点的底、顶边高光、柔和投影，
   悬停时浮起来一点。 */
.weekly-item { display: grid; gap: 2px; color: inherit; text-decoration: none; align-content: start; padding: 12px 14px; border-radius: var(--radius-md);
  background: linear-gradient(180deg, color-mix(in srgb, var(--ink) 6%, transparent), color-mix(in srgb, var(--ink) 2.5%, transparent));
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 9%, transparent), inset 0 -1px 0 rgba(0, 0, 0, .18), 0 6px 16px -10px rgba(0, 0, 0, .5);
  transition: translate var(--dur-base) var(--ease-out), box-shadow var(--dur-base) ease; }
.weekly-item:hover { translate: 0 -2px; box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 11%, transparent), inset 0 -1px 0 rgba(0, 0, 0, .18), 0 12px 22px -12px rgba(0, 0, 0, .55); }
.weekly-label { color: var(--muted); font-size: var(--fs-xs); }
.weekly-item strong { color: var(--ink); font-size: var(--fs-2xl); font-weight: 600; }
.weekly-delta { justify-self: start; margin-top: 4px; padding: 1px 9px; border-radius: 999px; font-size: var(--fs-xs); line-height: 1.5; }
.weekly-delta.good { background: color-mix(in srgb, var(--accent) 14%, transparent); }
.weekly-delta.bad { background: color-mix(in srgb, var(--danger) 14%, transparent); }
.weekly-delta.muted { padding: 0; background: none; }
.weekly-delta.good { color: var(--accent); }
.weekly-delta.good::before { content: '✓\a0'; font-weight: 700; }
.weekly-delta.bad { color: var(--danger); }
.weekly-delta.bad::before { content: '!\a0'; font-weight: 700; }
.weekly-delta.up { background: color-mix(in srgb, var(--accent) 10%, transparent); color: color-mix(in srgb, var(--accent) 80%, var(--ink)); font-weight: 600; }
.weekly-delta.down { background: color-mix(in srgb, var(--danger) 10%, transparent); color: color-mix(in srgb, var(--danger) 80%, var(--ink)); font-weight: 600; }
.weekly-delta.flat, .weekly-delta.muted { color: var(--muted); }

.weekly-note { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.6; }
.weekly-error { margin: 0; color: var(--danger); font-size: var(--fs-sm); }
</style>

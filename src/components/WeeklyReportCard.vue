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
import { computed, onMounted, ref, watch } from 'vue';
import { useFirstLoad } from '../composables/useFirstLoad';
import Icon from './Icon.vue';
import ComparisonBars from './ComparisonBars.vue';
import SkeletonBlock from './SkeletonBlock.vue';
import { useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import type { InsightFact, WeeklyReport } from '../types';
import { defineMessages, useMessages } from '../i18n';
import { finiteOrNull } from '../lib/missingValues';

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
    barThisWeek: '本周',
    barBaseline: '此前 28 天',
    noBaseline: '此前的数据不够，这次只报现状',
    baselineCountUnknown: '基线天数未知，这次只报现状不做比较。',
    thinBaseline: (days: number, found: number, needed: number) =>
      `此前 ${days} 天里只有 ${found} 天有这项数据，不足 ${needed} 天，所以只报现状不做比较。`,
    noRecentData: '最近 7 天本机没有这项数据。',
    zeroBaseline: '此前基线均值是 0，算不出相对变化，这次只报现状不做比较。',
    notProvided: '未提供',
    sleepDuration: (hours: number, minutes: number) => `${hours} 小时 ${minutes} 分`,
    regularity: (minutes: number) => `±${minutes} 分`,
    workoutCount: (count: number) => `${count} 次`,
    /** 后端给的单位码（score / load / bpm / ms）按界面语言写出来；返回空串就只显示数字。 */
    unitWord: (unit: string) =>
      ({ score: '分', load: '', bpm: '次/分' } as Record<string, string | undefined>)[unit] ?? unit,
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
    barThisWeek: 'This week',
    barBaseline: 'Prev. 28 days',
    noBaseline: 'Not enough history behind it, so this is the current figure only',
    baselineCountUnknown: 'Baseline days unknown, so this is the current figure without a comparison.',
    thinBaseline: (days: number, found: number, needed: number) =>
      `Only ${found} of the previous ${days} days carry this metric, fewer than the ${needed} needed, so this is the current figure without a comparison.`,
    noRecentData: 'Nothing recorded locally for this metric in the last 7 days.',
    zeroBaseline:
      'The previous baseline averaged 0, so no relative change can be computed — this is the current figure only.',
    notProvided: 'Not provided',
    sleepDuration: (hours: number, minutes: number) => `${hours} hr ${minutes} min`,
    regularity: (minutes: number) => `±${minutes} min`,
    workoutCount: (count: number) => `${count} sessions`,
    unitWord: (unit: string) => unit,
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
  {
    title: 'Esta semana',
    window: (recentStart: string, recentEnd: string, baseStart: string, baseEnd: string) =>
      `${recentStart} ~ ${recentEnd} · frente a tu propio ${baseStart} ~ ${baseEnd}`,
    legendGood: 'Verde = mejor para esta métrica',
    legendBad: 'Rojo = peor',
    legendNote: 'Comparado solo con tus propios 28 días anteriores, nunca con un promedio de población',
    desktopOnly: 'El informe semanal necesita la app de escritorio de ZeppBridge.',
    nothingComparable: 'Todavía no hay nada comparable esta semana. Vuelve después de sincronizar.',
    loadFailed: 'No se pudo generar el informe semanal local',
    barThisWeek: 'Esta semana',
    barBaseline: '28 días previos',
    noBaseline: 'No hay suficiente historial detrás, así que solo se muestra el valor actual',
    baselineCountUnknown: 'No se conoce el número de días de la línea base, así que solo se muestra el valor actual sin comparación.',
    thinBaseline: (days: number, found: number, needed: number) =>
      `Solo ${found} de los ${days} días anteriores tienen esta métrica (se necesitan ${needed}), así que se muestra el valor actual sin comparación.`,
    noRecentData: 'No hay registros locales de esta métrica en los últimos 7 días.',
    zeroBaseline:
      'La línea base anterior promedia 0, así que no se puede calcular un cambio relativo; solo se muestra el valor actual.',
    notProvided: 'Sin datos',
    sleepDuration: (hours: number, minutes: number) => `${hours} h ${minutes} min`,
    regularity: (minutes: number) => `±${minutes} min`,
    workoutCount: (count: number) => `${count} sesiones`,
    unitWord: (unit: string) =>
      ({ score: 'pts', load: '', bpm: 'lpm' } as Record<string, string | undefined>)[unit] ?? unit,
    metric: {
      'weekly.resting_hr': 'FC en reposo',
      'weekly.hrv': 'VFC',
      'weekly.stress': 'Estrés',
      'weekly.sleep_duration': 'Duración del sueño',
      'weekly.sleep_start_regularity': 'Variación de la hora de dormir',
      'weekly.workout_count': 'Entrenamientos',
      'weekly.training_load': 'Carga de entrenamiento',
    },
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'components/WeeklyReportCard',
);
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

const { dataRevision } = useSyncController();

const report = ref<WeeklyReport | null>(null);
const loading = ref(true);
const initialLoading = useFirstLoad(loading);
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
              {{ fact.comparison!.delta_percent > 0 ? '+' : '' }}{{ fact.comparison!.delta_percent.toFixed(1) }}%
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
  border-radius: 28px;
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
.weekly-item { display: grid; gap: 2px; color: inherit; text-decoration: none; align-content: start; padding: 12px 14px; border-radius: 20px;
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
.weekly-delta.flat, .weekly-delta.muted { color: var(--muted); }

.weekly-note { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.6; }
.weekly-error { margin: 0; color: var(--danger); font-size: var(--fs-sm); }
</style>

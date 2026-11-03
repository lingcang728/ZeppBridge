/**
 * 周报一条事实怎么写成字：指标名、数值口径、没法比较的原因。
 *
 * 概览的本地周报卡和信匣的每周数据来信都用这一份——同一句话只能有一份渲染实现。
 */
import { useMessages } from '../i18n';
import { weeklyReportMessages as messages } from './WeeklyReportCard.i18n';
import { finiteOrNull } from '../lib/missingValues';
import type { InsightFact } from '../types';

export function useWeeklyFactText() {
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

  const metricLabel = (factId: string, fallback: string): string =>
    (t.value.metric as Record<string, string | undefined>)[factId] ?? fallback;

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

  const formatValue = (fact: InsightFact): string =>
    (fact.value === null ? t.value.notProvided : formatNumber(fact, fact.value));

  return { t, reasonText, metricLabel, formatNumber, formatValue };
}

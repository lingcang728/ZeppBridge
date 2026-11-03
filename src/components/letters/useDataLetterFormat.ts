/**
 * 「你的信」里的数怎么写成字（每周来信、时间胶囊、那年今天共用）。
 * 快照里的一项借周报的写法（同一指标同一口径，weeklyFactText.ts）；步数周报里没有，单独写。全是本机事实，不生成评语。
 */
import { useDataLetterText } from './dataLetters.i18n';
import { useWeeklyFactText } from '../weeklyFactText';
import { workoutLabel } from '../../lib/labels';
import { formatNumber } from '../../lib/format';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { dayKey } from '../../lib/aiTask/bridgeScale';
import { changeArrow, reportTone } from '../../lib/changeTone';
import type { DataLetter, OnThisDayWorkout, SnapshotValue } from '../../types/letters';
import type { InsightFact } from '../../types';

export function useDataLetterFormat() {
  const t = useDataLetterText();
  const facts = useWeeklyFactText();

  const longDate = (value: string) => {
    const date = parseDisplayDate(value.slice(0, 10));
    return Number.isNaN(date.getTime()) ? value : displayDateTimeFormatter({ year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  };
  const shortDate = (value: string) => displayDateTimeFormatter({ month: 'short', day: 'numeric' }).format(parseDisplayDate(value));
  /** 邮票面值：周一那天的「月.日」（不分语言）。 */
  const stampDay = (value: string) => {
    const [, month = '', day = ''] = value.slice(0, 10).split('-');
    return `${Number(month)}.${Number(day)}`;
  };
  const isDue = (letter: DataLetter) => Boolean(letter.open_on && letter.open_on <= dayKey(new Date()));

  const asFact = (value: SnapshotValue) => ({ metric: value.metric, unit: value.unit } as InsightFact);
  const valueLabel = (value: SnapshotValue) =>
    (value.metric === 'steps' ? t.value.stepsLabel : facts.metricLabel(`weekly.${value.metric}`, value.metric));
  const valueText = (value: SnapshotValue | undefined) => {
    if (!value || value.value === null) return '—';
    if (value.metric === 'steps') return t.value.steps(formatNumber(Math.round(value.value)));
    return facts.formatNumber(asFact(value), value.value);
  };
  const pairs = (letter: DataLetter) => (letter.written_snapshot?.values ?? []).map((then) => ({
    then,
    now: letter.opened_snapshot?.values.find((value) => value.metric === then.metric),
  })).filter((pair) => pair.then.value !== null || (pair.now?.value ?? null) !== null);

  const workoutText = (workout: Pick<OnThisDayWorkout, 'workout_type' | 'distance_meters' | 'duration_seconds'>) => {
    const km = workout.distance_meters && workout.distance_meters > 0
      ? formatNumber(workout.distance_meters / 1000, { maximumFractionDigits: 1 }) : null;
    const minutes = workout.duration_seconds ? Math.round(workout.duration_seconds / 60) : null;
    return t.value.workout(workoutLabel(workout.workout_type), km, minutes);
  };

  const weeklyFacts = (letter: DataLetter) => (letter.weekly?.facts ?? []).filter((fact) => fact.value !== null);
  const deltaText = (fact: InsightFact) => {
    if (!fact.comparison) return facts.reasonText(fact);
    const percent = `${fact.comparison.delta_percent > 0 ? '+' : ''}${fact.comparison.delta_percent.toFixed(1)}%`;
    const arrow = reportTone(fact) === 'up' || reportTone(fact) === 'down' ? `${changeArrow(fact)} ` : '';
    return t.value.vsBefore(facts.formatNumber(fact, fact.comparison.baseline_value), arrow + percent);
  };

  return { t, facts, longDate, shortDate, stampDay, isDue, valueLabel, valueText, pairs, workoutText, weeklyFacts, deltaText, tone: reportTone };
}

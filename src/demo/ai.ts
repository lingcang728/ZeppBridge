/**
 * 演示里「交给 AI」页的数据：内置方向、已存任务、覆盖预览、交付结果。
 *
 * 预览的覆盖是**真算**出来的——按任务选了哪几类、回溯几天，去数演示数据里哪几天有睡眠 / 运动 / 日指标。
 * 所以访客在关系网里拖进拖出一个类别，日环、「N/15 天有数据」、数据包大小都会跟着变，不是一张静态图。
 */
import { at, dayKey } from './rng';
import type { DemoData } from './dataset';
import { CATEGORY_METRICS } from '../lib/aiTask/metrics';
import { demoText } from './texts';
import type {
  AiTask, AiTaskCategory, AiTaskCategoryRange, AiTaskCoverage, AiTaskIssue, AiTaskPrepareResult,
  AiTaskPreview, AiTaskSummary, AiTaskTemplate, AiTaskWorkoutBrief,
} from '../lib/bridge/types';

const STAMP = '2026-09-23T00:00:00Z';

const range = (category: AiTaskCategory, days: number, enabled = true): AiTaskCategoryRange => ({
  category, enabled, days_before: days, include_workout_day: true, excluded_metrics: [],
});
const DATA_CATEGORIES: AiTaskCategory[] = ['workout', 'sleep', 'recovery', 'resting_hr', 'heart_rate', 'training', 'body'];
/** 内置模板按拆类之前的写法给「心率」：静息心率跟着它（与后端 builtin_categories 同一条规则）。 */
const categories = (days: Partial<Record<AiTaskCategory, number>>, off: AiTaskCategory[] = ['body']): AiTaskCategoryRange[] => [
  ...DATA_CATEGORIES.map((category) => {
    const as = category === 'resting_hr' ? 'heart_rate' : category;
    return range(category, days[as] ?? 14, !off.includes(as));
  }),
  range('personal_note', 0, false),
  range('attachment', 0, false),
];

/* 内置方向的名字和提示词界面都按 name_code / prompt_code 取，这里的原文不会被显示，用 id 占位。 */
const template = (id: string, cats: AiTaskCategoryRange[], series: string[]): AiTaskTemplate => ({
  schema_version: 1, id, builtin: true, name: id, name_code: `ui.ai_template.${id}.name`,
  categories: cats, detail_level: 'standard', prompt_template: id, prompt_code: `ui.ai_template.${id}.prompt`,
  default_summaries: ['avg_hr', 'max_hr', 'pace'], required_series: series, created_at: STAMP, updated_at: STAMP,
});

export const demoTemplates = (): AiTaskTemplate[] => [
  template('sleep_review', categories({ sleep: 14, recovery: 14, workout: 14 }, ['body', 'training']), []),
  template('recovery_trend', categories({ sleep: 28, recovery: 28, heart_rate: 28, training: 28 }, ['body', 'workout']), []),
  template('week_review', categories({ sleep: 7, recovery: 7, heart_rate: 7, workout: 7, training: 7 }), []),
  template('recovery_run', categories({ workout: 7, sleep: 3, recovery: 14, heart_rate: 7 }, ['body', 'training']), ['heart_rate']),
  template('long_run_compare', categories({ workout: 28, sleep: 7, training: 28 }), ['heart_rate']),
  template('hr_drift', categories({ workout: 14, sleep: 3, recovery: 14, heart_rate: 14, training: 14 }), ['heart_rate']),
];

export const demoTaskList = (data: DemoData): AiTaskSummary[] => [{
  id: 'demo-task-1', title: demoText().taskTitle(data.now.getMonth() + 1, data.now.getDate()), template_id: null, workout_count: 0,
  updated_at: data.now.toISOString(), mcp_shared: false,
}];

/* —— 覆盖预览 —— */
const UNIT_OF: Record<string, string> = {
  distance_meters: 'm', moving_seconds: 's', calories: 'kcal', avg_hr: 'bpm', max_hr: 'bpm', min_hr: 'bpm', total_steps: '步',
  elevation_gain_m: 'm', elevation_loss_m: 'm', training_load: 'load', vo2max: 'ml/kg/min', duration_minutes: 'min', score: 'score',
  deep_minutes: 'min', light_minutes: 'min', rem_minutes: 'min', awake_minutes: 'min', wake_count: 'count',
  resting_hr: 'bpm', hrv: 'ms', readiness: 'score', stress: 'score', respiratory_rate: '次/分', spo2: '%', steps: '步', heart_rate: 'bpm',
};

const daysOf = (data: DemoData, category: AiTaskCategory): Set<string> => {
  switch (category) {
    case 'workout': return data.workoutDays;
    case 'sleep': return data.sleepDays;
    case 'recovery': return new Set(data.metrics.readiness.map((point) => point.date));
    case 'resting_hr': return new Set((data.metrics.resting_hr ?? []).map((point) => point.date));
    case 'heart_rate': return new Set(data.metrics.steps.map((point) => point.date));
    case 'training': return new Set(data.metrics.training_load.map((point) => point.date));
    default: return new Set(); // 没有体成分秤：身体状态一天都没有，如实空着
  }
};

const windowDays = (start: Date, end: Date): string[] => {
  const out: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = at(cursor, 1)) out.push(dayKey(cursor));
  return out;
};

export const demoPreview = (data: DemoData, task: AiTask): AiTaskPreview => {
  const picked = data.workouts.filter((w) => task.workout_ids.includes(w.workout_id));
  const anchors = picked.length ? picked.map((w) => new Date(w.start_time)) : [data.now];
  const coverage: AiTaskCoverage[] = [];
  const warnings: AiTaskIssue[] = [];
  let enabledDays = 0;

  for (const category of DATA_CATEGORIES) {
    const setting = task.categories.find((item) => item.category === category);
    if (!setting?.enabled) continue;
    const have = daysOf(data, category);
    const metrics = (CATEGORY_METRICS[category] ?? []).slice(0, 12);
    const rows = anchors.map((anchor, index) => {
      const end = setting.include_workout_day ? anchor : at(anchor, -1);
      const days = windowDays(at(anchor, -setting.days_before), end);
      const covered = days.filter((day) => have.has(day));
      return { days, covered, workoutId: picked[index]?.workout_id ?? null };
    });
    const merged = rows.length > 1;
    const toRow = (days: string[], covered: string[], workoutId: string | null): AiTaskCoverage => ({
      category, workout_id: workoutId, start_date: days[0], end_date: days[days.length - 1],
      days_in_range: days.length, days_with_data: covered.length, covered_dates: covered,
      sources: covered.length ? ['device'] : [],
      units: Object.fromEntries(metrics.map((metric) => [metric, UNIT_OF[metric] ?? ''])),
      metric_days: Object.fromEntries(metrics.map((metric, i) => [metric, Math.max(0, covered.length - (i % 4 === 3 ? 2 : 0))])),
      missing: covered.length === 0,
    });
    for (const row of rows) coverage.push(toRow(row.days, row.covered, row.workoutId));
    const unionDays = [...new Set(rows.flatMap((row) => row.days))].sort();
    const unionCovered = [...new Set(rows.flatMap((row) => row.covered))].sort();
    if (merged) coverage.push(toRow(unionDays, unionCovered, null));
    const total = merged ? unionDays.length : rows[0].days.length;
    const got = merged ? unionCovered.length : rows[0].covered.length;
    enabledDays += total;
    if (got === 0) warnings.push({ code: 'ui.ai_task.warn.category_missing', message: '该类别在所选时间窗内没有数据', params: { category } });
    else if (got < total) warnings.push({ code: 'ui.ai_task.warn.partial_coverage', message: '时间窗内只有部分日期有数据', params: { category, days_in_range: total, days_with_data: got } });
  }

  const bytes = Math.round(enabledDays * 1020 + 2400);
  const tokens = Math.round(bytes / 29);
  const workouts: AiTaskWorkoutBrief[] = picked.map((w) => ({
    workout_id: w.workout_id, workout_type: w.effective_type, start_time: w.start_time, end_time: w.end_time,
    start_date: dayKey(new Date(w.start_time)), distance_meters: w.distance_meters ?? null, calories: w.calories ?? null,
    avg_hr: w.avg_hr ?? null, max_hr: w.max_hr ?? null,
  }));
  return {
    task_id: task.id || 'draft', workouts, coverage, attachments: [], estimated_bytes: bytes, warnings,
    markdown: { approx_tokens: tokens, byte_len: bytes, curve_average_seconds: null, summarized_workouts: [], over_budget: false, token_budget: 30000 },
  };
};

/** 演示里「交给 ChatGPT」不写文件、不开网站：假装备好一个 .md，真正的动画由落地页接管。 */
export const demoPrepare = (data: DemoData, task: AiTask, promptText: string): AiTaskPrepareResult => {
  const preview = demoPreview(data, task);
  const name = `ZeppBridge ${task.title || demoText().taskFile}.md`;
  return {
    status: 'ready', task_id: task.id || 'demo-task-1', output_dir: 'ZeppBridge AI', json_path: null, prompt_path: null,
    prompt_text: promptText, byte_len: preview.estimated_bytes, copied_attachments: 0, md_path: name,
    markdown: preview.markdown ?? null, attachments: [], blocked: [],
  } as AiTaskPrepareResult;
};


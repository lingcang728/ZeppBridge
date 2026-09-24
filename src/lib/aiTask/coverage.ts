/**
 * `AiTaskCoverage` → 界面行与类别摘要。
 *
 * 缺失不补造——`missing`/`days_with_data` 原样带上来。界面可见的字符串
 * （运动类型、来源范围、单位）在这里就换成当前语言，覆盖表不再露出
 * `activity`、`user_fused`、`events/h` 这类内部码。
 */
import type {
  AiTaskCategory,
  AiTaskCategoryRange,
  AiTaskCoverage,
  AiTaskPreview,
  AiTaskWorkoutBrief,
} from '../bridge/types';
import { parseDisplayDate } from '../dateTime';
import { localDateString } from '../format';
import { dataScopeLabel, workoutLabel } from '../labels';
import { categoryLabel } from './categories';
import { unitLabel } from './metrics';

export interface CoverageRow {
  key: string;
  category: AiTaskCategory;
  categoryLabel: string;
  /** 窗口隶属的运动名（已本地化）；全局窗口为 null。 */
  workoutTitle: string | null;
  workoutId: string | null;
  start_date: string;
  end_date: string;
  days_in_range: number;
  days_with_data: number;
  /** 去重、本地化后的来源表与单位表，界面直接 join 展示。 */
  sources: string[];
  units: string[];
  missing: boolean;
}

export const coverageRows = (
  coverage: AiTaskCoverage[],
  workouts: AiTaskWorkoutBrief[],
): CoverageRow[] => {
  const titles = new Map(workouts.map((workout) => [workout.workout_id, workout.workout_type]));
  return coverage.map((entry, index) => {
    const type = entry.workout_id ? titles.get(entry.workout_id) : undefined;
    return {
      key: `${entry.category}:${entry.workout_id ?? 'global'}:${index}`,
      category: entry.category,
      categoryLabel: categoryLabel(entry.category),
      workoutTitle: type ? workoutLabel(type) : null,
      workoutId: entry.workout_id,
      start_date: entry.start_date,
      end_date: entry.end_date,
      days_in_range: entry.days_in_range,
      days_with_data: entry.days_with_data,
      sources: [...new Set(entry.sources.map((scope) => dataScopeLabel(scope)))],
      units: [...new Set(Object.values(entry.units).map(unitLabel))],
      missing: entry.missing,
    };
  });
};

export interface CategoryCoverage {
  daysWithData: number;
  daysInRange: number;
  missing: boolean;
  /** 指标 → 有数据天数（含被排除的指标）。 */
  metricDays: Record<string, number>;
  /** 该类别会查的指标（`units` 的键，字母序；展示顺序由调用方决定）。 */
  metrics: string[];
}

/**
 * 一个类别的覆盖摘要：多窗口时取合并行（workout_id=null，后端已按日期
 * 去重），单窗口就是唯一那行。没有预览或类别没开时为 null。
 */
export const categoryCoverage = (
  preview: AiTaskPreview | null,
  category: AiTaskCategory,
): CategoryCoverage | null => {
  const rows = preview?.coverage.filter((row) => row.category === category) ?? [];
  if (!rows.length) return null;
  const row = rows.find((entry) => entry.workout_id === null) ?? rows[0];
  return {
    daysWithData: row.days_with_data,
    daysInRange: row.days_in_range,
    missing: row.missing,
    metricDays: row.metric_days ?? {},
    metrics: Object.keys(row.units),
  };
};

/**
 * 某类别在某次运动上的回溯窗口（A7 P4 的界面侧镜像）：
 * `[运动开始日(本地) − days_before, 运动开始日]`；`include_workout_day=false`
 * 时右端收一天。后端算权威覆盖，这里只给配置面板一个一致的预期。
 *
 * 返回 null：输入时间无效时不编窗口。
 */
export const categoryWindowForWorkout = (
  workoutStartRfc3339: string,
  range: Pick<AiTaskCategoryRange, 'days_before' | 'include_workout_day'>,
): { start: string; end: string } | null => {
  const startTime = new Date(workoutStartRfc3339);
  if (Number.isNaN(startTime.getTime())) return null;
  const days = Math.max(0, Math.floor(range.days_before));
  const start = new Date(startTime);
  start.setDate(start.getDate() - days);
  const end = new Date(startTime);
  if (!range.include_workout_day) end.setDate(end.getDate() - 1);
  return { start: localDateString(start), end: localDateString(end) };
};

/**
 * 一个任务（多选运动 × 一个类别）的全部窗口，按开始日排序。
 * `workouts` 传 `{id, start_time}` 形状——`Workout.workout_id` 与
 * `AiTaskWorkoutBrief.workout_id` 在调用处先归一成 `id`。
 */
export const categoryWindows = (
  workoutIds: string[],
  workouts: ReadonlyArray<{ id: string; start_time: string }>,
  range: Pick<AiTaskCategoryRange, 'days_before' | 'include_workout_day'>,
): Array<{ workoutId: string; start: string; end: string }> =>
  workoutIds
    .map((id) => {
      const workout = workouts.find((item) => item.id === id);
      if (!workout) return null;
      const window = categoryWindowForWorkout(workout.start_time, range);
      return window ? { workoutId: id, ...window } : null;
    })
    .filter((entry): entry is { workoutId: string; start: string; end: string } => entry !== null)
    .sort((a, b) => a.start.localeCompare(b.start));

export const formatBytes = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const isValidDateString = (value: string): boolean =>
  !Number.isNaN(parseDisplayDate(value).getTime());

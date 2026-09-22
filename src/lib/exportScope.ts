import type { ExportDataType, ExportDetail, ExportScope, ExportSelection } from '../types';

/**
 * 导出范围的构造与校验。
 *
 * 单独拿出来，是因为「哪些范围是合法的」是一条产品规则，不是某个页面的
 * 局部逻辑：CLI、AI 出口和以后任何一个导出入口都得给出同一个答案。
 *
 * 最重要的一条：**日期范围和单条运动是互斥的**。两个都给出是矛盾请求，
 * 直接报错而不是定一个优先级——优先级规则只会让下一个人写出
 * 「我以为选了这条运动就只导这一条」的 bug。后端也是同样的处理。
 */

/** 单次导出的最大跨度。和后端的 MAX_EXPORT_RANGE_DAYS 保持一致。 */
export const MAX_EXPORT_RANGE_DAYS = 365;

export interface ExportScopeInput {
  startDate?: string | null;
  endDate?: string | null;
  workoutId?: string | null;
  dataTypes: ExportDataType[];
  detail: ExportDetail;
}

/**
 * 为什么返回码而不是句子：这一层是产品规则，不是某个页面的文案。
 * 规则得让 CLI、AI 出口和界面给出同一个答案，而界面还要按当前语言把它写
 * 成人话——两件事混在一个字符串里，翻译的时候必然把规则也一起改了。
 */
export type ExportScopeError =
  | 'scope_conflict'
  | 'no_data_types'
  | 'invalid_dates'
  | 'end_before_start'
  | 'range_too_long';

export type ExportScopeResult =
  | { ok: true; selection: ExportSelection }
  | { ok: false; error: ExportScopeError };

const dayCount = (start: string, end: string): number | null => {
  const from = Date.parse(`${start}T00:00:00`);
  const to = Date.parse(`${end}T00:00:00`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86_400_000) + 1;
};

/**
 * UI 锁定单条运动时，只提交 workoutId，把日期拿掉。
 *
 * 日期和单条运动同时出现会被当成矛盾请求（见 `buildExportSelection`）。
 * 「锁定该条运动」必须走这条路，不能把页面上还在显示的日期范围一并送出去。
 */
export const exportInputForFocus = (input: {
  startDate?: string | null;
  endDate?: string | null;
  focusedWorkoutId?: string | null;
  dataTypes: ExportDataType[];
  detail: ExportDetail;
}): ExportScopeInput => {
  const workoutId = input.focusedWorkoutId?.trim() || '';
  if (workoutId) {
    return { workoutId, dataTypes: input.dataTypes, detail: input.detail };
  }
  return {
    startDate: input.startDate,
    endDate: input.endDate,
    dataTypes: input.dataTypes,
    detail: input.detail,
  };
};

export const buildExportSelection = (input: ExportScopeInput): ExportScopeResult => {
  const workoutId = input.workoutId?.trim() || '';
  const hasRange = Boolean(input.startDate || input.endDate);

  if (workoutId && hasRange) {
    return { ok: false, error: 'scope_conflict' };
  }

  if (!input.dataTypes.length) {
    return { ok: false, error: 'no_data_types' };
  }

  let scope: ExportScope;
  if (workoutId) {
    scope = { kind: 'workout', workoutId };
  } else {
    if (!input.startDate || !input.endDate) {
      return { ok: false, error: 'invalid_dates' };
    }
    const days = dayCount(input.startDate, input.endDate);
    if (days === null) {
      return { ok: false, error: 'invalid_dates' };
    }
    if (days <= 0) {
      return { ok: false, error: 'end_before_start' };
    }
    if (days > MAX_EXPORT_RANGE_DAYS) {
      // 一年以上的历史请走数据库快照，而不是塞进一个要交给 AI 的 JSON。
      return { ok: false, error: 'range_too_long' };
    }
    scope = { kind: 'dateRange', start: input.startDate, end: input.endDate };
  }

  return {
    ok: true,
    selection: { scope, dataTypes: [...input.dataTypes], detail: input.detail },
  };
};

/** 设置页「默认导出格式」和 Explore / 运动详情共用这一份。 */
export const DEFAULT_EXPORT_FORMAT_KEY = 'zeppbridge-default-export-format';
export const DEFAULT_EXPORT_FORMATS = ['json', 'csv', 'gpx'] as const;
export type DefaultExportFormat = (typeof DEFAULT_EXPORT_FORMATS)[number];

export const isDefaultExportFormat = (value: unknown): value is DefaultExportFormat =>
  value === 'json' || value === 'csv' || value === 'gpx';

export const readDefaultExportFormat = (): DefaultExportFormat => {
  if (typeof window === 'undefined') return 'json';
  try {
    const raw = window.localStorage.getItem(DEFAULT_EXPORT_FORMAT_KEY);
    if (isDefaultExportFormat(raw)) return raw;
  } catch {
    // 隐私模式读不了 localStorage，退回 JSON。
  }
  return 'json';
};

export const writeDefaultExportFormat = (format: DefaultExportFormat): void => {
  if (!isDefaultExportFormat(format)) return;
  try {
    window.localStorage.setItem(DEFAULT_EXPORT_FORMAT_KEY, format);
  } catch {
    // 写失败只影响下次打开的默认值，这次导出不受影响。
  }
};

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

export type ExportScopeResult =
  | { ok: true; selection: ExportSelection }
  | { ok: false; error: string };

const dayCount = (start: string, end: string): number | null => {
  const from = Date.parse(`${start}T00:00:00`);
  const to = Date.parse(`${end}T00:00:00`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86_400_000) + 1;
};

export const buildExportSelection = (input: ExportScopeInput): ExportScopeResult => {
  const workoutId = input.workoutId?.trim() || '';
  const hasRange = Boolean(input.startDate || input.endDate);

  if (workoutId && hasRange) {
    return {
      ok: false,
      error: '日期范围和单条运动是互斥的导出范围，只能选一个。',
    };
  }

  if (!input.dataTypes.length) {
    return { ok: false, error: '请至少选择一种数据类型。' };
  }

  let scope: ExportScope;
  if (workoutId) {
    scope = { kind: 'workout', workoutId };
  } else {
    if (!input.startDate || !input.endDate) {
      return { ok: false, error: '请选择有效的开始和结束日期。' };
    }
    const days = dayCount(input.startDate, input.endDate);
    if (days === null) {
      return { ok: false, error: '请选择有效的开始和结束日期。' };
    }
    if (days <= 0) {
      return { ok: false, error: '结束日期不能早于开始日期。' };
    }
    if (days > MAX_EXPORT_RANGE_DAYS) {
      // 一年以上的历史请走数据库快照，而不是塞进一个要交给 AI 的 JSON。
      return {
        ok: false,
        error: `单次导出最多 ${MAX_EXPORT_RANGE_DAYS} 天。更长的历史请用设置页的数据库快照。`,
      };
    }
    scope = { kind: 'dateRange', start: input.startDate, end: input.endDate };
  }

  return {
    ok: true,
    selection: { scope, dataTypes: [...input.dataTypes], detail: input.detail },
  };
};

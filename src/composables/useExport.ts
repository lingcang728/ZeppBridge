import { ref } from 'vue';
import { save as showSaveDialog } from '@tauri-apps/plugin-dialog';
import { tauriApi, toUserMessage } from './useTauriApi';
import { localDateString } from '../lib/format';
import { buildExportSelection, MAX_EXPORT_RANGE_DAYS, type ExportScopeError } from '../lib/exportScope';
import { defineMessages, messagesOf } from '../i18n';
import type {
  ExportDataType,
  ExportDetail,
  ExportResult,
  ExportSelection,
  ExportTypeGroup,
} from '../types';

export type SaveFormat = 'json' | 'csv' | 'gpx';

const messages = defineMessages(
  {
    typeSteps: '步数',
    typeDailyActivity: '日常活动',
    typeWorkouts: '运动',
    typeSleep: '睡眠',
    typeHeartRate: '心率',
    typeSpo2: '血氧',
    typeStress: '压力',
    typeRespiratoryRate: '呼吸率',
    typeRecovery: '恢复状态',
    typeTrainingLoad: '训练负荷',
    typeLactateThreshold: '乳酸阈值',
    typePai: 'PAI 活力指数',
    groupActivity: '活动',
    groupSleep: '睡眠',
    groupBody: '身体状态',
    groupTraining: '训练',
    detailSummary: '摘要',
    detailSummaryHint: '心率按小时聚合，省略逐秒运动序列；结构化指标完整，体积适合交给 AI',
    detailFull: '完整',
    detailFullHint: '保留逐秒运动序列与逐条心率，体积大，适合归档',
    scopeConflict: '日期范围和单条运动是互斥的导出范围，只能选一个。',
    noDataTypes: '请至少选择一种数据类型。',
    invalidDates: '请选择有效的开始和结束日期。',
    endBeforeStart: '结束日期不能早于开始日期。',
    rangeTooLong: (days: number) => `单次导出最多 ${days} 天。更长的历史请用设置页的数据库快照。`,
    nothingToExport: '这段时间没有可导出的记录。',
    jsonTooLarge: 'JSON 过大（超过 1 MB），请改用「保存文件」',
    copied: (count: number) => `已复制 ${count} 条标准化记录。`,
    copyFailed: '复制 JSON 失败',
    saveJsonTitle: '另存 ZeppBridge JSON',
    saveCsvTitle: '另存 ZeppBridge CSV（汇总表）',
    saveGpxTitle: '另存 ZeppBridge GPX（GPS 轨迹）',
    jsonFilter: 'JSON 文件',
    csvFilter: 'CSV 表格',
    gpxFilter: 'GPX 轨迹',
    unitRecords: '条记录',
    unitRows: '行',
    unitTrackPoints: '个轨迹点',
    saved: (count: number, unit: string) => `已保存 ${count} ${unit}。`,
    saveFailed: (format: string) => `保存 ${format} 失败`,
    feedUpdated: (count: number) => `本地 AI 数据源已更新，共 ${count} 条记录。`,
    feedFailed: '更新本地 AI 数据源失败',
  },
  {
    typeSteps: 'Steps',
    typeDailyActivity: 'Daily activity',
    typeWorkouts: 'Workouts',
    typeSleep: 'Sleep',
    typeHeartRate: 'Heart rate',
    typeSpo2: 'Blood oxygen',
    typeStress: 'Stress',
    typeRespiratoryRate: 'Respiratory rate',
    typeRecovery: 'Readiness',
    typeTrainingLoad: 'Training load',
    typeLactateThreshold: 'Lactate threshold',
    typePai: 'PAI',
    groupActivity: 'Activity',
    groupSleep: 'Sleep',
    groupBody: 'Body status',
    groupTraining: 'Training',
    detailSummary: 'Summary',
    detailSummaryHint: 'Heart rate aggregated hourly, per-second workout series left out. Structured metrics stay complete, and the size suits handing to an AI.',
    detailFull: 'Full',
    detailFullHint: 'Keeps per-second workout series and individual heart rate readings. Large, and meant for archiving.',
    scopeConflict: 'A date range and a single workout are mutually exclusive scopes. Pick one.',
    noDataTypes: 'Choose at least one data type.',
    invalidDates: 'Choose a valid start and end date.',
    endBeforeStart: 'The end date cannot be earlier than the start date.',
    rangeTooLong: (days: number) => `One export covers at most ${days} days. For longer history, use the database snapshot in Settings.`,
    nothingToExport: 'Nothing to export in this period.',
    jsonTooLarge: 'The JSON is over 1 MB. Use "Save file" instead.',
    copied: (count: number) => `Copied ${count} normalized records.`,
    copyFailed: 'Could not copy the JSON',
    saveJsonTitle: 'Save ZeppBridge JSON',
    saveCsvTitle: 'Save ZeppBridge CSV (summary table)',
    saveGpxTitle: 'Save ZeppBridge GPX (GPS track)',
    jsonFilter: 'JSON file',
    csvFilter: 'CSV table',
    gpxFilter: 'GPX track',
    unitRecords: 'records',
    unitRows: 'rows',
    unitTrackPoints: 'track points',
    saved: (count: number, unit: string) => `Saved ${count} ${unit}.`,
    saveFailed: (format: string) => `Could not save the ${format}`,
    feedUpdated: (count: number) => `The local AI feed now holds ${count} records.`,
    feedFailed: 'Could not update the local AI feed',
  },
);

const copy = () => messagesOf(messages);

/** 范围规则给的是码，写成人话在这里做——见 lib/exportScope.ts 的说明。 */
const scopeErrorText = (error: ExportScopeError): string => {
  const t = copy();
  switch (error) {
    case 'scope_conflict': return t.scopeConflict;
    case 'no_data_types': return t.noDataTypes;
    case 'invalid_dates': return t.invalidDates;
    case 'end_before_start': return t.endBeforeStart;
    case 'range_too_long': return t.rangeTooLong(MAX_EXPORT_RANGE_DAYS);
  }
};

/**
 * The export picker grew from five entries to fifteen; a flat checkbox list of
 * that length is hard to scan, so each type declares the section it belongs to.
 */
export interface ExportTypeOption {
  value: ExportDataType;
  label: string;
  group: ExportTypeGroup;
}

export const exportTypeOptions = (): ExportTypeOption[] => {
  const t = copy();
  return [
    { value: 'steps', label: t.typeSteps, group: 'activity' },
    { value: 'daily_activity', label: t.typeDailyActivity, group: 'activity' },
    { value: 'workouts', label: t.typeWorkouts, group: 'activity' },
    { value: 'sleep', label: t.typeSleep, group: 'sleep' },
    { value: 'heart_rate', label: t.typeHeartRate, group: 'body' },
    { value: 'hrv', label: 'HRV (SDNN)', group: 'body' },
    { value: 'hrv_rmssd', label: 'HRV (RMSSD)', group: 'body' },
    { value: 'spo2', label: t.typeSpo2, group: 'body' },
    { value: 'stress', label: t.typeStress, group: 'body' },
    { value: 'respiratory_rate', label: t.typeRespiratoryRate, group: 'body' },
    { value: 'recovery', label: t.typeRecovery, group: 'body' },
    { value: 'training_load', label: t.typeTrainingLoad, group: 'training' },
    { value: 'vo2max', label: 'VO₂max', group: 'training' },
    { value: 'lactate_threshold', label: t.typeLactateThreshold, group: 'training' },
    { value: 'pai', label: t.typePai, group: 'training' },
  ];
};

/** 分组的显示顺序固定；名字跟着语言走。 */
export const exportTypeGroups = (): Array<{ key: ExportTypeGroup; label: string }> => {
  const t = copy();
  return [
    { key: 'activity', label: t.groupActivity },
    { key: 'sleep', label: t.groupSleep },
    { key: 'body', label: t.groupBody },
    { key: 'training', label: t.groupTraining },
  ];
};

export const exportDetailOptions = (): { value: ExportDetail; label: string; hint: string }[] => {
  const t = copy();
  return [
    { value: 'summary', label: t.detailSummary, hint: t.detailSummaryHint },
    { value: 'full', label: t.detailFull, hint: t.detailFullHint },
  ];
};

const rangeFromToday = (days: number): { start: string; end: string } => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(0, days - 1));
  return { start: localDateString(start), end: localDateString(end) };
};

export const useExport = () => {
  const initial = rangeFromToday(7);
  const exportStartDate = ref(initial.start);
  const exportEndDate = ref(initial.end);
  const exportDataTypes = ref<ExportDataType[]>([
    'heart_rate',
    'sleep',
    'workouts',
    'steps',
    'daily_activity',
    'recovery',
  ]);
  const exportDetail = ref<ExportDetail>('summary');
  const exportBusy = ref<'copy' | 'save' | 'publish' | null>(null);
  const exportError = ref<string | null>(null);
  const exportMessage = ref<string | null>(null);
  const exportResult = ref<ExportResult | null>(null);

  const applyExportRange = (days: number) => {
    const range = rangeFromToday(days);
    exportStartDate.value = range.start;
    exportEndDate.value = range.end;
  };

  const exportSelection = (): ExportSelection | null => {
    exportError.value = null;
    exportMessage.value = null;
    // 范围规则在 lib/exportScope.ts 一处实现：CLI 和后端也认同一套。
    const result = buildExportSelection({
      startDate: exportStartDate.value,
      endDate: exportEndDate.value,
      dataTypes: [...exportDataTypes.value],
      detail: exportDetail.value,
    });
    if (!result.ok) {
      exportError.value = scopeErrorText(result.error);
      return null;
    }
    return result.selection;
  };

  const copyExportJson = async () => {
    const selection = exportSelection();
    if (!selection) return;
    exportBusy.value = 'copy';
    try {
      const encoded = await tauriApi.getExportJson(selection);
      const parsed = JSON.parse(encoded) as { record_count?: number; records?: unknown[] };
      const count = parsed.record_count ?? parsed.records?.length ?? 0;
      if (!count) {
        exportError.value = copy().nothingToExport;
        return;
      }
      if (encoded.length > 1_000_000) {
        exportError.value = copy().jsonTooLarge;
        return;
      }
      await navigator.clipboard.writeText(encoded);
      exportMessage.value = copy().copied(count);
    } catch (error) {
      exportError.value = toUserMessage(error, copy().copyFailed);
    } finally {
      exportBusy.value = null;
    }
  };

  // 三种格式共用同一份本地数据：后端先生成标准化 JSON，再转成 CSV / GPX，
  // 所以「换个格式」不会换成另一套数据口径。计数单位各不相同，文案必须跟着变，
  // 否则「已保存 N 条记录」会把 CSV 行数或轨迹点数说成记录数。
  const saveFormats = () => {
    const t = copy();
    return {
      json: {
        title: t.saveJsonTitle,
        extension: 'json',
        filterName: t.jsonFilter,
        unit: t.unitRecords,
        save: (selection: ExportSelection, path: string) => tauriApi.saveJsonExport(selection, path),
      },
      csv: {
        title: t.saveCsvTitle,
        extension: 'csv',
        filterName: t.csvFilter,
        unit: t.unitRows,
        save: (selection: ExportSelection, path: string) => tauriApi.saveCsvExport(selection, path),
      },
      gpx: {
        title: t.saveGpxTitle,
        extension: 'gpx',
        filterName: t.gpxFilter,
        unit: t.unitTrackPoints,
        save: (selection: ExportSelection, path: string) => tauriApi.saveGpxExport(selection, path),
      },
    } as const;
  };

  const saveExportAs = async (format: SaveFormat) => {
    const selection = exportSelection();
    if (!selection) return;
    const meta = saveFormats()[format];
    exportBusy.value = 'save';
    try {
      const path = await showSaveDialog({
        title: meta.title,
        defaultPath: `zeppbridge-${exportStartDate.value}-${exportEndDate.value}.${meta.extension}`,
        filters: [{ name: meta.filterName, extensions: [meta.extension] }],
      });
      if (!path) return;
      exportResult.value = await meta.save(selection, path);
      exportMessage.value = copy().saved(exportResult.value.record_count, meta.unit);
    } catch (error) {
      exportError.value = toUserMessage(error, copy().saveFailed(meta.extension.toUpperCase()));
    } finally {
      exportBusy.value = null;
    }
  };

  const saveExportFile = () => saveExportAs('json');

  const publishAiFeed = async () => {
    const selection = exportSelection();
    if (!selection) return;
    exportBusy.value = 'publish';
    try {
      exportResult.value = await tauriApi.publishAiExport(selection);
      if (!exportResult.value.record_count) {
        exportError.value = copy().nothingToExport;
        return;
      }
      exportMessage.value = copy().feedUpdated(exportResult.value.record_count);
    } catch (error) {
      exportError.value = toUserMessage(error, copy().feedFailed);
    } finally {
      exportBusy.value = null;
    }
  };

  return {
    exportStartDate,
    exportEndDate,
    exportDataTypes,
    exportDetail,
    exportBusy,
    exportError,
    exportMessage,
    exportResult,
    applyExportRange,
    copyExportJson,
    saveExportFile,
    saveExportAs,
    publishAiFeed,
  };
};

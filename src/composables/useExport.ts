import { ref } from 'vue';
import { open as showOpenDialog, save as showSaveDialog } from '@tauri-apps/plugin-dialog';
import { tauriApi, toUserMessage } from './useTauriApi';
import { localDateString } from '../lib/format';
import {
  buildExportSelection,
  exportInputForFocus,
  MAX_EXPORT_RANGE_DAYS,
  type ExportScopeError,
} from '../lib/exportScope';
import { messagesOf } from '../i18n';
import { exportMessages } from './useExport.i18n';
import type {
  ExportDataType,
  ExportDetail,
  ExportResult,
  ExportSelection,
  ExportTypeGroup,
} from '../types';

export type SaveFormat = 'json' | 'csv' | 'gpx' | 'fit';

const copy = () => messagesOf(exportMessages);

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
    { value: 'life_events', label: t.typeLifeEvents, group: 'context' },
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
    { key: 'context', label: t.groupContext },
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
  /** 从运动详情「锁定该条运动」进来时有值。和日期范围互斥，不能同时进 selection。 */
  const focusedWorkoutId = ref<string | null>(null);
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
    // 锁定单条运动时绝不能把页面上的日期范围一起送出去。
    const result = buildExportSelection(exportInputForFocus({
      startDate: exportStartDate.value,
      endDate: exportEndDate.value,
      focusedWorkoutId: focusedWorkoutId.value,
      dataTypes: [...exportDataTypes.value],
      detail: exportDetail.value,
    }));
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
      // FIT 的 activity 文件按约定装一次活动，所以一次导出是一个目录下的多份
      // 文件——选的是文件夹，不是文件名。
      fit: {
        title: t.saveFitTitle,
        extension: 'fit',
        filterName: t.fitFilter,
        unit: t.unitSamplePoints,
        directory: true,
        save: (selection: ExportSelection, path: string) => tauriApi.saveFitExport(selection, path),
      },
    } as const;
  };

  const saveExportAs = async (format: SaveFormat) => {
    const selection = exportSelection();
    if (!selection) return;
    const meta = saveFormats()[format];
    exportBusy.value = 'save';
    try {
      const path =
        'directory' in meta && meta.directory
          ? await showOpenDialog({
              title: meta.title,
              directory: true,
              multiple: false,
              defaultPath: `zeppbridge-fit-${exportStartDate.value}-${exportEndDate.value}`,
            })
          : await showSaveDialog({
              title: meta.title,
              defaultPath: `zeppbridge-${exportStartDate.value}-${exportEndDate.value}.${meta.extension}`,
              filters: [{ name: meta.filterName, extensions: [meta.extension] }],
            });
      if (!path || typeof path !== 'string') return;
      exportResult.value = await meta.save(selection, path);
      // 一次写出多个文件时报文件数，否则「已保存 N 个采样点」会让人以为只有
      // 一个文件。
      const files = exportResult.value.file_count;
      exportMessage.value =
        files === undefined
          ? copy().saved(exportResult.value.record_count, meta.unit)
          : copy().savedFiles(files, exportResult.value.record_count, meta.unit);
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
    focusedWorkoutId,
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

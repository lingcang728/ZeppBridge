import { ref } from 'vue';
import { save as showSaveDialog } from '@tauri-apps/plugin-dialog';
import { tauriApi, toUserMessage } from './useTauriApi';
import { localDateString } from '../lib/format';
import type {
  ExportDataType,
  ExportDetail,
  ExportResult,
  ExportSelection,
  ExportTypeGroup,
} from '../types';

export type SaveFormat = 'json' | 'csv' | 'gpx';

/**
 * The export picker grew from five entries to fifteen; a flat checkbox list of
 * that length is hard to scan, so each type declares the section it belongs to.
 */
export const exportTypeOptions: {
  value: ExportDataType;
  label: string;
  group: ExportTypeGroup;
}[] = [
  { value: 'steps', label: '步数', group: '活动' },
  { value: 'daily_activity', label: '日常活动', group: '活动' },
  { value: 'workouts', label: '运动', group: '活动' },
  { value: 'sleep', label: '睡眠', group: '睡眠' },
  { value: 'heart_rate', label: '心率', group: '身体状态' },
  { value: 'hrv', label: 'HRV (SDNN)', group: '身体状态' },
  { value: 'hrv_rmssd', label: 'HRV (RMSSD)', group: '身体状态' },
  { value: 'spo2', label: '血氧', group: '身体状态' },
  { value: 'stress', label: '压力', group: '身体状态' },
  { value: 'respiratory_rate', label: '呼吸率', group: '身体状态' },
  { value: 'recovery', label: '恢复状态', group: '身体状态' },
  { value: 'training_load', label: '训练负荷', group: '训练' },
  { value: 'vo2max', label: 'VO₂max', group: '训练' },
  { value: 'lactate_threshold', label: '乳酸阈值', group: '训练' },
  { value: 'pai', label: 'PAI 活力指数', group: '训练' },
];

export const exportTypeGroups: ExportTypeGroup[] = ['活动', '睡眠', '身体状态', '训练'];

export const exportDetailOptions: { value: ExportDetail; label: string; hint: string }[] = [
  {
    value: 'summary',
    label: '摘要',
    hint: '心率按小时聚合，省略逐秒运动序列；结构化指标完整，体积适合交给 AI',
  },
  { value: 'full', label: '完整', hint: '保留逐秒运动序列与逐条心率，体积大，适合归档' },
];

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
    if (!exportStartDate.value || !exportEndDate.value || exportStartDate.value > exportEndDate.value) {
      exportError.value = '请选择有效的开始和结束日期。';
      return null;
    }
    if (!exportDataTypes.value.length) {
      exportError.value = '请至少选择一种数据类型。';
      return null;
    }
    return {
      startDate: exportStartDate.value,
      endDate: exportEndDate.value,
      dataTypes: [...exportDataTypes.value],
      detail: exportDetail.value,
    };
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
        exportError.value = '这段时间没有可导出的记录。';
        return;
      }
      if (encoded.length > 1_000_000) {
        exportError.value = 'JSON 过大（超过 1 MB），请改用「保存文件」';
        return;
      }
      await navigator.clipboard.writeText(encoded);
      exportMessage.value = `已复制 ${count} 条标准化记录。`;
    } catch (error) {
      exportError.value = toUserMessage(error, '复制 JSON 失败');
    } finally {
      exportBusy.value = null;
    }
  };

  // 三种格式共用同一份本地数据：后端先生成标准化 JSON，再转成 CSV / GPX，
  // 所以「换个格式」不会换成另一套数据口径。计数单位各不相同，文案必须跟着变，
  // 否则「已保存 N 条记录」会把 CSV 行数或轨迹点数说成记录数。
  const saveFormats = {
    json: {
      title: '另存 ZeppBridge JSON',
      extension: 'json',
      filterName: 'JSON 文件',
      unit: '条记录',
      save: (selection: ExportSelection, path: string) => tauriApi.saveJsonExport(selection, path),
    },
    csv: {
      title: '另存 ZeppBridge CSV（汇总表）',
      extension: 'csv',
      filterName: 'CSV 表格',
      unit: '行',
      save: (selection: ExportSelection, path: string) => tauriApi.saveCsvExport(selection, path),
    },
    gpx: {
      title: '另存 ZeppBridge GPX（GPS 轨迹）',
      extension: 'gpx',
      filterName: 'GPX 轨迹',
      unit: '个轨迹点',
      save: (selection: ExportSelection, path: string) => tauriApi.saveGpxExport(selection, path),
    },
  } as const;

  const saveExportAs = async (format: SaveFormat) => {
    const selection = exportSelection();
    if (!selection) return;
    const meta = saveFormats[format];
    exportBusy.value = 'save';
    try {
      const path = await showSaveDialog({
        title: meta.title,
        defaultPath: `zeppbridge-${selection.startDate}-${selection.endDate}.${meta.extension}`,
        filters: [{ name: meta.filterName, extensions: [meta.extension] }],
      });
      if (!path) return;
      exportResult.value = await meta.save(selection, path);
      exportMessage.value = `已保存 ${exportResult.value.record_count} ${meta.unit}。`;
    } catch (error) {
      exportError.value = toUserMessage(error, `保存 ${meta.extension.toUpperCase()} 失败`);
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
        exportError.value = '这段时间没有可导出的记录。';
        return;
      }
      exportMessage.value = `本地 AI 数据源已更新，共 ${exportResult.value.record_count} 条记录。`;
    } catch (error) {
      exportError.value = toUserMessage(error, '更新本地 AI 数据源失败');
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

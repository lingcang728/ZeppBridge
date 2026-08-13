import { ref } from 'vue';
import { save as showSaveDialog } from '@tauri-apps/plugin-dialog';
import { tauriApi, toUserMessage } from './useTauriApi';
import { localDateString } from '../lib/format';
import type { ExportDataType, ExportResult, ExportSelection } from '../types';

export const exportTypeOptions: { value: ExportDataType; label: string }[] = [
  { value: 'heart_rate', label: '心率' },
  { value: 'sleep', label: '睡眠' },
  { value: 'workouts', label: '运动' },
  { value: 'steps', label: '步数' },
  { value: 'spo2', label: '血氧' },
  { value: 'stress', label: '压力' },
  { value: 'hrv', label: 'HRV' },
  { value: 'training_load', label: '训练负荷' },
  { value: 'vo2max', label: 'VO₂max' },
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
    'spo2',
  ]);
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

  const saveExportFile = async () => {
    const selection = exportSelection();
    if (!selection) return;
    exportBusy.value = 'save';
    try {
      const path = await showSaveDialog({
        title: '另存 ZeppBridge JSON',
        defaultPath: `zeppbridge-${selection.startDate}-${selection.endDate}.json`,
        filters: [{ name: 'JSON 文件', extensions: ['json'] }],
      });
      if (!path) return;
      exportResult.value = await tauriApi.saveJsonExport(selection, path);
      exportMessage.value = `已保存 ${exportResult.value.record_count} 条记录。`;
    } catch (error) {
      exportError.value = toUserMessage(error, '保存 JSON 失败');
    } finally {
      exportBusy.value = null;
    }
  };

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
    exportBusy,
    exportError,
    exportMessage,
    exportResult,
    applyExportRange,
    copyExportJson,
    saveExportFile,
    publishAiFeed,
  };
};

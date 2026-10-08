import { computed, ref } from 'vue';
import { useSyncController } from '../useSyncController';
import { backend, toUserMessage } from '../../lib/bridge';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { useMessages } from '../../i18n';
import { settingsMessages } from '../../views/Settings.i18n';
import type { UserPrefs } from '../../types';
import type { SettingsFeedback } from './useSettingsFeedback';

const clampDays = (value: number) => Math.min(365, Math.max(1, Math.round(value) || 1));

/**
 * 保留期、补拉窗口、存储估算，以及读写它们的几个动作。
 *
 * 数据保留、长期归档、高级维护几个区块都读这一份：归档面板改了偏好
 * 要回写到这里，压缩完要刷新这里的估算——各拿一份就会各说各话。
 *
 * 以前这里还有一个按 history_sync_days 跑的「历史补拉」，和归档卡里的账本补拉
 * 是同一件事的两个入口；现在只留账本补拉。history_sync_days 这个偏好仍然保存
 * （首次同步还会用），只是不再单独放一个按钮。
 */
export const createUserPrefs = (feedback: SettingsFeedback) => {
  const t = useMessages(settingsMessages);
  const { appStatus, refreshStatus, markDataChanged } = useSyncController();
  const { dataMessage, dataError } = feedback;

  const retentionDays = ref(appStatus.value?.retention_days ?? 365);
  const historyDays = ref(appStatus.value?.history_sync_days ?? 30);
  const storageEstimate = ref(appStatus.value?.storage ?? null);
  const prefsBusy = ref(false);
  const dataBusy = ref<string | null>(null);
  /** 完整偏好（含归档开关）。AppStatus 只带保留期与补拉窗口。 */
  const userPrefs = ref<UserPrefs | null>(null);

  /* 保留天数是「往回保留最近 N 天」，不是「N 天后清理」，而且清理只在每次成功
     同步之后执行。所以这里显示会被保留的最早日期，不再显示一个算错的未来日期。 */
  const retentionCutoffDate = computed(() => {
    const date = new Date();
    date.setDate(date.getDate() - Number(retentionDays.value || 30));
    return displayDateTimeFormatter({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).replace(/\//g, '-');
  });

  /** 已写入的保留期。清理和确认取消都读这个，绝不读输入框里还没保存的草稿。 */
  const persistedRetentionDays = () =>
    userPrefs.value?.retention_days ?? appStatus.value?.retention_days ?? 365;
  const persistedHistoryDays = () =>
    userPrefs.value?.history_sync_days ?? appStatus.value?.history_sync_days ?? 30;

  const revertPrefsDraft = () => {
    retentionDays.value = persistedRetentionDays();
    historyDays.value = persistedHistoryDays();
  };

  const savePrefs = async () => {
    const retention = clampDays(Number(retentionDays.value));
    const history = clampDays(Number(historyDays.value));
    retentionDays.value = retention;
    historyDays.value = history;
    if (retention < persistedRetentionDays()) {
      if (!window.confirm(t.value.retentionConfirm(retention))) {
        revertPrefsDraft();
        return;
      }
    }
    prefsBusy.value = true;
    try {
      const prefs = await backend.setUserPrefs(retention, history);
      userPrefs.value = prefs;
      retentionDays.value = prefs.retention_days;
      historyDays.value = prefs.history_sync_days;
      try {
        storageEstimate.value = await backend.getStorageEstimate(history);
      } catch {
        dataError.value = t.value.prefsSavedNoEstimate;
      }
      dataMessage.value = t.value.prefsSaved;
      await refreshStatus();
    } catch (error) {
      revertPrefsDraft();
      dataError.value = toUserMessage(error, t.value.prefsSaveFailed);
    } finally {
      prefsBusy.value = false;
    }
  };

  /** 归档面板改了偏好，回写到设置页自己的几个 ref，避免两处说法不一致。 */
  const applyPrefsChange = (prefs: UserPrefs) => {
    userPrefs.value = prefs;
    retentionDays.value = prefs.retention_days;
    historyDays.value = prefs.history_sync_days;
    void refreshStatus();
  };

  const cleanupData = async () => {
    const days = persistedRetentionDays();
    if (!window.confirm(t.value.cleanupConfirm(days))) return;
    dataBusy.value = 'cleanup';
    dataError.value = null;
    try {
      await backend.cleanupOldData(days);
      dataMessage.value = t.value.cleanupDone(days);
      storageEstimate.value = await backend.getStorageEstimate(days).catch(() => null);
      markDataChanged();
    } catch (error) {
      dataError.value = toUserMessage(error, t.value.cleanupFailed);
    } finally {
      dataBusy.value = null;
    }
  };

  const reprocessLocalData = async () => {
    dataBusy.value = 'reprocess';
    dataError.value = null;
    dataMessage.value = null;
    try {
      const result = await backend.reprocessLocalData();
      dataMessage.value = t.value.reprocessed(result.total_records);
      markDataChanged();
      await refreshStatus();
    } catch (error) {
      dataError.value = toUserMessage(error, t.value.reprocessFailed);
    } finally {
      dataBusy.value = null;
    }
  };

  /** 页面挂载时：先刷新一次状态，再读完整偏好。 */
  const load = async () => {
    const status = await refreshStatus();
    retentionDays.value = status?.retention_days ?? 365;
    historyDays.value = status?.history_sync_days ?? 30;
    storageEstimate.value = status?.storage ?? null;
    userPrefs.value = await backend.getUserPrefs().catch(() => null);
  };

  return {
    retentionDays,
    historyDays,
    storageEstimate,
    prefsBusy,
    dataBusy,
    userPrefs,
    retentionCutoffDate,
    savePrefs,
    applyPrefsChange,
    cleanupData,
    reprocessLocalData,
    load,
  };
};

export type UserPrefsState = ReturnType<typeof createUserPrefs>;

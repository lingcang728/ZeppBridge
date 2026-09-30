import { computed, onMounted, ref } from 'vue';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { formatBytes } from '../lib/format';
import type { BackupManifest, BackupVerification, PendingRestore, RestorePreview } from '../types';
import { backendText } from '../i18n/backendText';
import { useMessages } from '../i18n';
import { backupMessages } from '../components/BackupPanel.i18n';

/**
 * 数据库快照与恢复的状态和动作（从 BackupPanel 里搬出来，行为不变）。
 *
 * 三件事必须在界面上分开说清楚，否则「有备份」会变成一句假承诺：
 * 1. **快照是不是完好的**——每份快照都带 SHA-256 和 `integrity_check` 结果，随时可以重新校验；
 * 2. **恢复会覆盖掉什么**——恢复前先给预览：快照里各表的记录数 vs 当前库的记录数；
 * 3. **恢复什么时候真的发生**——文件替换只能在任何连接打开之前做，所以这里只负责排队，
 *    真正的替换在下次启动时执行。
 */
export const useBackups = () => {
  const t = useMessages(backupMessages);

  const lookup = (table: unknown, key: string): string | undefined =>
    (table as Record<string, string | undefined>)[key];

  const backups = ref<BackupManifest[]>([]);
  const pending = ref<PendingRestore | null>(null);
  const preview = ref<RestorePreview | null>(null);
  const verifications = ref<Record<string, BackupVerification>>({});
  const busy = ref<string | null>(null);
  const error = ref<string | null>(null);
  const message = ref<string | null>(null);

  const kindLabel = (kind: string): string => lookup(t.value.kind, kind) ?? kind;
  const compatibilityCopy = (kind: string): string =>
    lookup(t.value.compatibility, kind) ?? t.value.compatibilityUnknown;

  /** 只显示真正有意义的几张表，避免把内部表堆到界面上。 */
  const TABLE_KEYS = ['life_events', 'raw_records', 'workouts', 'daily_metrics', 'workout_samples', 'metric_samples', 'sleep_sessions'];
  const tableLabel = (key: string): string => lookup(t.value.table, key) ?? key;

  /* 校验失败原因：后端给稳定码，这里按界面语言出文案；
     未知码才回落到它那句中文原文。 */
  const verifyProblemText = (verification: BackupVerification): string => {
    switch (verification.problem_code) {
      case 'ui.backup.file_missing': return t.value.problemFileMissing;
      case 'ui.backup.size_mismatch': return t.value.problemSizeMismatch;
      case 'ui.backup.sha256_mismatch': return t.value.problemSha256Mismatch;
      case 'ui.backup.integrity_failed': return t.value.problemIntegrityFailed;
      default: return backendText(verification.problem, t.value.problemUnknown);
    }
  };

  const restoreBlockerText = (preview: RestorePreview): string => {
    if (preview.blocker_code === 'ui.backup.future_schema'
      || preview.compatibility === 'future_schema_refused') {
      return t.value.blockerFutureSchema(
        preview.manifest.schema_version,
        preview.current_schema_version,
      );
    }
    if (preview.verification.problem_code || preview.verification.problem) {
      return verifyProblemText(preview.verification);
    }
    return backendText(preview.blocker, t.value.blockerUnknown);
  };

  const previewRows = computed(() => {
    const value = preview.value;
    if (!value) return [];
    const keys = TABLE_KEYS.filter(
      (key) => key in value.manifest.table_counts || key in value.current_table_counts,
    );
    return keys.map((key) => {
      const from = value.manifest.table_counts[key] ?? 0;
      const to = value.current_table_counts[key] ?? 0;
      return { key, label: tableLabel(key), backup: from, current: to, delta: from - to };
    });
  });

  const load = async () => {
    if (!isDesktop()) return;
    error.value = null;
    try {
      const [list, staged] = await Promise.all([backend.listBackups(), backend.getPendingRestore()]);
      backups.value = list;
      pending.value = staged;
    } catch (cause) {
      error.value = toUserMessage(cause, t.value.listFailed);
    }
  };


  const createBackup = async () => {
    busy.value = 'create';
    error.value = null;
    message.value = null;
    try {
      const created = await backend.createManualBackup();
      message.value = t.value.created(formatBytes(created.bytes));
      await load();
    } catch (cause) {
      error.value = toUserMessage(cause, t.value.createFailed);
    } finally {
      busy.value = null;
    }
  };

  const verify = async (id: string) => {
    busy.value = id;
    error.value = null;
    message.value = null;
    try {
      verifications.value = { ...verifications.value, [id]: await backend.verifyBackup(id) };
    } catch (cause) {
      error.value = toUserMessage(cause, t.value.verifyError);
    } finally {
      busy.value = null;
    }
  };

  const togglePinned = async (item: BackupManifest) => {
    busy.value = item.id;
    error.value = null;
    try {
      await backend.setBackupPinned(item.id, !item.pinned);
      await load();
    } catch (cause) {
      error.value = toUserMessage(cause, t.value.pinFailed);
    } finally {
      busy.value = null;
    }
  };

  const openPreview = async (id: string) => {
    busy.value = id;
    error.value = null;
    message.value = null;
    try {
      preview.value = await backend.getRestorePreview(id);
    } catch (cause) {
      error.value = toUserMessage(cause, t.value.previewFailed);
    } finally {
      busy.value = null;
    }
  };

  const confirmRestore = async () => {
    const target = preview.value;
    if (!target || !target.can_restore) return;
    busy.value = 'stage';
    error.value = null;
    try {
      pending.value = await backend.stageRestore(target.manifest.id);
      preview.value = null;
      message.value = t.value.staged;
      await load();
    } catch (cause) {
      error.value = toUserMessage(cause, t.value.stageFailed);
    } finally {
      busy.value = null;
    }
  };

  const cancelRestore = async () => {
    busy.value = 'cancel';
    error.value = null;
    try {
      await backend.cancelPendingRestore();
      pending.value = null;
      message.value = t.value.cancelled;
      await load();
    } catch (cause) {
      error.value = toUserMessage(cause, t.value.cancelFailed);
    } finally {
      busy.value = null;
    }
  };

  onMounted(() => void load());

  return {
    t,
    backups,
    pending,
    preview,
    verifications,
    busy,
    error,
    message,
    kindLabel,
    compatibilityCopy,
    verifyProblemText,
    restoreBlockerText,
    formatBytes,
    previewRows,
    load,
    createBackup,
    verify,
    togglePinned,
    openPreview,
    confirmRestore,
    cancelRestore,
  };
};

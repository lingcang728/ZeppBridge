import { computed } from 'vue';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { syncStreamLabel } from '../../lib/syncStreams';
import { failedStreamKeys } from '../../lib/syncDeferred';
import { errorTextFor } from '../../i18n/errors';
import { backendText } from '../../i18n/backendText';
import type { SyncOutcome, SyncReport } from '../../types';
import { appStatus, copy, notice, type SyncNotice } from './state';

/* 把「发生了什么」渲染成当前语言的一句话（从 useSyncController.ts 搬出来）。 */

export const formatTime = (value?: string): string => {
  if (!value) return copy().timeUnknown;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return copy().timeUnknown;
  return displayDateTimeFormatter({
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const formatClock = (value?: string): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return displayDateTimeFormatter({ hour: '2-digit', minute: '2-digit' }).format(date);
};

const latestHeartRateAt = (report?: SyncReport | null): string | undefined =>
  report?.streams.find((stream) => stream.stream === 'heart_rate')?.newest_sample_at
  ?? appStatus.value?.streams.find((stream) => stream.stream === 'heart_rate')?.newest_sample_at;

const KNOWN_SYNC_OUTCOMES: readonly SyncOutcome[] = [
  'updated',
  'no_new_data',
  'partial',
  'failed',
  'cancelled',
  'deferred',
];

/** 把后端存的 outcome 码写成当前语言的一句话。不认识的码不原样吐出去。 */
export const syncOutcomeLabel = (outcome: string | null | undefined): string | null => {
  if (!outcome || !(KNOWN_SYNC_OUTCOMES as readonly string[]).includes(outcome)) return null;
  return renderReport(outcome as SyncOutcome, []);
};

const renderReport = (
  outcome: SyncOutcome,
  failedStreams: string[],
  latestAt?: string,
  backendMessage?: string,
): string => {
  const t = copy();
  const latest = latestAt ? formatTime(latestAt) : null;
  if (outcome === 'updated') return latest ? t.updatedWithLatest(latest) : t.updated;
  if (outcome === 'no_new_data') return latest ? t.noNewDataWithLatest(latest) : t.noNewData;
  if (outcome === 'partial') {
    // 失败流列的是键（heart_rate…），显示时换成人话。
    const names = failedStreams.map((stream) => syncStreamLabel(stream));
    return names.length ? t.partialWithStreams(names.join(t.streamSeparator)) : t.partial;
  }
  if (outcome === 'cancelled') return t.cancelled;
  if (outcome === 'deferred') return backendMessage ?? t.deferred;
  return t.failed;
};

/**
 * 增量同步往回拉多少天。
 *
 * 从后端状态读，**不在这里写死**。它曾经写死成 7：后端改成 30 之后，界面
 * 整整一个版本都还在说「正在同步最近 7 天」——用户看到的数字和程序做的事
 * 不是一回事，而这种漂移不会让任何测试变红。契约值在
 * `zeppbridge_core::contract::INCREMENTAL_SYNC_DAYS`。
 *
 * 状态还没到手时（第一次同步的头几百毫秒）用 30 兜底：那是当前的契约值，
 * 而这一句话本来就是过渡态的提示。
 */
const incrementalSyncDays = () => appStatus.value?.incremental_sync_days ?? 30;

const renderNotice = (value: SyncNotice): string => {
  const t = copy();
  switch (value.kind) {
    case 'none': return t.notSyncedYet;
    case 'backend': return backendText(value.text, t.syncingRecent(incrementalSyncDays()));
    case 'progress': {
      const stream = syncStreamLabel(value.stream);
      if (value.code === 'backfilling' && value.month) return t.backfillingStream(stream, value.month);
      if (value.code === 'backfilling') return t.syncingStream(stream);
      if (value.code === 'syncing' || value.code === 'stream_completed') return t.syncingStream(stream);
      // 后端加了新的一步而界面还不认识它：英文界面下不吐中文，给一句笼统的。
      return backendText(value.text, t.syncingRecent(incrementalSyncDays()));
    }
    case 'syncingRecent': return t.syncingRecent(value.days ?? incrementalSyncDays());
    case 'backfilling': return t.backfilling(value.days);
    case 'alreadySyncing': return t.alreadySyncing;
    case 'desktopOnly': return t.desktopOnly;
    case 'reauthNeeded': return t.reauthNeeded;
    case 'verifyFirst': return t.verifyFirst;
    case 'connectFirst': return t.connectFirst;
    case 'cancelling': return t.cancelling;
    case 'report':
      return renderReport(value.outcome, value.failedStreams, value.latestAt, value.backendMessage);
  }
};

export const syncMessage = computed(() => renderNotice(notice.value));

export const noticeForReport = (report: SyncReport): SyncNotice => ({
  kind: 'report',
  outcome: report.outcome,
  failedStreams: failedStreamKeys(report.streams),
  latestAt: latestHeartRateAt(report),
  // deferred 那句话后端给了稳定码，按界面语言取；取不到才用后端的中文原文。
  backendMessage: report.outcome === 'deferred'
    ? errorTextFor(report.message_code) ?? report.message ?? undefined
    : undefined,
});

export const lastOutcomeLabel = computed(() => {
  const outcome = appStatus.value?.last_cloud_sync_outcome;
  if (!outcome) return null;
  const latest = latestHeartRateAt();
  if (outcome === 'no_new_data' && latest) return copy().noNewDataWithLatest(formatTime(latest));
  return copy().lastCloudSync(formatTime(appStatus.value?.last_cloud_sync_at));
});

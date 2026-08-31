/**
 * 存储估算说明的唯一一份文案实现。
 *
 * 后端只给稳定码（`ui.estimate.*`）和几个数字，句子在这里按界面语言拼。
 *
 * 为什么要单独成文件：这段文案原本在 `HistoryArchivePanel` 里写了一份，
 * `Settings.vue` 又独立渲染了同一个 `estimate.message`。第一轮修的时候只改了
 * 前者，后者继续在英文界面上显示中文——同一句话有两份实现，就一定会漏掉一份。
 * 现在只有这一份，两个调用方都从这里取。
 */
import { defineMessages, messagesOf } from '../i18n';

/*
 * 只声明这里真正要读的字段，而不是整个 `StorageEstimate`。
 * 调用方有的是 `readonly` 的（Settings 里的 computed），整体类型对不上；
 * 而这段文案本来也只需要这几个数字。
 */
export interface EstimateCopyInput {
  readonly message: string;
  readonly message_code?: string;
  readonly requested_days: number;
  readonly estimated_add_bytes: number;
  readonly free_bytes: number;
  readonly needed_bytes?: number;
  readonly stop_reason?: string | null;
  readonly stop_reason_code?: string | null;
}

const messages = defineMessages(
  {
    stopNoSpace: (needed: string, free: string) =>
      `这次补拉预计需要 ${needed}（含安全余量），本盘只剩 ${free}，不会开始。请先腾出空间或缩短范围。`,
    diskUnknown: '未能读取磁盘剩余空间，补拉前请确认本机还有足够空间。',
    diskTooSmall: '磁盘剩余不足 300 MB，不能补拉 90 天以上的历史。',
    builtinGuess: (days: number, add: string, free: string) =>
      `本机样本还不够，用的是内置粗略估算：${days} 天大约占用 ${add}，本盘剩余 ${free}。`,
    measured: (days: number, add: string, free: string) =>
      `按本机已有数据的实际速率推算，${days} 天大约占用 ${add}，本盘剩余 ${free}。`,
    partial: (days: number, add: string, free: string) =>
      `只按本机已有样本的那几条流推算，${days} 天大约占用 ${add}（其余流样本不足，未计入），本盘剩余 ${free}。`,
  },
  {
    stopNoSpace: (needed: string, free: string) =>
      `This backfill needs about ${needed} (including a safety margin) but only ${free} is free, so it will not start. Free up space or shorten the range.`,
    diskUnknown: 'Could not read the free disk space. Make sure there is enough room before backfilling.',
    diskTooSmall: 'Less than 300 MB free — history longer than 90 days cannot be backfilled.',
    builtinGuess: (days: number, add: string, free: string) =>
      `Not enough local samples yet, so this is a rough built-in estimate: ${days} days takes about ${add}, and ${free} is free on this drive.`,
    measured: (days: number, add: string, free: string) =>
      `Based on the rate your own data actually accumulates, ${days} days takes about ${add}, and ${free} is free on this drive.`,
    partial: (days: number, add: string, free: string) =>
      `Based only on the streams that have enough local samples, ${days} days takes about ${add} (the rest are not counted), and ${free} is free on this drive.`,
  },
);

/** 和面板里显示的一致的字节写法。 */
export const formatEstimateBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};

/**
 * 估算说明。后端加了新说法而界面还不认识时，回落到它那句原文——
 * 宁可显示一句看不懂的，也不要显示空白。
 */
export const storageEstimateText = (estimate: EstimateCopyInput | null | undefined): string => {
  if (!estimate) return '';
  const t = messagesOf(messages);
  const add = formatEstimateBytes(estimate.estimated_add_bytes);
  const free = formatEstimateBytes(estimate.free_bytes);
  switch (estimate.message_code) {
    case 'ui.estimate.stop_no_space':
      return t.stopNoSpace(formatEstimateBytes(estimate.needed_bytes ?? 0), free);
    case 'ui.estimate.disk_unknown': return t.diskUnknown;
    case 'ui.estimate.disk_too_small': return t.diskTooSmall;
    case 'ui.estimate.builtin_guess': return t.builtinGuess(estimate.requested_days, add, free);
    case 'ui.estimate.measured': return t.measured(estimate.requested_days, add, free);
    case 'ui.estimate.partial': return t.partial(estimate.requested_days, add, free);
    default: return estimate.message;
  }
};

/** 空间不足那句。没有 stop_reason 时返回空串。 */
export const storageStopReasonText = (
  estimate: EstimateCopyInput | null | undefined,
): string => {
  if (!estimate?.stop_reason) return '';
  if (estimate.stop_reason_code === 'ui.estimate.stop_no_space') {
    return messagesOf(messages).stopNoSpace(
      formatEstimateBytes(estimate.needed_bytes ?? 0),
      formatEstimateBytes(estimate.free_bytes),
    );
  }
  return estimate.stop_reason;
};

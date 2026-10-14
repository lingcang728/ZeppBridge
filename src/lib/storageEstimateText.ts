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
import { backendText } from '../i18n/backendText';
import { formatBytes } from './format';

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
      `这次补拉预计要 ${needed}（含安全余量），本盘只剩 ${free}，不会开始。先腾空间或缩短范围。`,
    diskUnknown: '读不到磁盘剩余空间，补拉前确认本机空间足够。',
    diskTooSmall: '磁盘剩余不足 300 MB，不能补拉 90 天以上的历史。',
    builtinGuess: (days: number, add: string, free: string) =>
      `本机样本不足，按内置粗估：${days} 天约占用 ${add}，本盘剩余 ${free}。`,
    measured: (days: number, add: string, free: string) =>
      `按本机已有数据的实际速率推算，${days} 天约占用 ${add}，本盘剩余 ${free}。`,
    partial: (days: number, add: string, free: string) =>
      `只按本机有样本的几条流推算，${days} 天约占用 ${add}（其余流样本不足，未计入），本盘剩余 ${free}。`,
    unknownEstimate: '暂时算不出这次补拉的占用。',
  },
  {
    stopNoSpace: (needed: string, free: string) =>
      `This backfill needs about ${needed} (incl. safety margin); only ${free} is free. It will not start — free up space or shorten the range.`,
    diskUnknown: 'Could not read free disk space. Check there is enough room before backfilling.',
    diskTooSmall: 'Less than 300 MB free — history longer than 90 days cannot be backfilled.',
    builtinGuess: (days: number, add: string, free: string) =>
      `Too few local samples — rough built-in estimate: ${days} days ≈ ${add}; ${free} free on this drive.`,
    measured: (days: number, add: string, free: string) =>
      `At the rate your own data accumulates, ${days} days ≈ ${add}; ${free} free on this drive.`,
    partial: (days: number, add: string, free: string) =>
      `Only streams with enough local samples counted: ${days} days ≈ ${add} (rest not counted); ${free} free on this drive.`,
    unknownEstimate: 'Cannot estimate this backfill’s size right now.',
  },
  {
    stopNoSpace: (needed: string, free: string) =>
      `Esta recuperación requiere ${needed} (con margen de seguridad); solo quedan ${free} libres. No iniciará: libera espacio o acorta el rango.`,
    diskUnknown: 'No se pudo leer el espacio libre. Comprueba que haya espacio antes de recuperar historial.',
    diskTooSmall: 'Menos de 300 MB libres: no se puede recuperar historial mayor a 90 días.',
    builtinGuess: (days: number, add: string, free: string) =>
      `Pocas muestras locales; estimación aproximada de la app: ${days} días ≈ ${add}, con ${free} libres en este disco.`,
    measured: (days: number, add: string, free: string) =>
      `Según el ritmo de tus datos, ${days} días ≈ ${add}; ${free} libres en este disco.`,
    partial: (days: number, add: string, free: string) =>
      `Solo flujos con muestras suficientes: ${days} días ≈ ${add} (el resto no se cuenta); ${free} libres en disco.`,
    unknownEstimate: 'No se puede estimar el tamaño de esta recuperación por ahora.',
  },
  'lib/storageEstimateText',
);

/** 和面板里显示的一致的字节写法。 */
export const formatEstimateBytes = (bytes: number): string => formatBytes(bytes, '0 KB');

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
    // 未知码：英文界面下不吐中文原文，给一句笼统的。
    default: return backendText(estimate.message, t.unknownEstimate);
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
  return backendText(estimate.stop_reason, messagesOf(messages).unknownEstimate);
};

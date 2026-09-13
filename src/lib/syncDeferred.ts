/**
 * 同步「让路」与失败流的纯函数。
 *
 * 抽出来是为了 vitest 能钉住两件事：unavailable/unverified 不能进失败名单，
 * 以及 Busy/重放/压缩必须被认成 deferred 而不是红条。
 */

const DEFERRED_CODES = new Set([
  'err.sync.deferred_compaction',
  'err.sync.deferred_replay',
  'err.sync.deferred_busy',
  'err.core.busy',
]);

export const isDeferredSyncError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && DEFERRED_CODES.has(code);
};

export const isCancelledSyncError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === 'err.core.cancelled';
};

export const failedStreamKeys = (
  streams: Array<{ stream: string; status: string }>,
): string[] => streams
  .filter((stream) => stream.status === 'failed')
  .map((stream) => stream.stream);

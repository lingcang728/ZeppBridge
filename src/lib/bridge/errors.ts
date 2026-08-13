type UnknownRecord = Record<string, unknown>;

export class DesktopUnavailableError extends Error {
  constructor(message = '请使用桌面应用') {
    super(message);
    this.name = 'DesktopUnavailableError';
  }
}

export class TauriUnavailableError extends DesktopUnavailableError {
  constructor(message = '请使用桌面应用') {
    super(message);
    this.name = 'TauriUnavailableError';
  }
}

const errorText = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const candidate = error as UnknownRecord;
    if (typeof candidate.message === 'string') return candidate.message;
    if (typeof candidate.error === 'string') return candidate.error;
  }
  return '';
};

export const toUserMessage = (error: unknown, fallback = '操作未完成，请稍后重试'): string => {
  const source = errorText(error).replace(/^Err\((.*)\)$/s, '$1').trim();
  if (!source) return fallback;
  const lower = source.toLowerCase();
  if (lower.includes('请使用桌面应用') || error instanceof DesktopUnavailableError) {
    return '请使用桌面应用';
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return '请求超时，请确认网络与 Zepp 区域后重试。';
  }
  if (source.length > 140) return `${source.slice(0, 137)}…`;
  return source;
};

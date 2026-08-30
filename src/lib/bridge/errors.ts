import { defineMessages, messagesOf } from '../../i18n';

type UnknownRecord = Record<string, unknown>;

const messages = defineMessages(
  {
    desktopOnly: '请使用桌面应用',
    genericFailure: '操作未完成，请稍后重试',
    timedOut: '请求超时，请确认网络与 Zepp 区域后重试。',
  },
  {
    desktopOnly: 'Use the desktop app',
    genericFailure: "That didn't go through. Try again in a moment",
    timedOut: 'The request timed out. Check your network and the Zepp region, then try again.',
  },
);

const copy = () => messagesOf(messages);

/*
 * 「请使用桌面应用」这句在两个地方出现：这里抛出的异常消息，和 toUserMessage
 * 的识别规则。识别规则必须认中文原文——异常可能是别处（含旧代码路径）抛的，
 * 而且它是本地判断，不是给用户看的字。给用户看的那份跟着界面语言走。
 */
const DESKTOP_ONLY_MARKER = '请使用桌面应用';

export class DesktopUnavailableError extends Error {
  constructor(message = DESKTOP_ONLY_MARKER) {
    super(message);
    this.name = 'DesktopUnavailableError';
  }
}

export class TauriUnavailableError extends DesktopUnavailableError {
  constructor(message = DESKTOP_ONLY_MARKER) {
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

export const toUserMessage = (error: unknown, fallback = copy().genericFailure): string => {
  const source = errorText(error).replace(/^Err\((.*)\)$/s, '$1').trim();
  if (!source) return fallback;
  const lower = source.toLowerCase();
  if (lower.includes(DESKTOP_ONLY_MARKER) || error instanceof DesktopUnavailableError) {
    return copy().desktopOnly;
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return copy().timedOut;
  }
  if (source.length > 140) return `${source.slice(0, 137)}…`;
  return source;
};

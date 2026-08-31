/**
 * 补拉失败原因的唯一一份文案实现。
 *
 * 抽出来是为了能测：这段逻辑原本长在 `HistoryArchivePanel.vue` 里面，
 * 而 SFC 内部的函数没法单独跑单测，于是「它到底会不会吐中文」只能靠人去点
 * 界面看——用户已经因此来回截了三次图。现在它是个纯函数，可以拿真实的
 * 数据库行直接断言。
 *
 * 取文案的顺序：账本里的码 → 通用错误码表 → 中文闸门兜底。
 */
import { defineMessages, messagesOf } from '../i18n';
import { backendText } from '../i18n/backendText';
import { errorTextFor } from '../i18n/errors';

const messages = defineMessages(
  {
    noCanonical: '云端返回了报文，但没有解析出可用记录',
    noReason: '没有记录原因',
  },
  {
    noCanonical: 'The cloud returned a payload, but no usable records could be parsed from it',
    noReason: 'No reason recorded',
  },
);

/** 只声明这里要读的字段，方便直接拿数据库行来测。 */
export interface FailedChunkLike {
  readonly error?: string | null;
  readonly error_code?: string | null;
}

export const failedChunkText = (chunk: FailedChunkLike): string => {
  const t = messagesOf(messages);
  if (chunk.error_code === 'err.backfill.no_canonical_records') return t.noCanonical;
  const localized = errorTextFor(chunk.error_code);
  if (localized) return localized;
  // 码缺失（比如旧版本写进库的行）时，英文界面下也不能把中文原文放出去。
  return backendText(chunk.error, t.noReason);
};

import { describe, expect, it } from 'vitest';
import { LETTER_REPLY_MAX, replyCharCount, tidyReplyInput } from '../letterBox';

describe('信纸边写边收', () => {
  it('光按回车空不出一大片：开头不留空行，段落之间最多空一行', () => {
    expect(tidyReplyInput('\n\n\n  你好')).toBe('你好');
    expect(tidyReplyInput('第一段\n\n\n\n\n第二段')).toBe('第一段\n\n第二段');
    expect(tidyReplyInput('第一段\n  \n 　\n第二段')).toBe('第一段\n\n第二段');
    // 正在打第二段：先按出来的一个空行留着。
    expect(tidyReplyInput('第一段\n\n')).toBe('第一段\n\n');
    expect(tidyReplyInput('第一段\n\n\n')).toBe('第一段\n\n');
  });

  it('连着的空格收成一个，单个空格和换行照旧', () => {
    expect(tidyReplyInput('a     b\t\tc　　d')).toBe('a b c d');
    expect(tidyReplyInput('Hello world\nnext line')).toBe('Hello world\nnext line');
    expect(tidyReplyInput('\r\n\r\nx\r\ny')).toBe('x\ny');
  });

  it('字数按码点数，表情算一个字', () => {
    expect(replyCharCount('你好👋')).toBe(3);
    expect(replyCharCount('x'.repeat(LETTER_REPLY_MAX))).toBe(LETTER_REPLY_MAX);
  });
});

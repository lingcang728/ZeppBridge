import { describe, expect, it } from 'vitest';
import { echoTitle, leadParagraph, lettersBetween, parseEcho, parseLetter } from '../letters/parse';
import { stampFace } from '../letters/stamp';
import { archiveSpan } from '../letters/personal';
import { noteParts } from '../letters/notes';

describe('letters', () => {
  it('reads paragraphs and a short dash-led signature, like the website archive', () => {
    expect(parseLetter('你好，\n这是第一段。\n\n第二段 **加粗**。\n\n—— 作者\n')).toEqual({
      paragraphs: ['你好， 这是第一段。', '第二段 **加粗**。'], signature: '作者',
    });
    expect(parseLetter('Only one paragraph.').signature).toBeNull();
    expect(leadParagraph(['Hello,', 'This is where the letter really starts.'])).toBe(1);
    expect(leadParagraph(['短短一句。'])).toBe(0);
  });

  it('parses echo items with fixed English prefixes and stable ids', () => {
    const echo = parseEcho([
      '上一版一共收到 37 封回信，谢谢。',
      '- next #backfill-stuck: **补拉卡住**：3.1.1 先修。',
      '- later #linux-lag：**Linux 卡顿**，推迟到 3.2。',
      '- asking #watch-faces: Which watch faces?',
      '- 不认识的行会被忽略',
    ].join('\n'));
    expect(echo.intro).toEqual(['上一版一共收到 37 封回信，谢谢。']);
    expect(echo.items.map((item) => [item.kind, item.id])).toEqual([
      ['next', 'backfill-stuck'], ['later', 'linux-lag'], ['asking', 'watch-faces'],
    ]);
    expect(echoTitle(echo.items[0]!)).toBe('补拉卡住');
    expect(echoTitle(echo.items[2]!)).toBe('Which watch faces?');
  });

  it('bundles every letter written since the previous install, oldest first', () => {
    const all = ['3.0.7', '3.1.0', '3.0.9', '3.2.0'];
    expect(lettersBetween(all, '3.0.6', '3.1.0')).toEqual(['3.0.7', '3.0.9', '3.1.0']);
    expect(lettersBetween(all, '3.1.0', '3.2.0')).toEqual(['3.2.0']);
    // 版本不明（老安装）：只给这一版。
    expect(lettersBetween(all, '', '3.1.0')).toEqual(['3.1.0']);
    expect(lettersBetween(all, '3.1.0', '3.1.1')).toEqual([]);
  });

  it('prints the minor version on a stamp, and the full version for patch releases', () => {
    expect(stampFace('3.1.0')).toBe('3.1');
    expect(stampFace('3.0.7')).toBe('3.0.7');
  });

  it('only states the archive span when there is at least a month of data', () => {
    const today = new Date(2026, 9, 21);
    expect(archiveSpan('2019-08-03', today)).toEqual({ years: 7, months: 2 });
    expect(archiveSpan('2019-08-25', today)).toEqual({ years: 7, months: 1 });
    expect(archiveSpan('2026-10-01', today)).toBeNull();
    expect(archiveSpan(null, today)).toBeNull();
  });

  it('splits a release note into title, body and issue refs for the paper', () => {
    expect(noteParts('**命令行顶替运动（#143）**。zeppbridge-cli 新增 fit-override。')).toEqual({ title: '命令行顶替运动', body: 'zeppbridge-cli 新增 fit-override。', refs: ['#143'] });
    expect(noteParts('**Backfill gaps (#143, #150)**: months come back.')).toEqual({ title: 'Backfill gaps', body: 'months come back.', refs: ['#143', '#150'] });
    expect(noteParts('Plain note without a title')).toEqual({ title: '', body: 'Plain note without a title', refs: [] });
  });
});

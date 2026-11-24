import { describe, expect, it } from 'vitest';
import { echoTitle, leadParagraph, lettersBetween, parseEcho, parseLetter } from '../letters/parse';
import { stampFace } from '../letters/stamp';
import { archiveSpan } from '../letters/personal';
import { noteParts } from '../letters/notes';
import { flightFrames, flightPath, launchEase } from '../letters/paperPlane';

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

  it('a local beta build re-delivers the letter of the release it belongs to', () => {
    const all = ['3.0.7', '3.0.9'];
    expect(lettersBetween(all, '3.0.9', '3.0.9-beta.1')).toEqual(['3.0.9']);
    expect(lettersBetween(all, '3.0.9-beta.1', '3.0.9-beta.2')).toEqual(['3.0.9']);
    expect(lettersBetween(all, '3.0.6', '3.0.9-beta.1')).toEqual(['3.0.7', '3.0.9']);
  });

  it('a beta install upgrading to its release still receives that release letter', () => {
    const all = ['3.1.1', '3.2.0', '3.2.1'];
    expect(lettersBetween(all, '3.2.1-beta.1', '3.2.1')).toEqual(['3.2.1']);
    expect(lettersBetween(all, '3.1.1', '3.2.1')).toEqual(['3.2.0', '3.2.1']);
    // 正式版重装同一版：不再弹。
    expect(lettersBetween(all, '3.2.1', '3.2.1')).toEqual([]);
    // 升到预发布版：照旧只给它所属正式版的信。
    expect(lettersBetween(all, '3.2.0', '3.2.1-beta.1')).toEqual(['3.2.1']);
  });

  it('prints the full version on a stamp, without a prerelease suffix', () => {
    expect(stampFace('3.1.0')).toBe('3.1.0');
    expect(stampFace('3.0.7')).toBe('3.0.7');
    expect(stampFace('3.1.0-beta.1')).toBe('3.1.0');
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

  it('flies the paper plane down a little first, then out past the top-right corner, nose along the path', () => {
    const frames = flightFrames(flightPath({ x: 400, y: 500 }, { width: 1200, height: 800 }));
    const first = frames[0]!;
    const last = frames[frames.length - 1]!;
    expect(first).toMatchObject({ x: 400, y: 500, t: 0 });
    expect(frames[3]!.y).toBeGreaterThan(500);
    expect(last.x).toBeGreaterThan(1200);
    expect(last.y).toBeLessThan(0);
    expect(last.scale).toBeLessThan(first.scale);
    /* 起飞时机头朝右下（沉），飞出时朝右上（抬头）。 */
    expect(first.angle).toBeGreaterThan(frames[frames.length - 2]!.angle);
  });

  it('starts the flight slow and speeds up smoothly, keyframes evenly spaced in time', () => {
    const path = flightPath({ x: 400, y: 500 }, { width: 1200, height: 800 });
    const frames = flightFrames(path, 40, launchEase);
    expect(launchEase(0)).toBe(0);
    expect(launchEase(1)).toBe(1);
    expect(frames.map((frame) => frame.t)).toEqual(Array.from({ length: 41 }, (_, i) => i / 40));
    const step = (i: number) => Math.hypot(frames[i + 1]!.x - frames[i]!.x, frames[i + 1]!.y - frames[i]!.y);
    /* 起步那一段比后段慢得多，但不是停着的（手推了一下）。 */
    expect(step(0)).toBeGreaterThan(0);
    expect(step(0)).toBeLessThan(step(36) / 2);
    expect(frames[40]).toMatchObject({ x: path[3].x, y: path[3].y });
  });
});

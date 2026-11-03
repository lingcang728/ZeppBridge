import assert from 'node:assert/strict';
import test from 'node:test';
import { groupNotes, renderChangelog, splitLegacy } from '../scripts/site/changelog.mjs';

test('only tagged versions reach the changelog, newest first', () => {
  const notes = new Map([
    ['3.0.9', { en: '- Fixed: **Old** one' }],
    ['3.1.0', { en: '- Added: **New** <script>x</script>', zh: '- 新增：**新的**' }],
    ['3.1.1', { en: '- Added: unreleased' }],
  ]);
  const files = renderChangelog(notes, new Map([['3.0.9', '2026-10-20'], ['3.1.0', '2026-10-29']]));
  assert.equal(files.size, 13);
  const en = files.get('changelog/index.html');
  assert.ok(!en.includes('unreleased'));
  assert.ok(en.indexOf('id="v3.1.0"') < en.indexOf('id="v3.0.9"'));
  assert.match(en, /<strong>New<\/strong> &lt;script&gt;/);
  assert.match(en, /<time datetime="2026-10-29">/);
  // 繁体缺稿先落简体，其余语言缺稿落英文并标出段落语言。
  assert.match(files.get('changelog/zh-TW.html'), /<section class="release" id="v3.1.0" lang="zh-CN">.*新的/);
  assert.match(files.get('changelog/de.html'), /<section class="release" id="v3.1.0" lang="en">/);
});

test('notes group like the in-app dialog and the 3.0.1 single file splits by language', () => {
  assert.deepEqual(groupNotes('# 3.1.0\n- Fixed: a\n- Added: b\n## Section\n- Improved: c\nplain'), [
    { kind: 'added', items: ['b'] }, { kind: 'improved', items: ['c'] }, { kind: 'fixed', items: ['a'] }, { kind: 'note', items: ['plain'] },
  ]);
  const legacy = splitLegacy('# ZeppBridge 3.0.1\n\n## 中文\n\n- 新增：甲\n\n## English\n\n- Added: A\n');
  assert.deepEqual(Object.keys(legacy), ['zh', 'en']);
  assert.match(legacy.zh, /甲/);
  assert.ok(!legacy.en.includes('甲'));
});

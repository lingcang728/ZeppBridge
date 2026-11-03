import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLetter, renderLetterArchive } from '../scripts/site/letters.mjs';

test('a letter is paragraphs plus an optional signature, nothing else', () => {
  assert.deepEqual(parseLetter('Hi,\nthere.\n\nSecond **bold**.\n\n— The author\n'), {
    paragraphs: ['Hi, there.', 'Second **bold**.'], signature: 'The author',
  });
  // 一句很长、碰巧以破折号开头的段落不是落款。
  const long = `— ${'x'.repeat(80)}`;
  assert.equal(parseLetter(`Hi.\n\n${long}`).signature, null);
});

test('the archive escapes everything except **bold** and lists newest first', () => {
  const letters = new Map([
    ['3.0.7', { en: 'Older <b>one</b>.\n\n— A', zh: '旧的。' }],
    ['3.1.0', { en: 'Newer **one** <script>alert(1)</script>.\n\n— A' }],
  ]);
  const files = renderLetterArchive(letters);
  assert.deepEqual([...files.keys()].sort(), ['letters/3.0.7/index.html', 'letters/3.0.7/zh.html', 'letters/3.1.0/index.html', 'letters/index.html']);
  const newest = files.get('letters/3.1.0/index.html');
  assert.match(newest, /<strong>one<\/strong>/);
  assert.ok(!newest.includes('<script>alert'));
  assert.match(newest, /&lt;script&gt;/);
  assert.match(files.get('letters/3.0.7/index.html'), /Older &lt;b&gt;one&lt;\/b&gt;/);
  assert.match(files.get('letters/3.0.7/zh.html'), /<html lang="zh-CN">/);
  const index = files.get('letters/index.html');
  assert.ok(index.indexOf('3.1.0') < index.indexOf('3.0.7'));
});

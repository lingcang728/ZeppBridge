import assert from 'node:assert/strict';
import test from 'node:test';
import { NOTE_LOCALES, echoPath, echoProblems, needsLetter, tagMessage } from '../scripts/release/release-core.mjs';

test('the tag body is the title plus this version’s changes, never the author letter', () => {
  assert.equal(tagMessage('3.1.1', '- Added: **X**.\n'), '# ZeppBridge 3.1.1\n\n- Added: **X**.\n');
  assert.equal(tagMessage('3.1.1', '\n\n- Fixed: **Y**.  \n\n'), '# ZeppBridge 3.1.1\n\n- Fixed: **Y**.\n');
});

test('every version from 3.0.7 needs a letter, patches included', () => {
  assert.equal(needsLetter('3.0.6'), false);
  assert.equal(needsLetter('3.0.7'), true);
  assert.equal(needsLetter('3.1.1'), true);
});

test('an echo is optional, but once written every language carries the same #ids', () => {
  const files = new Map();
  const show = (path) => files.get(path) ?? null;
  assert.deepEqual(echoProblems('3.1.0', show), []);
  const zh = '上一版收到 3 封回信。\n- next #backfill-stuck: **补拉卡住**：先修。\n- asking #watch-faces: **表盘**？';
  for (const locale of NOTE_LOCALES) files.set(echoPath('3.1.0', locale), zh);
  assert.deepEqual(echoProblems('3.1.0', show), []);
  files.set(echoPath('3.1.0', 'de'), '- next #backfill-stuck: x\n- asking #faces: y');
  files.set(echoPath('3.1.0', 'fr'), '- soon #backfill-stuck: x');
  files.delete(echoPath('3.1.0', 'pl'));
  const problems = echoProblems('3.1.0', show).join('\n');
  assert.match(problems, /echo\/de\.md 的 #id 和中文原稿对不上/);
  assert.match(problems, /echo\/fr\.md 这一行不是回音格式/);
  assert.match(problems, /缺上期回音 .*echo\/pl\.md/);
});

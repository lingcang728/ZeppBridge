import assert from 'node:assert/strict';
import test from 'node:test';
import { checkCommitMessage, checkContentLine, checkPath } from '../scripts/privacy/rules.mjs';
import { parseAddedLines, rangeFromEvent } from '../scripts/privacy/check.mjs';

const ids = (hits) => hits.map((h) => h.id);

test('maintainer notes never enter the public tree', () => {
  for (const path of [
    'CLAUDE.md', 'AGENTS.local.md', 'CLAUDE.local.md', '翻译.md', '计划.md', 'docs/计划-3.2.md',
    '修复计划.md', 'docs/issue-repair-20261023-handoff.md', 'artifacts/journal-repair-1/plan.md',
    '.site-cache/task-italian/pr-3.0.1.md', 'docs/sub/CLAUDE.md',
  ]) assert.equal(checkPath(path).length, 1, path);
  for (const path of ['AGENTS.md', 'README.md', 'docs/guides/ai.md', 'docs/releases/README.md', 'src/lib/plan.ts']) {
    assert.deepEqual(checkPath(path), [], path);
  }
});

test('real Windows user folders are caught, placeholders and test fixtures are not', () => {
  assert.deepEqual(ids(checkContentLine('scripts/x.ps1', String.raw`$p = 'C:\Users\someone\Desktop\x'`)), ['local-path.windows-user']);
  assert.deepEqual(ids(checkContentLine('src/x.rs', String.raw`// C:\\Users\\someone\\AppData`)), ['local-path.windows-user']);
  for (const line of [
    String.raw`C:\Users\example\AppData`, String.raw`C:\Users\<you>\AppData`, String.raw`%USERPROFILE%\Desktop`,
    'C:/Users/demo/Documents', String.raw`C:\Users\me\x`, String.raw`C:\Users\$env:USERNAME`,
  ]) assert.deepEqual(checkContentLine('docs/guides/x.md', line), [], line);
  assert.deepEqual(checkContentLine('src-tauri/crates/core/src/paths/tests.rs', String.raw`"D:\Users\someone\data"`), []);
});

test('dated decisions and internal plan references are caught in code and docs', () => {
  for (const line of [
    '// 撤掉标志（用户 10-21 看过：太丑）',
    '/** 2026-10-29 用户定：发布页只写改动 */',
    '// 2026-10-13 定：附件放最后',
    '// 2026-11-12 修复计划 A3：以前前 35% 就淡完',
    '* 用户拍板：信纸点开就展开',
    '// 用户第三轮录屏：翻页顿一下',
  ]) assert.ok(checkContentLine('src/lib/x.ts', line).length > 0, line);
});

test('ordinary product wording about users stays allowed in code and docs', () => {
  for (const line of [
    '用户 ID 和区域地址只存在 auth.json',
    '已装用户随即收到更新',
    '（用户手动指认仍优先）',
    '删除前要用户确认',
    '由用户定的目标配速',
    'Claude Desktop 的设置里打开开发者模式',
    '日期 2026-10-13 的报文',
    '第二轮重试',
  ]) assert.deepEqual(checkContentLine('docs/guides/x.md', line), [], line);
});

test('privacy-allow and exempt files skip content rules', () => {
  assert.deepEqual(checkContentLine('src/x.ts', String.raw`'C:\Users\someone' // privacy-allow`), []);
  assert.deepEqual(checkContentLine('docs/releases/letters/3.2.0/zh.md', '用户 10-21 看过'), []);
});

test('commit messages that retell the conversation are rejected', () => {
  for (const message of [
    '撤掉「现在」标志（用户 10-21 看过：太丑）',
    '按用户 10-21 第三段录屏修信封',
    '邮票只留海拔那一枚（用户：桥和手表太丑）',
    '信封分正反两面（用户采纳）',
    '批准 3.1.0（用户已自测 3.1.0-beta.3）',
    '发版改回正常流程（10-29 用户定）',
    '第五十九至六十一批译文',
    '翻译 agent 分工调整',
    '更新说明登记到桌面《翻译.md》',
  ]) assert.ok(checkCommitMessage(message).length > 0, message);
});

test('commit messages that describe the change pass', () => {
  for (const message of [
    '入口卡按项数自适应：训练状态只有一行时不再留大片空白',
    '修 macOS CI：测试临时目录改用 unique_suffix()',
    'MCP 预设补 Grok Build 和 Factory；Claude Desktop 配置示例改正',
    '3.2.0：更新说明（13 种语言）、版本号统一\n\n# Please enter the commit message for your changes.\n# 用户：这是 git 的注释行',
  ]) assert.deepEqual(checkCommitMessage(message), [], message);
});

test('added lines are read from a unified diff with their file', () => {
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1,0 +1,2 @@', '+one\r', '+two',
    'diff --git a/old.md b/old.md', '--- a/old.md', '+++ /dev/null', '@@ -1 +0,0 @@', '-gone',
  ].join('\n');
  assert.deepEqual(parseAddedLines(diff), [{ file: 'src/a.ts', text: 'one' }, { file: 'src/a.ts', text: 'two' }]);
});

test('CI range comes from the GitHub event', () => {
  const a = 'a'.repeat(40);
  const b = 'b'.repeat(40);
  assert.equal(rangeFromEvent('push', { ref: 'refs/heads/main', before: a, after: b }), `${a}..${b}`);
  assert.equal(rangeFromEvent('push', { ref: 'refs/heads/new', before: '0'.repeat(40), after: b }), `${b}^!`);
  assert.equal(rangeFromEvent('push', { ref: 'refs/tags/v3.2.0', before: a, after: b }), null);
  assert.equal(rangeFromEvent('pull_request', { pull_request: { base: { sha: a }, head: { sha: b } } }), `${a}..${b}`);
  assert.equal(rangeFromEvent('workflow_dispatch', {}), null);
});

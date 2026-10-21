import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  LETTER_HEADING, NOTE_LOCALES, decide, defaultReleaseTime, letterPath, nextRelease, parseSchedule, removedLines, tagMessage, verifySnapshot,
} from '../scripts/release/schedule-core.mjs';

const sha = (c) => c.repeat(40);
const schedule = (releases, paused = false) => parseSchedule(JSON.stringify({ paused, releases }));
const entry = (version, extra = {}) => ({
  version, commit: sha('a'), notBefore: '2026-10-20T10:00:00+08:00', approved: true, ...extra,
});

test('the schedule refuses ambiguous input instead of guessing', () => {
  assert.throws(() => schedule([entry('3.0.3', { notBefore: '2026-10-20T10:00:00' })]), /时区/);
  assert.throws(() => schedule([entry('3.0.3', { commit: '3d13fd8f' })]), /40 位/);
  assert.throws(() => schedule([entry('3.0.4'), entry('3.0.3')]), /从小到大/);
  assert.throws(() => schedule([entry('3.0.3', { approved: 'yes' })]), /approved/);
  assert.equal(schedule([entry('3.0.3')]).releases[0].notBefore.toISOString(), '2026-10-20T02:00:00.000Z');
});

test('releases go out strictly in order, one at a time', () => {
  const plan = schedule([entry('3.0.3'), entry('3.0.4'), entry('3.0.5')]);
  assert.deepEqual(nextRelease(plan, new Set(['v3.0.2'])).entry.version, '3.0.3');
  assert.equal(nextRelease(plan, new Set(['v3.0.2'])).previousTag, 'v3.0.2');
  assert.equal(nextRelease(plan, new Set(['v3.0.2', 'v3.0.3'])).entry.version, '3.0.4');
  assert.equal(nextRelease(plan, new Set(['v3.0.3', 'v3.0.4', 'v3.0.5'])), null);
  assert.throws(() => nextRelease(plan, new Set(['v3.0.2', 'v3.0.4'])), /顺序乱了/);
  assert.throws(() => nextRelease(schedule([entry('3.0.3')]), new Set(['v3.1.0'])), /不高于/);
});

test('only an approved, due release goes out; urgent skips the clock but not the order', () => {
  const plan = schedule([entry('3.0.3', { approved: false })]);
  const [e] = plan.releases;
  const early = new Date('2026-10-20T01:59:00Z');
  const late = new Date('2026-10-20T02:01:00Z');
  assert.equal(decide({ schedule: plan, entry: e, now: late }).release, false);
  const approved = schedule([entry('3.0.3')]);
  assert.equal(decide({ schedule: approved, entry: approved.releases[0], now: early }).release, false);
  assert.equal(decide({ schedule: approved, entry: approved.releases[0], now: late }).release, true);
  const paused = schedule([entry('3.0.3')], true);
  assert.equal(decide({ schedule: paused, entry: paused.releases[0], now: late }).release, false);
  assert.equal(decide({ schedule: plan, entry: e, now: early, urgentVersion: '3.0.3' }).release, true);
  const skip = decide({ schedule: plan, entry: e, now: late, urgentVersion: '3.0.4' });
  assert.equal(skip.release, false);
  assert.equal(skip.error, true);
});

test('a frozen version defaults to 9 pm Beijing time, the day after the last scheduled one', () => {
  const tonight = new Date('2026-10-19T12:00:00Z'); // 北京 20:00
  assert.equal(defaultReleaseTime(null, tonight), '2026-10-20T21:00:00+08:00');
  assert.equal(defaultReleaseTime(new Date('2026-10-20T13:00:00Z'), tonight), '2026-10-21T21:00:00+08:00');
  assert.equal(defaultReleaseTime(new Date('2026-10-21T13:00:00Z'), tonight), '2026-10-22T21:00:00+08:00');
  // 北京已过零点（UTC 还是前一天）：仍按北京日期算「明天」。
  assert.equal(defaultReleaseTime(null, new Date('2026-10-19T16:30:00Z')), '2026-10-21T21:00:00+08:00');
  // 计划里最后一版早就过期了：不能排到过去。
  assert.equal(defaultReleaseTime(new Date('2026-10-01T13:00:00Z'), tonight), '2026-10-20T21:00:00+08:00');
});

test('the tag body keeps the release-notes format the in-app prompt reads', () => {
  assert.equal(tagMessage('3.0.3', '- Added: **X**.\n'), '# ZeppBridge 3.0.3\n\n- Added: **X**.\n');
  // 有信的版本：信接在更新清单后面，单独一节，标题固定（应用内回落显示时在这里截断）。
  assert.equal(tagMessage('3.1.0', '- Added: **X**.\n', 'Dear reader,\n\nThanks.\n'),
    `# ZeppBridge 3.1.0\n\n- Added: **X**.\n\n${LETTER_HEADING}\n\nDear reader,\n\nThanks.\n`);
  assert.equal(tagMessage('3.1.0', '- Added: **X**.\n', '  '), '# ZeppBridge 3.1.0\n\n- Added: **X**.\n');
  assert.deepEqual(removedLines('--- a/m.rs\n+++ b/m.rs\n@@ -1 +1,2 @@\n+new\n'), []);
  // 有信的版本：信接在更新清单后面，单独一节，标题固定（应用内回落显示时在这里截断）。
  assert.equal(tagMessage('3.1.0', '- Added: **X**.\n', 'Dear reader,\n\nThanks.\n'),
    `# ZeppBridge 3.1.0\n\n- Added: **X**.\n\n${LETTER_HEADING}\n\nDear reader,\n\nThanks.\n`);
  assert.equal(tagMessage('3.1.0', '- Added: **X**.\n', '  '), '# ZeppBridge 3.1.0\n\n- Added: **X**.\n');
  assert.deepEqual(removedLines('--- a/m.rs\n+++ b/m.rs\n@@ -3 +3 @@\n-old\n+new\n'), ['-old']);
});

test('a snapshot must carry its version, all notes, the previous release and append-only migrations', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'zeppbridge-schedule-'));
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (path, text) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), text);
  };
  const release = (version, { notes = NOTE_LOCALES, letters = [], schema = 38, migrations = 'step1\n' } = {}) => {
    write('package.json', JSON.stringify({ version }));
    write('src-tauri/tauri.conf.json', JSON.stringify({ version }));
    write('src/services/updateNotice.ts', `export const BUNDLED_VERSION = '${version}';\nglob('../../docs/releases/${version}/*.md')\n`);
    for (const l of notes) write(`docs/releases/${version}/${l}.md`, `- Added: **${l}**.\n`);
    for (const l of letters) write(letterPath(version, l), `Dear reader (${l}).\n`);
    write('src-tauri/crates/core/src/storage/mod.rs', `pub const CURRENT_SCHEMA_VERSION: i64 = ${schema};\n`);
    write('src-tauri/crates/core/src/storage/migrations.rs', migrations);
    git(['add', '-A']);
    git(['commit', '-q', '-m', version]);
    return git(['rev-parse', 'HEAD']).trim();
  };
  try {
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.email', 'ci@example.invalid']);
    git(['config', 'user.name', 'ci']);
    release('3.0.2');
    git(['tag', 'v3.0.2']);
    const good = release('3.0.3', { schema: 39, migrations: 'step1\nstep2\n' });
    git(['branch', 'freeze/v3.0.3', good]);
    const check = (commit, version = '3.0.3') => verifySnapshot({
      git, entry: { version, commit }, previousTag: 'v3.0.2', mainRef: 'main', freezeRef: `freeze/v${version}`,
    });
    assert.deepEqual(check(good), []);

    const missingNote = release('3.0.4', { notes: NOTE_LOCALES.filter((l) => l !== 'pl'), schema: 39, migrations: 'step1\nstep2\n' });
    assert.ok(check(missingNote, '3.0.4').some((p) => p.includes('3.0.4/pl.md')));
    assert.ok(check(missingNote, '3.0.4').some((p) => p.includes('freeze/v3.0.4')));

    const rewritten = release('3.0.5', { schema: 37, migrations: 'step1-edited\nstep2\n' });
    const problems = verifySnapshot({ git, entry: { version: '3.0.5', commit: rewritten }, previousTag: 'v3.0.2', mainRef: 'main' });
    assert.ok(problems.some((p) => p.includes('migrations.rs')));
    assert.ok(problems.some((p) => p.includes('CURRENT_SCHEMA_VERSION')));

    // 3.0.7 起每版都要有信：缺一种语言也不让冻结；3.0.6 及以前不要求。
    const noLetter = release('3.0.7', { letters: NOTE_LOCALES.filter((l) => l !== 'ru'), schema: 39, migrations: 'step1\nstep2\n' });
    const letterProblems = verifySnapshot({ git, entry: { version: '3.0.7', commit: noLetter }, previousTag: 'v3.0.2', mainRef: 'main' });
    assert.deepEqual(letterProblems, [`缺作者来信 ${letterPath('3.0.7', 'ru')}（每一版都要先写信）`]);
    const withLetter = release('3.0.8', { letters: NOTE_LOCALES, schema: 39, migrations: 'step1\nstep2\n' });
    assert.deepEqual(verifySnapshot({ git, entry: { version: '3.0.8', commit: withLetter }, previousTag: 'v3.0.2', mainRef: 'main' }), []);

    // 快照不在 main 上（比如只在某个分支），或者没继承上一版：都不发。
    git(['checkout', '-q', '--orphan', 'stray']);
    const stray = release('3.0.3');
    const strayProblems = verifySnapshot({ git, entry: { version: '3.0.3', commit: stray }, previousTag: 'v3.0.2', mainRef: 'main' });
    assert.ok(strayProblems.some((p) => p.includes('不在 main 上')));
    assert.ok(strayProblems.some((p) => p.includes('继承')));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { isOrdinaryDocumentation, selectChecks } from '../scripts/ci/select-checks.mjs';

test('only ordinary prose and documentation images qualify for the fast path', () => {
  for (const path of [
    'README.md', 'README.zh-CN.md', 'CHANGELOG.md', 'packaging/README.md',
    'docs/guides/linux.md', 'docs/assets/readme/overview-zh.png',
    'docs/guides/a guide with spaces.md',
  ]) assert.equal(isOrdinaryDocumentation(path), true, path);
  for (const path of [
    'src/App.vue', 'src-tauri/Cargo.toml', 'package-lock.json',
    '.github/workflows/ci.yml', 'scripts/ci/select-checks.mjs', 'tests/ci-routing.test.mjs',
    'docs/reference/cli-and-mcp.md', 'docs/reference/cli-and-mcp.zh-CN.md',
    'docs/capabilities/official-api-matrix.json', 'docs/landing-research/export_report.py',
    'src/prompt.md', 'src/assets/logo.png', 'new-unknown-file',
  ]) assert.equal(isOrdinaryDocumentation(path), false, path);
});

test('tags, manual runs, unknown events and incomplete ranges always run full CI', () => {
  for (const input of [
    { eventName: 'push', ref: 'refs/tags/v3.0.1', event: {} },
    { eventName: 'workflow_dispatch', ref: 'refs/heads/main', event: {} },
    { eventName: 'schedule', event: {} },
    { eventName: 'push', event: { before: '0'.repeat(40), after: 'a'.repeat(40) } },
    { eventName: 'pull_request', event: {} },
  ]) assert.equal(selectChecks(input).full, true);
});

test('real Git ranges handle PRs, multi-commit pushes, deletes, renames and failures', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'zeppbridge-ci-routing-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (path, contents) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), contents);
  };
  const commit = (message) => {
    git('add', '--all');
    git('commit', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const push = (before, after) => selectChecks({ cwd, eventName: 'push', event: { before, after } });
  try {
    git('init', '--initial-branch=main');
    git('config', 'user.name', 'CI routing test');
    git('config', 'user.email', 'ci-routing@example.invalid');
    git('config', 'commit.gpgSign', 'false');
    git('config', 'core.hooksPath', join(cwd, 'no-hooks'));
    write('README.md', 'Original documentation\n');
    write('src/code.js', 'export const value = 1;\n');
    const base = commit('base');

    write('README.md', 'Updated documentation\n');
    const docs = commit('docs');
    assert.equal(push(base, docs).full, false);

    write('src/code.js', 'export const value = 2;\n');
    commit('code');
    write('README.md', 'Final documentation\n');
    const mixed = commit('docs after code');
    assert.equal(push(docs, mixed).full, true, 'the whole push includes the earlier code commit');
    assert.equal(push(base, base).full, true, 'empty diff must not silently skip CI');

    git('checkout', '-b', 'docs-pr', base);
    write('docs/guides/usage.md', 'Usage\n');
    const prHead = commit('guide');
    assert.equal(selectChecks({
      cwd, eventName: 'pull_request',
      event: { pull_request: { base: { sha: mixed }, head: { sha: prHead } } },
    }).full, false, 'base-only changes are excluded from the PR diff');

    git('mv', 'src/code.js', 'docs/guides/moved-code.md');
    const renamed = commit('move code into docs');
    assert.equal(push(prHead, renamed).full, true, 'renaming code into docs still counts as code');
    git('rm', 'README.md');
    const deletedDoc = commit('delete doc');
    assert.equal(push(renamed, deletedDoc).full, false);
    git('checkout', 'main');
    git('rm', 'src/code.js');
    const deletedCode = commit('delete code');
    assert.equal(push(mixed, deletedCode).full, true);
    assert.throws(() => push('f'.repeat(40), deletedCode), 'missing history must fail the required routing check');

    const eventPath = join(cwd, 'event.json');
    const outputPath = join(cwd, 'outputs.txt');
    writeFileSync(eventPath, JSON.stringify({ before: base, after: docs }));
    execFileSync(process.execPath, [resolve('scripts/ci/select-checks.mjs')], {
      cwd,
      env: { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main',
        GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath },
    });
    assert.equal(readFileSync(outputPath, 'utf8'), 'full=false\n');
  } finally {
    // Only remove the temporary repository created by this test.
    assert.equal(dirname(cwd), resolve(tmpdir()));
    assert.ok(cwd.startsWith(join(tmpdir(), 'zeppbridge-ci-routing-')));
    rmSync(cwd, { recursive: true, force: true });
  }
});

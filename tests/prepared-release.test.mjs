import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { prepareAssets } from '../scripts/release/prepare-release.mjs';
import { NOTE_LOCALES, parseChecksums, releaseAssetNames, tagMessage, verifyPreparedRelease } from '../scripts/release/schedule-core.mjs';

const repo = 'lingcang728/ZeppBridge';
const digest = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const fixture = (version = '3.0.4') => {
  const root = mkdtempSync(join(tmpdir(), 'zeppbridge-prepared-'));
  const entry = { version, commit: 'a'.repeat(40), approved: true, notBefore: new Date('2099-10-21T13:00:00Z') };
  const notes = '- Added: **Prepared release**.\n';
  const names = releaseAssetNames(version);
  const folders = { windows: 'windows', msi: 'windows', portable: 'windows', windowsTools: 'windows', dmg: 'macos', mac: 'macos', macTools: 'macos', deb: 'linux', rpm: 'linux', appimage: 'linux', linuxTools: 'linux', flatpak: 'flatpak' };
  for (const folder of new Set(Object.values(folders))) mkdirSync(join(root, folder));
  for (const [key, name] of Object.entries(names)) writeFileSync(join(root, folders[key], name), `package ${name}\n`);
  writeFileSync(join(root, 'macos', `${names.mac}.sig`), 'mac-signature');
  writeFileSync(join(root, 'windows', 'latest.json'), JSON.stringify({ version, notes: 'branch build fallback', platforms: { 'windows-x86_64': { signature: 'windows-signature' }, 'windows-x86_64-portable': { signature: 'portable-signature' } } }));
  const output = join(root, 'assets');
  const files = prepareAssets({ root, output, entry, notes, repo });
  const assets = files.map((name, index) => {
    const bytes = readFileSync(join(output, name));
    return { id: 100 + index, name, state: 'uploaded', size: bytes.length, digest: digest(bytes) };
  });
  const release = { id: 42, tag_name: `v${version}`, target_commitish: entry.commit, body: tagMessage(version, notes), draft: true, prerelease: false, assets };
  const latest = JSON.parse(readFileSync(join(output, 'latest.json'), 'utf8'));
  const checksums = readFileSync(join(output, 'SHA256SUMS.txt'), 'utf8');
  return { root, output, entry, notes, release, latest, checksums, repo };
};

for (const version of ['3.0.4', '3.0.6']) test(`prepares complete signed updater metadata and checksums for frozen ${version} names`, () => {
  const f = fixture(version);
  try {
    assert.deepEqual(verifyPreparedRelease(f), []);
    assert.equal(f.release.assets.length, 14);
    assert.equal(parseChecksums(f.checksums).size, 13);
    assert.equal(f.latest.pub_date, f.entry.notBefore.toISOString());
    assert.equal(f.latest.notes, tagMessage(version, f.notes).trim());
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('rejects a changed snapshot, changed notes, incomplete assets, tampering and wrong updater endpoints', () => {
  const f = fixture();
  const check = (change, pattern) => {
    const copy = structuredClone(f);
    change(copy);
    assert.ok(verifyPreparedRelease(copy).some((problem) => pattern.test(problem)));
  };
  try {
    check((v) => { v.release.target_commitish = 'b'.repeat(40); }, /冻结提交/);
    check((v) => { v.release.body = 'wrong notes'; }, /更新说明/);
    check((v) => { v.release.assets.pop(); }, /附件/);
    check((v) => { v.release.assets[0].digest = `sha256:${'0'.repeat(64)}`; }, /摘要/);
    check((v) => { v.release.assets[0].state = 'starter'; }, /未完整上传/);
    check((v) => { v.latest.platforms['windows-x86_64'].url = 'https://wrong.example/file'; }, /下载地址/);
    check((v) => { delete v.latest.platforms['darwin-aarch64']; }, /平台不齐全/);
    check((v) => { v.latest.platforms['windows-x86_64-portable'].signature = ''; }, /签名/);
    check((v) => { v.latest.pub_date = '2026-10-21T13:00:00Z'; }, /发布时间/);
    check((v) => { v.release.draft = false; }, /必须是.*草稿/);
    assert.throws(() => parseChecksums(`${f.checksums}${f.checksums.split('\n')[0]}\n`), /重复/);
    assert.throws(() => parseChecksums(`${'a'.repeat(64)}  ../installer.exe`), /格式/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

function runScheduler(f, { due = false, dryRun = false, paused = false, remotePaused = false, changedFreeze = false, mainGreen = true, draft = true, legacy = false, build = 'ready', staging = false } = {}) {
  const routes = {};
  const route = (cmd, args, value) => { routes[JSON.stringify([cmd, ...args])] = value; };
  const gh = (path, value, { paginated = false, raw = false } = {}) => route('gh', ['api', `repos/${repo}/${path}`, ...(paginated ? ['--paginate', '--slurp'] : []), ...(raw ? ['-H', 'Accept: application/octet-stream'] : [])], paginated ? [value] : value);
  const plan = { paused, releases: [{ ...f.entry, notBefore: f.entry.notBefore.toISOString() }] };
  const old = { tag_name: 'v3.0.3', draft: false, prerelease: false, published_at: '2026-10-20T14:20:00Z' };
  gh('releases?per_page=100', [old, ...(draft ? [f.release] : [])], { paginated: true });
  gh(`releases/${f.release.id}`, f.release);
  gh(`git/matching-refs/tags/v${f.entry.version}`, legacy ? [{ ref: `refs/tags/v${f.entry.version}`, object: { sha: 'd'.repeat(40), type: 'tag' } }] : []);
  for (const asset of f.release.assets) {
    if (['latest.json', 'SHA256SUMS.txt'].includes(asset.name)) gh(`releases/assets/${asset.id}`, readFileSync(join(f.output, asset.name), 'utf8'), { raw: true });
  }
  const required = ['Windows verification', 'Linux verification', 'macOS verification'];
  const packaging = ['Package Windows installers', 'Package macOS bundle', 'Package Linux bundles', 'Package Flatpak bundle'];
  const runs = [{ id: 1, event: 'push', head_branch: 'main', status: 'completed', conclusion: mainGreen ? 'success' : 'failure' }];
  if (build !== 'missing') runs.unshift({ id: 2, event: 'workflow_dispatch', head_branch: `freeze/v${f.entry.version}`, status: build === 'active' ? 'in_progress' : 'completed', conclusion: build === 'failed' ? 'failure' : build === 'active' ? null : 'success', html_url: 'https://example.test/build' });
  if (legacy) runs.unshift({ id: 4, event: 'workflow_dispatch', head_branch: `v${f.entry.version}`, status: 'in_progress', conclusion: null });
  gh(`actions/workflows/ci.yml/runs?head_sha=${f.entry.commit}&per_page=100`, { workflow_runs: runs }, { paginated: true });
  gh('actions/runs/1/jobs?per_page=100', { jobs: required.map((name) => ({ name, conclusion: 'success' })) }, { paginated: true });
  gh('actions/runs/2/jobs?per_page=100', { jobs: [...required, ...packaging].map((name) => ({ name, conclusion: 'success' })) }, { paginated: true });
  gh('actions/runs/2', { head_sha: f.entry.commit, head_branch: `freeze/v${f.entry.version}`, event: 'workflow_dispatch', status: 'completed', conclusion: 'success', id: 2 });
  gh('actions/runs/2/artifacts?per_page=100', { artifacts: ['zeppbridge-installers', 'zeppbridge-macos', 'zeppbridge-linux', 'zeppbridge-flatpak'].map((name) => ({ name, expired: false, size_in_bytes: 100 })) }, { paginated: true });
  gh('contents/.github/release-schedule.json?ref=main', { content: Buffer.from(JSON.stringify({ ...plan, paused: remotePaused })).toString('base64') });
  gh(`git/ref/heads/freeze/v${f.entry.version}`, { object: { sha: changedFreeze ? 'b'.repeat(40) : f.entry.commit } });
  gh('git/ref/heads/main', { object: { sha: 'c'.repeat(40) } });
  gh(`actions/workflows/ci.yml/runs?head_sha=${'c'.repeat(40)}&per_page=100`, { workflow_runs: [{ id: 3, event: 'push', head_branch: 'main', status: 'completed', conclusion: mainGreen ? 'success' : 'failure' }] }, { paginated: true });
  route('git', ['tag', '-l', `v${f.entry.version}`], legacy ? `v${f.entry.version}\n` : '');
  route('git', ['merge-base', '--is-ancestor', f.entry.commit, 'origin/main'], '');
  route('git', ['rev-parse', `origin/freeze/v${f.entry.version}`], f.entry.commit);
  route('git', ['merge-base', '--is-ancestor', 'v3.0.3', f.entry.commit], '');
  const sources = {
    'package.json': JSON.stringify({ version: f.entry.version }), 'src-tauri/tauri.conf.json': JSON.stringify({ version: f.entry.version }),
    'src/services/updateNotice.ts': `BUNDLED_VERSION = '${f.entry.version}'; docs/releases/${f.entry.version}/*.md`,
    'src-tauri/crates/core/src/storage/mod.rs': 'CURRENT_SCHEMA_VERSION: i64 = 39;',
    ...Object.fromEntries(NOTE_LOCALES.map((locale) => [`docs/releases/${f.entry.version}/${locale}.md`, f.notes])),
  };
  for (const [path, source] of Object.entries(sources)) route('git', ['show', `${f.entry.commit}:${path}`], source);
  route('git', ['show', 'v3.0.3:src-tauri/crates/core/src/storage/mod.rs'], 'CURRENT_SCHEMA_VERSION: i64 = 38;');
  route('git', ['diff', '--unified=0', 'v3.0.3', f.entry.commit, '--', 'src-tauri/crates/core/src/storage/migrations.rs'], '');
  route('gh', ['api', `repos/${repo}/git/tags`, '--method', 'POST', '--input', '-'], { sha: 'd'.repeat(40) });
  route('gh', ['api', `repos/${repo}/git/refs`, '--method', 'POST', '--input', '-'], { ref: `refs/tags/v${f.entry.version}` });
  route('gh', ['api', `repos/${repo}/releases/42`, '--method', 'PATCH', '--input', '-'], { ...f.release, draft: false, published_at: new Date().toISOString(), html_url: 'https://example.test/release' });
  route('gh', ['api', `repos/${repo}/releases`, '--method', 'POST', '--input', '-'], f.release);
  route('gh', ['release', 'upload', `v${f.entry.version}`, '--repo', repo, '--clobber', ...f.release.assets.map((a) => a.name).sort().map((name) => join('.prepared-release/assets', name))], '');
  route('gh', ['workflow', 'run', 'ci.yml', '--repo', repo, '--ref', `freeze/v${f.entry.version}`], '');
  mkdirSync(join(f.root, '.github'), { recursive: true });
  writeFileSync(join(f.root, '.github', 'release-schedule.json'), JSON.stringify(plan));
  const routePath = join(f.root, 'routes.json');
  const callsPath = join(f.root, 'calls.jsonl');
  const outputPath = join(f.root, 'outputs.txt');
  writeFileSync(routePath, JSON.stringify(routes));
  writeFileSync(callsPath, '');
  writeFileSync(outputPath, '');
  if (staging) cpSync(f.output, join(f.root, '.prepared-release/assets'), { recursive: true });
  const result = spawnSync(process.execPath, ['--import', new URL('./helpers/mock-release-tools.mjs', import.meta.url).href, fileURLToPath(new URL('../scripts/release/scheduled-release.mjs', import.meta.url)), ...(staging ? ['stage'] : [])], {
    cwd: f.root, encoding: 'utf8', env: { ...process.env, RELEASE_TEST_ROUTES: routePath, RELEASE_TEST_CALLS: callsPath, GITHUB_OUTPUT: outputPath, GITHUB_STEP_SUMMARY: '', GITHUB_REPOSITORY: repo, URGENT_VERSION: due ? f.entry.version : '', NOW: '', DRY_RUN: dryRun ? 'true' : '', PREPARE_VERSION: f.entry.version, PREPARE_COMMIT: f.entry.commit, PREPARE_RUN_ID: '2' },
  });
  const calls = readFileSync(callsPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return { ...result, calls, writes: calls.filter((c) => c.args.includes('--method') || ['workflow', 'release'].includes(c.args[0])), outputs: readFileSync(outputPath, 'utf8') };
}

test('stages and verifies all uploaded files while leaving the future release private', () => {
  const f = fixture();
  try {
    const staged = runScheduler(f, { staging: true, draft: false });
    assert.equal(staged.status, 0, staged.stdout + staged.stderr);
    assert.equal(staged.writes.length, 2);
    assert.equal(JSON.parse(staged.writes[0].input).draft, true);
    assert.equal(staged.writes[1].args[0], 'release');
    assert.ok(!staged.writes.some((c) => c.args.includes('PATCH') || c.args[1].endsWith('/git/refs')));
    const paused = runScheduler(f, { staging: true, remotePaused: true });
    assert.equal(paused.status, 1, paused.stdout);
    assert.deepEqual(paused.writes, []);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

for (const options of [{}, { paused: true }, { due: true, dryRun: true }]) test(`ready drafts stay private: ${JSON.stringify(options)}`, () => {
  const f = fixture();
  try { const r = runScheduler(f, options); assert.equal(r.status, 0, r.stdout + r.stderr); assert.deepEqual(r.writes, []); }
  finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('publishes a verified draft without dispatching another build', () => {
  const f = fixture();
  // 使用已到期的计划测试普通定时公开，不能依赖 urgent 跳过暂停来测试远端撤销。
  f.entry.notBefore = new Date('2020-10-21T13:00:00Z');
  f.latest.pub_date = f.entry.notBefore.toISOString();
  const json = `${JSON.stringify(f.latest, null, 2)}\n`;
  writeFileSync(join(f.output, 'latest.json'), json);
  f.checksums = f.checksums.replace(/^.*  latest.json$/m, `${digest(json).slice(7)}  latest.json`);
  writeFileSync(join(f.output, 'SHA256SUMS.txt'), f.checksums);
  for (const asset of f.release.assets) { const bytes = readFileSync(join(f.output, asset.name)); asset.digest = digest(bytes); asset.size = bytes.length; }
  try {
    const r = runScheduler(f);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(r.writes.map((c) => c.args[1]), [`repos/${repo}/git/tags`, `repos/${repo}/git/refs`, `repos/${repo}/releases/42`]);
    assert.deepEqual(JSON.parse(r.writes.at(-1).input), { draft: false, make_latest: 'true' });
    for (const options of [{ remotePaused: true }, { changedFreeze: true }, { mainGreen: false }]) {
      const blocked = runScheduler(f, options);
      assert.equal(blocked.status, 1, JSON.stringify(options));
      assert.deepEqual(blocked.writes, []);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('prepares ahead, avoids duplicate builds, and leaves a legacy tag build alone', () => {
  const f = fixture();
  try {
    const ready = runScheduler(f, { draft: false });
    assert.equal(ready.status, 0, ready.stdout);
    assert.match(ready.outputs, /prepare_run=2/);
    assert.deepEqual(ready.writes, []);
    const start = runScheduler(f, { draft: false, build: 'missing' });
    assert.equal(start.status, 0, start.stdout);
    assert.equal(start.writes.length, 1);
    assert.equal(start.writes[0].args[0], 'workflow');
    for (const options of [{ draft: false, build: 'active' }, { draft: false, legacy: true }, { draft: false, build: 'missing', dryRun: true }]) {
      const r = runScheduler(f, options);
      assert.equal(r.status, 0, r.stdout);
      assert.deepEqual(r.writes, []);
    }
    const failed = runScheduler(f, { draft: false, build: 'failed' });
    assert.equal(failed.status, 1);
    assert.deepEqual(failed.writes, []);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

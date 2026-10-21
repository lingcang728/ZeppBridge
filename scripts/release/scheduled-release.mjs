// 提前构建并核验冻结版本，暂存为草稿；到点只公开已核验的 Release。
// DRY_RUN=true 只读；URGENT_VERSION 跳过时间/批准/暂停，但不跳过版本顺序或产物核验。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  decide, letterPath, needsLetter, nextRelease, parseSchedule, releaseAssetNames, tagMessage, verifyPreparedRelease, verifySnapshot,
} from './schedule-core.mjs';

const repo = process.env.GITHUB_REPOSITORY || 'lingcang728/ZeppBridge';
const dryRun = ['true', '1'].includes(process.env.DRY_RUN);
const urgentVersion = (process.env.URGENT_VERSION || '').replace(/^v/, '').trim() || null;
const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
const REQUIRED_JOBS = ['Windows verification', 'Linux verification', 'macOS verification'];
const PACKAGE_JOBS = ['Package Windows installers', 'Package macOS bundle', 'Package Linux bundles', 'Package Flatpak bundle'];
const summary = [];
const say = (line) => { console.log(line); summary.push(line); };
const run = (cmd, args, input) => execFileSync(cmd, args, {
  encoding: 'utf8', input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
});
const git = (args) => run('git', args);
// 只重试只读查询；写操作遇到断线留给下一次运行核对状态后恢复。
const read = (operation) => {
  for (let attempt = 1; ; attempt++) {
    try { return operation(); } catch (error) { if (attempt >= 3) throw error; }
  }
};
const api = (path) => `repos/${repo}/${path}`;
const ghJson = (path) => read(() => JSON.parse(run('gh', ['api', api(path)])));
const pages = (path, key) => read(() => JSON.parse(run('gh', ['api', api(path), '--paginate', '--slurp'])).flatMap((p) => key ? p[key] : p));
const writeApi = (path, body, method = 'POST') => JSON.parse(run('gh', ['api', api(path), '--method', method, '--input', '-'], JSON.stringify(body)));
const releases = () => pages('releases?per_page=100');
const publicTags = (items) => new Set(items.filter((r) => !r.draft && !r.prerelease && r.published_at).map((r) => r.tag_name));
const remoteTagFor = (entry) => ghJson(`git/matching-refs/tags/v${entry.version}`).find((ref) => ref.ref === `refs/tags/v${entry.version}`);
const notesFor = (entry) => git(['show', `${entry.commit}:docs/releases/${entry.version}/en.md`]);
// 3.0.7 起每版都有信（verifySnapshot 把关）；更早的版本没有，读不到就是 null。
const letterFor = (entry) => {
  if (!needsLetter(entry.version)) return null;
  try { return git(['show', `${entry.commit}:${letterPath(entry.version, 'en')}`]); } catch { return null; }
};
const bodyFor = (entry) => tagMessage(entry.version, notesFor(entry), letterFor(entry));
const jobsFor = (id) => pages(`actions/runs/${id}/jobs?per_page=100`, 'jobs');
const jobsPassed = (jobs, names) => names.every((name) => jobs.some((j) => j.name === name && j.conclusion === 'success'));
const runsFor = (sha) => pages(`actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`, 'workflow_runs')
  .filter((r) => ['push', 'workflow_dispatch'].includes(r.event));

function ciProblems(runs) {
  for (const r of runs.filter((r) => r.status === 'completed' && r.conclusion === 'success')) {
    if (jobsPassed(jobsFor(r.id), REQUIRED_JOBS)) return [];
  }
  return ['冻结快照自己的 Windows / Linux / macOS verification 尚未全部通过（跳过不算）'];
}

// 在公开/上传前重新读取远端计划，暂停、撤销批准、换快照和调整时间立即生效。
function guard(entry, { publishing = false } = {}) {
  const file = ghJson('contents/.github/release-schedule.json?ref=main');
  const schedule = parseSchedule(Buffer.from(file.content, 'base64').toString('utf8'));
  const next = nextRelease(schedule, publicTags(releases()));
  if (!next || next.entry.version !== entry.version || next.entry.commit !== entry.commit
      || next.entry.notBefore.getTime() !== entry.notBefore.getTime()) throw new Error('远端发布计划已改变，停止本次操作，等待下一次检查');
  const verdict = decide({ schedule, entry: next.entry, now: new Date(), urgentVersion });
  if (publishing ? !verdict.release : (!urgentVersion && (schedule.paused || !next.entry.approved))) throw new Error(verdict.reason);
  const branch = ghJson(`git/ref/heads/freeze/v${entry.version}`);
  if (branch.object.sha !== entry.commit) throw new Error('远端 freeze 分支已改变，不发布旧产物');
  if (publishing) {
    const main = ghJson('git/ref/heads/main');
    const latest = runsFor(main.object.sha).find((r) => r.event === 'push' && r.head_branch === 'main');
    if (!latest || latest.status !== 'completed' || latest.conclusion !== 'success') throw new Error('main 最新提交的 CI 尚未成功，暂不公开 Release');
  }
}

function readAsset(release, name) {
  const asset = release.assets.find((a) => a.name === name);
  if (!asset) throw new Error(`草稿缺少 ${name}`);
  const text = read(() => run('gh', ['api', api(`releases/assets/${asset.id}`), '-H', 'Accept: application/octet-stream']));
  const digest = `sha256:${createHash('sha256').update(text).digest('hex')}`;
  if (digest !== asset.digest) throw new Error(`${name} 下载内容与服务端摘要不一致`);
  return text;
}

function verifyDraft(entry, draft) {
  const checksums = readAsset(draft, 'SHA256SUMS.txt');
  const latest = JSON.parse(readAsset(draft, 'latest.json'));
  const problems = verifyPreparedRelease({ entry, release: draft, notes: notesFor(entry), letter: letterFor(entry), latest, checksums, repo });
  if (problems.length) throw new Error(problems.join('\n- '));
}

function ensureTag(entry) {
  const tag = `v${entry.version}`;
  const message = bodyFor(entry);
  const ref = remoteTagFor(entry);
  if (ref) {
    if (ref.object.type !== 'tag') throw new Error(`${tag} 已存在但不是附注 tag，不覆盖`);
    const existing = ghJson(`git/tags/${ref.object.sha}`);
    if (existing.object.sha !== entry.commit || existing.message?.trim() !== message.trim()) throw new Error(`${tag} 已存在但提交或附注不一致，不覆盖`);
    return;
  }
  const object = writeApi('git/tags', { tag, message, object: entry.commit, type: 'commit' });
  writeApi('git/refs', { ref: `refs/tags/${tag}`, sha: object.sha });
  say(`已建附注 tag ${tag} → ${entry.commit.slice(0, 8)}`);
}

function publish(entry, draft) {
  verifyDraft(entry, ghJson(`releases/${draft.id}`));
  guard(entry, { publishing: true });
  ensureTag(entry);
  const result = writeApi(`releases/${draft.id}`, { draft: false, make_latest: 'true' }, 'PATCH');
  if (result.draft || !result.published_at) throw new Error('GitHub 未确认 Release 已公开');
  say(`已公开 v${entry.version}：${result.html_url}（使用提前核验的安装包，未重新编译）`);
}

// 兼容升级流程时仍在按旧 tag 工作流构建的 3.0.3，不并行创建第二份 Release。
function waitForLegacyTag(entry) {
  // REST 的 branch 筛选未返回标签上的手动运行；按 SHA 查询后再核对标签名。
  const runs = runsFor(entry.commit).filter((r) => r.head_branch === `v${entry.version}`);
  if (runs.some((r) => r.status !== 'completed')) {
    say(`v${entry.version} 已有 tag，旧发布构建还在运行；等待它完成。`);
    return;
  }
  throw new Error(`v${entry.version} 已有 tag 但没有公开 Release；请检查原发布构建，不另建或重打 tag`);
}

function stage(entry, items) {
  if (dryRun) throw new Error('演练模式不能上传草稿');
  guard(entry);
  const build = ghJson(`actions/runs/${process.env.PREPARE_RUN_ID}`);
  if (build.head_sha !== entry.commit || build.head_branch !== `freeze/v${entry.version}` || build.event !== 'workflow_dispatch'
      || build.status !== 'completed' || build.conclusion !== 'success'
      || !jobsPassed(jobsFor(build.id), [...REQUIRED_JOBS, ...PACKAGE_JOBS])) throw new Error('准备产物的构建记录与快照不一致或没有全部通过');
  const output = '.prepared-release/assets';
  const files = readdirSync(output).sort();
  const expected = [...Object.values(releaseAssetNames(entry.version)), 'latest.json', 'SHA256SUMS.txt'].sort();
  if (JSON.stringify(files) !== JSON.stringify(expected)) throw new Error('待上传的 14 个附件不一致');
  const tag = `v${entry.version}`;
  let draft = items.find((r) => r.tag_name === tag);
  const body = bodyFor(entry);
  if (draft && (!draft.draft || draft.target_commitish !== entry.commit || draft.body?.trim() !== body.trim())) throw new Error('已有 Release 与本次草稿不一致，不覆盖');
  if (!draft) draft = writeApi('releases', { tag_name: tag, target_commitish: entry.commit, name: `ZeppBridge ${entry.version}`, body, draft: true, prerelease: false });
  run('gh', ['release', 'upload', tag, '--repo', repo, '--clobber', ...files.map((name) => join(output, name))]);
  draft = ghJson(`releases/${draft.id}`);
  for (const asset of draft.assets) {
    const local = createHash('sha256').update(readFileSync(join(output, asset.name))).digest('hex');
    if (asset.digest !== `sha256:${local}`) throw new Error(`上传后的摘要与本地不一致：${asset.name}`);
  }
  verifyDraft(entry, draft);
  say(`v${entry.version} 草稿已准备：14 个附件、SHA-256 校验和、自动更新签名条目与地址全部核验通过；计划 ${entry.notBefore.toISOString()} 公开。`);
}

function main() {
  const schedule = parseSchedule(readFileSync('.github/release-schedule.json', 'utf8'));
  const items = releases();
  const next = nextRelease(schedule, publicTags(items));
  if (!next) { say('计划里的版本都已公开发布。'); return; }
  const { entry, previousTag } = next;
  if (process.argv[2] === 'stage') {
    if (entry.version !== process.env.PREPARE_VERSION || entry.commit !== process.env.PREPARE_COMMIT) throw new Error('准备中的版本已经不是下一版');
    stage(entry, items);
    return;
  }
  say(`下一版：v${entry.version}（${entry.commit.slice(0, 8)}，计划公开 ${entry.notBefore.toISOString()}，${entry.approved ? '已批准' : '未批准'}）`);
  const verdict = decide({ schedule, entry, now, urgentVersion });
  if (verdict.error) throw new Error(verdict.reason);
  if (!urgentVersion && (schedule.paused || !entry.approved)) { say(verdict.reason); return; }
  const draft = items.find((r) => r.tag_name === `v${entry.version}` && r.draft);
  if (!draft && remoteTagFor(entry)) { waitForLegacyTag(entry); return; }
  const runs = runsFor(entry.commit);
  const checks = ciProblems(runs);
  if (checks.length && runs.some((r) => r.status !== 'completed')) { say('冻结快照的 CI 正在运行，完成后自动继续准备。'); return; }
  const problems = [...verifySnapshot({ git, entry, previousTag, freezeRef: `origin/freeze/v${entry.version}` }), ...checks];
  if (problems.length) throw new Error(`发布前检查未通过：\n- ${problems.join('\n- ')}`);
  if (draft) {
    if (draft.target_commitish !== entry.commit || draft.body?.trim() !== bodyFor(entry).trim()) throw new Error('草稿来自另一个快照；请先删除旧草稿再重新准备');
    let ready = false;
    try { verifyDraft(entry, draft); ready = true; } catch (error) { say(`草稿尚未核验完整，需要重新准备：${error.message}`); }
    if (ready) {
      say(`v${entry.version} 安装包已提前构建并核验。${verdict.reason}`);
      if (verdict.release && !dryRun) publish(entry, draft);
      else if (dryRun) say('演练模式，不公开 Release。');
      return;
    }
  }
  const builds = runs.filter((r) => r.event === 'workflow_dispatch' && r.head_branch === `freeze/v${entry.version}`);
  for (const build of builds.filter((r) => r.status === 'completed' && r.conclusion === 'success')) {
    if (!jobsPassed(jobsFor(build.id), [...REQUIRED_JOBS, ...PACKAGE_JOBS])) continue;
    const artifacts = pages(`actions/runs/${build.id}/artifacts?per_page=100`, 'artifacts');
    if (!['zeppbridge-installers', 'zeppbridge-macos', 'zeppbridge-linux', 'zeppbridge-flatpak']
      .every((name) => artifacts.some((a) => a.name === name && !a.expired && a.size_in_bytes > 0))) continue;
    say(`复用冻结快照已通过的完整构建 ${build.id}，准备草稿（不重新编译）。`);
    if (!dryRun && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `prepare_run=${build.id}\nversion=${entry.version}\ncommit=${entry.commit}\n`);
    return;
  }
  const active = builds.find((r) => r.status !== 'completed');
  if (active) { say(`v${entry.version} 正在提前构建：${active.html_url}；完成后自动准备草稿。`); return; }
  if (builds.length && builds[0].conclusion !== 'success') throw new Error(`v${entry.version} 的提前构建未通过，请重跑失败的构建：${builds[0].html_url}`);
  if (dryRun) { say('演练：需要在 freeze 分支提前构建；本次不触发。'); return; }
  run('gh', ['workflow', 'run', 'ci.yml', '--repo', repo, '--ref', `freeze/v${entry.version}`]);
  say(`已开始提前构建 v${entry.version}；构建成功后自动核验并暂存草稿，到点才公开。`);
}

try { main(); } catch (error) { say(`发布流程出错：${error.message}`); process.exitCode = 1; }
finally { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`); }

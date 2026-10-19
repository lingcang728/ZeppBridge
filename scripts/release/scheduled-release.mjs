// 定时发布（.github/workflows/scheduled-release.yml 每小时跑一次；说明见 docs/releases/scheduling.md）。
//
// 一次最多发一版：挑出计划里下一个没发的版本 → 到点且批准了 → 逐项核对 →
// 建附注 tag → 触发 CI 在这个 tag 上打包、建 Release。任何一项不过就退出码 1、什么都不发。
//
// 环境变量：GH_TOKEN、GITHUB_REPOSITORY；URGENT_VERSION（手动立即发布）；DRY_RUN=true 只检查不发；
// TAG_TRIGGERS_CI=true 表示用的是个人令牌，建 tag 本身就会触发 CI，不必再手动触发；NOW 覆盖当前时间（演练用）。
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { decide, nextRelease, parseSchedule, tagMessage, verifySnapshot } from './schedule-core.mjs';

const SCHEDULE = '.github/release-schedule.json';
const REQUIRED_JOBS = ['Windows verification', 'Linux verification', 'macOS verification'];

const repo = process.env.GITHUB_REPOSITORY || 'lingcang728/ZeppBridge';
const dryRun = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
const urgentVersion = (process.env.URGENT_VERSION || '').replace(/^v/, '').trim() || null;
const now = process.env.NOW ? new Date(process.env.NOW) : new Date();

const run = (cmd, args, input) => execFileSync(cmd, args, {
  encoding: 'utf8', input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
});
const git = (args) => run('git', args);
// 只读查询偶尔会断（EOF / 5xx），重试两次；写操作（建 tag、触发 CI）不重试，免得重复。
const ghJson = (path) => {
  for (let attempt = 1; ; attempt += 1) {
    try { return JSON.parse(run('gh', ['api', path])); } catch (error) { if (attempt >= 3) throw error; }
  }
};

const summary = [];
const say = (line) => { console.log(line); summary.push(line); };
const finish = (code) => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`);
  process.exit(code);
};

/**
 * 这个提交自己的 CI 三平台检查都是绿的（不是跳过，也不是别的提交的）。
 * push 和在分支上手动触发的都算：快照里的 ci.yml 还不认 freeze/** 时（3.0.3 就是），
 * 推 freeze 分支不会自动跑，要 `gh workflow run ci.yml --ref freeze/v<版本>`。
 */
function ciProblems(sha) {
  const runs = (ghJson(`repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=30`).workflow_runs ?? [])
    .filter((r) => r.event === 'push' || r.event === 'workflow_dispatch');
  const green = runs.filter((r) => r.status === 'completed' && r.conclusion === 'success');
  if (!green.length) {
    const latest = runs[0];
    return [latest
      ? `快照的 CI 还没绿：最近一次 ${latest.status}/${latest.conclusion ?? '—'}（${latest.html_url}）`
      : '快照没有自己的 CI 记录——推 freeze/v<版本> 分支，没自动跑就 gh workflow run ci.yml --ref freeze/v<版本>'];
  }
  for (const r of green) {
    const jobs = ghJson(`repos/${repo}/actions/runs/${r.id}/jobs?per_page=100`).jobs ?? [];
    const ok = REQUIRED_JOBS.every((name) => jobs.some((j) => j.name === name && j.conclusion === 'success'));
    if (ok) return [];
  }
  return [`快照的 CI 绿了，但 ${REQUIRED_JOBS.join(' / ')} 不是全都跑过（被跳过的不算）`];
}

/** 上一版 tag 的 CI 还在跑或者挂了：先不发下一版。 */
function previousReleaseState(tag) {
  try {
    run('gh', ['release', 'view', tag, '--repo', repo, '--json', 'tagName']);
    return { ok: true };
  } catch { /* 没有 Release，看 CI */ }
  const runs = ghJson(`repos/${repo}/actions/workflows/ci.yml/runs?branch=${tag}&per_page=5`).workflow_runs ?? [];
  const latest = runs[0];
  if (latest && latest.status !== 'completed') return { ok: false, wait: true, reason: `上一版 ${tag} 还在打包（${latest.html_url}）` };
  return { ok: false, wait: false, reason: `上一版 ${tag} 有 tag 但没有 Release（${latest ? `CI ${latest.conclusion}：${latest.html_url}` : '没有 CI 记录'}）；修好或删掉 tag 前不发下一版` };
}

function publish(entry) {
  const tag = `v${entry.version}`;
  const notes = git(['show', `${entry.commit}:docs/releases/${entry.version}/en.md`]);
  const tagObject = JSON.parse(run('gh', ['api', `repos/${repo}/git/tags`, '--input', '-'], JSON.stringify({
    tag, message: tagMessage(entry.version, notes), object: entry.commit, type: 'commit',
  })));
  run('gh', ['api', `repos/${repo}/git/refs`, '--input', '-'], JSON.stringify({ ref: `refs/tags/${tag}`, sha: tagObject.sha }));
  say(`已建附注 tag ${tag} → ${entry.commit.slice(0, 8)}`);
  // 默认令牌建的 tag 不会触发 push 事件（GitHub 防递归），但 workflow_dispatch 例外。
  if (process.env.TAG_TRIGGERS_CI !== 'true') {
    run('gh', ['workflow', 'run', 'ci.yml', '--repo', repo, '--ref', tag]);
    say(`已触发 CI 在 ${tag} 上打包并建 Release`);
  }
}

function main() {
  const schedule = parseSchedule(readFileSync(SCHEDULE, 'utf8'));
  const tags = new Set(git(['tag', '-l', 'v*']).split('\n').map((t) => t.trim()).filter(Boolean));
  const next = nextRelease(schedule, tags);
  if (!next) { say('计划里的版本都发完了。'); return 0; }
  const { entry, previousTag } = next;
  say(`下一版：v${entry.version}（${entry.commit.slice(0, 8)}，不早于 ${entry.notBefore.toISOString()}，${entry.approved ? '已批准' : '未批准'}）`);

  const verdict = decide({ schedule, entry, now, urgentVersion });
  if (!verdict.release && !dryRun) { say(verdict.reason); return verdict.error ? 1 : 0; }
  say(verdict.release ? verdict.reason : `（演练）${verdict.reason}，照样跑一遍检查`);

  if (previousTag) {
    const prev = previousReleaseState(previousTag);
    if (!prev.ok) { say(prev.reason); return prev.wait ? 0 : 1; }
  }
  const problems = [
    ...verifySnapshot({ git, entry, previousTag, freezeRef: `origin/freeze/v${entry.version}` }),
    ...ciProblems(entry.commit),
  ];
  if (problems.length) {
    say(`v${entry.version} 没通过发布前检查，这次不发：`);
    for (const p of problems) say(`- ${p}`);
    return 1;
  }
  say('发布前检查全部通过：快照在 main 上、freeze 分支一致、继承上一版、版本号与 12 种更新说明齐全、迁移只追加、快照自己的三平台 CI 全绿。');
  if (dryRun || !verdict.release) { say('演练模式，不建 tag。'); return 0; }
  publish(entry);
  return 0;
}

try {
  finish(main());
} catch (error) {
  say(`定时发布出错，什么都没发：${error.message}`);
  finish(1);
}

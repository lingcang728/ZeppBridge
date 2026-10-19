// 本地管理定时发布计划（说明见 docs/releases/scheduling.md）。只改本地文件和分支，不推送。
//
//   node scripts/release/freeze.mjs add 3.0.4                                   # 把 HEAD 冻结成 3.0.4，排在上一版的后一天晚上 9 点（北京）
//   node scripts/release/freeze.mjs add 3.0.4 --at 2026-10-21T21:00:00+08:00   # 或者指定时间
//     （加 --commit <SHA> 冻结 HEAD 之前的某个提交）
//   node scripts/release/freeze.mjs approve 3.0.3                               # 自测通过，允许到点发布
//   node scripts/release/freeze.mjs move 3.0.3 --at 2026-10-21T10:00:00+08:00  # 改发布时间
//   node scripts/release/freeze.mjs remove 3.0.4                                # 撤掉一版（还没发的）
//   node scripts/release/freeze.mjs pause | resume | list
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { defaultReleaseTime, parseSchedule, verifySnapshot } from './schedule-core.mjs';

const SCHEDULE = '.github/release-schedule.json';
const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const load = () => JSON.parse(readFileSync(SCHEDULE, 'utf8'));
const save = (raw) => {
  raw.releases.sort((a, b) => a.version.localeCompare(b.version, 'en', { numeric: true }));
  parseSchedule(JSON.stringify(raw)); // 写之前按发布脚本的规则再验一遍
  writeFileSync(SCHEDULE, `${JSON.stringify(raw, null, 2)}\n`);
};
const option = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};
const find = (raw, version) => {
  const entry = raw.releases.find((r) => r.version === version);
  if (!entry) throw new Error(`计划里没有 ${version}`);
  return entry;
};
const released = (version) => git(['tag', '-l', `v${version}`]).trim() !== '';

const [command, version] = process.argv.slice(2);
const raw = load();

switch (command) {
  case 'add': {
    if (!version) throw new Error('用法：add <版本> [--at <带时区的时间>] [--commit <SHA>]');
    const others = parseSchedule(JSON.stringify(raw)).releases.filter((r) => r.version !== version);
    const at = option('--at') ?? defaultReleaseTime(others.at(-1)?.notBefore ?? null, new Date());
    const pinned = option('--commit');
    if (!pinned && git(['status', '--porcelain', '--untracked-files=no']).trim()) {
      throw new Error('工作区有没提交的改动；先提交（冻结的是 HEAD），或用 --commit 指定提交');
    }
    const commit = git(['rev-parse', '--verify', `${pinned ?? 'HEAD'}^{commit}`]).trim();
    const tags = git(['tag', '-l', 'v*']).split('\n').filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const previousTag = tags.filter((t) => t.slice(1).localeCompare(version, 'en', { numeric: true }) < 0).at(-1) ?? null;
    const problems = verifySnapshot({ git, entry: { version, commit }, previousTag, mainRef: 'HEAD' });
    if (problems.length) throw new Error(`HEAD 还不能冻结成 ${version}：\n- ${problems.join('\n- ')}`);
    let branchHead = null;
    try { branchHead = git(['rev-parse', '--verify', '--quiet', `freeze/v${version}`]).trim(); } catch { /* 还没有 */ }
    if (branchHead && branchHead !== commit) throw new Error(`本地 freeze/v${version} 已指向 ${branchHead.slice(0, 8)}，不覆盖`);
    if (!branchHead) git(['branch', `freeze/v${version}`, commit]);
    raw.releases = raw.releases.filter((r) => r.version !== version);
    raw.releases.push({ version, commit, notBefore: at, approved: false });
    save(raw);
    console.log(`已冻结 ${version} = ${commit.slice(0, 8)}（freeze/v${version}），定在 ${at}，未批准。`);
    console.log(`下一步：提交 ${SCHEDULE}，然后 git push origin main freeze/v${version}，等快照的 CI 绿。`);
    break;
  }
  case 'approve':
    find(raw, version).approved = true;
    save(raw);
    console.log(`${version} 已批准；提交并推送 ${SCHEDULE} 后生效。`);
    break;
  case 'move': {
    const at = option('--at');
    if (!at) throw new Error('用法：move <版本> --at <带时区的时间>');
    find(raw, version).notBefore = at;
    save(raw);
    console.log(`${version} 改到 ${at}；提交并推送后生效。`);
    break;
  }
  case 'remove':
    if (released(version)) throw new Error(`v${version} 已经发布，不能从计划里撤掉`);
    find(raw, version);
    raw.releases = raw.releases.filter((r) => r.version !== version);
    save(raw);
    console.log(`已撤掉 ${version}；freeze/v${version} 分支留着，不要了自己删。`);
    break;
  case 'pause':
  case 'resume':
    raw.paused = command === 'pause';
    save(raw);
    console.log(`${raw.paused ? '已暂停' : '已恢复'}；提交并推送后生效（要立刻停：gh workflow disable scheduled-release.yml）。`);
    break;
  case 'list':
  case undefined:
    console.log(`paused: ${raw.paused}`);
    for (const r of raw.releases) {
      console.log(`${r.version}  ${r.commit.slice(0, 8)}  ${r.notBefore}  ${r.approved ? '已批准' : '未批准'}  ${released(r.version) ? '已发布' : ''}`);
    }
    break;
  default:
    throw new Error(`不认识的命令：${command}`);
}

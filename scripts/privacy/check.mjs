#!/usr/bin/env node
// 拦住要进公开仓库的私密内容。规则在 rules.mjs。
//
//   node scripts/privacy/check.mjs --staged        pre-commit：暂存区的文件名和新增行
//   node scripts/privacy/check.mjs --msg <文件>     commit-msg：提交说明
//   node scripts/privacy/check.mjs --range a..b    这段提交逐条查（文件名、新增行、提交说明）
//   node scripts/privacy/check.mjs --ci            CI：从 GitHub 事件里取范围，再按 --range 查
//   node scripts/privacy/check.mjs --tree          整棵已跟踪的树（手动排查用）
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkCommitMessage, checkContentLine, checkPath } from './rules.mjs';

const git = (args, cwd) => execFileSync('git', args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024,
});

/** 解析 `git diff -U0` 的输出，返回每个文件的新增行。 */
export function parseAddedLines(diff) {
  const out = [];
  let file = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim();
      file = p === '/dev/null' ? null : p.replace(/^"?b\//, '').replace(/"$/, '');
    } else if (file && line.startsWith('+')) {
      out.push({ file, text: line.slice(1).replace(/\r$/, '') });
    }
  }
  return out;
}

function checkDiff({ names, diff, where }) {
  const problems = [];
  for (const name of names) {
    for (const hit of checkPath(name)) problems.push({ where, file: name, ...hit });
  }
  for (const { file, text } of parseAddedLines(diff)) {
    for (const hit of checkContentLine(file, text)) problems.push({ where, file, ...hit });
  }
  return problems;
}

const DIFF_ARGS = ['-U0', '--no-color', '--no-ext-diff', '--no-renames', '--diff-filter=ACMR'];

export function checkStaged(cwd) {
  const names = git(['diff', '--cached', '--name-only', '-z', '--no-renames', '--diff-filter=ACMR'], cwd).split('\0').filter(Boolean);
  const diff = git(['-c', 'core.quotePath=false', 'diff', '--cached', ...DIFF_ARGS], cwd);
  return checkDiff({ names, diff, where: 'staged' });
}

export function checkMessage(message) {
  return checkCommitMessage(message).map((hit) => ({ where: 'commit message', file: 'line', ...hit }));
}

export function checkRange(range, cwd) {
  const shas = git(['rev-list', '--reverse', range], cwd).split('\n').filter(Boolean);
  const problems = [];
  for (const sha of shas) {
    const where = sha.slice(0, 8);
    const message = git(['log', '-1', '--format=%B', sha], cwd);
    for (const hit of checkCommitMessage(message)) problems.push({ where, file: 'commit message', ...hit });
    const parents = git(['rev-list', '--parents', '-n', '1', sha], cwd).trim().split(' ').length - 1;
    if (parents > 1) continue; // 合并提交的内容已经在被合进来的那些提交里查过
    const names = git(['show', '--format=', '--name-only', '-z', '--no-renames', '--diff-filter=ACMR', sha], cwd).split('\0').filter(Boolean);
    const diff = git(['-c', 'core.quotePath=false', 'show', '--format=', ...DIFF_ARGS, sha], cwd);
    problems.push(...checkDiff({ names, diff, where }));
  }
  return problems;
}

export function checkTree(cwd) {
  const problems = [];
  const files = git(['ls-files', '-z'], cwd).split('\0').filter(Boolean);
  for (const file of files) {
    for (const hit of checkPath(file)) problems.push({ where: 'tree', file, ...hit });
    let text;
    try { text = readFileSync(resolve(cwd, file)); } catch { continue; }
    if (text.includes(0)) continue; // 二进制
    text.toString('utf8').split('\n').forEach((line, i) => {
      for (const hit of checkContentLine(file, line.replace(/\r$/, ''))) problems.push({ where: 'tree', file, line: i + 1, ...hit });
    });
  }
  return problems;
}

/** GitHub 事件 → 要查的范围；没有可比的范围时返回 null（打 tag、手动触发）。 */
export function rangeFromEvent(eventName, event) {
  const ok = (sha) => /^[a-f0-9]{40}$/.test(sha ?? '') && !/^0+$/.test(sha);
  if (eventName === 'pull_request') {
    const base = event.pull_request?.base?.sha;
    const head = event.pull_request?.head?.sha;
    return ok(base) && ok(head) ? `${base}..${head}` : null;
  }
  if (eventName === 'push') {
    if (event.ref?.startsWith('refs/tags/')) return null;
    // 强推（比如清理历史）后 before 已经不在历史里，只查推上来的最新一条。
    if (event.forced && ok(event.after)) return `${event.after}^!`;
    if (ok(event.before) && ok(event.after)) return `${event.before}..${event.after}`;
    if (ok(event.after)) return `${event.after}^!`; // 新分支：只查最新一条
  }
  return null;
}

function report(problems) {
  if (problems.length === 0) return 0;
  console.error(`隐私检查没通过（${problems.length} 处）：公开仓库里不放本机路径、工作笔记，也不转述和维护者的讨论。`);
  for (const p of problems) {
    const at = p.line ? `${p.file}:${p.line}` : p.file;
    console.error(`  [${p.where}] ${at}  ${p.id}  «${p.text}»`);
  }
  console.error('提交说明请只写改了什么、为什么；私密笔记放 ../ZeppBridge-private/。误报的单行代码可在行尾加注释 privacy-allow。');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, arg] = process.argv.slice(2);
  const cwd = process.cwd();
  let problems;
  if (mode === '--staged') problems = checkStaged(cwd);
  else if (mode === '--msg') problems = checkMessage(readFileSync(arg, 'utf8'));
  else if (mode === '--range') problems = checkRange(arg, cwd);
  else if (mode === '--tree') problems = checkTree(cwd);
  else if (mode === '--ci') {
    const range = rangeFromEvent(process.env.GITHUB_EVENT_NAME, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')));
    if (!range) { console.log('没有可比较的提交范围，跳过隐私检查。'); process.exit(0); }
    console.log(`隐私检查范围：${range}`);
    problems = checkRange(range, cwd);
  } else {
    console.error('用法：check.mjs --staged | --msg <文件> | --range <a..b> | --ci | --tree');
    process.exit(2);
  }
  process.exit(report(problems));
}

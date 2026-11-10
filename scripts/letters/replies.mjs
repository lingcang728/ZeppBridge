#!/usr/bin/env node
/**
 * 发版前读回信（批次 6「信匣」）。线上表 letter_replies 在 D1 zeppbridge-feedback 里。
 *
 *   node scripts/letters/replies.mjs export [--out <文件夹>]
 *       把没处理完的回信导成 Markdown + JSON，按关键词粗分类，附「我也遇到」计票。
 *       默认导到 桌面\回信\（仓库外；回信原文绝不进仓库）。
 *   node scripts/letters/replies.mjs mark <id...> [--category <#id>] [--status next|later|asking|fixed|declined] [--fixed-in x.y.z]
 *       给回信定性。用户的信匣回执显示的就是这些：已读、归入「…」、下版先修 / 已在 x.y.z 修好。
 *   node scripts/letters/replies.mjs prune
 *       删掉处理完满 180 天的回信（先 export 留底）。
 *   node scripts/letters/replies.mjs show <id>
 *       把一封回信打到终端（语言、版本、原文、已有的作者回复），写一对一回复前先看它是什么语言。
 *   node scripts/letters/replies.mjs reply <id> --file <回复.md>
 *       作者的一对一回复（用户的应用取回执时一并取回）。文件放仓库外；空文件 = 撤回。
 *       流程见 docs/releases/README.md「读回信」：译成来信的语言、回译给作者过目，点头后才发。
 *
 * 加 --dry-run 只打印 SQL 不执行。需要本机 wrangler 已登录。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { markSql, pruneSql, renderReplies, replySql, selectOneSql, selectOpenSql, tallyAlsoHit } from './replies-core.mjs';

const DATABASE = 'zeppbridge-feedback';
const args = process.argv.slice(2);
const command = args.shift();
const dryRun = args.includes('--dry-run');
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};
const positional = () => {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('--')) { if (args[i] !== '--dry-run') i += 1; continue; }
    values.push(args[i]);
  }
  return values;
};

function d1(sql) {
  if (dryRun) { console.log(sql); return []; }
  /* 直接用 node 跑仓库里的 wrangler，不经 shell：SQL 里的引号和空格不会被 cmd 拆坏。 */
  const wrangler = path.join(import.meta.dirname, '..', '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const output = execFileSync(process.execPath, [wrangler, 'd1', 'execute', DATABASE, '--remote', '--json', '--command', sql], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  });
  const parsed = JSON.parse(output);
  return (Array.isArray(parsed) ? parsed : [parsed]).flatMap((part) => part.results ?? []);
}

if (command === 'export') {
  const rows = d1(selectOpenSql());
  if (dryRun) process.exit(0);
  const out = option('--out') ?? path.join(homedir(), 'Desktop', '回信');
  const repo = path.resolve(import.meta.dirname, '..', '..');
  if (path.resolve(out).toLowerCase().startsWith(repo.toLowerCase())) {
    console.error('回信原文不能导进仓库里，换一个 --out。');
    process.exit(1);
  }
  mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const exportedAt = new Date().toISOString();
  writeFileSync(path.join(out, `${stamp}.json`), `${JSON.stringify(rows, null, 2)}\n`);
  const tally = tallyAlsoHit(rows).map(([id, count]) => `- #${id}：${count}`).join('\n');
  writeFileSync(path.join(out, `${stamp}.md`), renderReplies(rows, exportedAt) + (tally ? `\n## 「我也遇到」计票\n\n${tally}\n` : ''));
  console.log(`${rows.length} 封未处理的回信 → ${path.join(out, `${stamp}.md`)}`);
} else if (command === 'mark') {
  const sql = markSql(positional(), { category: option('--category'), status: option('--status'), fixedIn: option('--fixed-in') });
  d1(sql);
  if (!dryRun) console.log('已更新。');
} else if (command === 'prune') {
  d1(pruneSql());
  if (!dryRun) console.log('已删除处理完满 180 天的回信。');
} else if (command === 'show') {
  const [row] = d1(selectOneSql(positional()[0] ?? ''));
  if (dryRun) process.exit(0);
  if (!row) { console.error('没有这封回信（可能已经被 prune）。'); process.exit(1); }
  console.log(`${row.id}\n${row.received_at} · 语言 ${row.locale} · 信 ${row.letter_version} · 应用 ${row.app_version} · ${row.status || '未定'}${row.category ? ` · #${row.category}` : ''}${row.report_id ? ` · 附诊断报告 ${row.report_id}` : ''}`);
  console.log(`\n${row.body || '（没写字，只点了「我也遇到」）'}`);
  if (row.author_reply) console.log(`\n—— 已回复（${row.author_reply_at}）——\n${row.author_reply}`);
} else if (command === 'reply') {
  const [id] = positional();
  const file = option('--file');
  if (!id || !file) { console.error('用法：replies.mjs reply <id> --file <回复.md> [--dry-run]'); process.exit(2); }
  const text = readFileSync(file, 'utf8');
  d1(replySql(id, text));
  if (!dryRun) console.log(text.trim() ? '已回复。' : '已撤回回复。');
} else {
  console.error('用法：node scripts/letters/replies.mjs export|mark|prune|show|reply（见文件头）');
  process.exit(2);
}

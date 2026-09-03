#!/usr/bin/env node
/**
 * 反馈库的 triage 工具。
 *
 * 为什么是脚本而不是管理台：反馈库里存的是型号编号、运动编号和用户写的一句
 * 话——没有账号、没有 token、没有序列号，但也不是可以随手挂在公网上的东西。
 * 一个带鉴权的管理界面要自己维护登录、审计和最小字段，而这件事每周只做一次。
 * 所以固定成几条命令：读什么、怎么汇总、改哪几行的状态，都写在这里，谁跑都
 * 一样。`GET /api/feedback` 保持 405 不变。
 *
 * 用法：
 *   node scripts/feedback/triage.mjs summary          总量、状态、版本、系统分布
 *   node scripts/feedback/triage.mjs notes            用户手写的那几条（最有信息量）
 *   node scripts/feedback/triage.mjs codes            未知运动编号汇总
 *   node scripts/feedback/triage.mjs rejections       云端业务错误码（HTTP 200 但说不成功）
 *   node scripts/feedback/triage.mjs corrections      用户的运动类型纠正（认错了的编号）
 *   node scripts/feedback/triage.mjs devices          用户指认的型号 -> deviceSource 汇总
 *   node scripts/feedback/triage.mjs list <status>    列出某个状态的报告 id
 *   node scripts/feedback/triage.mjs mark <status> <id...>   改状态
 *
 * 状态取值：new / reviewed / resolved / ignored（见 migrations/0001）。
 *   reviewed —— 看过了，也动手了，但修复还没发到用户手上；
 *   resolved —— 修复已经在正式版里；
 *   ignored  —— 重复提交或不可行动。
 *
 * 只打印聚合结果和用户自己写的那句话，绝不整份 dump 原始 JSON。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const DATABASE = 'zeppbridge-feedback';
const STATUSES = ['new', 'reviewed', 'resolved', 'ignored'];
/** 报告 id 是 UUID。放行别的形状等于把 SQL 拼接的口子留给下一个人。 */
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 直接跑 wrangler 的入口脚本，不经过 npx。
 *
 * Windows 上 `execFileSync('npx.cmd', ...)` 会 EINVAL（`.cmd` 得走 shell），
 * 而一旦借道 shell，SQL 里的引号就得自己转义——那是个不该有的口子。用
 * `node <入口>` 两边都能跑，参数原样传过去。
 */
const wranglerEntry = () => {
  const require = createRequire(import.meta.url);
  let manifest;
  try {
    manifest = require.resolve('wrangler/package.json');
  } catch {
    throw new Error('找不到 wrangler，先跑 npm install');
  }
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8'));
  const entry = typeof bin === 'string' ? bin : bin.wrangler;
  return path.join(path.dirname(manifest), entry);
};

/**
 * 跑一条 SQL，返回 results。
 *
 * wrangler 会把代理告警和 JSON 混着往 stdout 写，先后顺序还不固定，所以不能
 * 靠「找第一个 [」——扫每一个行首的 `[`，第一个解得出来的才算。
 */
const query = (sql) => {
  const stdout = execFileSync(
    process.execPath,
    [wranglerEntry(), 'd1', 'execute', DATABASE, '--remote', '--json', '--command', sql],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      // wrangler 会往 stderr 写代理告警之类的东西。默认继承的话，它会插进
      // 表格中间，让输出没法直接贴进 issue。收下来，出错时再一起报。
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const clean = stdout.replace(/\x1b\[[0-9;]*m/g, '');
  for (const match of clean.matchAll(/^\[/gm)) {
    try {
      const payload = JSON.parse(clean.slice(match.index));
      if (Array.isArray(payload) && payload[0]?.results) return payload[0].results;
    } catch {
      // 这个 [ 不是 JSON 的开头，看下一个。
    }
  }
  throw new Error(`wrangler 的输出里没有 JSON：\n${clean}`);
};

const table = (rows) => {
  if (rows.length === 0) {
    console.log('(没有行)');
    return;
  }
  const columns = Object.keys(rows[0]);
  const width = (column) => Math.max(
    column.length,
    ...rows.map((row) => String(row[column] ?? '').length),
  );
  const widths = Object.fromEntries(columns.map((column) => [column, width(column)]));
  const line = (cells) => columns.map((c) => String(cells[c] ?? '').padEnd(widths[c])).join('  ');
  console.log(line(Object.fromEntries(columns.map((c) => [c, c]))));
  for (const row of rows) console.log(line(row));
};

const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
};

const summary = () => {
  console.log('== 状态 ==');
  table(query('SELECT status, COUNT(*) AS reports FROM feedback_reports GROUP BY status ORDER BY status'));
  console.log('\n== 版本 ==');
  table(query('SELECT app_version, COUNT(*) AS reports FROM feedback_reports GROUP BY app_version ORDER BY app_version'));
  console.log('\n== 系统 ==');
  table(query('SELECT operating_system, COUNT(*) AS reports FROM feedback_reports GROUP BY operating_system ORDER BY operating_system'));
  console.log('\n== 分类 ==');
  table(query("SELECT CASE WHEN category = '' THEN '(自动检测)' ELSE category END AS category, COUNT(*) AS reports FROM feedback_reports GROUP BY category ORDER BY reports DESC"));
  console.log('\n== 时间跨度 ==');
  table(query('SELECT MIN(received_at) AS earliest, MAX(received_at) AS latest, COUNT(*) AS reports FROM feedback_reports'));
};

/**
 * 云端在 HTTP 200 里写的那个「不成功」。
 *
 * 这一栏存在的唯一理由：客户端至今**一个失败码都没观测到过**（本地库里
 * 1075 条带包裹的报文全是 `code = 1`），所以 `classify_business_code` 不敢把任何
 * code 敎定为「需要重新登录」。这里一旦出现非空行，就可以把那个具体的 code
 * 映成 `NeedsReauth`，那些「All my readings are showing empty」的人才会被提示重新连接，
 * 而不是卡在一个既不报错也拉不到数据的假死态里。
 */
const rejections = () => {
  const rows = query(
    'SELECT cloud_rejection_code AS code, cloud_rejection_stream AS stream, '
    + 'COUNT(*) AS reports, MIN(app_version) AS first_version, MAX(app_version) AS last_version '
    + 'FROM feedback_reports WHERE cloud_rejection_code IS NOT NULL '
    + 'GROUP BY cloud_rejection_code, cloud_rejection_stream ORDER BY reports DESC',
  );
  if (rows.length === 0) {
    console.log('还没有任何一份报告带回业务错误码。');
    console.log('在拿到真实的失败码之前，不要猜着把某个数字映成 NeedsReauth。');
    return;
  }
  table(rows);
  console.log('');
  console.log('拿到 code 之后：在 `connectors/zepp.rs` 的 `classify_business_code` 里把它映成');
  console.log('`NeedsReauth`，并把这份证据（报告 id + code）写进那段注释。');
};

const notes = () => {
  // 用户自己写的那句话往往比十个字段都管用（见 migrations/0003）。
  table(query(
    "SELECT id, status, app_version, substr(received_at, 1, 10) AS day, category, user_note "
    + "FROM feedback_reports WHERE user_note <> '' ORDER BY received_at",
  ));
};

const codes = () => {
  const rows = query('SELECT app_version, unknown_workout_codes_json FROM feedback_reports');
  const stats = new Map();
  for (const row of rows) {
    for (const entry of parseJson(row.unknown_workout_codes_json, [])) {
      if (typeof entry?.code !== 'number') continue;
      const stat = stats.get(entry.code) ?? { code: entry.code, reports: 0, records: 0, versions: new Set() };
      stat.reports += 1;
      stat.records += Number(entry.records) || 0;
      stat.versions.add(row.app_version);
      stats.set(entry.code, stat);
    }
  }
  table([...stats.values()]
    .sort((a, b) => b.records - a.records || a.code - b.code)
    .map((stat) => ({
      code: stat.code,
      reports: stat.reports,
      records: stat.records,
      versions: [...stat.versions].sort().join(','),
    })));
  console.log('\n只有拿到文字证据的编号才写进 src/assets/workouts/catalog.json。数量再多也只说明有人在用，不说明它是什么运动。');
};

/**
 * 用户的运动类型纠正汇总：**编号 → 我们的解释 → 用户的解释**。
 *
 * 和 `codes` 是两件事。`codes` 列的是「我们不认识的编号」；这里列的是
 * 「我们认识、但认错了的编号」——issue #24 就是后者，所以它在 `codes` 里
 * 一行都不会出现。
 *
 * 同一个编号被不同人纠正成不同运动是正常的（自定义训练模板），所以按
 * 三元组分行，让分歧留在表里而不是被聚合掉。
 */
const corrections = () => {
  const rows = query(
    "SELECT app_version, workout_type_corrections_json FROM feedback_reports"
    + " WHERE workout_type_corrections_json <> '[]'",
  );
  const stats = new Map();
  for (const row of rows) {
    for (const entry of parseJson(row.workout_type_corrections_json, [])) {
      if (typeof entry?.code !== 'number') continue;
      if (typeof entry?.interpreted !== 'string' || typeof entry?.corrected !== 'string') continue;
      const key = `${entry.code}|${entry.interpreted}|${entry.corrected}`;
      const stat = stats.get(key) ?? {
        code: entry.code,
        interpreted: entry.interpreted,
        corrected: entry.corrected,
        reports: 0,
        records: 0,
        versions: new Set(),
      };
      stat.reports += 1;
      stat.records += Number(entry.records) || 0;
      stat.versions.add(row.app_version);
      stats.set(key, stat);
    }
  }
  if (stats.size === 0) {
    console.log('还没有任何运动类型纠正被上报。');
    console.log('这个字段是 2.0.0 才加的，老版本的报告里没有它——需要等用户升级后再纠正一次。');
    return;
  }
  // 同一个编号被指认成几种不同运动，是「这个编号有歧义」的信号，要标出来。
  const kindsPerCode = new Map();
  for (const stat of stats.values()) {
    const set = kindsPerCode.get(stat.code) ?? new Set();
    set.add(stat.corrected);
    kindsPerCode.set(stat.code, set);
  }
  table([...stats.values()]
    .sort((a, b) => b.reports - a.reports || b.records - a.records || a.code - b.code)
    .map((stat) => ({
      code: stat.code,
      '我们认成': stat.interpreted,
      '用户说是': stat.corrected,
      reports: stat.reports,
      records: stat.records,
      versions: [...stat.versions].sort().join(','),
      eligible: kindsPerCode.get(stat.code).size > 1
        ? 'no (同一编号多个说法)'
        : (stat.reports >= 2 ? 'review' : 'no (只有一份报告)'),
    })));
  console.log('\neligible=review 的需要人看，不是自动通过。');
  console.log('改运动目录的规则没变：至少两份互相独立的报告，且没有分歧；改完必须推 NORMALIZER_REVISION。');
};

const devices = () => {
  const rows = query("SELECT id, user_assigned_models_json FROM feedback_reports WHERE user_assigned_models_json <> '[]'");
  // hint -> catalogId -> 报告数
  const byHint = new Map();
  for (const row of rows) {
    for (const entry of parseJson(row.user_assigned_models_json, [])) {
      const catalogId = entry?.catalogId;
      if (!catalogId) continue;
      for (const hint of entry.modelIdentifierHints ?? []) {
        const names = byHint.get(hint) ?? new Map();
        names.set(catalogId, (names.get(catalogId) ?? 0) + 1);
        byHint.set(hint, names);
      }
    }
  }

  const rowsOut = [];
  for (const [hint, names] of byHint) {
    const sorted = [...names.entries()].sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((sum, [, count]) => sum + count, 0);
    const [topName, topCount] = sorted[0];
    rowsOut.push({
      hint,
      reports: total,
      distinct_models: sorted.length,
      top: `${topName} (${topCount})`,
      eligible: eligibility(hint, sorted),
    });
  }
  table(rowsOut.sort((a, b) => b.reports - a.reports));
  console.log('\n收录规则见 DEVICE_SOURCE_CODES（scripts/assets/build-device-catalog.py）：');
  console.log('  只收 deviceSource，绝不收 deviceType；只收 >= 1000000；每个编号至少两份独立报告；');
  console.log('  冲突项人工裁决，裁不下来的不写。eligible=review 的需要人看，不是自动通过。');
};

/** 一个编号够不够格进目录。只回答「能不能自动排除」，剩下的一律交给人。 */
const eligibility = (hint, sorted) => {
  const match = /^deviceSource:(\d+)$/.exec(hint);
  if (!match) return 'no (不是 deviceSource)';
  if (Number(match[1]) < 1_000_000) return 'no (低位段自相矛盾)';
  const total = sorted.reduce((sum, [, count]) => sum + count, 0);
  if (total < 2) return 'no (只有一份报告)';
  if (sorted.length === 1) return 'yes';
  return 'review (多个型号)';
};

const list = (status) => {
  if (!STATUSES.includes(status)) throw new Error(`状态只能是 ${STATUSES.join(' / ')}`);
  table(query(
    `SELECT id, app_version, substr(received_at, 1, 10) AS day, category, unknown_device_count `
    + `FROM feedback_reports WHERE status = '${status}' ORDER BY received_at`,
  ));
};

const mark = (status, ids) => {
  if (!STATUSES.includes(status)) throw new Error(`状态只能是 ${STATUSES.join(' / ')}`);
  if (ids.length === 0) throw new Error('至少给一个报告 id');
  const bad = ids.filter((id) => !ID_PATTERN.test(id));
  if (bad.length > 0) throw new Error(`不是合法的报告 id：${bad.join(', ')}`);
  const values = ids.map((id) => `'${id}'`).join(', ');
  query(`UPDATE feedback_reports SET status = '${status}' WHERE id IN (${values})`);
  table(query(`SELECT id, status FROM feedback_reports WHERE id IN (${values})`));
};

const [command, ...rest] = process.argv.slice(2);
try {
  switch (command) {
    case 'summary': summary(); break;
    case 'notes': notes(); break;
    case 'codes': codes(); break;
    case 'rejections': rejections(); break;
    case 'corrections': corrections(); break;
    case 'devices': devices(); break;
    case 'list': list(rest[0]); break;
    case 'mark': mark(rest[0], rest.slice(1)); break;
    default:
      console.error('用法：node scripts/feedback/triage.mjs <summary|notes|codes|rejections|corrections|devices|list|mark> [...]');
      process.exit(2);
  }
} catch (error) {
  console.error(String(error?.message ?? error));
  process.exit(1);
}

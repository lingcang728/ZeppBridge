/**
 * 作者处理回信用的纯函数（scripts/letters/replies.mjs 调它；tests/letters-replies.test.mjs 守着）。
 *
 * 线上表：migrations/0008_letter_replies.sql。回信原文只导到本机仓库外的文件夹，不进仓库。
 */

export const STATUSES = ['next', 'later', 'asking', 'fixed', 'declined'];
/** 处理完（fixed / declined）满这么多天的回信从线上删掉。 */
export const RETENTION_DAYS = 180;
const ECHO_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const REPLY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * 粗分类：只是给作者读信时的初筛建议（写在导出里），不自动写回线上。真正归类用 `mark --category <上期回音的 #id>`。
 * 关键词中英混排，其余语言的信多半也会夹英文术语；分不出来就是 other。
 */
const KINDS = [
  ['sync', /补拉|同步|拉不|卡住|没数据|缺数据|backfill|sync|missing data|stuck/i],
  ['login', /登录|登陆|授权|账号|token|login|sign.?in|auth/i],
  ['platform', /linux|appimage|flatpak|macos|mac\b|windows|闪退|崩溃|crash|启动不/i],
  ['accuracy', /不准|错误的|偏高|偏低|对不上|时区|wrong|inaccurate|timezone|mismatch/i],
  ['ui', /界面|卡顿|动画|字体|颜色|太小|看不清|ui\b|lag|animation|font|layout/i],
  ['request', /希望|能不能|可以加|想要|建议|支持一下|please add|feature|would love|wish|request/i],
  ['thanks', /谢谢|感谢|好用|喜欢|thank|love it|great app|awesome/i],
];

export function classify(body) {
  const text = String(body ?? '');
  for (const [kind, pattern] of KINDS) if (pattern.test(text)) return kind;
  return 'other';
}

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;

/** 还没处理完的回信（导出读信用），从旧到新。 */
export function selectOpenSql() {
  return `SELECT id, received_at, app_version, letter_version, locale, body, allow_quote, also_hit_json, read_at, category, status, fixed_in
FROM letter_replies WHERE handled_at IS NULL ORDER BY received_at ASC`;
}

/**
 * 作者给一批回信定性：读过、归到哪一类、什么状态、哪一版修。fixed / declined 算处理完，记 handled_at。
 * 参数先校验，校验不过直接抛错，不拼出一句坏 SQL。
 */
export function markSql(ids, { category = null, status = null, fixedIn = null, now = new Date().toISOString() } = {}) {
  if (!ids.length) throw new Error('至少给一个回信 id');
  for (const id of ids) if (!REPLY_ID.test(id)) throw new Error(`不是回信 id：${id}`);
  if (category !== null && !ECHO_ID.test(category)) throw new Error(`category 要用上期回音里的 #id（小写字母、数字、连字符）：${category}`);
  if (status !== null && !STATUSES.includes(status)) throw new Error(`status 只能是 ${STATUSES.join(' / ')}：${status}`);
  if (fixedIn !== null && !VERSION.test(fixedIn)) throw new Error(`fixed-in 要是 x.y.z：${fixedIn}`);
  if (status === 'fixed' && fixedIn === null) throw new Error('status=fixed 要同时给 --fixed-in');
  const sets = [`read_at = COALESCE(read_at, ${q(now)})`];
  if (category !== null) sets.push(`category = ${q(category)}`);
  if (status !== null) sets.push(`status = ${q(status)}`);
  if (fixedIn !== null) sets.push(`fixed_in = ${q(fixedIn)}`);
  if (status === 'fixed' || status === 'declined') sets.push(`handled_at = ${q(now)}`);
  else if (status !== null) sets.push('handled_at = NULL');
  return `UPDATE letter_replies SET ${sets.join(', ')} WHERE id IN (${ids.map(q).join(', ')})`;
}

/** 处理完满 180 天的回信从线上删除（删之前先 export，本地留底）。 */
export function pruneSql(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString();
  return `DELETE FROM letter_replies WHERE handled_at IS NOT NULL AND handled_at < ${q(cutoff)}`;
}

/** 导出给作者读的 Markdown：按粗分类分组，每封带 id 方便 mark。 */
export function renderReplies(rows, exportedAt = new Date().toISOString()) {
  const groups = new Map();
  for (const row of rows) {
    const kind = classify(row.body);
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind).push(row);
  }
  const lines = [`# 回信 · 导出于 ${exportedAt}`, '', `共 ${rows.length} 封未处理。分类只是关键词初筛，归类以 \`mark --category <#id>\` 为准。`, ''];
  for (const [kind] of KINDS.concat([['other']])) {
    const list = groups.get(kind);
    if (!list?.length) continue;
    lines.push(`## ${kind}（${list.length}）`, '');
    for (const row of list) {
      let alsoHit = [];
      try { alsoHit = JSON.parse(row.also_hit_json || '[]'); } catch { /* 坏数据就当没有 */ }
      const tags = [row.letter_version, row.locale, row.allow_quote ? '可引用' : '不可引用', row.status || '未定', row.category ? `#${row.category}` : '']
        .filter(Boolean).join(' · ');
      lines.push(`### ${row.id}`, '', `${row.received_at} · ${tags}${alsoHit.length ? ` · 我也遇到：${alsoHit.map((id) => `#${id}`).join(' ')}` : ''}`, '');
      lines.push(row.body ? row.body.split(/\r?\n/).map((line) => `> ${line}`).join('\n') : '> （没写字，只点了「我也遇到」）', '');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** 「我也遇到」按 #id 计票：写下一封信的回音时用。 */
export function tallyAlsoHit(rows) {
  const counts = new Map();
  for (const row of rows) {
    let ids = [];
    try { ids = JSON.parse(row.also_hit_json || '[]'); } catch { /* 坏数据就当没有 */ }
    for (const id of new Set(ids)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

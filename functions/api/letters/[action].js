/**
 * 作者来信的回信与回执（批次 6「信匣」）。和 /api/feedback 同一个 D1，同样的脱敏、去重和限流思路，
 * 但单独一张表（migrations/0008_letter_replies.sql）——回信是人写给人的话，不是诊断证据。
 *
 *   POST /api/letters/reply     寄一封回信（可以只按「我也遇到」，不写字）
 *   POST /api/letters/receipts  按本机随机 install id 取回自己回信的状态（已读 / 归类 / 哪版修）
 *
 * install id 是应用第一次寄信时本机生成的随机 UUID，**不绑账号**。库里只存它的加盐哈希，
 * 回执也只返回状态，不返回回信原文——拿到别人的 install id 也读不到他写了什么。
 */
const MAX_BODY_BYTES = 16 * 1024;
/** 和客户端 LETTER_REPLY_MAX_CHARS 一致。 */
export const REPLY_MAX_CHARS = 1000;
const MAX_ALSO_HIT = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 12;
const RECEIPTS_LIMIT = 100;

const LOCALES = ['zh', 'en', 'es', 'nl', 'pt-BR', 'pt-PT', 'de', 'ru', 'hi-IN', 'fr', 'it', 'pl'];
const INSTALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const ECHO_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;

const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  },
});

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOnlyKeys = (value, keys) => isObject(value) && Object.keys(value).every((key) => keys.includes(key));
const chars = (text) => Array.from(text).length;

export const validateReply = (reply) => hasOnlyKeys(reply, ['format', 'installId', 'appVersion', 'letterVersion', 'locale', 'text', 'allowQuote', 'alsoHit'])
  && reply.format === 'zeppbridge.letter-reply.v1'
  && typeof reply.installId === 'string' && INSTALL_ID.test(reply.installId)
  && typeof reply.appVersion === 'string' && reply.appVersion.length <= 32 && /^[0-9A-Za-z.+-]+$/.test(reply.appVersion)
  && typeof reply.letterVersion === 'string' && VERSION.test(reply.letterVersion)
  && LOCALES.includes(reply.locale)
  && typeof reply.text === 'string' && chars(reply.text) <= REPLY_MAX_CHARS
  && typeof reply.allowQuote === 'boolean'
  && Array.isArray(reply.alsoHit) && reply.alsoHit.length <= MAX_ALSO_HIT
  && reply.alsoHit.every((id) => typeof id === 'string' && ECHO_ID.test(id))
  && new Set(reply.alsoHit).size === reply.alsoHit.length
  // 一个字没写、也没按「我也遇到」：没什么可寄的。
  && (reply.text.trim().length > 0 || reply.alsoHit.length > 0);

export const validateReceiptsRequest = (body) => hasOnlyKeys(body, ['format', 'installId'])
  && body.format === 'zeppbridge.letter-receipts.v1'
  && typeof body.installId === 'string' && INSTALL_ID.test(body.installId);

const sha256Hex = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
export const installHash = (installId) => sha256Hex(`zeppbridge-letters:install:${installId}`);

/** 同一台机器、同一封信、同样的话再寄一次（断线重发、连点两下）只算一封。 */
export const replyHashInput = (hash, reply) => JSON.stringify([hash, reply.letterVersion, reply.text.trim(), [...reply.alsoHit].sort()]);

/** 来源键：和反馈入口一样只存当天加盐的哈希，不存 IP；盐不同，两边的计数互不相干。 */
const sourceKey = async (request) => {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown-source';
  return sha256Hex(`zeppbridge-letters:${new Date().toISOString().slice(0, 10)}:${ip}`);
};

/** 固定窗口限流；计数表自己出错时放行（宁可多收一封，不丢真实用户的信）。 */
const overRateLimit = async (db, hash, now) => {
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS).toISOString();
  try {
    const row = await db.prepare('SELECT window_started_at, count FROM feedback_intake_counters WHERE source_hash = ?').bind(hash).first();
    if (!row || row.window_started_at < windowStart) {
      await db.prepare(`
        INSERT INTO feedback_intake_counters (source_hash, window_started_at, count) VALUES (?, ?, 1)
        ON CONFLICT(source_hash) DO UPDATE SET window_started_at = excluded.window_started_at, count = 1
      `).bind(hash, now.toISOString()).run();
      return false;
    }
    if (row.count >= RATE_LIMIT_MAX) return true;
    await db.prepare('UPDATE feedback_intake_counters SET count = count + 1 WHERE source_hash = ?').bind(hash).run();
    return false;
  } catch {
    return false;
  }
};

const readJson = async (request) => {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) return { error: response({ ok: false, error: 'unsupported_media_type' }, 415) };
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return { error: response({ ok: false, error: 'payload_too_large' }, 413) };
  let raw;
  try { raw = await request.text(); } catch { return { error: response({ ok: false, error: 'invalid_request' }, 400) }; }
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return { error: response({ ok: false, error: 'payload_too_large' }, 413) };
  try { return { body: JSON.parse(raw) }; } catch { return { error: response({ ok: false, error: 'invalid_json' }, 400) }; }
};

async function reply(context, body) {
  if (!validateReply(body)) return response({ ok: false, error: 'invalid_reply' }, 422);
  const db = context.env.FEEDBACK_DB;
  const now = new Date();
  const hash = await installHash(body.installId);
  const contentHash = await sha256Hex(replyHashInput(hash, body));
  try {
    const existing = await db.prepare('SELECT id, received_at FROM letter_replies WHERE content_hash = ?').bind(contentHash).first();
    if (existing) return response({ replyId: existing.id, receivedAt: existing.received_at, duplicate: true });
  } catch { /* 查不了就当没有重复 */ }
  if (await overRateLimit(db, await sourceKey(context.request), now)) return response({ ok: false, error: 'rate_limited' }, 429);
  const replyId = crypto.randomUUID();
  const receivedAt = now.toISOString();
  try {
    await db.prepare(`
      INSERT INTO letter_replies (
        id, received_at, install_hash, app_version, letter_version, locale,
        body, allow_quote, also_hit_json, content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      replyId, receivedAt, hash, body.appVersion, body.letterVersion, body.locale,
      body.text.trim(), body.allowQuote ? 1 : 0, JSON.stringify(body.alsoHit), contentHash,
    ).run();
  } catch {
    return response({ ok: false, error: 'storage_unavailable' }, 503);
  }
  return response({ replyId, receivedAt }, 201);
}

async function receipts(context, body) {
  if (!validateReceiptsRequest(body)) return response({ ok: false, error: 'invalid_request' }, 422);
  const hash = await installHash(body.installId);
  try {
    const { results } = await context.env.FEEDBACK_DB.prepare(`
      SELECT id, letter_version, received_at, read_at, category, status, fixed_in
      FROM letter_replies WHERE install_hash = ? ORDER BY received_at DESC LIMIT ?
    `).bind(hash, RECEIPTS_LIMIT).all();
    return response({
      receipts: (results ?? []).map((row) => ({
        replyId: row.id,
        letterVersion: row.letter_version,
        receivedAt: row.received_at,
        readAt: row.read_at || null,
        category: row.category || null,
        status: row.status || null,
        fixedIn: row.fixed_in || null,
      })),
    });
  } catch {
    return response({ ok: false, error: 'storage_unavailable' }, 503);
  }
}

export async function onRequestPost(context) {
  const action = context.params?.action;
  if (action !== 'reply' && action !== 'receipts') return response({ ok: false, error: 'not_found' }, 404);
  const { body, error } = await readJson(context.request);
  if (error) return error;
  return action === 'reply' ? reply(context, body) : receipts(context, body);
}

export function onRequest() {
  return response({ ok: false, error: 'method_not_allowed' }, 405);
}

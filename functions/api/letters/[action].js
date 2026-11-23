/**
 * 作者来信的回信与回执（批次 6「信匣」）。和 /api/feedback 同一个 D1，同样的脱敏、去重和限流思路，
 * 但单独一张表（migrations/0008_letter_replies.sql）——回信是人写给人的话，不是诊断证据。
 *
 *   POST /api/letters/reply     寄一封回信（可以只按「我也遇到」，不写字）
 *                               写给作者的信可以附一份脱敏诊断报告的编号 `reportId`（/api/feedback 返回的那个，
 *                               migrations/0010_letter_report_id.sql）；作者读信时据此找到那份报告
 *   POST /api/letters/attachment?reply=<编号>  给自己刚寄出的回信补一张截图（存私有 R2，见下面 attachment()）
 *   POST /api/letters/receipts  按本机随机 install id 取回自己回信的状态（已读 / 归类 / 哪版修），
 *                               以及作者对这封信的一对一回复（migrations/0009_letter_author_reply.sql）
 *
 * install id 是应用第一次寄信时本机生成的随机 UUID，**不绑账号**。库里只存它的加盐哈希。
 * 回执不返回用户写的原文；作者的回复会返回——拿到别人的 install id 读不到他写了什么，
 * 但能读到作者回他的话，所以作者回复里不写对方的个人信息。
 */
/** 5000 个字最坏按 4 字节一个、再加 JSON 转义和其他字段，48 KB 够用。 */
const MAX_BODY_BYTES = 48 * 1024;
/** 和客户端 LETTER_REPLY_MAX_CHARS 一致。 */
export const REPLY_MAX_CHARS = 5000;
const MAX_ALSO_HIT = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 12;
const RECEIPTS_LIMIT = 100;

const LOCALES = ['zh', 'en', 'es', 'nl', 'pt-BR', 'pt-PT', 'de', 'ru', 'hi-IN', 'fr', 'it', 'pl', 'ko', 'zh-TW'];
const INSTALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const ECHO_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
/** 诊断报告编号：/api/feedback 用 crypto.randomUUID() 生成。 */
const REPORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

export const validateReply = (reply) => hasOnlyKeys(reply, ['format', 'installId', 'appVersion', 'letterVersion', 'locale', 'text', 'allowQuote', 'alsoHit', 'reportId'])
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
  // 可选：附上的诊断报告编号。没附就不带这个键。
  && (!('reportId' in reply) || (typeof reply.reportId === 'string' && REPORT_ID.test(reply.reportId)))
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
        body, allow_quote, also_hit_json, content_hash, report_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      replyId, receivedAt, hash, body.appVersion, body.letterVersion, body.locale,
      body.text.trim(), body.allowQuote ? 1 : 0, JSON.stringify(body.alsoHit), contentHash, body.reportId ?? null,
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
      SELECT id, letter_version, received_at, read_at, category, status, fixed_in, author_reply, author_reply_at
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
        authorReply: row.author_reply || null,
        authorReplyAt: row.author_reply ? row.author_reply_at || null : null,
      })),
    });
  } catch {
    return response({ ok: false, error: 'storage_unavailable' }, 503);
  }
}

/*
 * POST /api/letters/attachment?reply=<回信编号>   给刚寄出的回信补一张截图（migrations/0011_letter_attachments.sql）
 *   头：content-type = image/jpeg | image/png，x-zeppbridge-install-id = 寄这封信的那个 install id
 *   体：图片原始字节。客户端已经重新编码过（去掉 EXIF / 定位），这里只认文件头、限大小。
 * 只给寄出 7 天内的回信补图。图存在私有 R2 桶里，只有作者能取；30 天后连同记录一起删。
 * 总量闸：桶里留存的图合计到 2 GB、或当天全站收满 300 张就先不收（507，客户端退避重试），
 * 留在 R2 免费额度（10 GB 存储、每月 100 万次写入）以内。桶上另有 31 天过期的生命周期规则兜底。
 */
export const ATTACHMENT_MAX_BYTES = 1024 * 1024;
export const ATTACHMENTS_PER_REPLY = 3;
const ATTACHMENT_REPLY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ATTACHMENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const ATTACHMENT_BUDGET_BYTES = 2 * 1024 * 1024 * 1024;
export const ATTACHMENTS_PER_DAY = 300;
const REPLY_ID = REPORT_ID;
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png' };

/** 看文件头认图片，不信 content-type 一面之词。 */
export const sniffImage = (bytes) => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((value, index) => bytes[index] === value)) return 'image/png';
  return null;
};

const sha256Bytes = async (bytes) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

/** 顺手删掉过了保留期的附图（每次最多 20 张）。删不掉不影响这次上传。 */
const pruneAttachments = async (db, bucket, now) => {
  try {
    const before = new Date(now.getTime() - ATTACHMENT_RETENTION_MS).toISOString();
    const { results } = await db.prepare('SELECT id, object_key FROM letter_attachments WHERE received_at < ? LIMIT 20').bind(before).all();
    for (const row of results ?? []) {
      await bucket.delete(row.object_key);
      await db.prepare('DELETE FROM letter_attachments WHERE id = ?').bind(row.id).run();
    }
  } catch { /* 下次再删 */ }
};

async function attachment(context) {
  const { request, env } = context;
  const bucket = env.LETTER_ATTACHMENTS;
  const db = env.FEEDBACK_DB;
  if (!bucket) return response({ ok: false, error: 'attachments_unavailable' }, 503);
  const replyId = new URL(request.url).searchParams.get('reply') || '';
  const installId = request.headers.get('x-zeppbridge-install-id') || '';
  const declared = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!REPLY_ID.test(replyId) || !INSTALL_ID.test(installId)) return response({ ok: false, error: 'invalid_request' }, 422);
  if (!IMAGE_TYPES[declared]) return response({ ok: false, error: 'unsupported_media_type' }, 415);
  if (Number(request.headers.get('content-length') || 0) > ATTACHMENT_MAX_BYTES) return response({ ok: false, error: 'payload_too_large' }, 413);
  let bytes;
  try { bytes = new Uint8Array(await request.arrayBuffer()); } catch { return response({ ok: false, error: 'invalid_request' }, 400); }
  if (bytes.length === 0) return response({ ok: false, error: 'invalid_request' }, 422);
  if (bytes.length > ATTACHMENT_MAX_BYTES) return response({ ok: false, error: 'payload_too_large' }, 413);
  if (sniffImage(bytes) !== declared) return response({ ok: false, error: 'unsupported_media_type' }, 415);

  const now = new Date();
  let owner;
  try {
    owner = await db.prepare('SELECT install_hash, received_at FROM letter_replies WHERE id = ?').bind(replyId).first();
  } catch {
    return response({ ok: false, error: 'storage_unavailable' }, 503);
  }
  // 编号不存在和不是你寄的信说法一样，别让人拿来探别人的回信编号。
  if (!owner || owner.install_hash !== await installHash(installId)) return response({ ok: false, error: 'unknown_reply' }, 404);
  if (now.getTime() - Date.parse(owner.received_at) > ATTACHMENT_REPLY_MAX_AGE_MS) return response({ ok: false, error: 'reply_too_old' }, 410);

  const sha256 = await sha256Bytes(bytes);
  try {
    const existing = await db.prepare('SELECT id FROM letter_attachments WHERE reply_id = ? AND sha256 = ?').bind(replyId, sha256).first();
    if (existing) return response({ attachmentId: existing.id, duplicate: true });
    const counted = await db.prepare('SELECT COUNT(*) AS count FROM letter_attachments WHERE reply_id = ?').bind(replyId).first();
    if (Number(counted?.count ?? 0) >= ATTACHMENTS_PER_REPLY) return response({ ok: false, error: 'too_many_attachments' }, 409);
  } catch {
    return response({ ok: false, error: 'storage_unavailable' }, 503);
  }
  if (await overRateLimit(db, await sourceKey(request), now)) return response({ ok: false, error: 'rate_limited' }, 429);

  // 先清掉过期的，再看总量；总量查不到就不收（宁可晚一点传，也不让账单失控）。
  await pruneAttachments(db, bucket, now);
  try {
    const dayStart = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
    const usage = await db.prepare(`
      SELECT COALESCE(SUM(bytes), 0) AS stored, COALESCE(SUM(CASE WHEN received_at >= ? THEN 1 ELSE 0 END), 0) AS today
      FROM letter_attachments
    `).bind(dayStart).first();
    if (Number(usage?.stored ?? 0) + bytes.length > ATTACHMENT_BUDGET_BYTES || Number(usage?.today ?? 0) >= ATTACHMENTS_PER_DAY) {
      return response({ ok: false, error: 'attachments_full' }, 507);
    }
  } catch {
    return response({ ok: false, error: 'storage_unavailable' }, 503);
  }

  const attachmentId = crypto.randomUUID();
  const objectKey = `letters/${replyId}/${attachmentId}.${IMAGE_TYPES[declared]}`;
  try {
    await bucket.put(objectKey, bytes, { httpMetadata: { contentType: declared } });
    await db.prepare(`
      INSERT INTO letter_attachments (id, reply_id, received_at, content_type, bytes, sha256, object_key)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(attachmentId, replyId, now.toISOString(), declared, bytes.length, sha256, objectKey).run();
  } catch {
    try { await bucket.delete(objectKey); } catch { /* 留一个没有记录的对象，下次按前缀清 */ }
    return response({ ok: false, error: 'storage_unavailable' }, 503);
  }
  return response({ attachmentId }, 201);
}

export async function onRequestPost(context) {
  const action = context.params?.action;
  if (action === 'attachment') return attachment(context);
  if (action !== 'reply' && action !== 'receipts') return response({ ok: false, error: 'not_found' }, 404);
  const { body, error } = await readJson(context.request);
  if (error) return error;
  return action === 'reply' ? reply(context, body) : receipts(context, body);
}

export function onRequest() {
  return response({ ok: false, error: 'method_not_allowed' }, 405);
}

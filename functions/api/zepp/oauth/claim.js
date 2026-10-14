import {
  PENDING_TTL_MS, isState, jsonResponse, officialConfig, sameHex, sha256Hex, unseal,
} from '../../../../server/zepp/official.js';

const MAX_BODY_BYTES = 1024;

// 桌面端轮询领令牌。要同时拿出 state 和只有它知道的 claim_secret；
// 令牌只交出一次，交出即删。领到后把这个 Zepp 账号记成「已授权」（只存哈希），
// 后面的数据中转只收已授权账号的推送。
export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
  }
  const config = officialConfig(env);
  if (!config) return jsonResponse({ error: 'oauth_not_configured' }, 503);

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return jsonResponse({ error: 'invalid_request' }, 400);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return jsonResponse({ error: 'invalid_request' }, 400);
  }
  const { state, claim_secret: claimSecret } = body ?? {};
  if (!isState(state) || !isState(claimSecret)) return jsonResponse({ error: 'invalid_request' }, 400);

  const stateHash = await sha256Hex(state);
  const row = await config.db
    .prepare('SELECT claim_hash, status, error, tokens_enc, created_at FROM oauth_pending WHERE state_hash = ?')
    .bind(stateHash)
    .first();
  // 不存在、过期、密钥不对，一律同一个回答：不让人借此探测哪些 state 存在。
  if (!row || row.created_at < Date.now() - PENDING_TTL_MS
      || !sameHex(row.claim_hash, await sha256Hex(claimSecret))) {
    return jsonResponse({ status: 'expired' }, 404);
  }
  if (row.status === 'pending') return jsonResponse({ status: 'pending' }, 202);

  const removed = await config.db
    .prepare('DELETE FROM oauth_pending WHERE state_hash = ? AND status = ?')
    .bind(stateHash, row.status)
    .run();
  if (!removed?.meta?.changes) return jsonResponse({ status: 'expired' }, 404);
  if (row.status !== 'ready') {
    return jsonResponse({ status: row.status === 'denied' ? 'denied' : 'failed', error: row.error ?? null });
  }

  const tokens = await unseal(config.relayKey, row.tokens_enc);
  if (tokens.user_id) {
    const now = Date.now();
    await config.db
      .prepare(`INSERT INTO official_users (user_hash, registered_at, last_seen_at) VALUES (?, ?, ?)
                ON CONFLICT(user_hash) DO UPDATE SET last_seen_at = excluded.last_seen_at`)
      .bind(await sha256Hex(tokens.user_id), now, now)
      .run();
  }
  return jsonResponse({ status: 'ready', ...tokens });
}

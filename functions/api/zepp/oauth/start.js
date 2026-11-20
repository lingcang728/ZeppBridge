import {
  MAX_PENDING, PENDING_TTL_MS, authorizeUrl, isHash, isState, jsonResponse, officialConfig, purgeExpired, sameHex, sha256Hex,
} from '../../../../server/zepp/official.js';
import { resultPage, startPage } from '../../../../server/zepp/pages.js';

// 桌面端用系统浏览器打开这里：记下这次授权（state 只存哈希），给一页说明，再由用户点去 Zepp 授权页。
// App ID 由这里拼进授权地址，所以桌面二进制里没有它。
//
// 同一个链接会被打开不止一次：刷新、浏览器预加载、从历史里点回来。只要还是同一对
// state / claim、没过期也没用过，就再给一遍说明页；别的情况给「已失效」页，
// 不把一行 JSON 丢给浏览器里的人看。
export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  }
  const config = officialConfig(env);
  if (!config) return resultPage('failed', 503, request);

  const params = new URL(request.url).searchParams;
  const state = params.get('state');
  const claimHash = params.get('claim');
  if (!isState(state) || !isHash(claimHash)) return resultPage('expired', 400, request);

  const now = Date.now();
  await purgeExpired(config.db, now);
  const stateHash = await sha256Hex(state);
  const existing = await config.db
    .prepare('SELECT claim_hash, status, error, tokens_enc, created_at FROM oauth_pending WHERE state_hash = ?')
    .bind(stateHash)
    .first();
  if (existing) {
    const reusable = existing.status === 'pending'
      && existing.created_at >= now - PENDING_TTL_MS
      && sameHex(existing.claim_hash, claimHash);
    return reusable
      ? startPage(request, authorizeUrl(config.clientId, state))
      : resultPage('expired', 400, request);
  }

  const pending = await config.db.prepare('SELECT COUNT(*) AS n FROM oauth_pending').first();
  if ((pending?.n ?? 0) >= MAX_PENDING) {
    return jsonResponse({ error: 'busy' }, 503, { 'Retry-After': '60' });
  }
  const inserted = await config.db
    .prepare(`INSERT INTO oauth_pending (state_hash, claim_hash, status, created_at)
              VALUES (?, ?, 'pending', ?) ON CONFLICT(state_hash) DO NOTHING`)
    .bind(stateHash, claimHash, now)
    .run();
  if (!inserted?.meta?.changes) return resultPage('expired', 400, request);

  // 不直接跳走：先给一页说明（连的是什么、下一步去哪、怎么换账号），用户点了再去 Zepp。
  return startPage(request, authorizeUrl(config.clientId, state));
}

import {
  MAX_PENDING, authorizeUrl, isHash, isState, jsonResponse, officialConfig, purgeExpired, sha256Hex,
} from '../../../../server/zepp/official.js';
import { startPage } from '../../../../server/zepp/pages.js';

// 桌面端用系统浏览器打开这里：记下这次授权（state 只存哈希），给一页说明，再由用户点去 Zepp 授权页。
// App ID 由这里拼进授权地址，所以桌面二进制里没有它。
export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  }
  const config = officialConfig(env);
  if (!config) return jsonResponse({ error: 'oauth_not_configured' }, 503);

  const params = new URL(request.url).searchParams;
  const state = params.get('state');
  const claimHash = params.get('claim');
  if (!isState(state) || !isHash(claimHash)) {
    return jsonResponse({ error: 'invalid_request' }, 400);
  }

  const now = Date.now();
  await purgeExpired(config.db, now);
  const pending = await config.db.prepare('SELECT COUNT(*) AS n FROM oauth_pending').first();
  if ((pending?.n ?? 0) >= MAX_PENDING) {
    return jsonResponse({ error: 'busy' }, 503, { 'Retry-After': '60' });
  }
  const stateHash = await sha256Hex(state);
  const inserted = await config.db
    .prepare(`INSERT INTO oauth_pending (state_hash, claim_hash, status, created_at)
              VALUES (?, ?, 'pending', ?) ON CONFLICT(state_hash) DO NOTHING`)
    .bind(stateHash, claimHash, now)
    .run();
  if (!inserted?.meta?.changes) return jsonResponse({ error: 'invalid_request' }, 400);

  // 不直接跳走：先给一页说明（连的是什么、下一步去哪、怎么换账号），用户点了再去 Zepp。
  return startPage(request, authorizeUrl(config.clientId, state));
}

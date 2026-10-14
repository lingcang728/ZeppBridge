import {
  PENDING_TTL_MS, exchangeCode, isState, jsonResponse, officialConfig, seal, sha256Hex,
} from '../../../../server/zepp/official.js';
import { resultPage as page } from '../../../../server/zepp/pages.js';

// Zepp 授权后回到这里（控制台登记的 Authorization Callback）。
// 只认 /start 登记过、没过期、还没用过的 state；code 用 client_secret 换成令牌后
// 加密暂存，等桌面端来领。页面只显示固定文案，不回显任何参数。
export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse({ error: 'method_not_allowed' }, 405, { Allow: 'GET, HEAD' });
  }
  const params = new URL(request.url).searchParams;
  const config = officialConfig(env);

  // 裸地址是连通性检查，不是一次授权。
  if (!params.toString()) {
    const status = jsonResponse({
      service: 'ZeppBridge',
      endpoint: 'authorization_callback',
      oauthEnabled: Boolean(config),
    });
    return request.method === 'HEAD' ? new Response(null, { status: 200, headers: status.headers }) : status;
  }
  // 带参数的 HEAD 不做任何事：换令牌只能发生在一次真正的 GET 里。
  if (request.method === 'HEAD') {
    return jsonResponse({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  }
  if (!config) return page('failed', 503, request);

  const state = params.get('state');
  if (!isState(state)) return page('expired', 400, request);
  const stateHash = await sha256Hex(state);
  const row = await config.db
    .prepare('SELECT status, created_at FROM oauth_pending WHERE state_hash = ?')
    .bind(stateHash)
    .first();
  if (!row || row.status !== 'pending' || row.created_at < Date.now() - PENDING_TTL_MS) {
    return page('expired', 400, request);
  }

  const settle = (status, error = null, tokensEnc = null) => config.db
    .prepare(`UPDATE oauth_pending SET status = ?, error = ?, tokens_enc = ?
              WHERE state_hash = ? AND status = 'pending'`)
    .bind(status, error, tokensEnc, stateHash)
    .run();

  const code = params.get('code');
  if (params.get('error') || !code) {
    await settle('denied', 'access_denied');
    return page('denied', 200, request);
  }

  let exchanged;
  try {
    exchanged = await exchangeCode(config, code);
  } catch {
    await settle('failed', 'exchange_unreachable');
    return page('failed', 502, request);
  }
  if (!exchanged.tokens) {
    await settle('failed', `exchange_http_${exchanged.status}`);
    return page('failed', 502, request);
  }
  await settle('ready', null, await seal(config.relayKey, exchanged.tokens));
  return page('ready', 200, request);
}

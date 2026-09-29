import { jsonResponse, officialConfig, refreshTokens } from '../../../../server/zepp/official.js';

const MAX_BODY_BYTES = 8 * 1024;
const MAX_TOKEN_CHARS = 4096;

const isToken = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_TOKEN_CHARS;

// 刷新令牌必须带 client_secret，所以桌面端经这里转一次。无状态：什么都不存。
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
  // access_token 桌面端也会带来，但刷新只用得到 refresh_token。
  const { refresh_token: refreshToken } = body ?? {};
  if (!isToken(refreshToken)) return jsonResponse({ error: 'invalid_request' }, 400);

  let result;
  try {
    result = await refreshTokens(config, refreshToken);
  } catch {
    return jsonResponse({ error: 'upstream_unreachable' }, 502);
  }
  if (result.tokens) return jsonResponse({ status: 'ready', ...result.tokens });
  // 400/401/403 是令牌确定失效，要重新授权；其余当作暂时失败，稍后再试。
  const revoked = [400, 401, 403].includes(result.status);
  return jsonResponse({ error: revoked ? 'invalid_grant' : 'upstream_error' }, revoked ? 401 : 502);
}

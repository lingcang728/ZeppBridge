// Zepp 官方授权的中转：App ID / Secret 只在这里（Cloudflare Secrets），桌面端一样都不带。
//
// 流程：桌面端生成 state 与 claim_secret，只把 sha256(claim_secret) 交给 /start；
// 浏览器授权后 Zepp 带 code 回到 /callback，我们用 client_secret 换令牌、加密暂存；
// 桌面端拿 claim_secret 来 /claim 领走，领一次即删。state 会出现在浏览器地址栏，
// claim_secret 从不出现——只知道 state 的人领不走令牌。

export const AUTHORIZE_URL = 'https://user.zepp.com/oauth2/index.html#/login';
export const TOKEN_URL = 'https://auth.zepp.com/v2/oauth2/access_token';
export const REFRESH_URL = 'https://auth.zepp.com/v2/oauth2/refresh_token';
export const REDIRECT_URI = 'https://zeppbridge.pages.dev/api/zepp/oauth/callback';

/** 一次授权从打开浏览器到桌面端领走令牌，最长给 10 分钟。 */
export const PENDING_TTL_MS = 10 * 60 * 1000;
/** 同时挂着的授权超过这个数就先拒绝新的，免得有人刷 /start 把库撑大。 */
export const MAX_PENDING = 2000;

const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

export const isState = (value) => typeof value === 'string' && STATE_PATTERN.test(value);
export const isHash = (value) => typeof value === 'string' && HASH_PATTERN.test(value);

/** 所有必需的服务端配置都在才算启用；缺一样就一律安全拒绝。 */
export function officialConfig(env) {
  const clientId = env?.ZEPP_CLIENT_ID;
  const clientSecret = env?.ZEPP_CLIENT_SECRET;
  const relayKey = env?.RELAY_KEY;
  const db = env?.OFFICIAL_DB;
  if (!clientId || !clientSecret || !relayKey || !db) return null;
  return { clientId, clientSecret, relayKey, db };
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 两个等长十六进制串的比较不随第一个不同字符提前返回。 */
export function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const base64ToBytes = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
const bytesToBase64 = (bytes) => btoa(String.fromCharCode(...bytes));

async function relayCryptoKey(relayKey) {
  const raw = base64ToBytes(relayKey);
  if (raw.length !== 32) throw new Error('RELAY_KEY must be 32 bytes of base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** 暂存在 D1 里的令牌用 AES-GCM 加密：库被导出也读不出令牌。 */
export async function seal(relayKey, value) {
  const key = await relayCryptoKey(relayKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  return `${bytesToBase64(iv)}.${bytesToBase64(sealed)}`;
}

export async function unseal(relayKey, text) {
  const [iv, sealed] = String(text).split('.');
  const key = await relayCryptoKey(relayKey);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv) },
    key,
    base64ToBytes(sealed),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

/** 只留下桌面端需要的字段，Zepp 响应里多出来的东西不往外传。 */
export function pickTokens(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, user_id: userId } = payload;
  if (typeof accessToken !== 'string' || !accessToken) return null;
  return {
    access_token: accessToken,
    refresh_token: typeof refreshToken === 'string' ? refreshToken : null,
    expires_in: Number.isFinite(Number(expiresIn)) ? Number(expiresIn) : null,
    user_id: userId === undefined || userId === null ? null : String(userId),
  };
}

async function postForm(url, fields, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, tokens: response.ok ? pickTokens(payload) : null };
}

export function exchangeCode(config, code) {
  return postForm(TOKEN_URL, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
    code,
  });
}

// 刷新时 Authorization 里放的是 **refresh_token**。官方文档写的是 access_token，
// 但 2026-09-29 实测：放 access_token 一律回 401，放 refresh_token 才成功。
// 放错的后果是令牌 90 天后刷新不动，每个用户都得重新授权。
export function refreshTokens(config, refreshToken) {
  return postForm(REFRESH_URL, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  }, { Authorization: `Bearer ${refreshToken}` });
}

export function authorizeUrl(clientId, state) {
  // redirect_uri 文档说可省略，但实测带上它的授权能走通；不赌省略也行。
  const query = `client_id=${encodeURIComponent(clientId)}&response_type=code`
    + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
    + `&state=${encodeURIComponent(state)}&token=%5B%22access%22,%22refresh%22%5D`;
  return `${AUTHORIZE_URL}?${query}`;
}

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

const PAGES = {
  ready: {
    title: '授权成功 · Authorized',
    zh: '授权成功。回到 ZeppBridge，它会自动完成连接；这个页面可以关掉了。',
    en: 'Authorized. Go back to ZeppBridge — it finishes connecting by itself. You can close this page.',
  },
  denied: {
    title: '授权已取消 · Cancelled',
    zh: '你没有同意授权，ZeppBridge 什么也没拿到。需要时可以在应用里重新发起。',
    en: 'You did not grant access, so ZeppBridge received nothing. You can start again from the app.',
  },
  expired: {
    title: '授权已过期 · Expired',
    zh: '这次授权已过期或已经用过。请回到 ZeppBridge 重新点一次「用 Zepp 账号授权」。',
    en: 'This authorization expired or was already used. Go back to ZeppBridge and start again.',
  },
  failed: {
    title: '授权没有完成 · Not completed',
    zh: 'Zepp 没有接受这次授权，ZeppBridge 什么也没保存。请回到应用重试。',
    en: 'Zepp did not accept this authorization, so nothing was saved. Go back to the app and try again.',
  },
};

/**
 * 给浏览器看的结果页。只放固定文案：code、state、令牌、错误描述一律不回显。
 */
export function resultPage(kind, status = 200) {
  const page = PAGES[kind] ?? PAGES.failed;
  const body = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${page.title}</title>`
    + '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1411;color:#e8efe9;'
    + 'font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:32rem;padding:2rem}'
    + 'h1{font-size:1.25rem;margin:0 0 1rem}p{margin:.5rem 0;color:#b8c4bb}'
    + '@media (prefers-color-scheme:light){body{background:#f4f7f4;color:#152019}p{color:#3d4a41}}</style>'
    + `</head><body><main><h1>${page.title}</h1><p>${page.zh}</p><p>${page.en}</p></main></body></html>`;
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
      ...SECURITY_HEADERS,
    },
  });
}

/** 过期的待领授权顺手清掉：每次有人来都扫一遍，不需要定时任务。 */
export function purgeExpired(db, now) {
  return db.prepare('DELETE FROM oauth_pending WHERE created_at < ?').bind(now - PENDING_TTL_MS).run();
}

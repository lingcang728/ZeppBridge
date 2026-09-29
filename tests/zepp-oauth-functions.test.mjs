import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';

import { onRequest as start } from '../functions/api/zepp/oauth/start.js';
import { onRequest as callback } from '../functions/api/zepp/oauth/callback.js';
import { onRequest as claim } from '../functions/api/zepp/oauth/claim.js';
import { onRequest as refresh } from '../functions/api/zepp/oauth/refresh.js';

/*
 * 官方授权中转的门禁。它挡的是三件事：
 *   1. 令牌、code、state 绝不出现在浏览器能看到的地方（页面、跳转地址）；
 *   2. 只知道 state 的人领不走令牌，令牌只能领一次；
 *   3. 服务端配置不全时一律安全拒绝，绝不假装授权成功。
 */

const SECRET = 'fixture-client-secret';
const CLIENT_ID = 'fixture-client-id';
const base64url = (bytes) => bytes.toString('base64url');
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const newPair = () => {
  const state = base64url(randomBytes(32));
  const secret = base64url(randomBytes(32));
  return { state, secret, claimHash: sha256(secret) };
};

/** 只认这几个端点真正会发的 SQL；出现别的语句就算失败。 */
class FakeD1 {
  constructor() {
    this.pending = new Map();
    this.users = new Map();
  }

  prepare(sql) {
    const db = this;
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async first() { return db.exec(sql, args); },
      async run() { return db.exec(sql, args); },
    };
    return statement;
  }

  exec(rawSql, a) {
    const sql = rawSql.replace(/\s+/g, ' ').trim();
    const changed = (n) => ({ meta: { changes: n } });
    if (sql.startsWith('DELETE FROM oauth_pending WHERE created_at <')) {
      let n = 0;
      for (const [key, row] of this.pending) if (row.created_at < a[0]) { this.pending.delete(key); n += 1; }
      return changed(n);
    }
    if (sql.startsWith('SELECT COUNT(*) AS n FROM oauth_pending')) return { n: this.pending.size };
    if (sql.startsWith('INSERT INTO oauth_pending')) {
      if (this.pending.has(a[0])) return changed(0);
      this.pending.set(a[0], { claim_hash: a[1], status: 'pending', error: null, tokens_enc: null, created_at: a[2] });
      return changed(1);
    }
    if (sql.startsWith('SELECT status, created_at FROM oauth_pending')) {
      const row = this.pending.get(a[0]);
      return row ? { status: row.status, created_at: row.created_at } : null;
    }
    if (sql.startsWith('UPDATE oauth_pending SET status')) {
      const row = this.pending.get(a[3]);
      if (!row || row.status !== 'pending') return changed(0);
      Object.assign(row, { status: a[0], error: a[1], tokens_enc: a[2] });
      return changed(1);
    }
    if (sql.startsWith('SELECT claim_hash, status, error, tokens_enc, created_at FROM oauth_pending')) {
      return this.pending.get(a[0]) ?? null;
    }
    if (sql.startsWith('DELETE FROM oauth_pending WHERE state_hash = ? AND status = ?')) {
      const row = this.pending.get(a[0]);
      if (!row || row.status !== a[1]) return changed(0);
      this.pending.delete(a[0]);
      return changed(1);
    }
    if (sql.startsWith('INSERT INTO official_users')) {
      const existing = this.users.get(a[0]);
      this.users.set(a[0], { registered_at: existing?.registered_at ?? a[1], last_seen_at: a[2] });
      return changed(1);
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

const configuredEnv = () => ({
  ZEPP_CLIENT_ID: CLIENT_ID,
  ZEPP_CLIENT_SECRET: SECRET,
  RELAY_KEY: randomBytes(32).toString('base64'),
  OFFICIAL_DB: new FakeD1(),
});

const url = (path, query = '') => `https://zeppbridge.pages.dev/api/zepp/oauth/${path}${query}`;
const get = (handler, env, path, query) => handler({ request: new Request(url(path, query)), env });
const post = (handler, env, path, body) => handler({
  request: new Request(url(path), { method: 'POST', body: JSON.stringify(body) }),
  env,
});

const tokenResponse = (overrides = {}) => new Response(JSON.stringify({
  access_token: 'fixture-access-token',
  token_type: 'Bearer',
  expires_in: 3600,
  refresh_token: 'fixture-refresh-token',
  user_id: '3000000002',
  scope: 'ignored-extra-field',
  ...overrides,
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('every endpoint refuses safely while the server is not configured', async (context) => {
  context.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected outbound request'));
  const { state, secret, claimHash } = newPair();
  for (const env of [{}, { ZEPP_CLIENT_ID: CLIENT_ID }, { ...configuredEnv(), RELAY_KEY: undefined }]) {
    assert.equal((await get(start, env, 'start', `?state=${state}&claim=${claimHash}`)).status, 503);
    assert.equal((await post(claim, env, 'claim', { state, claim_secret: secret })).status, 503);
    assert.equal((await post(refresh, env, 'refresh', { access_token: 'a', refresh_token: 'b' })).status, 503);
    const page = await get(callback, env, 'callback', `?code=fixture-code&state=${state}`);
    assert.equal(page.status, 503);
    assert.doesNotMatch(await page.text(), /fixture-code/);
    const bare = await (await get(callback, env, 'callback', '')).json();
    assert.equal(bare.oauthEnabled, false);
  }
});

test('the full flow hands the tokens to the desktop exactly once, and never to the browser', async (context) => {
  const env = configuredEnv();
  const { state, secret, claimHash } = newPair();

  const started = await get(start, env, 'start', `?state=${state}&claim=${claimHash}`);
  // 先给一页说明，用户点了才去 Zepp：链接在页面里，不是 302。
  assert.equal(started.status, 200);
  assert.match(started.headers.get('content-type'), /^text\/html/);
  const startHtml = await started.text();
  assert.doesNotMatch(startHtml, new RegExp(SECRET));
  assert.doesNotMatch(startHtml, new RegExp(claimHash));
  const location = startHtml.match(/<a class="go" href="([^"]+)"/)[1].replaceAll('&amp;', '&');
  assert.ok(location.startsWith('https://user.zepp.com/oauth2/index.html#/login?'));
  assert.match(location, new RegExp(`client_id=${CLIENT_ID}`));
  assert.match(location, /response_type=code/);
  assert.match(location, /redirect_uri=https%3A%2F%2Fzeppbridge\.pages\.dev%2Fapi%2Fzepp%2Foauth%2Fcallback/);
  assert.match(location, /token=%5B%22access%22,%22refresh%22%5D/);
  assert.doesNotMatch(location, new RegExp(SECRET));
  assert.doesNotMatch(location, new RegExp(claimHash));

  // 还没授权完：桌面端会一直得到 pending。
  assert.equal((await post(claim, env, 'claim', { state, claim_secret: secret })).status, 202);

  const exchange = context.mock.method(globalThis, 'fetch', async (target, init) => {
    assert.equal(target, 'https://auth.zepp.com/v2/oauth2/access_token');
    const form = new URLSearchParams(init.body);
    assert.equal(form.get('client_secret'), SECRET);
    assert.equal(form.get('grant_type'), 'authorization_code');
    assert.equal(form.get('code'), 'fixture-code');
    assert.equal(form.get('redirect_uri'), 'https://zeppbridge.pages.dev/api/zepp/oauth/callback');
    return tokenResponse();
  });
  const page = await get(callback, env, 'callback', `?code=fixture-code&state=${state}`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /^text\/html/);
  const html = await page.text();
  for (const leaked of ['fixture-code', state, 'fixture-access-token', 'fixture-refresh-token']) {
    assert.ok(!html.includes(leaked), `page leaked ${leaked}`);
  }
  assert.equal(exchange.mock.callCount(), 1);

  // 暂存在库里的是密文。
  const [stored] = env.OFFICIAL_DB.pending.values();
  assert.equal(stored.status, 'ready');
  assert.doesNotMatch(stored.tokens_enc, /fixture-access-token/);

  // 只知道 state 不够。
  const wrong = await post(claim, env, 'claim', { state, claim_secret: base64url(randomBytes(32)) });
  assert.equal(wrong.status, 404);

  const claimed = await post(claim, env, 'claim', { state, claim_secret: secret });
  assert.equal(claimed.status, 200);
  assert.deepEqual(await claimed.json(), {
    status: 'ready',
    access_token: 'fixture-access-token',
    refresh_token: 'fixture-refresh-token',
    expires_in: 3600,
    user_id: '3000000002',
  });
  assert.equal(env.OFFICIAL_DB.pending.size, 0);
  assert.ok(env.OFFICIAL_DB.users.has(sha256('3000000002')), 'the account is registered by hash only');

  const again = await post(claim, env, 'claim', { state, claim_secret: secret });
  assert.equal(again.status, 404, 'tokens are handed out once');

  // 同一个 state 回调第二次不会再换一次令牌。
  const replay = await get(callback, env, 'callback', `?code=fixture-code&state=${state}`);
  assert.equal(replay.status, 400);
  assert.equal(exchange.mock.callCount(), 1);
});

test('a denied authorization is reported as denied and nothing is exchanged', async (context) => {
  context.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected outbound request'));
  const env = configuredEnv();
  const { state, secret, claimHash } = newPair();
  await get(start, env, 'start', `?state=${state}&claim=${claimHash}`);
  const page = await get(callback, env, 'callback', `?error=access_denied&error_description=fixture-text&state=${state}`);
  assert.equal(page.status, 200);
  assert.doesNotMatch(await page.text(), /fixture-text/);
  const claimed = await post(claim, env, 'claim', { state, claim_secret: secret });
  assert.equal((await claimed.json()).status, 'denied');
});

test('a rejected code exchange is a failure, never a half-connected account', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response('{"error":"invalid_grant"}', { status: 400 }));
  const env = configuredEnv();
  const { state, secret, claimHash } = newPair();
  await get(start, env, 'start', `?state=${state}&claim=${claimHash}`);
  assert.equal((await get(callback, env, 'callback', `?code=fixture-code&state=${state}`)).status, 502);
  const claimed = await (await post(claim, env, 'claim', { state, claim_secret: secret })).json();
  assert.equal(claimed.status, 'failed');
  assert.equal(claimed.access_token, undefined);
  assert.equal(env.OFFICIAL_DB.users.size, 0);
});

test('unknown, malformed or expired states never reach Zepp', async (context) => {
  context.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected outbound request'));
  const env = configuredEnv();
  const { state, claimHash } = newPair();
  for (const query of [`?code=x&state=${state}`, '?code=x&state=short', '?code=x']) {
    assert.equal((await get(callback, env, 'callback', query)).status, 400);
  }
  await get(start, env, 'start', `?state=${state}&claim=${claimHash}`);
  const [row] = env.OFFICIAL_DB.pending.values();
  row.created_at -= 11 * 60 * 1000;
  assert.equal((await get(callback, env, 'callback', `?code=x&state=${state}`)).status, 400);
});

test('start rejects malformed input and duplicate states', async () => {
  const env = configuredEnv();
  const { state, claimHash } = newPair();
  for (const query of ['', `?state=${state}`, `?state=bad&claim=${claimHash}`, `?state=${state}&claim=XYZ`]) {
    assert.equal((await get(start, env, 'start', query)).status, 400);
  }
  assert.equal((await get(start, env, 'start', `?state=${state}&claim=${claimHash}`)).status, 200);
  assert.equal((await get(start, env, 'start', `?state=${state}&claim=${claimHash}`)).status, 400);
});

test('refresh adds the secret server-side and reports a dead grant distinctly', async (context) => {
  const env = configuredEnv();
  const upstream = context.mock.method(globalThis, 'fetch', async (target, init) => {
    assert.equal(target, 'https://auth.zepp.com/v2/oauth2/refresh_token');
    // 实测：Zepp 要的是 refresh_token，放 access_token 会 401。
    assert.equal(init.headers.Authorization, 'Bearer old-refresh');
    const form = new URLSearchParams(init.body);
    assert.equal(form.get('client_secret'), SECRET);
    assert.equal(form.get('grant_type'), 'refresh_token');
    assert.equal(form.get('refresh_token'), 'old-refresh');
    return tokenResponse({ access_token: 'new-access', refresh_token: 'new-refresh' });
  });
  const ok = await post(refresh, env, 'refresh', { access_token: 'old-access', refresh_token: 'old-refresh' });
  const body = await ok.json();
  assert.equal(body.access_token, 'new-access');
  assert.equal(body.refresh_token, 'new-refresh');
  assert.equal(JSON.stringify(body).includes(SECRET), false);
  assert.equal(upstream.mock.callCount(), 1);

  upstream.mock.mockImplementation(async () => new Response('{}', { status: 401 }));
  const dead = await post(refresh, env, 'refresh', { access_token: 'old-access', refresh_token: 'old-refresh' });
  assert.equal(dead.status, 401);
  assert.equal((await dead.json()).error, 'invalid_grant');

  upstream.mock.mockImplementation(async () => new Response('{}', { status: 500 }));
  const flaky = await post(refresh, env, 'refresh', { access_token: 'old-access', refresh_token: 'old-refresh' });
  assert.equal(flaky.status, 502);
});

test('the pages follow the browser language and never echo parameters', async (context) => {
  context.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected outbound request'));
  const env = configuredEnv();
  const { state, claimHash } = newPair();
  const zh = await start({
    request: new Request(url('start', `?state=${state}&claim=${claimHash}`), { headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' } }),
    env,
  });
  const zhHtml = await zh.text();
  assert.match(zhHtml, /lang="zh-CN"/);
  assert.match(zhHtml, /无痕窗口/);
  const expired = await callback({
    request: new Request(url('callback', `?code=fixture-code&state=${newPair().state}`), { headers: { 'Accept-Language': 'en-US' } }),
    env,
  });
  const expiredHtml = await expired.text();
  assert.match(expiredHtml, /lang="en"/);
  assert.doesNotMatch(expiredHtml, /fixture-code/);
  assert.match(expired.headers.get('content-security-policy'), /default-src 'none'/);
});

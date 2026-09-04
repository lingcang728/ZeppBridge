import assert from 'node:assert/strict';

const base = new URL(process.argv[2] ?? 'https://zeppbridge.pages.dev');
assert.ok(base.protocol === 'https:' || (base.protocol === 'http:' && base.hostname === '127.0.0.1'));
assert.ok(base.hostname === '127.0.0.1' || /^(?:[a-z0-9-]+\.)?zeppbridge\.pages\.dev$/.test(base.hostname));
assert.ok(!base.username && !base.password && base.pathname === '/' && !base.search && !base.hash);

const cases = [
  ['/api/zepp/oauth/callback', 'GET', 200, 'authorization_callback'],
  ['/api/zepp/data/callback', 'GET', 200, 'data_callback'],
  ['/api/zepp/oauth/callback/', 'GET', 200, 'authorization_callback'],
  ['/api/zepp/data/callback/', 'GET', 200, 'data_callback'],
  ['/api/zepp/oauth/callback', 'HEAD', 200],
  ['/api/zepp/data/callback', 'HEAD', 200],
  ['/api/zepp/oauth/callback?code=synthetic-smoke-only&state=synthetic-smoke-only', 'GET', 503, 'oauth_not_enabled'],
  ['/api/zepp/oauth/callback?error=access_denied', 'GET', 503, 'oauth_not_enabled'],
  ['/api/zepp/data/callback?challenge=synthetic-smoke-only', 'GET', 503, 'data_ingestion_not_enabled'],
  ['/api/zepp/data/callback', 'POST', 503, 'data_ingestion_not_enabled'],
  ['/api/zepp/oauth/callback', 'POST', 405, 'method_not_allowed'],
  ['/api/zepp/data/callback', 'OPTIONS', 405, 'method_not_allowed'],
  ['/api/zepp/data/callback', 'PUT', 405, 'method_not_allowed'],
];

const results = [];
for (const [path, method, expected, identifier] of cases) {
  const response = await fetch(new URL(path, base), {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
    ...(method === 'POST' ? { body: '[]', headers: { 'Content-Type': 'text/plain' } } : {}),
  });
  const label = `${method} ${path.split('?')[0]}`;
  assert.equal(response.status, expected, label);
  assert.equal(response.headers.get('cache-control'), 'no-store', label);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer', label);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff', label);
  assert.match(response.headers.get('content-type'), /^application\/json/, label);
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/, label);
  const body = await response.text();
  assert.ok(!body.includes('synthetic-smoke-only'), `${label}: reflected input`);
  if (method === 'HEAD') {
    assert.equal(body, '', label);
  } else {
    const payload = JSON.parse(body);
    assert.equal(payload.endpoint ?? payload.error, identifier, label);
    if (expected === 200) {
      assert.equal(payload.status, 'registration_only', label);
      assert.equal(payload.oauthEnabled ?? payload.dataIngestionEnabled, false, label);
    }
  }
  results.push({ method, path: path.split('?')[0], status: response.status, queryTest: path.includes('?') });
}

// Read-only regression checks: never submit a feedback report during smoke.
const homepage = await fetch(base, { signal: AbortSignal.timeout(30_000) });
assert.equal(homepage.status, 200);
const html = await homepage.text();
assert.match(html, /ZeppBridge/);
const modulePath = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/);
assert.ok(modulePath, 'Homepage module entry is missing');
const entry = await fetch(new URL(modulePath[1], base), { signal: AbortSignal.timeout(30_000) });
assert.equal(entry.status, 200);
assert.match(entry.headers.get('content-type'), /javascript/);
const feedback = await fetch(new URL('/api/feedback', base), { signal: AbortSignal.timeout(30_000) });
assert.equal(feedback.status, 405);
assert.equal((await feedback.json()).error, 'method_not_allowed');
console.log(JSON.stringify({ baseUrl: base.origin, callbacks: results, homepage: 'ok', module: 'ok', feedback: 'ok' }, null, 2));

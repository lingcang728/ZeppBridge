import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest as oauthCallback } from '../functions/api/zepp/oauth/callback.js';
import { onRequest as dataCallback } from '../functions/api/zepp/data/callback.js';

const endpoints = [
  { handler: oauthCallback, path: '/api/zepp/oauth/callback', name: 'authorization_callback', flag: 'oauthEnabled', allow: 'GET, HEAD' },
  { handler: dataCallback, path: '/api/zepp/data/callback', name: 'data_callback', flag: 'dataIngestionEnabled', allow: 'GET, HEAD, POST' },
];

function invoke(endpoint, method = 'GET', query = '', body) {
  const request = new Request(`https://zeppbridge.pages.dev${endpoint.path}${query}`, {
    method, body,
  });
  // Fail if these registration-only handlers ever access a secret, database,
  // background task, or static fallback.
  const context = new Proxy({ request }, {
    get(target, key) {
      assert.equal(key, 'request', `Unexpected context access: ${String(key)}`);
      return target.request;
    },
  });
  return { request, response: endpoint.handler(context) };
}

for (const endpoint of endpoints) {
  test(`${endpoint.name}: GET advertises registration-only status`, async () => {
    const { response } = invoke(endpoint);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.service, 'ZeppBridge');
    assert.equal(payload.endpoint, endpoint.name);
    assert.equal(payload.status, 'registration_only');
    assert.equal(payload[endpoint.flag], false);
  });

  test(`${endpoint.name}: HEAD is bodyless`, async () => {
    const { response } = invoke(endpoint, 'HEAD');
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
  });

  test(`${endpoint.name}: unexpected methods do not fall through to the SPA`, async () => {
    for (const method of ['OPTIONS', 'PUT', 'PATCH', 'DELETE']) {
      const { response } = invoke(endpoint, method);
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), endpoint.allow);
      assert.deepEqual(await response.json(), { error: 'method_not_allowed' });
    }
  });

  test(`${endpoint.name}: headers protect all response paths`, () => {
    for (const [method, query] of [['GET', ''], ['HEAD', ''], ['GET', '?code=fixture-secret'], ['POST', ''], ['OPTIONS', '']]) {
      const { response } = invoke(endpoint, method, query);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.match(response.headers.get('content-type'), /^application\/json; charset=utf-8$/);
      assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
      assert.match(response.headers.get('x-robots-tag'), /noindex/);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      assert.equal(response.headers.get('location'), null);
      assert.equal(response.headers.get('set-cookie'), null);
    }
  });

  test(`${endpoint.name}: query parameters are never echoed or treated as success`, async (context) => {
    context.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected outbound request'));
    for (const query of [
      '?code=fixture-secret&state=fixture-secret',
      '?error=access_denied&error_description=fixture-secret',
      '?access_token=fixture-secret',
      '?challenge=fixture-secret',
      '?code=&code=fixture-secret',
      '?redirect_uri=https://example.test/fixture-secret',
    ]) {
      const { response } = invoke(endpoint, 'GET', query);
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('retry-after'), '3600');
      assert.doesNotMatch(await response.text(), /fixture-secret/);
      const head = invoke(endpoint, 'HEAD', query).response;
      assert.equal(head.status, 503);
      assert.equal(await head.text(), '');
    }
  });
}

test('OAuth POST is rejected without consuming credentials', async () => {
  const { request, response } = invoke(endpoints[0], 'POST', '', 'code=fixture-secret');
  assert.equal(response.status, 405);
  assert.equal(request.bodyUsed, false);
  assert.doesNotMatch(await response.text(), /fixture-secret/);
});

test('data POST is never acknowledged or consumed, even for empty or malformed payloads', async (context) => {
  context.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected outbound request'));
  for (const body of [undefined, '', '[]', 'not-json', '["{\\"userId\\":\\"fixture-secret\\"}"]', 'x'.repeat(1_000_000)]) {
    const { request, response } = invoke(endpoints[1], 'POST', '', body);
    assert.equal(response.status, 503);
    assert.equal(request.bodyUsed, false);
    const payload = await response.json();
    assert.equal(payload.error, 'data_ingestion_not_enabled');
    assert.doesNotMatch(JSON.stringify(payload), /fixture-secret/);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRedirect, onRequest } from '../functions/_middleware.js';

test('www and legacy pages.dev pages move to zeppbridge.com, keeping path and query', () => {
  assert.equal(canonicalRedirect('https://www.zeppbridge.com/?lang=en'), 'https://zeppbridge.com/?lang=en');
  assert.equal(canonicalRedirect('https://zeppbridge.pages.dev/'), 'https://zeppbridge.com/');
  assert.equal(canonicalRedirect('https://zeppbridge.pages.dev/index.html'), 'https://zeppbridge.com/index.html');
});

test('pages.dev APIs stay where shipped apps and the Zepp console expect them', () => {
  for (const path of ['/api/zepp/oauth/callback?code=x', '/api/zepp/oauth/start', '/api/feedback', '/api/release', '/api/zepp/data/callback']) {
    assert.equal(canonicalRedirect(`https://zeppbridge.pages.dev${path}`), null, path);
  }
});

test('the canonical host and preview deployments are served as-is', async () => {
  assert.equal(canonicalRedirect('https://zeppbridge.com/'), null);
  assert.equal(canonicalRedirect('https://4c264995.zeppbridge.pages.dev/'), null);
  const passed = await onRequest({ request: new Request('https://zeppbridge.com/'), next: async () => new Response('page') });
  assert.equal(await passed.text(), 'page');
  const moved = await onRequest({ request: new Request('https://zeppbridge.pages.dev/'), next: async () => new Response('page') });
  assert.equal(moved.status, 301);
  assert.equal(moved.headers.get('location'), 'https://zeppbridge.com/');
});

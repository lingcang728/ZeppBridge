import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestGet, projectLatestRelease } from '../functions/api/release.js';

const releaseFixture = () => ({
  tag_name: 'v1.1.2',
  published_at: '2026-08-31T06:50:40Z',
  html_url: 'https://github.com/lingcang728/ZeppBridge/releases/tag/v1.1.2',
  draft: false,
  prerelease: false,
  assets: [
    {
      name: 'ZeppBridge_1.1.2_x64-setup.exe',
      browser_download_url: 'https://example.test/windows.exe',
      size: 29_702_073,
      digest: 'sha256:windows',
    },
    {
      name: 'ZeppBridge_1.1.2_x64_en-US.msi',
      browser_download_url: 'https://example.test/windows.msi',
      size: 32_186_368,
      digest: 'sha256:msi',
    },
    {
      name: 'ZeppBridge_1.1.2_aarch64.dmg',
      browser_download_url: 'https://example.test/macos.dmg',
      size: 34_896_785,
      digest: 'sha256:macos',
    },
  ],
});

test('projects the three user-facing installers from a stable release', () => {
  const result = projectLatestRelease(releaseFixture());

  assert.equal(result.version, '1.1.2');
  assert.equal(result.downloads.windowsExe.url, 'https://example.test/windows.exe');
  assert.equal(result.downloads.windowsMsi.name, 'ZeppBridge_1.1.2_x64_en-US.msi');
  assert.equal(result.downloads.macosDmg.digest, 'sha256:macos');
});

test('rejects an incomplete release instead of serving the wrong file', () => {
  const fixture = releaseFixture();
  fixture.assets = fixture.assets.filter((asset) => !asset.name.endsWith('.dmg'));

  assert.throws(() => projectLatestRelease(fixture), /missing macosDmg/);
});

test('returns a cacheable response with direct download URLs', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json(releaseFixture()));

  const response = await onRequestGet({
    request: new Request('https://zeppbridge.pages.dev/api/release'),
    waitUntil() {},
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /s-maxage=300/);
  assert.equal(payload.downloads.windowsExe.url, 'https://example.test/windows.exe');
});

test('fails closed when GitHub is unavailable', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }));

  const response = await onRequestGet({
    request: new Request('https://zeppbridge.pages.dev/api/release'),
    waitUntil() {},
  });

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'latest_release_unavailable' });
});

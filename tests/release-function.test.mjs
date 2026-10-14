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

test('linux packages are optional, and marked preview when present', () => {
  // 1.1.5 及之前的发布里没有 Linux 包。把它们当成必需资产的话，这段代码
  // 一部署 /api/release 就会对着还挂在 latest 上的旧版整个 502——下载页会
  // 在新版发布之前先坏掉。
  const withoutLinux = projectLatestRelease(releaseFixture());
  assert.equal(withoutLinux.downloads.linuxDeb, undefined);
  assert.equal(withoutLinux.downloads.windowsExe.url, 'https://example.test/windows.exe');

  const fixture = releaseFixture();
  fixture.assets.push(
    {
      name: 'ZeppBridge_1.1.2_amd64.deb',
      browser_download_url: 'https://example.test/linux.deb',
      size: 12_000_000,
      digest: 'sha256:deb',
    },
    {
      name: 'ZeppBridge_1.1.2_x86_64.rpm',
      browser_download_url: 'https://example.test/linux.rpm',
      size: 12_100_000,
      digest: 'sha256:rpm',
    },
    {
      name: 'ZeppBridge_1.1.2_x86_64.AppImage',
      browser_download_url: 'https://example.test/linux.AppImage',
      size: 90_000_000,
      digest: 'sha256:appimage',
    },
    {
      name: 'ZeppBridge_1.1.2_x86_64.flatpak',
      browser_download_url: 'https://example.test/linux.flatpak',
      size: 31_000_000,
      digest: 'sha256:flatpak',
    },
  );

  const result = projectLatestRelease(fixture);
  assert.equal(result.downloads.linuxDeb.url, 'https://example.test/linux.deb');
  assert.equal(result.downloads.linuxFlatpak.digest, 'sha256:flatpak');
  // preview 标记跟着数据走，不是写死在下载页上——写死的话，等哪天真的验证
  // 过了，没人会记得回去删那句话。
  for (const key of ['linuxDeb', 'linuxRpm', 'linuxAppImage', 'linuxFlatpak']) {
    assert.equal(result.downloads[key].preview, true, `${key} 应当标为 preview`);
  }
  // Windows 和 macOS 不是 preview。
  assert.equal(result.downloads.windowsExe.preview, undefined);
});

// 一个按 URL 存取的最小 caches.default：够验证「上一次成功的结果」和「查询参数不进缓存键」。
const memoryCache = () => {
  const store = new Map();
  return {
    store,
    async match(request) { const hit = store.get(request.url); return hit ? hit.clone() : undefined; },
    async put(request, response) { store.set(request.url, response.clone()); },
  };
};
const run = async (url) => {
  const pending = [];
  const response = await onRequestGet({ request: new Request(url), waitUntil(p) { pending.push(p); } });
  await Promise.all(pending);
  return response;
};

test('when GitHub fails, the last good release is served instead of telling visitors nothing is released', async (context) => {
  const cache = memoryCache();
  globalThis.caches = { default: cache }; context.after(() => { delete globalThis.caches; });
  context.mock.method(globalThis, 'fetch', async () => Response.json(releaseFixture()));
  assert.equal((await run('https://zeppbridge.com/api/release')).status, 200);

  cache.store.delete('https://zeppbridge.com/api/release'); // 5 分钟的正常缓存过期了
  context.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 403 }));
  const stale = await run('https://zeppbridge.com/api/release');
  assert.equal(stale.status, 200);
  assert.equal(stale.headers.get('x-release-stale'), '1');
  assert.equal((await stale.json()).version, '1.1.2');
});

test('a query string cannot bypass the cache and burn the GitHub quota', async (context) => {
  globalThis.caches = { default: memoryCache() }; context.after(() => { delete globalThis.caches; });
  const github = context.mock.method(globalThis, 'fetch', async () => Response.json(releaseFixture()));
  await run('https://zeppbridge.com/api/release?a=1');
  const first = github.mock.callCount();
  await run('https://zeppbridge.com/api/release?b=2');
  assert.equal(github.mock.callCount(), first, 'the second query string is served from cache');
});

test('installers come from latest.json + SHA256SUMS.txt when the GitHub API refuses Cloudflare', async (context) => {
  const sums = [
    'aa'.repeat(32) + '  ZeppBridge_3.0.0_x64-setup.exe',
    'bb'.repeat(32) + '  ZeppBridge_3.0.0_x64_en-US.msi',
    'cc'.repeat(32) + '  ZeppBridge_3.0.0_aarch64.dmg',
    'dd'.repeat(32) + '  ZeppBridge_3.0.0_amd64.deb',
    'ee'.repeat(32) + '  latest.json',
  ].join('\n');
  context.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).endsWith('/releases/latest/download/latest.json')) return Response.json({ version: '3.0.0', pub_date: '2026-10-15T00:00:00Z' });
    if (String(url).endsWith('/releases/latest/download/SHA256SUMS.txt')) return new Response(sums);
    return new Response(null, { status: 403 }); // api.github.com
  });
  const response = await onRequestGet({ request: new Request('https://zeppbridge.com/api/release'), waitUntil() {} });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.version, '3.0.0');
  assert.equal(payload.downloads.windowsExe.url, 'https://github.com/lingcang728/ZeppBridge/releases/download/v3.0.0/ZeppBridge_3.0.0_x64-setup.exe');
  assert.equal(payload.downloads.macosDmg.digest, `sha256:${'cc'.repeat(32)}`);
  assert.equal(payload.downloads.linuxDeb.preview, true);
});

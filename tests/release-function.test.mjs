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

import { describe, expect, it } from 'vitest';

import { isUsableReleasePayload, REQUIRED_DOWNLOADS } from '../releaseAssets';

const BASE = 'https://github.com/lingcang728/ZeppBridge/releases/download/v2.0.0';
const trusted = (url: string) => url.startsWith('https://github.com/lingcang728/ZeppBridge/releases/download/');

const asset = (name: string) => ({ url: `${BASE}/${name}` });

const windowsAndMac = () => ({
  windowsExe: asset('ZeppBridge_2.0.0_x64-setup.exe'),
  windowsMsi: asset('ZeppBridge_2.0.0_x64_en-US.msi'),
  macosDmg: asset('ZeppBridge_2.0.0_aarch64.dmg'),
});

const withLinux = () => ({
  ...windowsAndMac(),
  linuxDeb: asset('ZeppBridge_2.0.0_amd64.deb'),
  linuxRpm: asset('ZeppBridge_2.0.0_x86_64.rpm'),
  linuxAppImage: asset('ZeppBridge_2.0.0_x86_64.AppImage'),
  linuxFlatpak: asset('ZeppBridge_2.0.0_x86_64.flatpak'),
});

describe('isUsableReleasePayload', () => {
  it('accepts the three required installers on their own', () => {
    expect(isUsableReleasePayload(windowsAndMac(), trusted)).toBe(true);
  });

  /*
   * 这条是本文件存在的理由。
   *
   * 守卫原本写的是 `assets.length !== 3`。2.0.0 加了四个 Linux 包之后，这一句
   * 把整个下载页打进 fallback——三个 CTA 全部退化成「打开 GitHub Release」，
   * Windows 和 macOS 的直链一起没了。页面照样渲染，控制台照样干净。
   */
  it('does not break when the endpoint grows new optional assets', () => {
    expect(isUsableReleasePayload(withLinux(), trusted)).toBe(true);

    // 再多加一个以后才会有的平台，也不能把它打倒。
    const future = { ...withLinux(), windowsArm64: asset('ZeppBridge_9.9.9_arm64-setup.exe') };
    expect(isUsableReleasePayload(future, trusted)).toBe(true);
  });

  it.each(REQUIRED_DOWNLOADS)('fails closed when %s is missing', (key) => {
    const downloads: Record<string, { url: string } | undefined> = withLinux();
    delete downloads[key];
    expect(isUsableReleasePayload(downloads, trusted)).toBe(false);
  });

  /* 安全边界：这些 URL 会被直接放进 href，一条也不能指向别的域名。 */
  it('rejects an untrusted url anywhere, including in an optional asset', () => {
    const tamperedRequired = { ...withLinux(), macosDmg: { url: 'https://evil.test/ZeppBridge.dmg' } };
    expect(isUsableReleasePayload(tamperedRequired, trusted)).toBe(false);

    const tamperedOptional = { ...withLinux(), linuxDeb: { url: 'https://evil.test/ZeppBridge.deb' } };
    expect(isUsableReleasePayload(tamperedOptional, trusted)).toBe(false);
  });

  it('treats a missing or empty payload as unusable', () => {
    expect(isUsableReleasePayload(null, trusted)).toBe(false);
    expect(isUsableReleasePayload(undefined, trusted)).toBe(false);
    expect(isUsableReleasePayload({}, trusted)).toBe(false);
  });
});

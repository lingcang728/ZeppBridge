import { computed, ref, type Ref } from 'vue';
import { isUsableReleasePayload } from '../../lib/releaseAssets';
import type { DownloadPlatform, LatestRelease, ReleaseAsset } from './release';
import type { LandingCopy } from './types';

export const GITHUB_URL = 'https://github.com/lingcang728/ZeppBridge';
const RELEASE_URL = `${GITHUB_URL}/releases/latest`;
const RELEASE_ENDPOINT = '/api/release';

/** Mac 访客默认看到 macOS 按钮，其余一律 Windows；判断不出来就退回 Windows，另一个平台的入口始终在。 */
const isMacVisitor = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPad|iPhone|iPod/i.test(`${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`);
};

const isTrustedAssetUrl = (value: string): boolean => value.startsWith(`${GITHUB_URL}/releases/download/`);

/**
 * 落地页的下载按钮：读 /api/release 拿直链，读不到就退回 GitHub Release 页面。
 * 判据在 lib/releaseAssets.ts（那里能测）：Linux 包是可选的，缺了不能把整页打进 fallback。
 */
export const useDownloads = (t: Ref<LandingCopy>) => {
  const latest = ref<LatestRelease | null>(null);
  const state = ref<'loading' | 'ready' | 'fallback'>('loading');

  const load = async () => {
    try {
      const response = await fetch(RELEASE_ENDPOINT, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`release endpoint returned ${response.status}`);
      const payload = await response.json() as LatestRelease;
      if (!isUsableReleasePayload(payload.downloads, isTrustedAssetUrl)) throw new Error('invalid asset set');
      latest.value = payload;
      state.value = 'ready';
    } catch {
      state.value = 'fallback';
    }
  };

  const primaryPlatform = computed<DownloadPlatform>(() => (isMacVisitor() ? 'macos' : 'windows'));
  const secondaryPlatform = computed<DownloadPlatform>(() => (primaryPlatform.value === 'macos' ? 'windows' : 'macos'));
  const assetFor = (platform: DownloadPlatform): ReleaseAsset | null => {
    if (!latest.value) return null;
    return platform === 'windows' ? latest.value.downloads.windowsExe : latest.value.downloads.macosDmg;
  };
  const primary = computed(() => ({
    ...t.value.downloads[primaryPlatform.value],
    href: assetFor(primaryPlatform.value)?.url ?? RELEASE_URL,
  }));
  const secondary = computed(() => ({
    ...t.value.downloads[secondaryPlatform.value],
    href: assetFor(secondaryPlatform.value)?.url ?? RELEASE_URL,
  }));
  const msiHref = computed(() => latest.value?.downloads.windowsMsi.url ?? RELEASE_URL);
  /* Linux 的四个包：旧的 latest release 里没有它们，没有就整块不渲染，不留死链接。 */
  const linux = computed(() => {
    const downloads = latest.value?.downloads;
    if (!downloads) return [];
    return [
      { label: '.deb', asset: downloads.linuxDeb },
      { label: '.rpm', asset: downloads.linuxRpm },
      { label: 'AppImage', asset: downloads.linuxAppImage },
      { label: 'Flatpak', asset: downloads.linuxFlatpak },
    ]
      .filter((entry): entry is { label: string; asset: ReleaseAsset } => Boolean(entry.asset))
      .map((entry) => ({ label: entry.label, url: entry.asset.url }));
  });
  const linuxIsPreview = computed(() => latest.value?.downloads.linuxDeb?.preview === true);
  const statusText = computed(() => (state.value === 'ready'
    ? `v${latest.value?.version}  ${t.value.downloads.status.ready}`
    : t.value.downloads.status[state.value]));

  return { load, primary, secondary, msiHref, linux, linuxIsPreview, statusText };
};

/**
 * 下载页对 `/api/release` 的校验。
 *
 * 抽成纯函数是因为它坏过一次，而且坏得很安静：2.0.0 给 `/api/release` 加了
 * 四个可选的 Linux 包，而这里原本写的是 `assets.length !== 3`——一次纯粹的
 * 新增，把整个下载页打进了 fallback，Windows 和 macOS 的直链跟着一起没了。
 * 页面照样渲染、控制台照样干净，只是每个按钮都变成了「打开 GitHub」。
 *
 * 写在 `.vue` 里的时候没有任何东西能测它。放这里就能。
 */

/** 缺了任何一个就整页退回 GitHub Release 页面。 */
export const REQUIRED_DOWNLOADS = ['windowsExe', 'windowsMsi', 'macosDmg'] as const;

export interface ReleaseAssetLike {
  url: string;
}

/**
 * 这份 payload 能不能拿来做直链下载。
 *
 * 两条判据，都不看资产**个数**：
 *   1. 三个必需安装包都在（按名字查，不按个数）；
 *   2. 每一条 URL 都指向本仓库的 Release 下载路径。
 *
 * 第 2 条是安全边界：下载页会把这些 URL 直接放进 `href`，一个被改过的
 * 响应不该能把访客送到别的域名去。它对**所有**资产生效，包括以后新增的。
 */
export const isUsableReleasePayload = (
  downloads: Record<string, ReleaseAssetLike | undefined> | null | undefined,
  isTrustedAssetUrl: (url: string) => boolean,
): boolean => {
  if (!downloads) return false;
  for (const key of REQUIRED_DOWNLOADS) {
    if (!downloads[key]?.url) return false;
  }
  return Object.values(downloads).every(
    (asset) => typeof asset?.url === 'string' && isTrustedAssetUrl(asset.url),
  );
};

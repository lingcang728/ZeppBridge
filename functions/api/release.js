const GITHUB_LATEST_RELEASE_URL =
  'https://api.github.com/repos/lingcang728/ZeppBridge/releases/latest';

const CACHE_SECONDS = 300;

/*
 * 必须存在的资产。少一个就整个 502，不给半份下载页。
 *
 * 「fail closed」是刻意的：下载页少列一个平台，用户看到的是「这个平台没有
 * 支持」，而事实是构建挂了——那比一个明确的错误更难被发现。
 */
const requiredAssetPatterns = {
  windowsExe: /^ZeppBridge_[^/]+_x64-setup\.exe$/,
  windowsMsi: /^ZeppBridge_[^/]+_x64_en-US\.msi$/,
  macosDmg: /^ZeppBridge_[^/]+_aarch64\.dmg$/,
};

/*
 * 可选资产：Linux 的四个包。
 *
 * **必须是可选的**，因为它们从 2.0.0 才开始有。放进必需列表的话，这段代码
 * 一部署，`/api/release` 就会对着还挂在 latest 上的 1.1.5 整个 502——下载页
 * 会在新版发布之前先坏掉。
 *
 * Linux 目前是 preview：CI 能出包，但没有人在真实 Linux 桌面上跑通过
 * 登录 + Secret Service/KWallet（issue #11、PR #26 自己也这么写）。所以
 * 返回里带一个 `preview` 标记，下载页照着它标注，而不是把这句话写死在
 * 页面上、等哪天验证过了再有人记得去删。
 */
const optionalAssetPatterns = {
  linuxDeb: /^ZeppBridge_[^/]+_amd64\.deb$/,
  linuxRpm: /^ZeppBridge_[^/]+_x86_64\.rpm$/,
  linuxAppImage: /^ZeppBridge_[^/]+_x86_64\.AppImage$/,
  linuxFlatpak: /^ZeppBridge_[^/]+_x86_64\.flatpak$/,
};

/** 哪些下载项还没有经过真实设备验证。 */
const PREVIEW_KEYS = new Set(Object.keys(optionalAssetPatterns));

const publicAsset = (asset) => ({
  name: asset.name,
  url: asset.browser_download_url,
  size: asset.size,
  digest: asset.digest ?? null,
});

export const projectLatestRelease = (release) => {
  if (!release || release.draft || release.prerelease || !Array.isArray(release.assets)) {
    throw new Error('GitHub did not return a published stable release');
  }

  const selected = Object.fromEntries(
    Object.entries(requiredAssetPatterns).map(([key, pattern]) => {
      const asset = release.assets.find((candidate) => pattern.test(candidate.name));
      if (!asset?.browser_download_url) {
        throw new Error(`Latest release is missing ${key}`);
      }
      return [key, publicAsset(asset)];
    }),
  );

  for (const [key, pattern] of Object.entries(optionalAssetPatterns)) {
    const asset = release.assets.find((candidate) => pattern.test(candidate.name));
    // 缺了就不列。旧版本没有这些包，那不是错误。
    if (asset?.browser_download_url) {
      selected[key] = { ...publicAsset(asset), preview: PREVIEW_KEYS.has(key) };
    }
  }

  return {
    version: String(release.tag_name ?? '').replace(/^v/, ''),
    tagName: release.tag_name,
    publishedAt: release.published_at,
    releaseUrl: release.html_url,
    downloads: selected,
  };
};

const jsonResponse = (payload, status, cacheControl) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
  },
});

export async function onRequestGet(context) {
  const cache = typeof caches === 'undefined' ? null : caches.default;
  const cacheKey = new Request(context.request.url, { method: 'GET' });
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return cached;

  let upstream;
  try {
    upstream = await fetch(GITHUB_LATEST_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ZeppBridge-Pages',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch {
    return jsonResponse(
      { error: 'latest_release_unavailable' },
      502,
      'no-store',
    );
  }

  if (!upstream.ok) {
    return jsonResponse(
      { error: 'latest_release_unavailable' },
      502,
      'no-store',
    );
  }

  try {
    const payload = projectLatestRelease(await upstream.json());
    const response = jsonResponse(
      payload,
      200,
      `public, max-age=60, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`,
    );
    if (cache) context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch {
    return jsonResponse(
      { error: 'latest_release_incomplete' },
      502,
      'no-store',
    );
  }
}

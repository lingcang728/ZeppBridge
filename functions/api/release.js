const GITHUB_LATEST_RELEASE_URL =
  'https://api.github.com/repos/lingcang728/ZeppBridge/releases/latest';
const REPO_URL = 'https://github.com/lingcang728/ZeppBridge';

/*
 * 首选不走 API：每次发版 CI 都把 latest.json（版本号）和 SHA256SUMS.txt（全部安装包的文件名 + 校验值）
 * 作为附件传上去，`releases/latest/download/<文件>` 只跳到附件下载，不吃 API 的匿名额度。
 * 2026-10-14 上线当天，api.github.com 对 Cloudflare 共享出口几乎全部拒绝（匿名每 IP 每小时 60 次早被别人用光），
 * 下载页因此一直显示失败。API 留作备用（拿得到文件大小），两条都失败才用上一次成功的结果。
 */
const sumLine = /^([0-9a-f]{64})\s+\*?(\S+)$/;
export const releaseFromFiles = (manifest, sums) => {
  const version = String(manifest?.version ?? '');
  if (!/^\d+\.\d+\.\d+/.test(version)) throw new Error('latest.json has no version');
  const tag = `v${version}`;
  const assets = String(sums).split('\n').map((line) => line.trim().match(sumLine)).filter(Boolean)
    .map(([, hash, name]) => ({
      name,
      browser_download_url: `${REPO_URL}/releases/download/${tag}/${name}`,
      size: null,
      digest: `sha256:${hash}`,
    }));
  return { tag_name: tag, published_at: manifest.pub_date ?? null, html_url: `${REPO_URL}/releases/tag/${tag}`, draft: false, prerelease: false, assets };
};

const fetchFromFiles = async () => {
  const [manifest, sums] = await Promise.all([
    fetch(`${REPO_URL}/releases/latest/download/latest.json`, { headers: { 'User-Agent': 'ZeppBridge-Pages' } }),
    fetch(`${REPO_URL}/releases/latest/download/SHA256SUMS.txt`, { headers: { 'User-Agent': 'ZeppBridge-Pages' } }),
  ]);
  if (!manifest.ok || !sums.ok) throw new Error('release files unavailable');
  return projectLatestRelease(releaseFromFiles(await manifest.json(), await sums.text()));
};

const fetchFromApi = async () => {
  const upstream = await fetch(GITHUB_LATEST_RELEASE_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ZeppBridge-Pages',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!upstream.ok) throw new Error('github api unavailable');
  return projectLatestRelease(await upstream.json());
};

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

/*
 * 上一次成功拿到的结果另存一份（每个边缘节点各一份，留一周）。GitHub 匿名接口从 Cloudflare 的共享出口
 * 经常被限流或偶发失败（2026-10-14 上线当天实测约一半请求 502）；那时宁可给上一次的结果，也不能让
 * 下载页因为一次失败就显示「尚未发布」。真正的新版要等这份过期或下一次成功才会换上，最多晚 5 分钟。
 */
const LAST_GOOD_SECONDS = 7 * 24 * 60 * 60;

export async function onRequestGet(context) {
  const cache = typeof caches === 'undefined' ? null : caches.default;
  // 缓存键不带查询参数：随便加个 ?x= 就能绕过缓存、把 GitHub 的匿名额度打光。
  const url = new URL(context.request.url);
  const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: 'GET' });
  const lastGoodKey = new Request(`${url.origin}${url.pathname}?last-good`, { method: 'GET' });
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return cached;

  const unavailable = async (error) => {
    const stale = cache ? await cache.match(lastGoodKey) : null;
    if (stale) {
      const body = await stale.text();
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Release-Stale': '1',
        },
      });
    }
    return jsonResponse({ error }, 502, 'no-store');
  };

  let payload;
  try {
    payload = await fetchFromFiles();
  } catch {
    try {
      payload = await fetchFromApi();
    } catch {
      // 版本已经建好、CI 还在逐个上传安装包时也会走到这里：先给上一次完整的结果。
      return unavailable('latest_release_unavailable');
    }
  }

  const response = jsonResponse(
    payload,
    200,
    `public, max-age=60, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`,
  );
  if (cache) {
    context.waitUntil(cache.put(cacheKey, response.clone()));
    context.waitUntil(cache.put(lastGoodKey, jsonResponse(payload, 200, `public, s-maxage=${LAST_GOOD_SECONDS}`)));
  }
  return response;
}

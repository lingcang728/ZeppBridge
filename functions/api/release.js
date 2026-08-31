const GITHUB_LATEST_RELEASE_URL =
  'https://api.github.com/repos/lingcang728/ZeppBridge/releases/latest';

const CACHE_SECONDS = 300;

const assetPatterns = {
  windowsExe: /^ZeppBridge_[^/]+_x64-setup\.exe$/,
  windowsMsi: /^ZeppBridge_[^/]+_x64_en-US\.msi$/,
  macosDmg: /^ZeppBridge_[^/]+_aarch64\.dmg$/,
};

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
    Object.entries(assetPatterns).map(([key, pattern]) => {
      const asset = release.assets.find((candidate) => pattern.test(candidate.name));
      if (!asset?.browser_download_url) {
        throw new Error(`Latest release is missing ${key}`);
      }
      return [key, publicAsset(asset)];
    }),
  );

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

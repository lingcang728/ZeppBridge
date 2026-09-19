import catalogJson from '../assets/devices/catalog.json';

export type DeviceKind = 'watch' | 'strap' | 'ring' | 'band' | 'earbuds' | 'scale' | 'unknown';
export type DeviceCatalogStatus = 'active' | 'historical';

export interface DeviceCatalogEntry {
  catalog_id: string;
  canonical_name: string;
  display_name: string;
  name_zh?: string | null;
  kind: DeviceKind;
  model_codes: string[];
  aliases: string[];
  region: string[];
  status: DeviceCatalogStatus;
  supported: boolean;
  canonical_device_key?: string;
  official_page?: string;
  official_url: string;
  image_source_url?: string | null;
  asset_source?: string | null;
  image_key?: string | null;
  asset_hash?: string | null;
  checked_at: string;
  provenance: string;
}

export interface DeviceCatalogDocument {
  version: number;
  checked_at: string;
  sources: string[];
  devices: DeviceCatalogEntry[];
}

const document = catalogJson as DeviceCatalogDocument;

/** Versioned snapshot of the official catalog. No runtime network lookup is performed. */
export const deviceCatalog: readonly DeviceCatalogEntry[] = document.devices;

/**
 * Assets are discovered at build time. Adding a catalog row only requires an
 * image pair in this directory; there is no 48-item hand-maintained import
 * list to drift out of sync.
 */
const imageModules = import.meta.glob('../assets/devices/*.webp', {
  eager: true,
  import: 'default',
  query: '?url',
}) as Record<string, string>;
const thumbnailModules = import.meta.glob('../assets/devices/*-thumb.png', {
  eager: true,
  import: 'default',
  query: '?url',
}) as Record<string, string>;

const keyFromPath = (path: string, suffix: string): string | null => {
  const normalizedPath = path.replace(/\\/g, '/');
  const match = normalizedPath.match(new RegExp(`/([^/]+)${suffix}$`));
  return match?.[1] ?? null;
};

/**
 * 把 Vite 给的资源地址变成一个**和当前路由无关**的绝对地址。
 *
 * 早先这里把地址改写成相对形式（`/src/... → ./src/...`）。相对地址是相对
 * *当前文档 URL* 解析的：在 `/settings` 下 `./assets/x.webp` 正好是
 * `/assets/x.webp`，但在 `/devices/9AC6` 这种两段式路由下就变成了
 * `/devices/assets/x.webp`——404，于是设备图片全成了破图。
 *
 * 改成用本模块自己的 URL 作基准解析。构建产物里 Vite 发的本来就是
 * `new URL("x.webp", import.meta.url).href`（带协议的绝对地址），会走上面
 * 那个提前返回；dev 下的 `/src/assets/...` 则会被补成完整地址。两种情况都
 * 不再依赖当前页面在第几层路由。data URL 原样返回。
 */
const runtimeAssetUrl = (source: string): string => {
  if (/^(?:data:|https?:|asset:|blob:)/u.test(source)) return source;
  try {
    return new URL(source, import.meta.url).href;
  } catch {
    return source;
  }
};

export const localDeviceAssets: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(imageModules)
      .map(([path, source]) => [keyFromPath(path, '\\.webp'), runtimeAssetUrl(source)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0])),
  ),
);

export const localDeviceThumbnails: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(thumbnailModules)
      .map(([path, source]) => [keyFromPath(path, '-thumb\\.png'), runtimeAssetUrl(source)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0])),
  ),
);

export function deviceImageFor(kind: DeviceKind | string | undefined, imageKey?: string | null): string {
  if (imageKey && localDeviceAssets[imageKey]) return localDeviceAssets[imageKey];
  return deviceFallbackFor(kind);
}

/** Missing images are rendered by DeviceVisual's inline, CSP-safe SVG fallback. */
export function deviceFallbackFor(_kind: DeviceKind | string | undefined): string {
  return '';
}

export function deviceThumbnailFor(kind: DeviceKind | string | undefined, imageKey?: string | null): string {
  if (imageKey && localDeviceThumbnails[imageKey]) return localDeviceThumbnails[imageKey];
  return deviceImageFor(kind, imageKey);
}

/**
 * 后端 `profile.catalog_id` 有时写的是 `canonical_device_key`，不是目录行的
 * `catalog_id`。指认选择器两边都对一下，否则已指认的型号打不开对应那一张。
 */
export function catalogEntryMatchesId(
  entry: DeviceCatalogEntry,
  value?: string | null,
): boolean {
  if (!value) return false;
  return entry.catalog_id === value
    || entry.canonical_device_key === value
    || entry.canonical_name === value;
}

import catalogJson from '../assets/devices/catalog.json';

export type DeviceKind = 'watch' | 'strap' | 'ring' | 'band' | 'earbuds' | 'scale' | 'unknown';
export type DeviceCatalogStatus = 'active' | 'historical';
export type DeviceMatchStatus = 'exact' | 'alias' | 'unknown';

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

export interface DeviceCatalogMatch {
  entry: DeviceCatalogEntry;
  status: Exclude<DeviceMatchStatus, 'unknown'>;
  matched_by: 'model_code' | 'alias';
  matched_value: string;
}

export interface DeviceCatalogMatchInput {
  modelCodes?: string[];
  productNames?: string[];
  deviceNames?: string[];
  displayName?: string;
}

const document = catalogJson as DeviceCatalogDocument;

/** Versioned snapshot of the official catalog. No runtime network lookup is performed. */
export const deviceCatalog: readonly DeviceCatalogEntry[] = document.devices;
export const deviceCatalogVersion = document.version;
export const deviceCatalogCheckedAt = document.checked_at;
export const deviceCatalogSources: readonly string[] = document.sources;

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
 * Vite emits imported assets according to the configured base. Keep a
 * defensive relative form for old/dev bundles that still contain a leading
 * slash; Tauri's asset protocol does not have the host-root path those URLs
 * imply. Data URLs (the original silhouette fallback) are left untouched.
 */
const runtimeAssetUrl = (source: string): string => {
  if (/^(?:data:|https?:|asset:|blob:)/u.test(source)) return source;
  return source.replace(/^\/+/, './');
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

export const normalizeDeviceText = (value: string): string =>
  value.normalize('NFKC').toLocaleLowerCase().replace(/[\u0000-\u001f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');

const deviceWords = (value: string): string[] =>
  value.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

const containsCompleteAlias = (displayName: string, alias: string): boolean => {
  const aliasWords = deviceWords(alias);
  // A single generic word such as "Balance" is intentionally not enough to
  // infer a product from a nickname. Numbered/two-word aliases are stable.
  if (aliasWords.length < 2 && !aliasWords.some((word) => /\d/u.test(word))) return false;
  // User nicknames may put a CJK prefix directly before the Latin product
  // name (for example, "凌苍的T-Rex 3").  The token matcher merges that
  // prefix with the first Latin word, so also scan the punctuation-free form
  // while retaining ASCII boundaries to reject "T-Rex 30".
  const display = normalizeDeviceText(displayName);
  const needle = normalizeDeviceText(alias);
  if (!needle) return false;
  let offset = 0;
  while (offset < display.length) {
    const found = display.indexOf(needle, offset);
    if (found < 0) break;
    const start = found;
    const end = start + needle.length;
    const before = start > 0 ? display[start - 1] : undefined;
    const after = end < display.length ? display[end] : undefined;
    const asciiBoundary = (value: string | undefined) => value === undefined || !/[A-Za-z0-9]/u.test(value);
    if (asciiBoundary(before) && asciiBoundary(after)) return true;
    offset = end;
  }
  return false;
};

const unique = (values: readonly (string | undefined | null)[]): string[] =>
  values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));

/**
 * Match in the same strict order used by the Rust IPC parser:
 * stable model code, exact product/device alias, then a complete alias in a
 * display nickname. Generic fuzzy matching is deliberately not used.
 */
export function matchDeviceCatalog(input: DeviceCatalogMatchInput): DeviceCatalogMatch | null {
  const matchable = (item: DeviceCatalogEntry): boolean => item.supported && item.status === 'active';
  const modelCodes = unique(input.modelCodes ?? []);
  for (const candidate of modelCodes) {
    const normalized = normalizeDeviceText(candidate);
    if (!normalized) continue;
    const entry = deviceCatalog.find((item) =>
      matchable(item) && item.model_codes.some((code) => normalizeDeviceText(code) === normalized),
    );
    if (entry) {
      return { entry, status: 'exact', matched_by: 'model_code', matched_value: candidate };
    }
  }

  const exactNames = unique([...(input.productNames ?? []), ...(input.deviceNames ?? [])]);
  for (const candidate of exactNames) {
    const normalized = normalizeDeviceText(candidate);
    if (!normalized) continue;
    const entry = deviceCatalog.find((item) =>
      matchable(item)
      && [item.display_name, item.name_zh, ...item.aliases]
        .filter((alias): alias is string => Boolean(alias))
        .some((alias) => normalizeDeviceText(alias) === normalized),
    );
    if (entry) {
      return { entry, status: 'alias', matched_by: 'alias', matched_value: candidate };
    }
  }

  if (input.displayName) {
    const entry = deviceCatalog.find((item) =>
      matchable(item)
      && [item.display_name, item.name_zh, ...item.aliases]
        .filter((alias): alias is string => Boolean(alias))
        .some((alias) => containsCompleteAlias(input.displayName!, alias)),
    );
    if (entry) {
      return { entry, status: 'alias', matched_by: 'alias', matched_value: input.displayName };
    }
  }
  return null;
}

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

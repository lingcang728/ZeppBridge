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

// 图片查找搬到 deviceImages.ts：首屏只要按 image_key 取图，不该把整份目录 JSON（约 13 kB gzip）一起拉进来。
export { deviceFallbackFor, deviceImageFor, deviceThumbnailFor, localDeviceAssets, localDeviceThumbnails } from './deviceImages';

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

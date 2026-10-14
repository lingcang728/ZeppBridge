import { describe, expect, it } from 'vitest';
import {
  catalogEntryMatchesId,
  localDeviceAssets,
  localDeviceThumbnails,
  type DeviceCatalogEntry,
} from '../deviceCatalog';

const entry = (overrides: Partial<DeviceCatalogEntry>): DeviceCatalogEntry => ({
  catalog_id: 'amazfit-balance-2',
  canonical_name: 'Amazfit Balance 2',
  display_name: 'Amazfit Balance 2',
  kind: 'watch',
  model_codes: [],
  aliases: [],
  region: [],
  status: 'active',
  supported: true,
  official_url: '',
  checked_at: '',
  provenance: 'test',
  ...overrides,
});

describe('catalogEntryMatchesId', () => {
  it('matches catalog_id, canonical_device_key, or canonical_name', () => {
    const row = entry({ canonical_device_key: 'balance-2' });
    expect(catalogEntryMatchesId(row, 'amazfit-balance-2')).toBe(true);
    expect(catalogEntryMatchesId(row, 'balance-2')).toBe(true);
    expect(catalogEntryMatchesId(row, 'Amazfit Balance 2')).toBe(true);
    expect(catalogEntryMatchesId(row, 'amazfit-t-rex-3')).toBe(false);
    expect(catalogEntryMatchesId(row, null)).toBe(false);
  });
});

/* 缩略图和产品图同是 .webp：产品图的 glob 必须排除 `*-thumb.webp`，否则设备页会拿到
   一张 72 px 的缩略图当大图，两张表也会对不齐。 */
describe('device image maps', () => {
  it('keeps thumbnails out of the product images and pairs every image with one', () => {
    const images = Object.keys(localDeviceAssets).sort();
    expect(images.length).toBeGreaterThan(0);
    expect(images.some((key) => key.endsWith('-thumb'))).toBe(false);
    expect(Object.keys(localDeviceThumbnails).sort()).toEqual(images);
  });
});

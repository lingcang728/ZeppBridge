import { describe, expect, it } from 'vitest';
import { catalogEntryMatchesId, type DeviceCatalogEntry } from '../deviceCatalog';

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

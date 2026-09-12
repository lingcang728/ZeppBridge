import { describe, expect, it, vi } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import DeviceMarquee from '../DeviceMarquee.vue';

vi.mock('../../lib/deviceCatalog', () => ({
  deviceCatalog: [
    { catalog_id: 'pictured', display_name: 'Pictured watch', status: 'active', supported: true, kind: 'watch', image_key: 'watch' },
    { catalog_id: 'missing', display_name: 'Missing watch', status: 'active', supported: true, kind: 'watch', image_key: null },
  ],
  deviceThumbnailFor: (_kind: string, key: string | null) => key ? '/watch.png' : '',
}));

describe('device marquee images', () => {
  it('renders available images without empty image requests', async () => {
    const html = await renderToString(createSSRApp(DeviceMarquee));
    expect(html).toContain('src="/watch.png"');
    expect(html).not.toContain('src=""');
    expect(html).not.toContain('Missing watch');
  });
});

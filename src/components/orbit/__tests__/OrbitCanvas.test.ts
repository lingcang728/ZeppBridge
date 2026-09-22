import { describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import OrbitCanvas from '../OrbitCanvas.vue';
import type { OrbitNode } from '../../../lib/orbit/types';

/*
 * SSR string assertions only (same pattern as DeviceMarquee.test.ts): the
 * node environment has no DOM, so this checks the rendered markup contract —
 * node count, dashed-candidate classes, tabindex, aria labels — not events.
 */
const nodes: OrbitNode[] = [
  { id: 'w1', category: 'workout', label: 'Workout', sublabel: 'last 14 days', state: 'member', count: 4 },
  { id: 's1', category: 'sleep', label: 'Sleep', state: 'member', count: 14 },
  { id: 'h1', category: 'heart_rate', label: 'Heart rate', state: 'candidate' },
  { id: 'a1', category: 'attachment', label: 'Attachment', state: 'disabled' },
];

const render = async (props?: Partial<{ zoom: number; activeId: string | null; readonly: boolean }>) =>
  renderToString(createSSRApp(OrbitCanvas, {
    center: { label: 'Analysis task', sublabel: 'synthetic' },
    nodes,
    zoom: props?.zoom ?? 1,
    activeId: props?.activeId ?? null,
    readonly: props?.readonly ?? false,
  }));

describe('OrbitCanvas SSR markup', () => {
  it('renders every node as a focusable button with an aria label', async () => {
    const html = await render();
    expect(html.match(/data-node-id="/g)).toHaveLength(4);
    expect(html).toContain('data-node-id="w1"');
    expect(html).toContain('data-node-id="a1"');
    expect(html.match(/role="button"/g)).toHaveLength(4);
    // Every node group is tabbable.
    expect((html.match(/tabindex="0"/g) ?? []).length).toBeGreaterThanOrEqual(5); // 4 nodes + canvas group
    // Node aria-labels carry the label text.
    expect(html).toContain('Workout');
    expect(html).toContain('Heart rate');
  });

  it('marks node states with distinct classes (dashed candidates, disabled)', async () => {
    const html = await render();
    expect(html).toContain('state-member');
    expect(html).toContain('state-candidate');
    expect(html).toContain('state-disabled');
    // The candidate ring guide + dashed styling hook exist in the markup.
    expect(html).toContain('ring-candidate');
    expect(html).toContain('ring-member');
  });

  it('renders member links to the centre but none for candidates', async () => {
    const html = await render();
    // Two members → two link lines (class="link").
    expect(html.match(/class="link"/g)).toHaveLength(2);
  });

  it('renders the centre disc with the task label', async () => {
    const html = await render();
    expect(html).toContain('orbit-center');
    expect(html).toContain('Analysis task');
  });

  it('exposes the canvas group label and zoom controls', async () => {
    const html = await render();
    expect(html).toContain('role="group"');
    expect(html.match(/class="[^"]*\borbit-tool\b/g)).toHaveLength(3);
    expect(html).toContain('100%');
  });

  it('applies the active id visual state', async () => {
    const html = await render({ activeId: 'w1' });
    expect(html).toContain('is-active');
  });
});

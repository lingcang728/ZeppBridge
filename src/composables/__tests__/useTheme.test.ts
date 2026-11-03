import { afterEach, describe, expect, it, vi } from 'vitest';
import { revealTheme } from '../useTheme';

afterEach(() => vi.unstubAllGlobals());

describe('theme changes with a fallback renderer', () => {
  it('changes the theme without calling the exposed but unsafe native transition API', () => {
    const transition = vi.fn(() => { throw new Error('WebKit fallback renderer would abort'); });
    vi.stubGlobal('document', { startViewTransition: transition });
    vi.stubGlobal('window', {
      __ZB_DISABLE_VIEW_TRANSITIONS__: true,
      matchMedia: () => ({ matches: false }),
    });
    const update = vi.fn();

    revealTheme(update, { x: 100, y: 100 });

    expect(update).toHaveBeenCalledOnce();
    expect(transition).not.toHaveBeenCalled();
  });
});

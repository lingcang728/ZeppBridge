import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollToSection } from '../motion';

afterEach(() => vi.unstubAllGlobals());

describe('landing anchor navigation', () => {
  it.each([false, true])('moves focus without an extra scroll; reduced motion=%s', (reduced) => {
    const target = { hasAttribute: () => false, setAttribute: vi.fn(), focus: vi.fn(), scrollIntoView: vi.fn() };
    const replaceState = vi.fn();
    vi.stubGlobal('document', { getElementById: () => target });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }), history: { replaceState } });
    scrollToSection('faq');
    expect(target.setAttribute).toHaveBeenCalledWith('tabindex', '-1');
    expect(target.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '#faq');
  });

  it('preserves an existing focus contract and ignores missing sections', () => {
    const target = { hasAttribute: () => true, setAttribute: vi.fn(), focus: vi.fn(), scrollIntoView: vi.fn() };
    const replaceState = vi.fn();
    vi.stubGlobal('document', { getElementById: (id: string) => id === 'story' ? target : null });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), history: { replaceState } });
    scrollToSection('story');
    scrollToSection('missing');
    expect(target.setAttribute).not.toHaveBeenCalled();
    expect(target.focus).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledTimes(1);
  });
});

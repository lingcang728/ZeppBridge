import { describe, expect, it } from 'vitest';
import { isLinuxWebView, resolveLite } from '../../composables/useEffects';

// issue #133：Linux 的 WebKitGTK 默认走低特效；Windows / macOS 默认完整；手动选的永远算数。
describe('effects mode', () => {
  const linux = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)';
  const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)';
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';

  it('recognises the Linux desktop webview, not Android', () => {
    expect(isLinuxWebView(linux)).toBe(true);
    expect(isLinuxWebView(windows)).toBe(false);
    expect(isLinuxWebView(android)).toBe(false);
  });

  it('auto means low effects on Linux only; an explicit choice wins everywhere', () => {
    expect(resolveLite('auto', true)).toBe(true);
    expect(resolveLite('auto', false)).toBe(false);
    expect(resolveLite('full', true)).toBe(false);
    expect(resolveLite('lite', false)).toBe(true);
  });
});

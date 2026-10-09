import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { COPY } from '../copy';
import { GITHUB_URL, isMobileVisitor, useDownloads } from '../useDownloads';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const payload = () => ({ version: '3.0.0', downloads: {
  windowsExe: { url: `${GITHUB_URL}/releases/download/v3.0.0/app.exe` },
  windowsMsi: { url: `${GITHUB_URL}/releases/download/v3.0.0/app.msi` },
  macosDmg: { url: `${GITHUB_URL}/releases/download/v3.0.0/app.dmg` },
} });
const environment = () => {
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Windows', maxTouchPoints: 0 });
};
describe('website download recovery', () => {
  it.each(['2.4.4', '3.0.0-beta.52'])('does not enable an installer for %s on the v3 stable website', async version => {
    environment(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...payload(), version }) }));
    const downloads = useDownloads(ref(COPY.en)); await downloads.load();
    expect(downloads.state.value).toBe('fallback');
  });
  it('exposes explicit Windows/macOS installers and safely falls back without Linux assets', async () => {
    environment(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload() }));
    const downloads = useDownloads(ref(COPY.en)); await downloads.load();
    expect(downloads.windows.value.href).toMatch(/app\.exe$/);
    expect(downloads.macos.value.href).toMatch(/app\.dmg$/);
    expect(downloads.linux.value).toEqual([]);
    expect(downloads.state.value).toBe('ready');
  });
  it('invalid optional URL clears previously trusted state rather than retaining old installers', async () => {
    environment(); const fetcher = vi.fn().mockResolvedValueOnce({ ok:true, json:async () => payload() }).mockResolvedValueOnce({ ok:true, json:async () => ({ ...payload(), downloads: { ...payload().downloads, linuxDeb: { url: 'https://evil.invalid/x.deb' } } }) });
    vi.stubGlobal('fetch', fetcher);
    const downloads = useDownloads(ref(COPY.en)); await downloads.load(); await downloads.load();
    expect(downloads.state.value).toBe('fallback');
    expect(downloads.windows.value.href).toBe(`${GITHUB_URL}/releases/latest`);
    expect(downloads.macos.value.href).toBe(`${GITHUB_URL}/releases/latest`);
  });
  it('bounds a stalled release request and restores usable release links', async () => {
    vi.useFakeTimers(); environment();
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    const downloads = useDownloads(ref(COPY.en)); const task=downloads.load();
    await vi.advanceTimersByTimeAsync(8000); await task;
    expect(downloads.state.value).toBe('fallback');
  });
  it.each([
    ['MacIntel','Safari',5,true], ['MacIntel','Safari',0,false], ['Linux armv8l','Android',1,true], ['iPhone','iPhone',1,true], ['Win32','Windows',0,false],
  ])('identifies mobile visitors %s/%s without treating iPad as desktop Mac', (platform,userAgent,maxTouchPoints,expected) => {
    vi.stubGlobal('navigator',{platform,userAgent,maxTouchPoints}); expect(isMobileVisitor()).toBe(expected);
  });
});

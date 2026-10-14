import { createSSRApp, h, ref } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppStatus, DeviceCacheMetadata, LoginStatus } from '../../../types';
import type { DeviceCardModel } from '../../useDevices';

const appStatus = ref<AppStatus>();
const isSyncing = ref(false);
const runSync = vi.fn(async () => null);
const refreshStatus = vi.fn(async () => appStatus.value);
const loadDevices = vi.fn(async () => {});
const models = ref<DeviceCardModel[]>([]);
const deviceError = ref<string | null>(null);
const deviceCache = ref<DeviceCacheMetadata | null>(null);
let onLogin: (status: LoginStatus) => void;

vi.mock('../../useSyncController', () => ({
  useSyncController: () => ({
    appStatus, isSyncing, runSync, refreshStatus,
    syncProgress: ref(null), dataReady: ref({ phase: 'idle' }), pickUpReady: vi.fn(),
  }),
}));
vi.mock('../../useDevices', () => ({
  deviceStateLabel: (state: string) => state,
  useDevices: () => ({ models, cache: deviceCache, loading: ref(false), error: deviceError, load: loadDevices }),
  useDeviceAssignment: () => ({ assignError: ref(null), assignMessage: ref(null) }),
}));
vi.mock('../../../lib/bridge', () => ({
  backend: {
    listen: vi.fn(async (_event: string, callback: typeof onLogin) => { onLogin = callback; return () => {}; }),
    getLoginStatus: vi.fn(async () => ({ state: 'idle', message: '', page_url: '' })),
    startWebLogin: vi.fn(async () => ({ state: 'waiting', message: '', page_url: '' })),
  },
  isDesktop: () => false,
  toUserMessage: (_error: unknown, fallback: string) => fallback,
}));
vi.mock('../context', () => ({ useSettingsContext: () => ({ auth, official }) }));
vi.mock('../../../views/settings/DiagnosticReportForm.vue', () => ({ default: { render: () => h('form') } }));

import { createAuthFlow } from '../useAuthFlow';
import { createSettingsFeedback } from '../useSettingsFeedback';
import { backend } from '../../../lib/bridge';
import { setLocale } from '../../../i18n';
import AccountSection from '../../../views/settings/sections/AccountSection.vue';
import AuthSection from '../../../views/settings/sections/AuthSection.vue';
import DevicesSection from '../../../views/settings/sections/DevicesSection.vue';

let auth: ReturnType<typeof createAuthFlow>;
const official = {
  connected: ref(true), waiting: ref(false), needsReauth: ref(false), busy: ref(false),
  status: ref({ nickname: 'Test account' }), failureText: ref(null),
};
const status = (patch: Partial<AppStatus> = {}): AppStatus => ({
  configured: false, auth_state: 'unconfigured', connection_state: 'connected', data_source: 'official',
  streams: [], capabilities: [], retention_days: 30, ...patch,
});
const render = async (component: typeof AccountSection | typeof AuthSection | typeof DevicesSection) => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }] });
  await router.push('/');
  return renderToString(createSSRApp(component).use(router));
};

beforeEach(() => {
  vi.clearAllMocks();
  setLocale('en');
  appStatus.value = status();
  isSyncing.value = false;
  official.connected.value = true;
  models.value = [];
  deviceError.value = null;
  deviceCache.value = null;
  vi.mocked(backend.getLoginStatus).mockResolvedValue({ state: 'idle', message: '', page_url: '' });
  auth = createAuthFlow(createSettingsFeedback());
});

describe('advanced data authentication is independent of official authorization', () => {
  it('official-only: reports advanced data disconnected and exposes both login entries', async () => {
    const account = await render(AccountSection);
    expect(account).toContain('Official connected · Advanced data not connected');
    expect(account).toContain('Connect advanced data');
    expect(await render(AuthSection)).not.toContain('In use');
    expect(auth.connected.value).toBe(false);
    expect(auth.accountRecognized.value).toBe(false);
    await auth.startLogin();
    expect(backend.startWebLogin).toHaveBeenCalledWith('en');
    expect(auth.loginInProgress.value).toBe(true);
  });

  it.each(['legacy', 'both'] as const)('%s: verified advanced credentials stay connected', async (source) => {
    appStatus.value = status({ configured: true, auth_state: 'verified', data_source: source });
    official.connected.value = source === 'both';
    expect(auth.connected.value).toBe(true);
    expect(await render(AccountSection)).toContain('Advanced data connected');
    expect(await render(AuthSection)).toContain('In use');
  });

  it('stored, unverified credentials offer verification rather than claiming connected', async () => {
    appStatus.value = status({ configured: true, auth_state: 'configured', connection_state: 'configured', data_source: 'both' });
    expect(auth.configuredOnly.value).toBe(true);
    const html = await render(AccountSection);
    expect(html).toContain('Advanced data not verified');
    expect(html).toContain('Verify');
  });

  it('expired advanced credentials offer a new login even with official authorization', async () => {
    appStatus.value = status({ configured: true, auth_state: 'needs_reauth', connection_state: 'needs_reauth', data_source: 'both' });
    expect(auth.needsReauth.value).toBe(true);
    const html = await render(AccountSection);
    expect(html).toContain('Advanced data needs re-authorizing');
    expect(html).toContain('Connect advanced data');
  });

  it('official expiration cannot be mistaken for advanced expiration', () => {
    appStatus.value = status({ connection_state: 'needs_reauth', data_source: 'none' });
    expect(auth.needsReauth.value).toBe(false);
    expect(auth.connected.value).toBe(false);
  });

  it('reacts to advanced credentials being connected and cleared', () => {
    expect(auth.connected.value).toBe(false);
    appStatus.value = status({ configured: true, auth_state: 'verified', data_source: 'both' });
    expect(auth.connected.value).toBe(true);
    appStatus.value = status();
    expect(auth.connected.value).toBe(false);
  });
});

describe('device list evidence', () => {
  it('official-only without workout evidence: allows refresh without claiming auth failed or a device exists', async () => {
    deviceError.value = 'Zepp authentication is not configured';
    deviceCache.value = { status: 'unavailable', refreshed: false, refresh_error_code: 'err.sync.not_connected' };
    const html = await render(DevicesSection);
    expect(html).not.toContain('Advanced data not connected');
    expect(html).toContain('No physical device');
    expect(html).not.toContain('Unidentified device found');
    expect(html).toContain('Re-identify devices');
    expect(html).not.toContain('Zepp authentication is not configured');
  });

  it('official-only: preserves genuine device refresh errors', async () => {
    deviceError.value = 'Cannot read the local database';
    deviceCache.value = { status: 'unavailable', refreshed: false, refresh_error_code: 'err.core.io' };
    expect(await render(DevicesSection)).toContain('Cannot read the local database');
  });

  it('official-only: an actual unknown workout device can be opened and assigned', async () => {
    models.value = [{ profile: { device_id: '99999999', match_status: 'unknown' }, canonicalName: 'Amazfit Prototype', state: 'unknown' } as DeviceCardModel];
    const html = await render(DevicesSection);
    expect(html).toContain('Unidentified device found');
    expect(html).toContain('/devices/99999999');
    expect(html).toContain('Re-identify devices');
  });

  it('official-only: a recognized workout device leaves advanced data disconnected', async () => {
    models.value = [{ profile: { device_id: '10551555', match_status: 'exact' }, canonicalName: 'Amazfit T-Rex 3 Pro', state: 'account' } as DeviceCardModel];
    const html = await render(DevicesSection);
    expect(html).toContain('Amazfit T-Rex 3 Pro');
    expect(html).toContain('/devices/10551555');
    expect(html).toContain('Re-identify devices');
    expect(html).not.toContain('Unidentified device found');
    expect(await render(AccountSection)).toContain('Official connected · Advanced data not connected');
  });

  it('official authorization cannot enable fallback while expired advanced credentials take priority', async () => {
    appStatus.value = status({ configured: true, auth_state: 'needs_reauth', connection_state: 'needs_reauth', data_source: 'both' });
    expect(await render(DevicesSection)).not.toContain('Re-identify devices');
  });

  it('an empty authenticated list is not evidence of an unidentified device', async () => {
    appStatus.value = status({ configured: true, auth_state: 'verified', data_source: 'both' });
    const html = await render(DevicesSection);
    expect(html).toContain('No physical device');
    expect(html).toContain('Re-identify devices');
    expect(html).not.toContain('Unidentified device found');
  });

  it('an actual unknown device still gets model assignment guidance', async () => {
    appStatus.value = status({ configured: true, auth_state: 'verified', data_source: 'both' });
    models.value = [{ profile: { device_id: 'test-device', match_status: 'unknown' }, canonicalName: 'Unknown watch', state: 'unknown' } as DeviceCardModel];
    const html = await render(DevicesSection);
    expect(html).toContain('Unidentified device found');
    expect(html).toContain('/devices/test-device');
  });

  it('cached known devices remain visible after advanced credentials are cleared', async () => {
    models.value = [{ profile: { device_id: 'test-device', match_status: 'exact' }, canonicalName: 'Amazfit T-Rex 3 Pro', state: 'cached' } as DeviceCardModel];
    expect(await render(DevicesSection)).toContain('Amazfit T-Rex 3 Pro');
  });
});

describe('connecting advanced data after an official sync', () => {
  const connected: LoginStatus = { state: 'connected', message: '', page_url: '' };

  it('starts one new sync and refreshes devices despite existing official sync history', async () => {
    appStatus.value = status({ last_cloud_sync_at: '2026-10-14T12:00:00Z' });
    await auth.attach();
    onLogin(connected);
    onLogin(connected);
    await vi.waitFor(() => expect(runSync).toHaveBeenCalledTimes(1));
    expect(runSync).toHaveBeenCalledWith('incremental', undefined, { silent: true, waited: true, skipProbe: true });
    expect(loadDevices).toHaveBeenCalledWith(true);
    auth.detach();
  });

  it('waits for the in-flight official sync before starting a new advanced sync', async () => {
    let finish!: () => void;
    const running = new Promise<null>((resolve) => { finish = () => resolve(null); });
    runSync.mockReturnValueOnce(running);
    isSyncing.value = true;
    await auth.attach();
    onLogin(connected);
    await vi.waitFor(() => expect(runSync).toHaveBeenCalledTimes(1));
    expect(loadDevices).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(runSync).toHaveBeenCalledTimes(2));
    expect(runSync).toHaveBeenLastCalledWith('incremental', undefined, { silent: true, waited: true, skipProbe: true });
    auth.detach();
  });

  it('replaying connected status on opening settings never triggers sync or cloud refresh', async () => {
    vi.mocked(backend.getLoginStatus).mockResolvedValue(connected);
    await auth.attach();
    expect(runSync).not.toHaveBeenCalled();
    expect(loadDevices).not.toHaveBeenCalled();
    auth.detach();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSettingsFeedback } from '../useSettingsFeedback';

const mocks = vi.hoisted(() => ({
  listen: vi.fn(async () => () => {}),
  getLoginStatus: vi.fn(),
  manualAuth: vi.fn(),
  recoverAdvancedCredentials: vi.fn(),
  cancelWebLogin: vi.fn(),
  startWebLogin: vi.fn(),
  refreshStatus: vi.fn(async () => null),
  runSync: vi.fn(async () => {}),
  loadDevices: vi.fn(async () => {}),
}));
vi.mock('../../../lib/bridge', () => ({ backend: mocks, toUserMessage: () => 'Store unavailable', errorCode: () => undefined }));
vi.mock('../../useDevices', () => ({ deviceStateLabel: () => '', useDevices: () => ({ load: mocks.loadDevices }) }));
vi.mock('../../useSyncController', async () => {
  const { ref } = await import('vue');
  return { useSyncController: () => ({ appStatus: ref(null), refreshStatus: mocks.refreshStatus, runSync: mocks.runSync, isSyncing: ref(false) }) };
});

import { createAuthFlow } from '../useAuthFlow';

const failed = {
  state: 'failed', code: 'err.core.credential_store', message: '', page_url: '',
  credential_recovery: { platform: 'linux', can_save_file: true },
};

describe('Advanced data credential recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLoginStatus.mockResolvedValue(failed);
  });

  it('retains only the backend recovery receipt after manual saving fails', async () => {
    const auth = createAuthFlow(createSettingsFeedback());
    auth.manualAppToken.value = 'manually-entered-secret';
    auth.manualUserId.value = 'fixture-user';
    auth.showManualAuth.value = true;
    mocks.manualAuth.mockRejectedValue(new Error('locked'));
    await auth.submitManualAuth();
    expect(auth.loginStatus.value.credential_recovery).toEqual(failed.credential_recovery);
    expect(auth.manualAppToken.value).toBe('');
    expect(auth.showManualAuth.value).toBe(false);
    expect(mocks.recoverAdvancedCredentials).not.toHaveBeenCalled();
  });

  it('saves manual credentials to JSON without starting another login or an unverified sync', async () => {
    const feedback = createSettingsFeedback();
    const auth = createAuthFlow(feedback);
    await auth.attach();
    mocks.recoverAdvancedCredentials.mockResolvedValue({ state: 'configured', code: '', message: '', page_url: '' });
    await auth.recoverCredentials('file');
    expect(mocks.recoverAdvancedCredentials).toHaveBeenCalledWith('file');
    expect(mocks.startWebLogin).not.toHaveBeenCalled();
    expect(mocks.runSync).not.toHaveBeenCalled();
    expect(auth.loginStatus.value.state).toBe('configured');
    expect(auth.loginStatus.value.credential_recovery).toBeUndefined();
    expect(feedback.dataMessage.value).toContain('credentials.json');
    auth.detach();
  });

  it('starts Advanced data sync after saving the already verified web-login receipt', async () => {
    const auth = createAuthFlow(createSettingsFeedback());
    await auth.attach();
    mocks.recoverAdvancedCredentials.mockResolvedValue({ state: 'connected', code: 'err.login.connected', message: '', page_url: '' });
    await auth.recoverCredentials('system');
    expect(mocks.runSync).toHaveBeenCalledWith('incremental', undefined, { silent: true, waited: true, skipProbe: true });
    expect(mocks.loadDevices).toHaveBeenCalledWith(true);
    expect(mocks.startWebLogin).not.toHaveBeenCalled();
    auth.detach();
  });

  it('discards manual input and recovery choices when the user cancels', async () => {
    const auth = createAuthFlow(createSettingsFeedback());
    await auth.attach();
    auth.manualAppToken.value = 'unsaved-secret';
    mocks.cancelWebLogin.mockResolvedValue({ state: 'idle', code: '', message: '', page_url: '' });
    await auth.cancelLogin();
    expect(auth.manualAppToken.value).toBe('');
    expect(auth.loginStatus.value.credential_recovery).toBeUndefined();
    expect(auth.loginError.value).toBeNull();
    auth.detach();
  });
});

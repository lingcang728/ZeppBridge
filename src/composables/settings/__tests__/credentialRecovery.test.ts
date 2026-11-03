import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { OfficialStatus } from '../../../types';
import { createSettingsFeedback } from '../useSettingsFeedback';

const backend = vi.hoisted(() => ({
  listen: vi.fn(async () => () => {}),
  getOfficialStatus: vi.fn(),
  recoverOfficialCredentials: vi.fn(),
  cancelOfficialLogin: vi.fn(),
  startOfficialLogin: vi.fn(),
}));
vi.mock('../../../lib/bridge', () => ({ backend, toUserMessage: () => 'Store unavailable' }));
vi.mock('../../sync/run', () => ({ applyOfficialStatus: vi.fn() }));

import { createOfficialAuth } from '../useOfficialAuth';

const failed: OfficialStatus = {
  state: 'failed', message_code: 'err.official.store', message: null,
  user_id_masked: null, connected_at: null,
  credential_recovery: { platform: 'linux', can_save_file: true },
};
const connected: OfficialStatus = {
  state: 'connected', message_code: null, message: null,
  user_id_masked: '••••1234', connected_at: 100,
};

describe('official credential recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backend.getOfficialStatus.mockResolvedValue(failed);
  });

  it('restores the recovery choice after revisiting settings without starting another login', async () => {
    const auth = createOfficialAuth(createSettingsFeedback());
    await auth.attach();
    expect(auth.status.value.credential_recovery?.can_save_file).toBe(true);
    expect(backend.recoverOfficialCredentials).not.toHaveBeenCalled();
    expect(backend.startOfficialLogin).not.toHaveBeenCalled();
    auth.detach();
  });

  it('reuses the pending authorization when the user selects JSON', async () => {
    const feedback = createSettingsFeedback();
    const auth = createOfficialAuth(feedback);
    await auth.attach();
    backend.recoverOfficialCredentials.mockResolvedValue(connected);
    await auth.recover('file');
    expect(backend.recoverOfficialCredentials).toHaveBeenCalledWith('file');
    expect(backend.startOfficialLogin).not.toHaveBeenCalled();
    expect(auth.connected.value).toBe(true);
    expect(auth.failureText.value).toBeNull();
    expect(feedback.dataMessage.value).toContain('credentials.json');
    auth.detach();
  });

  it('keeps repair available after another store failure and permits discarding the receipt', async () => {
    const auth = createOfficialAuth({ dataMessage: ref(null), dataError: ref(null) });
    await auth.attach();
    backend.recoverOfficialCredentials.mockRejectedValue(new Error('locked'));
    await auth.recover('system');
    expect(auth.busy.value).toBe(false);
    expect(auth.status.value.credential_recovery).toBeTruthy();
    expect(auth.failureText.value).toBe('Store unavailable');
    backend.cancelOfficialLogin.mockResolvedValue({ ...connected, state: 'idle' });
    await auth.cancel();
    expect(auth.status.value.credential_recovery).toBeUndefined();
    expect(auth.failureText.value).toBeNull();
    auth.detach();
  });
});

/**
 * 设置页的两条推送监听（官方授权、网页登录）：页面卸载时 listen 还没回来，回来后必须立刻撤掉，
 * 反复开关设置页只留当前这一份（代码审查 R16）。
 */
import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Pending = { resolve: (off: () => void) => void };
const pending: Pending[] = [];
const offs: ReturnType<typeof vi.fn>[] = [];

vi.mock('../../../lib/bridge', () => ({
  backend: {
    listen: vi.fn(() => new Promise<() => void>((resolve) => { pending.push({ resolve }); })),
    getOfficialStatus: vi.fn(async () => ({ state: 'idle', message_code: null, message: null, user_id_masked: null, nickname: null, connected_at: null, authorize_url: null })),
    getLoginStatus: vi.fn(async () => ({ state: 'idle', message: '', page_url: '' })),
  },
  toUserMessage: (_error: unknown, fallback: string) => fallback,
}));

import { createOfficialAuth } from '../useOfficialAuth';
import { createAuthFlow } from '../useAuthFlow';
import type { SettingsFeedback } from '../useSettingsFeedback';

const feedback = () => ({ dataMessage: ref(null), dataError: ref(null) }) as unknown as SettingsFeedback;
const newOff = () => { const off = vi.fn(); offs.push(off); return off; };
const live = () => offs.filter((off) => off.mock.calls.length === 0).length;

describe.each([
  ['official', () => createOfficialAuth(feedback())],
  ['login', () => createAuthFlow(feedback())],
])('%s attach / detach', (_name, make) => {
  beforeEach(() => { pending.length = 0; offs.length = 0; });

  it('卸载时 listen 还没回来：回来后立刻撤掉，最终订阅数 0', async () => {
    const flow = make();
    const attaching = flow.attach();
    flow.detach();
    pending[0].resolve(newOff());
    await attaching;
    expect(live()).toBe(0);
  });

  it('反复开关：只剩当前这一份监听', async () => {
    const flow = make();
    for (let i = 0; i < 3; i += 1) {
      const attaching = flow.attach();
      pending[pending.length - 1].resolve(newOff());
      await attaching;
      if (i < 2) flow.detach();
    }
    expect(live()).toBe(1);
    flow.detach();
    expect(live()).toBe(0);
  });

  it('两次 attach 交错回来：先发的那份作废', async () => {
    const flow = make();
    const first = flow.attach();
    const second = flow.attach();
    pending[1].resolve(newOff());
    pending[0].resolve(newOff());
    await Promise.all([first, second]);
    expect(live()).toBe(1);
  });
});

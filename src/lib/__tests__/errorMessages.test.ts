import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { errorTextFor } from '../../i18n/errors';
import { toUserMessage } from '../bridge/errors';

/*
 * 英文界面上不该出现后端的中文。
 *
 * 后端只给稳定码和中文原文，界面按码取自己语言的说法。上一版没有这一层，
 * `toUserMessage` 把后端字符串原样显示，于是英文用户看到的每一个后端错误
 * 都是中文——Reddit 上真实走通流程的用户就是被这个绊住的。
 */

/** Tauri 拒绝时传过来的就是这个形状。 */
const backendError = (code: string, message: string) => ({ code, message });

describe('backend errors in the English interface', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('prefers the code over the backend prose', () => {
    const error = backendError('err.sync.not_connected', '尚未连接 Zepp，请先完成连接');
    const shown = toUserMessage(error);
    expect(shown).toBe('Not connected to Zepp yet. Connect first');
    expect(shown).not.toMatch(/[一-鿿]/);
  });

  it('localises the failure that used to strand people at sign-in', () => {
    const error = backendError(
      'err.login.credentials_unreadable',
      '已经登录，但没能从登录窗口读到凭据。可以改用 HAR 导入或手动填写 App Token。',
    );
    expect(toUserMessage(error)).toContain('HAR import');
  });

  it('falls back to the backend text when a code is unknown', () => {
    // 兜底要还在：后端加了新码而界面还没跟上时，宁可显示中文也不能吞掉错误。
    const error = backendError('err.brand.new_thing', 'something specific went wrong');
    expect(toUserMessage(error)).toBe('something specific went wrong');
  });

  it('still handles plain string errors from older code paths', () => {
    expect(toUserMessage('plain failure')).toBe('plain failure');
  });

  it('switches with the interface language', () => {
    const error = backendError('err.export.empty_range', '这段时间没有可导出的记录');
    expect(toUserMessage(error)).toBe('No records in this range to export');
    setLocale('zh');
    expect(toUserMessage(error)).toBe('这段时间没有可导出的记录');
  });

  it('resolves every code through errorTextFor in both languages', () => {
    setLocale('en');
    expect(errorTextFor('err.core.network')).toBe(
      "Couldn't reach the Zepp region. Check your network and try again",
    );
    setLocale('zh');
    expect(errorTextFor('err.core.network')).toBe('无法连接 Zepp 区域，请检查网络后重试');
    expect(errorTextFor(undefined)).toBeUndefined();
    expect(errorTextFor('err.not.a.real.code')).toBeUndefined();
  });
});

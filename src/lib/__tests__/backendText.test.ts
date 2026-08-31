import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { backendText, containsChinese } from '../../i18n/backendText';
import { toUserMessage } from '../bridge/errors';

/*
 * 最后一道闸：英文界面下，后端的中文原文一律不输出。
 *
 * 前面每一次修复都是「补上某个码」，然后下一个没补到的回落点又冒出中文。
 * 这一层不关心码补齐了没有——它只保证「英文界面 + 中文原文」这个组合
 * 不可能出现在屏幕上。库里存着旧版本写的、没有码的行时，靠的就是它。
 */

const CHINESE = /[一-鿿]/;

describe('backend prose never leaks into the English interface', () => {
  beforeEach(() => setLocale('en'));

  it('replaces Chinese with the caller fallback', () => {
    expect(backendText('云端返回了报文，但没有解析出可用记录', 'No reason recorded'))
      .toBe('No reason recorded');
  });

  it('lets non-Chinese backend text through', () => {
    // 后端也可能给出本来就不是中文的东西（HTTP 状态、主机名）——那些没必要藏。
    expect(backendText('HTTP 503', 'fallback')).toBe('HTTP 503');
  });

  it('keeps the original in the Chinese interface', () => {
    setLocale('zh');
    expect(backendText('云端返回了报文', 'fallback')).toBe('云端返回了报文');
  });

  it('uses the fallback for empty or missing text', () => {
    expect(backendText(null, 'fallback')).toBe('fallback');
    expect(backendText('   ', 'fallback')).toBe('fallback');
  });

  /*
   * 这条对应用户真实遇到的情形：库里是旧版本写进去的行，只有中文、没有码。
   * 就算码完全缺失，英文界面也不能把中文显示出来。
   */
  it('protects toUserMessage even when the error carries no code at all', () => {
    const legacy = { message: '云端返回了报文，但没有解析出可用记录' };
    const shown = toUserMessage(legacy, 'Something went wrong');
    expect(shown).toBe('Something went wrong');
    expect(shown).not.toMatch(CHINESE);
  });

  it('still prefers a real code when there is one', () => {
    const shown = toUserMessage({ code: 'err.sync.not_connected', message: '尚未连接 Zepp' });
    expect(shown).toBe('Not connected to Zepp yet. Connect first');
  });

  it('containsChinese is honest about both cases', () => {
    expect(containsChinese('已损坏')).toBe(true);
    expect(containsChinese('damaged')).toBe(false);
    expect(containsChinese(null)).toBe(false);
  });
});

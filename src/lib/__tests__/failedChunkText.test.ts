import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { failedChunkText } from '../failedChunkText';

/*
 * 用户截图里的那一块：「Heart rate · 2026-08」下面跟着一行中文。
 *
 * 下面第一条用的是从他本机 zepp.db 里读出来的真实行，一字不改。
 */

const CHINESE = /[一-鿿]/;

/** 真实的库里长这样（coverage_ledger，2026-08 的 heart_rate 那行）。 */
const REAL_ROW = {
  error: '云端返回了报文，但没有解析出可用记录',
  error_code: 'err.backfill.no_canonical_records',
};

describe('failed chunk reason', () => {
  beforeEach(() => setLocale('en'));

  it('renders the row from the real database in English', () => {
    const text = failedChunkText(REAL_ROW);
    expect(text).not.toMatch(CHINESE);
    expect(text).toBe(
      'The cloud returned a payload, but no usable records could be parsed from it',
    );
  });

  it('shows Chinese for that same row in the Chinese interface', () => {
    setLocale('zh');
    expect(failedChunkText(REAL_ROW)).toBe('云端返回了报文，但没有解析出可用记录');
  });

  /*
   * 旧版本写进库的行没有 error_code。这类行不会因为升级而自动补上码，
   * 所以它是英文界面最后一个可能冒中文的地方——闸门必须挡住。
   */
  it('never shows Chinese for a legacy row that has no code', () => {
    const legacy = { error: '云端返回了报文，但没有解析出可用记录', error_code: null };
    const text = failedChunkText(legacy);
    expect(text).not.toMatch(CHINESE);
    expect(text).toBe('No reason recorded');
  });

  it('uses the shared error table for core error codes', () => {
    const networkFailure = { error: '无法连接 Zepp 区域，请检查网络后重试', error_code: 'err.core.network' };
    const text = failedChunkText(networkFailure);
    expect(text).not.toMatch(CHINESE);
    expect(text).toContain('Zepp region');
  });

  it('handles a row with nothing recorded at all', () => {
    expect(failedChunkText({ error: null, error_code: null })).toBe('No reason recorded');
  });
});

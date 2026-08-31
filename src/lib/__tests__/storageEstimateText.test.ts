import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { storageEstimateText, storageStopReasonText } from '../storageEstimateText';

/*
 * 用户报的那张截图就是这句：英文界面的「Local data retention」下面显示
 * 「按本机已有数据的实际速率推算，365 天大约占用 514 MB…」。
 *
 * 成因是后端把整句中文当 `message` 送过来，界面直接渲染。现在后端只给
 * `message_code`，句子在前端拼——这里把六种说法在两种语言下都钉住。
 */

const base = {
  message: '按本机已有数据的实际速率推算，365 天大约占用 514 MB，本盘剩余 163.1 GB。',
  requested_days: 365,
  estimated_add_bytes: 514 * 1024 * 1024,
  free_bytes: 175_000_000_000,
  needed_bytes: 600 * 1024 * 1024,
};

const CHINESE = /[一-鿿]/;

describe('storage estimate copy', () => {
  beforeEach(() => setLocale('en'));

  it('never shows Chinese in English for any known code', () => {
    const codes = [
      'ui.estimate.stop_no_space',
      'ui.estimate.disk_unknown',
      'ui.estimate.disk_too_small',
      'ui.estimate.builtin_guess',
      'ui.estimate.measured',
      'ui.estimate.partial',
    ];
    for (const message_code of codes) {
      const text = storageEstimateText({ ...base, message_code });
      expect(text, message_code).not.toMatch(CHINESE);
      expect(text.length, message_code).toBeGreaterThan(0);
    }
  });

  it('renders the sentence from the screenshot in English', () => {
    const text = storageEstimateText({ ...base, message_code: 'ui.estimate.measured' });
    expect(text).toContain('365 days');
    expect(text).toContain('the rate your own data actually accumulates');
    expect(text).not.toMatch(CHINESE);
  });

  it('follows the interface language', () => {
    const input = { ...base, message_code: 'ui.estimate.measured' };
    expect(storageEstimateText(input)).not.toMatch(CHINESE);
    setLocale('zh');
    expect(storageEstimateText(input)).toMatch(CHINESE);
  });

  it('does not fall back to Chinese for an unknown code', () => {
    /* 以前这里回落到后端原文，理由是「宁可显示看不懂的也不要空白」。
       但后端原文一律是中文，那条回落正是英文界面冒中文的最后一个入口。
       现在改成一句笼统的英文——看不懂的中文对英文用户既没信息量，
       也没法反馈给我们。 */
    const text = storageEstimateText({ ...base, message_code: 'ui.estimate.brand_new' });
    expect(text).not.toMatch(CHINESE);
    expect(text).toBe('The size of this backfill cannot be estimated right now.');
  });

  it('keeps the backend original in the Chinese interface', () => {
    setLocale('zh');
    const text = storageEstimateText({ ...base, message_code: 'ui.estimate.brand_new' });
    expect(text).toBe(base.message);
  });

  it('renders the stop reason without Chinese', () => {
    const text = storageStopReasonText({
      ...base,
      stop_reason: '这次补拉预计需要 600 MB（含安全余量），本盘只剩 100 MB，不会开始。',
      stop_reason_code: 'ui.estimate.stop_no_space',
    });
    expect(text).not.toMatch(CHINESE);
    expect(text).toContain('safety margin');
  });

  it('returns empty when there is nothing to say', () => {
    expect(storageEstimateText(null)).toBe('');
    expect(storageStopReasonText({ ...base, stop_reason: null })).toBe('');
  });
});

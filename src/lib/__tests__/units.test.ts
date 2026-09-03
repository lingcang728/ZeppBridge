import { afterEach, describe, expect, it } from 'vitest';
import { formatDistance, formatPace } from '../format';
import { formatPaceSeconds } from '../metricSeries';
import {
  METRES_PER_FOOT,
  METRES_PER_MILE,
  distanceUnitLabel,
  paceUnitLabel,
  setDistanceUnit,
  toElevation,
} from '../units';
import { setLocale } from '../../i18n';

/*
 * 单位切换的规则只有一条，但它决定了这个功能是有用还是有害：**换的是单位，
 * 不是数字的含义**。一个把 5.43 公里显示成 5.43 英里的界面，比只有公制要糟得多
 * —— 用户会拿它当真实读数，而它错了 61%。
 *
 * 下面的用例全部围着这条转：同一个米数，两种单位下必须是同一段真实距离。
 */

describe('英制显示的是同一段距离，只是换了单位', () => {
  afterEach(() => {
    setDistanceUnit('metric');
    setLocale('zh');
  });

  it('一英里以上用英里，以下用英尺', () => {
    setDistanceUnit('imperial');
    // 刚好一英里。
    expect(formatDistance(METRES_PER_MILE)).toBe('1.00 英里');
    // 差一米就不到一英里，于是落回小单位。
    expect(formatDistance(METRES_PER_MILE - 1)).toBe(`${Math.round((METRES_PER_MILE - 1) / METRES_PER_FOOT)} 英尺`);
    // 10 km ≈ 6.21 英里。
    expect(formatDistance(10_000)).toBe('6.21 英里');
  });

  it('分界线跟着单位走，不是永远的 1000 米', () => {
    // 公制下 1500 米已经是大单位了；英制下它还不到一英里。
    expect(formatDistance(1500)).toBe('1.50 公里');
    setDistanceUnit('imperial');
    expect(formatDistance(1500)).toContain('英尺');
  });

  it('配速换算成每英里，后缀跟着换', () => {
    // 10 km / 50 分钟 = 5:00 /km = 8:03 /mi
    expect(formatPace(10_000, 50)).toBe('5:00 /km');
    setDistanceUnit('imperial');
    expect(formatPace(10_000, 50)).toBe('8:03 /mi');
    expect(paceUnitLabel()).toBe('/mi');
  });

  it('每公里秒数的配速同样跟着换', () => {
    // 300 秒/公里 = 5:00；换成每英里是 482.8 秒 = 8:03。
    expect(formatPaceSeconds(300)).toBe('5:00');
    setDistanceUnit('imperial');
    expect(formatPaceSeconds(300)).toBe('8:03');
  });

  it('爬升换成英尺', () => {
    expect(toElevation(100)).toBe(100);
    setDistanceUnit('imperial');
    expect(Math.round(toElevation(100))).toBe(328);
  });

  it('缺失仍然是缺失，不会因为换单位变成 0', () => {
    setDistanceUnit('imperial');
    expect(formatDistance(undefined)).toBe('未记录');
    expect(formatDistance(0)).toBe('未记录');
    expect(formatPace(0, 30)).toBeNull();
  });

  it('单位名跟着界面语言，英文界面用符号', () => {
    setLocale('en');
    expect(distanceUnitLabel()).toBe('km');
    setDistanceUnit('imperial');
    expect(distanceUnitLabel()).toBe('mi');
    expect(formatDistance(METRES_PER_MILE)).toBe('1.00 mi');
  });
});

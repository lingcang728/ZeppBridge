import { afterEach, describe, expect, it } from 'vitest';
import {
  formatDistance,
  formatDuration,
  formatMetric,
  formatPace,
  isFiniteNumber,
  localDateString,
} from '../format';
import { setLocale } from '../../i18n';

/*
 * 这一层的规则只有一条，但它是整个产品的立身之本：**缺失不能被显示成 0**。
 * 一个「0 分钟睡眠」「0 米距离」的卡片，比一个「—」危险得多——用户会拿它
 * 当真实读数。下面的用例全部围着这条转。
 */

describe('缺失值不会被显示成 0', () => {
  it('undefined、NaN 和 Infinity 都不是可显示的数字', () => {
    expect(isFiniteNumber(undefined)).toBe(false);
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteNumber(0)).toBe(true);
  });

  it('没有数值的指标显示占位符而不是 0', () => {
    expect(formatMetric(undefined)).toBe('—');
    expect(formatMetric(Number.NaN)).toBe('—');
  });

  it('没有距离就说没记录，不说 0 米', () => {
    expect(formatDistance(undefined)).toBe('未记录');
    expect(formatDistance(0)).toBe('未记录');
  });

  it('没有时长就说未知，不说 0 分钟', () => {
    expect(formatDuration(undefined)).toBe('时长未知');
    expect(formatDuration(null)).toBe('时长未知');
    // 负数只可能来自坏数据，显示成「-3 分钟」比说不知道更糟。
    expect(formatDuration(-3)).toBe('时长未知');
  });

  it('真的是 0 的时候仍然显示 0', () => {
    // 「没测到」和「测到了，是 0」是两件事。前者是 —，后者是 0。
    expect(formatMetric(0)).toBe('0');
    expect(formatDuration(0)).toBe('0 分钟');
  });
});

describe('单位换算', () => {
  it('一公里以上用公里，以下用米', () => {
    expect(formatDistance(999)).toBe('999 米');
    expect(formatDistance(1000)).toBe('1.00 公里');
    expect(formatDistance(5432)).toBe('5.43 公里');
  });

  it('时长跨小时后拆成小时和分钟', () => {
    expect(formatDuration(45)).toBe('45 分钟');
    expect(formatDuration(60)).toBe('1 小时 0 分');
    expect(formatDuration(125)).toBe('2 小时 5 分');
  });

  it('配速是每个显示单位的分秒，秒数补零', () => {
    // 10 km / 50 分钟 = 5:00 /km
    expect(formatPace(10_000, 50)).toBe('5:00 /km');
    // 秒数个位必须补零，不能出现 5:5 /km
    expect(formatPace(10_000, 50.083)).toBe('5:00 /km');
    expect(formatPace(1000, 5.1)).toBe('5:06 /km');
  });

  it('距离或时长缺失时不给配速', () => {
    // 除以 0 会得到 Infinity，那会渲染成一个荒唐但看起来正常的数字。
    expect(formatPace(0, 30)).toBeNull();
    expect(formatPace(5000, 0)).toBeNull();
    expect(formatPace(undefined, 30)).toBeNull();
    expect(formatPace(5000, null)).toBeNull();
  });
});

describe('本地日期字符串', () => {
  it('用本地时区的年月日，不是 UTC 的', () => {
    // 用 toISOString().slice(0,10) 会在东八区把当地时间 08:00 之前的时刻
    // 算成前一天——「今天没有数据」的经典来源。
    const localMidnight = new Date(2026, 0, 1, 0, 30);
    expect(localDateString(localMidnight)).toBe('2026-01-01');
  });

  it('月和日补零到两位', () => {
    expect(localDateString(new Date(2026, 8, 5, 12))).toBe('2026-09-05');
  });
});

/*
 * 语言切换后，这些占位文案也必须跟着换。英文界面上冒出一句「时长未知」
 * 比不翻更糟——它恰恰是在说「这里没有数据」，看不懂就会被当成读数。
 */
describe('缺失值的说法跟着界面语言走', () => {
  afterEach(() => setLocale('zh'));

  it('英文界面下的占位是英文', () => {
    setLocale('en');
    expect(formatDistance(undefined)).toBe('Not recorded');
    expect(formatDuration(null)).toBe('Duration unknown');
    // 「—」两种语言通用，不需要翻。
    expect(formatMetric(undefined)).toBe('—');
  });

  it('英文界面下的时长单位是 hr / min', () => {
    setLocale('en');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(125)).toBe('2 hr 5 min');
    // 真的是 0 仍然显示 0，这条规则和语言无关。
    expect(formatDuration(0)).toBe('0 min');
  });

  it('切回中文后又是中文', () => {
    setLocale('en');
    setLocale('zh');
    expect(formatDuration(125)).toBe('2 小时 5 分');
  });
});

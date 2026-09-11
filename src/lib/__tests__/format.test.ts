import { afterEach, describe, expect, it } from 'vitest';
import {
  formatCalendarDate,
  formatCalendarMonth,
  formatDate,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatFullDateTime,
  formatMetric,
  formatPace,
  formatTime,
  formatWeekdayNames,
  isFiniteNumber,
  localDateString,
  parseCalendarDate,
} from '../format';
import { setDateFormat, setTimeFormat } from '../datePreferences';
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

  it('北京清晨仍算当天，不是 UTC 的前一天', () => {
    withTimeZone('Asia/Shanghai', () => {
      const beijingEarly = new Date(2026, 0, 1, 0, 30);
      expect(localDateString(beijingEarly)).toBe('2026-01-01');
      // 组件先前用的 `toISOString().slice(0, 10)` 在这里会得到 2025-12-31。
      expect(beijingEarly.toISOString().slice(0, 10)).toBe('2025-12-31');
    });
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

/*
 * 日期时间的格式偏好是纯显示层的：绝对时刻永远按运行时的本地时区渲染，偏好
 * 只决定年月日顺序和 12 / 24 小时制。下面把同一个 UTC 时刻放进三个时区，
 * 验证「本地」真的是本地，而不是某个写死的时区。
 */
const ZONES = ['Europe/London', 'America/New_York', 'Asia/Shanghai'] as const;

/** 换浏览器地区，跑完恢复：地区由 `navigator.language` 决定，和界面语言无关。 */
const withNavigatorLanguage = (language: string, run: () => void): void => {
  const own = Object.getOwnPropertyDescriptor(navigator, 'language');
  Object.defineProperty(navigator, 'language', { value: language, configurable: true, writable: true });
  try {
    run();
  } finally {
    if (own) Object.defineProperty(navigator, 'language', own);
    else delete (navigator as unknown as { language?: string }).language;
  }
};

/** 换系统时区，跑完恢复。Node 运行时改 `TZ` 会立即生效，无需新进程。 */
const nodeEnv = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const withTimeZone = (zone: string, run: () => void): void => {
  const previous = nodeEnv.TZ;
  nodeEnv.TZ = zone;
  try {
    run();
  } finally {
    if (previous === undefined) delete nodeEnv.TZ;
    else nodeEnv.TZ = previous;
  }
};

describe('绝对时刻按运行时的系统时区渲染', () => {
  afterEach(() => {
    setDateFormat('regional');
    setTimeFormat('regional');
    setLocale('zh');
  });

  const localDateTime: Record<(typeof ZONES)[number], string> = {
    'Europe/London': '1/1 00:30:00',
    'America/New_York': '31/12 19:30:00',
    'Asia/Shanghai': '1/1 08:30:00',
  };

  it.each(ZONES)('%s 下同一 UTC 时刻落在各自的本地日期时间', (zone) => {
    withNavigatorLanguage('en-US', () => {
      setDateFormat('dmy');
      setTimeFormat('24h');
      withTimeZone(zone, () => {
        expect(formatDateTime('2026-01-01T00:30:00Z', '—', { seconds: true })).toBe(localDateTime[zone]);
      });
    });
  });

  it('epoch 毫秒同样按本地时间渲染', () => {
    withNavigatorLanguage('en-GB', () => {
      setTimeFormat('24h');
      withTimeZone('Asia/Shanghai', () => {
        expect(formatTime(Date.UTC(2026, 0, 1, 0, 30))).toBe('08:30');
      });
      setTimeFormat('12h');
      withTimeZone('Asia/Shanghai', () => {
        expect(formatTime(Date.UTC(2026, 0, 1, 0, 30))).toBe('08:30 am');
      });
    });
  });

  it('12 / 24 小时制切换小时周期', () => {
    withNavigatorLanguage('en-US', () => {
      setDateFormat('mdy');
      withTimeZone('Europe/London', () => {
        setTimeFormat('12h');
        expect(formatDateTime('2026-01-01T00:30:00Z')).toMatch(/^1\/1 12:30\sAM$/);
        setTimeFormat('24h');
        expect(formatDateTime('2026-01-01T00:30:00Z')).toBe('1/1 00:30');
      });
    });
  });

  it('formatFullDateTime 带年份并可选秒', () => {
    withNavigatorLanguage('en-US', () => {
      setDateFormat('dmy');
      setTimeFormat('24h');
      withTimeZone('America/New_York', () => {
        expect(formatFullDateTime('2026-01-01T00:30:00Z', '—', { seconds: true }))
          .toBe('31/12/2025 19:30:00');
      });
    });
  });
});

describe('日历日期按本地年月日解析，不做 UTC 位移', () => {
  afterEach(() => {
    setDateFormat('regional');
    setLocale('zh');
  });

  it.each(ZONES)('%s 下 2026-01-01 仍是 1 月 1 日（星期四）', (zone) => {
    withNavigatorLanguage('en-US', () => {
      withTimeZone(zone, () => {
        expect(formatCalendarDate('2026-01-01')).toBe('Thu, Jan 1');
      });
    });
  });

  it('负时区里不会退回前一天', () => {
    withNavigatorLanguage('en-US', () => {
      withTimeZone('America/New_York', () => {
        // UTC 解析会得到 2025-12-31 19:00，这正是 formatCalendarDate 要避免的。
        expect(formatCalendarDate('2026-01-01')).toBe('Thu, Jan 1');
        expect(formatCalendarDate('2025-12-31')).toBe('Wed, Dec 31');
        // 旧的 formatDate 是「按时刻解析」，负时区里就会错一天。
        expect(formatDate('2026-01-01')).toBe('Wed, Dec 31');
      });
    });
  });

  it('日期顺序偏好控制年月日排列', () => {
    withNavigatorLanguage('en-US', () => {
      withTimeZone('Europe/London', () => {
        setDateFormat('ymd');
        expect(formatCalendarDate('2026-01-01', 'long')).toBe('Thursday 2026/1/1');
        setDateFormat('dmy');
        expect(formatCalendarDate('2026-01-01', 'long')).toBe('Thursday 1/1/2026');
      });
    });
  });

  it('接受本地 Date 对象', () => {
    withNavigatorLanguage('en-US', () => {
      withTimeZone('Asia/Shanghai', () => {
        expect(formatCalendarDate(new Date(2026, 0, 1))).toBe('Thu, Jan 1');
      });
    });
  });
});

/*
 * `parseCalendarDate` 是日期选择器共享的入口：它必须把 `YYYY-MM-DD` 读成
 * 本地的年月日，并且在输入根本不是一个合法日历日期时说「不知道」，而不是
 * 用一个被本地构造悄悄滚动过的错日期顶上。
 */
describe('严格解析纯日历日期', () => {
  it('解析出的年月日是本地字段，不做 UTC 位移', () => {
    withTimeZone('Asia/Shanghai', () => {
      const date = parseCalendarDate('2026-01-01');
      expect(date?.getFullYear()).toBe(2026);
      expect(date?.getMonth()).toBe(0);
      expect(date?.getDate()).toBe(1);
    });
  });

  it('纽约跨年清晨不会退回前一天', () => {
    withTimeZone('America/New_York', () => {
      // UTC 解析会得到 2025-12-31 19:00；这里必须仍是 1 月 1 日。
      const date = parseCalendarDate('2026-01-01');
      expect(date?.getFullYear()).toBe(2026);
      expect(date?.getMonth()).toBe(0);
      expect(date?.getDate()).toBe(1);
    });
  });

  it('接受闰日，拒绝平年的 2 月 29 日', () => {
    expect(parseCalendarDate('2024-02-29')?.getDate()).toBe(29);
    expect(parseCalendarDate('2026-02-29')).toBeNull();
    // 百年不闰：2100 不是闰年。
    expect(parseCalendarDate('2100-02-29')).toBeNull();
  });

  it('拒绝会被本地构造悄悄滚动的非法日期', () => {
    expect(parseCalendarDate('2026-04-31')).toBeNull();
    expect(parseCalendarDate('2026-13-01')).toBeNull();
    expect(parseCalendarDate('2026-00-10')).toBeNull();
    expect(parseCalendarDate('2026-01-00')).toBeNull();
  });

  it('拒绝形状不符的输入', () => {
    expect(parseCalendarDate('2026-1-1')).toBeNull();
    expect(parseCalendarDate('not-a-date')).toBeNull();
    expect(parseCalendarDate('2026-01-01T00:00:00Z')).toBeNull();
  });

  it('非法日历日期经 formatCalendarDate 渲染成日期未知', () => {
    expect(formatCalendarDate('2026-02-30')).toBe('日期未知');
  });
});

describe('地区不跟界面语言走', () => {
  afterEach(() => setLocale('zh'));

  it('regional 用 navigator.language，而不是英文界面的 en-US', () => {
    withNavigatorLanguage('en-GB', () => {
      setLocale('zh');
      expect(formatCalendarDate('2026-09-05')).toBe('Sat 5 Sept');
    });
    withNavigatorLanguage('en-US', () => {
      setLocale('zh');
      expect(formatCalendarDate('2026-09-05')).toBe('Sat, Sep 5');
    });
  });
});

/*
 * zh-CN 的 Intl 字面量是「年 / 月 / 日」。早先的实现拿它当分隔符，dmy 会拼成
 * `1年1年2026日`：既重复又错位。显式排列现在一律数字 + `/`，下面把三种顺序都钉住。
 */
describe('显式日期排列在 zh-CN 下不再借用地区字面量', () => {
  afterEach(() => {
    setDateFormat('regional');
    setLocale('zh');
  });

  const explicit: Record<'ymd' | 'dmy' | 'mdy', string> = {
    ymd: '2026/3/5 星期四',
    dmy: '5/3/2026 星期四',
    mdy: '3/5/2026 星期四',
  };

  it.each(['ymd', 'dmy', 'mdy'] as const)('%s 输出数字年月日，没有中文字面量乱入', (order) => {
    withNavigatorLanguage('zh-CN', () => {
      setDateFormat(order);
      expect(formatCalendarDate('2026-03-05', 'long')).toBe(explicit[order]);
    });
  });

  it('datetime 的日期前缀也是数字，时间仍按地区', () => {
    withNavigatorLanguage('zh-CN', () => {
      setDateFormat('dmy');
      setTimeFormat('24h');
      withTimeZone('Asia/Shanghai', () => {
        expect(formatDateTime('2026-03-05T10:30:00Z')).toBe('5/3 18:30');
      });
    });
  });
});

describe('日历月份与星期表头', () => {
  afterEach(() => setLocale('zh'));

  it('月份标题跟系统地区走，不跟界面语言', () => {
    withNavigatorLanguage('zh-CN', () => {
      expect(formatCalendarMonth(2026, 0)).toBe('2026年1月');
    });
    withNavigatorLanguage('en-US', () => {
      expect(formatCalendarMonth(2026, 0)).toBe('January 2026');
    });
  });

  it('星期表头从星期日开始，可按需取窄名', () => {
    withNavigatorLanguage('zh-CN', () => {
      expect(formatWeekdayNames('narrow')).toEqual(['日', '一', '二', '三', '四', '五', '六']);
    });
    withNavigatorLanguage('en-US', () => {
      expect(formatWeekdayNames('short')).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    });
  });
});

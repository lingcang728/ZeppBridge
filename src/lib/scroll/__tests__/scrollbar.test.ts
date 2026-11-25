import { describe, expect, it } from 'vitest';
import { MIN_THUMB, overflows, rowAt, scrollTopFor, thumbFor, timelineKey, timelineMonth, trackPointFor, yearMarks, type TimelineRow } from '../scrollbar';

const box = (scrollTop: number, scrollHeight = 4000, clientHeight = 800) => ({ scrollTop, scrollHeight, clientHeight });

describe('悬浮滚动条的几何', () => {
  it('滑块长度按可见比例、位置按滚动比例，到底时贴着轨道底', () => {
    expect(thumbFor(box(0), 700)).toEqual({ size: 140, offset: 0 });
    const end = thumbFor(box(3200), 700);
    expect(end.offset + end.size).toBe(700);
    expect(thumbFor(box(1600), 700).offset).toBe(280);
  });

  it('内容很长时滑块不短于下限；内容不够高就没有滚动条', () => {
    expect(thumbFor(box(0, 400_000), 700).size).toBe(MIN_THUMB);
    expect(overflows(box(0, 801))).toBe(false);
    expect(overflows(box(0, 820))).toBe(true);
  });

  it('拖动换算和滑块位置互逆，拖出轨道两头就停在两头', () => {
    const { size } = thumbFor(box(0), 700);
    expect(scrollTopFor(280, box(0), 700, size)).toBe(1600);
    expect(scrollTopFor(-50, box(0), 700, size)).toBe(0);
    expect(scrollTopFor(9999, box(0), 700, size)).toBe(3200);
  });
});

describe('时间刻度', () => {
  const rows: TimelineRow[] = [
    { key: '2026-11', top: 100 },
    { key: '2026-02', top: 900 },
    { key: '2025-12', top: 1000 },
    { key: '2024-12', top: 1050 },
    { key: '2024-03', top: 2400 },
    { key: '2023-06', top: 3600 },
  ];

  it('每年第一行标年份，顶上那一年也标，挨得太近的只留前一个', () => {
    const place = (top: number) => top / 5;
    expect(yearMarks(rows, place)).toEqual([
      { year: '2026', at: 20 },
      { year: '2025', at: 200 },
      { year: '2023', at: 720 },
    ]);
  });

  it('按位置找到当前那一行', () => {
    expect(rowAt(rows, 0)?.key).toBe('2026-11');
    expect(rowAt(rows, 1000)?.key).toBe('2025-12');
    expect(rowAt(rows, 2410)?.key).toBe('2024-03');
    expect(rowAt(rows, 99_999)?.key).toBe('2023-06');
    expect(rowAt([], 10)).toBeNull();
  });

  it('刻度位置和滑块中线对得上', () => {
    const size = thumbFor(box(0), 700).size;
    // 第一行在顶栏下沿时，刻度就在滑块停在最上面时的中线。
    expect(trackPointFor(64, 64, box(0), 700, size)).toBe(size / 2);
    expect(trackPointFor(64 + 3200, 64, box(0), 700, size)).toBe(700 - size / 2);
  });

  it('行时间按本地年月取键，认不出的不标', () => {
    expect(timelineKey('2025-03-04T08:00:00')).toBe('2025-03');
    expect(timelineKey('not a date')).toBeUndefined();
    expect(timelineKey(null)).toBeUndefined();
    expect(timelineMonth('2025-03')?.getMonth()).toBe(2);
    expect(timelineMonth('2025-3')).toBeNull();
  });
});

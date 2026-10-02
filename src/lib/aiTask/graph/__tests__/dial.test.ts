import { describe, expect, it } from 'vitest';
import { dialAngle, dialMarks, dialPaths, minorPerGap } from '../dial';
import { createWake, stepWake, wakePosition } from '../wake';
import { windowDial } from '../../dayRing';

describe('dial', () => {
  it('最后一格（今天）落在 12 点，第一格紧挨在它右手边', () => {
    expect(dialAngle(13, 14)).toBeCloseTo(-Math.PI / 2 + 2 * Math.PI);
    expect(dialAngle(0, 14)).toBeCloseTo(-Math.PI / 2 + (2 * Math.PI) / 14);
  });

  it('分刻度把整圈补到六十根上下：7 天补得密，90 天不补', () => {
    expect(minorPerGap(7, 60)).toBe(8);
    expect(minorPerGap(15, 60)).toBe(3);
    expect(minorPerGap(90, 60)).toBe(0);
    expect(dialMarks(7, { radius: 100, length: 6, minorTarget: 60 })).toHaveLength(63);
  });

  it('周刻度从今天往回每 7 天一根；几天并一格时不画周刻度', () => {
    const marks = dialMarks(15, { radius: 100, length: 6, weekLength: 10 });
    expect(marks.filter((mark) => mark.kind === 'week').map((mark) => mark.cell)).toEqual([0, 7]);
    expect(marks[marks.length - 1].kind).toBe('today');
    expect(dialMarks(30, { radius: 100, length: 6, weekLength: 10, perCell: 3 }).some((mark) => mark.kind === 'week')).toBe(false);
  });

  it('没有逐日数据只画标尺：不点亮、也不画成缺失', () => {
    const paths = dialPaths(null, 7, { radius: 100, length: 6 });
    expect(paths.ticks.on).toBe('');
    expect(paths.ticks.off).toBe('');
    expect(paths.ticks.plain).not.toBe('');
    expect(paths.todayState).toBe('plain');
  });

  it('今天那一格照实着色：没数据就不亮', () => {
    expect(dialPaths([1, 1, 0], 3, { radius: 100, length: 6 }).todayState).toBe('off');
  });
});

describe('windowDial', () => {
  const row = (start: string, end: string, days: number, covered?: string[]) =>
    ({ start_date: start, end_date: end, days_in_range: days, covered_dates: covered });

  it('多个类别取并集：任一类别有数据的那天就亮', () => {
    const dial = windowDial([
      row('2026-09-28', '2026-10-02', 5, ['2026-09-28']),
      row('2026-09-30', '2026-10-02', 3, ['2026-10-02']),
    ]);
    expect(dial).toEqual({ cells: [1, 0, 0, 0, 1], count: 5, perCell: 1, endDate: '2026-10-02' });
  });

  it('有一行缺逐日数据：只给刻度数，不点亮', () => {
    const dial = windowDial([row('2026-09-28', '2026-10-02', 5)]);
    expect(dial?.cells).toBeNull();
    expect(dial?.count).toBe(5);
  });

  it('没有行就没有表圈', () => {
    expect(windowDial([])).toBeNull();
  });
});

describe('wake', () => {
  it('指针扫过的刻度竖起来，越早扫过的越矮，停手后几帧内落回去', () => {
    const wake = createWake(60);
    stepWake(wake, wakePosition(0, 60), 16.7);
    stepWake(wake, wakePosition(0.3, 60), 16.7);
    const lit = [...wake.energy].map((value, index) => ({ value, index })).filter((entry) => entry.value > 0);
    expect(lit.length).toBeGreaterThan(1);
    expect(lit[0].value).toBeLessThan(lit[lit.length - 1].value);
    let live = true;
    for (let frame = 0; frame < 40 && live; frame += 1) live = stepWake(wake, null, 16.7);
    expect(live).toBe(false);
  });

  it('越快，身后竖着的尾迹越长', () => {
    const run = (perFrame: number) => {
      const wake = createWake(120);
      for (let frame = 0; frame <= 12; frame += 1) stepWake(wake, 10 + frame * perFrame, 16.7);
      return [...wake.energy].filter((value) => value > 0.2).length;
    };
    expect(run(2.5)).toBeGreaterThan(run(0.5));
  });

  it('跨过 12 点按最短方向走，不会绕一整圈', () => {
    const wake = createWake(60);
    stepWake(wake, 59.5, 16.7);
    stepWake(wake, 0.5, 16.7);
    expect([...wake.energy].filter((value) => value > 0)).toHaveLength(1);
  });
});

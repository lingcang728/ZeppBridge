import { describe, expect, it } from 'vitest';
import { groupRows, handLayout, MONTH_FOLD_DAYS, monthId, weekdayOf, type HandGroup } from '../hand';

const group = (key: string, dates: string[], category: HandGroup['category'] = 'recovery'): HandGroup => ({
  key, category, dates, items: dates.map((date) => ({ key: key === 'workout' ? `workout:${date}` : key, date })),
});
const options = { groupText: (key: string, n: number) => `${key} ${n}`, tintOf: () => '#f00', labelOf: (key: string) => key };
const px = (value: string) => Number.parseFloat(value);
const range = (from: number, to: number, month = '2026-09') => Array.from({ length: to - from + 1 }, (_, i) => `${month}-${String(from + i).padStart(2, '0')}`);

describe('收集箱铺开：按周分行', () => {
  it('一周一排，列对齐星期（周一 = 第 0 列）', () => {
    // 2026-09-07 是周一，2026-09-13 是周日；09-14 起是下一周。
    const rows = groupRows(group('resting_hr', ['2026-09-09', '2026-09-07', '2026-09-13', '2026-09-15']));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.map((slot) => slot.col)).toEqual([0, 2, 6]);
    expect(rows[1]!.map((slot) => slot.col)).toEqual([weekdayOf('2026-09-15')]);
  });

  it('同一天两次运动：第二次落到下一排的同一列，不叠在一个位置', () => {
    const g: HandGroup = { key: 'workout', category: 'workout', dates: ['2026-09-08', '2026-09-08'], items: [{ key: 'workout:a', date: '2026-09-08' }, { key: 'workout:b', date: '2026-09-08' }] };
    const rows = groupRows(g);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row[0]!.col)).toEqual([1, 1]);
  });

  it('一个月挑够天数折成一张月牌；点开（expanded）才按周摊开；运动不折', () => {
    const many = range(1, MONTH_FOLD_DAYS);
    const folded = groupRows(group('hrv', many));
    expect(folded).toHaveLength(1);
    expect(folded[0]![0]!.kind).toBe('month');
    const open = groupRows(group('hrv', many), new Set([monthId('hrv', '2026-09')]));
    expect(open.every((row) => row.every((slot) => slot.kind === 'card'))).toBe(true);
    expect(open.flat()).toHaveLength(MONTH_FOLD_DAYS);
    const few = groupRows(group('hrv', range(1, MONTH_FOLD_DAYS - 1)));
    expect(few.flat().every((slot) => slot.kind === 'card')).toBe(true);
    const workouts = groupRows(group('workout', many, 'workout'));
    expect(workouts.flat().every((slot) => slot.kind === 'card')).toBe(true);
  });

  it('月牌按日期落在它那个月的位置：早的周排在上、晚的周排在下', () => {
    const rows = groupRows(group('hrv', ['2026-08-10', ...range(1, MONTH_FOLD_DAYS), '2026-10-05']));
    expect(rows.map((row) => row.map((slot) => (slot.kind === 'month' ? slot.month : slot.item.date)))).toEqual([
      ['2026-08-10'], ['2026-09'], ['2026-10-05'],
    ]);
  });

  it('月牌的点阵：前面补空位对齐星期，挑了的那几天点亮', () => {
    const layout = handLayout([group('hrv', range(1, MONTH_FOLD_DAYS))], { width: 1440, height: 1000 }, options);
    const month = layout.months[0]!;
    // 2026-09-01 是周二：前面空一格。
    expect(month.cells[0]).toBeNull();
    expect(month.cells.filter((cell) => cell === true)).toHaveLength(MONTH_FOLD_DAYS);
    expect(month.cells.filter((cell) => cell !== null)).toHaveLength(30);
    expect(month.ids).toHaveLength(MONTH_FOLD_DAYS);
  });

  it('整体在顶部与底部按钮之间：不压底部安全区，标签在牌上方', () => {
    const insets = { top: 72, bottom: 170, side: 24 };
    const layout = handLayout([group('resting_hr', range(1, 12)), group('stress', range(3, 9))], { width: 1280, height: 800 }, { ...options, insets });
    for (const card of layout.cards) {
      expect(px(card.style.top)).toBeGreaterThanOrEqual(insets.top);
      expect(px(card.style.top) + px(card.style.height)).toBeLessThanOrEqual(800 - insets.bottom + 0.5);
    }
    for (const label of layout.labels) {
      const mine = layout.cards.filter((card) => card.key === label.key);
      expect(Math.min(...mine.map((card) => px(card.style.top)))).toBeGreaterThan(px(label.style.top));
    }
  });

  it('每张牌带的是它自己这一组的颜色（颜色从外面按组给）', () => {
    const tints: Record<string, string> = { resting_hr: 'red', hrv: 'teal' };
    const layout = handLayout([group('resting_hr', ['2026-09-07']), group('hrv', ['2026-09-07'])], { width: 1440, height: 1000 }, { ...options, tintOf: (g) => tints[g.key]! });
    expect(layout.cards.map((card) => [card.key, card.style['--tint']])).toEqual([['resting_hr', 'red'], ['hrv', 'teal']]);
  });
});

import { describe, expect, it } from 'vitest';
import { groupSlots, handLayout, MONTH_FOLD_DAYS, monthId, type HandGroup } from '../hand';

const group = (key: string, dates: string[], category: HandGroup['category'] = 'recovery'): HandGroup => ({
  key, category, dates, items: dates.map((date) => ({ key: key === 'workout' ? `workout:${date}` : key, date })),
});
const options = { groupText: (key: string, n: number) => `${key} ${n}`, tintOf: () => '#f00', labelOf: (key: string) => key };
const px = (value: string) => Number.parseFloat(value);
const range = (from: number, to: number, month = '2026-09') => Array.from({ length: to - from + 1 }, (_, i) => `${month}-${String(from + i).padStart(2, '0')}`);
const box = (style: Record<string, string>) => ({ left: px(style.left!), top: px(style.top!), right: px(style.left!) + px(style.width!), bottom: px(style.top!) + px(style.height!) });

describe('收集箱铺开：排在一处（10-08 H4）', () => {
  it('按日期先后排成一条，不按星期分行', () => {
    // 2026-09-07 是周一、09-13 是周日、09-15 是下一周——以前会分成两排、按星期对齐列。
    const slots = groupSlots(group('resting_hr', ['2026-09-15', '2026-09-09', '2026-09-07', '2026-09-13']));
    expect(slots.map((slot) => (slot.kind === 'card' ? slot.item.date : slot.month))).toEqual(['2026-09-07', '2026-09-09', '2026-09-13', '2026-09-15']);
    const layout = handLayout([group('resting_hr', ['2026-09-15', '2026-09-09', '2026-09-07', '2026-09-13'])], { width: 1440, height: 1000 }, options);
    const tops = new Set(layout.cards.map((card) => card.style.top));
    expect(tops.size).toBe(1);
    const lefts = layout.cards.map((card) => px(card.style.left));
    expect([...lefts].sort((a, b) => a - b)).toEqual(lefts);
  });

  it('牌两两不重叠（以前下一排压住上一排的下半截）', () => {
    const layout = handLayout([group('resting_hr', range(1, 12)), group('hrv', range(3, 9))], { width: 900, height: 700 }, options);
    const all = [...layout.cards, ...layout.months].map((card) => box(card.style));
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i]!;
        const b = all[j]!;
        const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap).toBe(false);
      }
    }
  });

  it('一个月挑够天数折成一张月牌；点开（expanded）才摊开；运动不折', () => {
    const many = range(1, MONTH_FOLD_DAYS);
    const folded = groupSlots(group('hrv', many));
    expect(folded).toHaveLength(1);
    expect(folded[0]!.kind).toBe('month');
    const open = groupSlots(group('hrv', many), new Set([monthId('hrv', '2026-09')]));
    expect(open.every((slot) => slot.kind === 'card')).toBe(true);
    expect(open).toHaveLength(MONTH_FOLD_DAYS);
    expect(groupSlots(group('hrv', range(1, MONTH_FOLD_DAYS - 1))).every((slot) => slot.kind === 'card')).toBe(true);
    expect(groupSlots(group('workout', many, 'workout')).every((slot) => slot.kind === 'card')).toBe(true);
  });

  it('月牌落在它那个月的位置', () => {
    const slots = groupSlots(group('hrv', ['2026-08-10', ...range(1, MONTH_FOLD_DAYS), '2026-10-05']));
    expect(slots.map((slot) => (slot.kind === 'month' ? slot.month : slot.item.date))).toEqual(['2026-08-10', '2026-09', '2026-10-05']);
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

  it('整体在顶部与底部按钮之间；组标签一排在牌堆上方、不压任何一张牌', () => {
    const insets = { top: 72, bottom: 170, side: 24 };
    const layout = handLayout([group('resting_hr', range(1, 12)), group('stress', range(3, 9))], { width: 1280, height: 800 }, { ...options, insets });
    for (const card of layout.cards) {
      expect(px(card.style.top)).toBeGreaterThanOrEqual(insets.top);
      expect(px(card.style.top) + px(card.style.height)).toBeLessThanOrEqual(800 - insets.bottom + 0.5);
    }
    expect(layout.labels.map((label) => label.key)).toEqual(['resting_hr', 'stress']);
    expect(layout.labelTop).toBeGreaterThanOrEqual(insets.top);
    expect(Math.min(...layout.cards.map((card) => px(card.style.top)))).toBeGreaterThanOrEqual(layout.labelTop + 40);
  });

  it('每张牌带的是它自己这一组的颜色（颜色从外面按组给）', () => {
    const tints: Record<string, string> = { resting_hr: 'red', hrv: 'teal' };
    const layout = handLayout([group('resting_hr', ['2026-09-07']), group('hrv', ['2026-09-07'])], { width: 1440, height: 1000 }, { ...options, tintOf: (g) => tints[g.key]! });
    expect(layout.cards.map((card) => [card.key, card.style['--tint']])).toEqual([['resting_hr', 'red'], ['hrv', 'teal']]);
  });
});

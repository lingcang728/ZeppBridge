import { describe, expect, it } from 'vitest';
import { daysBetweenInclusive, deckRangeOf, expandGroup, focusWindow, groupSummary, monthsOf, pickableDates, rangeStart, rootLevel, weeksOf } from '../deck';

const lookup = (date: string) => (date.endsWith('3') ? null : { value: Number(date.slice(8)), has: true });

describe('扑克牌的层级', () => {
  it('范围决定第一层发什么牌', () => {
    expect(deckRangeOf(7)).toBe(7);
    expect(deckRangeOf(30)).toBe(30);
    expect(deckRangeOf(90)).toBe(180);
    expect(rangeStart('2026-10-06', 7)).toBe('2026-09-30');
    expect(rangeStart('2026-10-06', 30)).toBe('2026-09-07');
    expect(rangeStart('2026-10-06', 180)).toBe('2026-05-01');
  });

  it('一个月是 4–5 叠自然周，开头不满 3 天的那周并进下一叠', () => {
    // 2026-09-07 是周一：30 天正好从周一开始，五叠（最后一叠只有周一、周二）。
    const days = daysBetweenInclusive('2026-09-07', '2026-10-06', lookup);
    const weeks = weeksOf(days);
    expect(weeks.map((w) => [w.start, w.end])).toEqual([
      ['2026-09-07', '2026-09-13'], ['2026-09-14', '2026-09-20'], ['2026-09-21', '2026-09-27'],
      ['2026-09-28', '2026-10-04'], ['2026-10-05', '2026-10-06'],
    ]);
    // 从周日开始：那一天单独成不了一叠。
    const shifted = weeksOf(daysBetweenInclusive('2026-09-06', '2026-10-05', lookup));
    expect(shifted[0]!.start).toBe('2026-09-06');
    expect(shifted[0]!.days).toHaveLength(8);
    expect(shifted.length).toBeGreaterThanOrEqual(4);
    expect(shifted.length).toBeLessThanOrEqual(5);
  });

  it('六个月是六叠月，点开是这个月的周，再点开是日', () => {
    const days = daysBetweenInclusive(rangeStart('2026-10-06', 180), '2026-10-06', lookup);
    const root = rootLevel(days, 180);
    expect(root.kind).toBe('groups');
    if (root.kind !== 'groups') return;
    expect(root.groups.map((g) => g.id)).toEqual(['m:2026-05', 'm:2026-06', 'm:2026-07', 'm:2026-08', 'm:2026-09', 'm:2026-10']);
    const september = expandGroup(root.groups[4]!);
    expect(september.kind).toBe('groups');
    if (september.kind !== 'groups') return;
    // 9 月 1 日是周二：第一周只有 6 天，月里的周不并头。
    expect(september.groups[0]!.start).toBe('2026-09-01');
    expect(september.groups[0]!.end).toBe('2026-09-06');
    expect(expandGroup(september.groups[0]!)).toEqual({ kind: 'days', days: september.groups[0]!.days });
    expect(monthsOf(days)).toHaveLength(6);
  });

  it('没有记录的日子照样发牌，但不能勾，平均值不拿 0 充数', () => {
    const week = weeksOf(daysBetweenInclusive('2026-09-21', '2026-09-27', lookup))[0]!;
    expect(week.days.find((d) => d.date === '2026-09-23')).toEqual({ date: '2026-09-23', value: null, has: false });
    expect(pickableDates(week)).not.toContain('2026-09-23');
    const summary = groupSummary(week);
    expect(summary).toEqual({ recorded: 6, total: 7, average: (21 + 22 + 24 + 25 + 26 + 27) / 6 });
    const empty = weeksOf(daysBetweenInclusive('2026-09-21', '2026-09-22', () => null))[0]!;
    expect(groupSummary(empty).average).toBeNull();
  });

  it('从某一天点开：以它为中心的 7 天，不超过今天', () => {
    expect(focusWindow('2026-09-20', '2026-10-06')).toEqual(['2026-09-17', '2026-09-23']);
    // 离今天不到 3 天：整段往前挪，最后一天停在今天，被点的那天不一定在正中。
    expect(focusWindow('2026-10-05', '2026-10-06')).toEqual(['2026-09-30', '2026-10-06']);
  });
});

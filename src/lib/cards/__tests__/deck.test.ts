import { describe, expect, it } from 'vitest';
import { cardIdOf, daysBetweenInclusive, deckRangeOf, expandGroup, focusWindow, groupDots, groupSummary, monthsOf, pickableDates, quartersOf, rangeStart, rootLevel, spanBetween, weeksOf, yearsOf } from '../deck';
import { groupCoverage, monthsIn } from '../coverage';
import type { CoverageLedger } from '../../../types';

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

  it('1 年是四叠自然季度，点开是三个月；全部是十年一年一叠，点开是四个季度', () => {
    expect(deckRangeOf(365)).toBe(365);
    expect(deckRangeOf(3650)).toBe(3650);
    expect(deckRangeOf(200)).toBe(365);
    expect(rangeStart('2026-10-06', 365)).toBe('2026-01-01');
    expect(rangeStart('2026-02-10', 365)).toBe('2025-04-01');
    expect(rangeStart('2026-10-06', 3650)).toBe('2017-01-01');
    const year = rootLevel(daysBetweenInclusive(rangeStart('2026-02-10', 365), '2026-02-10', lookup), 365);
    expect(year.kind).toBe('groups');
    if (year.kind !== 'groups') return;
    expect(year.groups.map((g) => g.id)).toEqual(['q:2025-2', 'q:2025-3', 'q:2025-4', 'q:2026-1']);
    const quarter = expandGroup(year.groups[1]!);
    expect(quarter.kind === 'groups' && quarter.groups.map((g) => g.id)).toEqual(['m:2025-07', 'm:2025-08', 'm:2025-09']);
    const all = rootLevel(daysBetweenInclusive(rangeStart('2026-10-06', 3650), '2026-10-06', lookup), 3650);
    expect(all.kind === 'groups' && all.groups.map((g) => g.id)).toEqual(Array.from({ length: 10 }, (_, i) => `y:${2017 + i}`));
    const one = yearsOf(daysBetweenInclusive('2025-01-01', '2025-12-31', lookup))[0]!;
    const expanded = expandGroup(one);
    expect(expanded.kind === 'groups' && expanded.groups.map((g) => g.kind)).toEqual(['quarter', 'quarter', 'quarter', 'quarter']);
  });

  it('季叠、年叠的小点一月一个，不是几百个', () => {
    const days = daysBetweenInclusive('2025-01-01', '2025-03-31', (date) => (date.startsWith('2025-02') ? null : { value: 1, has: true }));
    const [quarter] = quartersOf(days);
    expect(groupDots(quarter!, (date) => date === '2025-03-05')).toEqual([true, false, 'picked']);
    const [week] = weeksOf(daysBetweenInclusive('2025-01-06', '2025-01-12', lookup));
    expect(groupDots(week!, () => false)).toHaveLength(7);
  });

  it('连选按牌序取两头之间的每一张，不管先点哪头', () => {
    const days = daysBetweenInclusive('2026-09-01', '2026-09-07', lookup);
    expect(spanBetween(days, cardIdOf, '2026-09-05', '2026-09-02').map(cardIdOf)).toEqual(['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']);
    expect(spanBetween(days, cardIdOf, '2026-09-02', '2026-09-02')).toHaveLength(1);
    expect(spanBetween(days, cardIdOf, '2026-08-01', '2026-09-02')).toEqual([]);
  });
});

describe('没有记录的一叠：还没补拉还是云端没有', () => {
  const ledger = (emptyMonths: string[], requestedFrom = '2024-01-01'): CoverageLedger => ({
    requested_from: requestedFrom, requested_to: '2026-10-01', total_chunks: 1, completed_chunks: 1, complete: true, failed_chunks_detail: [], needs_manual_retry: false,
    streams: [{ stream: 'sleep', requested_chunks: 1, persisted_chunks: 0, empty_chunks: emptyMonths.length, failed_chunks: 0, pending_chunks: 0, persisted_from: null, persisted_to: null, empty_months: emptyMonths, records: 0 }],
  });
  const none = () => null;
  const q = quartersOf(daysBetweenInclusive('2024-04-01', '2024-06-30', none))[0]!;

  it('月份按账本的写法列出来', () => {
    expect(monthsIn('2024-11-15', '2025-02-03')).toEqual(['2024-11-01', '2024-12-01', '2025-01-01', '2025-02-01']);
  });

  it('账本里这几个月云端都说没有：云端没有', () => {
    expect(groupCoverage(q, { category: 'sleep', earliestLocal: '2026-01-01', ledger: ledger(['2024-04-01', '2024-05-01', '2024-06-01']) })).toBe('cloud_empty');
  });

  it('早于本机最早一天、云端也没说没有：还没补拉', () => {
    expect(groupCoverage(q, { category: 'sleep', earliestLocal: '2026-01-01', ledger: ledger(['2024-04-01']) })).toBe('not_backfilled');
    expect(groupCoverage(q, { category: 'sleep', earliestLocal: '2026-01-01', ledger: null })).toBe('not_backfilled');
  });

  it('本机范围里的空叠、有记录的叠、体重这种不补拉的类别：不下结论', () => {
    expect(groupCoverage(q, { category: 'sleep', earliestLocal: '2024-01-01', ledger: null })).toBeNull();
    const recorded = quartersOf(daysBetweenInclusive('2024-04-01', '2024-06-30', lookup))[0]!;
    expect(groupCoverage(recorded, { category: 'sleep', earliestLocal: '2026-01-01', ledger: null })).toBeNull();
    expect(groupCoverage(q, { category: 'body', earliestLocal: '2026-01-01', ledger: ledger(['2024-04-01', '2024-05-01', '2024-06-01']) })).toBe('not_backfilled');
  });
});

/**
 * 牌桌上每一叠（周 / 月 / 季 / 年）牌面要显示的东西，一次算好放进一张表（10-28 牌桌卡顿，从 CardTable.vue 拆出来）。
 *
 * 以前模板里每张叠牌现场调 `groupSummary` / `pickableDates` / `groupDots` / `coverageOf`，每次 O(天数)
 * （「全部」是十年 3650 天），`box.has` 又是对整张已挑清单线性扫；而按住、拖起、悬停任何一个状态一变就整桌重渲染，
 * `dots` 每次是新数组，逼每张牌重打补丁——拖一张年牌，每帧都在把十年的日子重数一遍。
 *
 * 现在：
 * - 只看叠本身的部分（概况、能挑的日子、按月分好的小点）按叠对象缓存（叠是不可变的，换层 / 换范围才换新的）；
 * - 表本身是 `computed`，只在层级、已挑、覆盖账本、语言变了时重算；
 * - 重算出来和上一次一模一样的那一叠沿用上一次的对象，牌的 props 不变就不重打补丁。
 */
import { computed, type ComputedRef } from 'vue';
import { useCardCollection } from './useCardCollection';
import { useCardsText } from '../components/cards/cards.i18n';
import { groupSummary, monthsOf, quarterOf, type DeckDay, type DeckGroup, type DeckLevel, type GroupCoverage } from '../lib/cards/deck';
import { groupCoverage, type CoverageContext } from '../lib/cards/coverage';
import type { DeckSource } from '../lib/cards/sources';

export interface GroupView {
  title: string;
  top: string;
  value: string | null;
  dots: Array<boolean | 'picked'>;
  empty: boolean;
  coverage: GroupCoverage;
  badge: string | null;
  /** 挑了一部分 = 虚线；整叠挑满 = 实线实底（10-08 H5）。 */
  picked: 'some' | 'all' | null;
  aria: string;
  description: string;
}

/** 只看叠本身、和已挑无关的部分。 */
interface GroupFacts { summary: ReturnType<typeof groupSummary>; pickable: string[]; buckets: DeckDay[][] }
const facts = new WeakMap<DeckGroup, GroupFacts>();
const factsOf = (group: DeckGroup): GroupFacts => {
  let hit = facts.get(group);
  if (!hit) {
    // 周叠、月叠一天一个点；季叠、年叠一月一个点（和 lib/cards/deck.ts 的 groupDots 一致）。
    const buckets = group.kind === 'week' || group.kind === 'month' ? group.days.map((day) => [day]) : monthsOf(group.days).map((month) => month.days);
    hit = { summary: groupSummary(group), pickable: group.days.filter((day) => day.has).map((day) => day.date), buckets };
    facts.set(group, hit);
  }
  return hit;
};

const sameView = (a: GroupView, b: GroupView) => a.title === b.title && a.top === b.top && a.value === b.value && a.empty === b.empty && a.coverage === b.coverage
  && a.badge === b.badge && a.picked === b.picked && a.aria === b.aria && a.description === b.description
  && a.dots.length === b.dots.length && a.dots.every((dot, i) => dot === b.dots[i]);

export const useGroupViews = (options: {
  /** 牌桌上每一层（含退到桌角的）。 */
  levels: () => DeckLevel[];
  source: () => DeckSource;
  coverage: () => CoverageContext | null;
  numberText: (value: number | null) => string | null;
  md: (date: string) => string;
  monthName: (date: string) => string;
  yearMonth: (date: string) => string;
}) => {
  const t = useCardsText();
  const box = useCardCollection();

  const groupTitle = (group: DeckGroup) => {
    if (group.kind === 'year') return group.start.slice(0, 4);
    if (group.kind === 'quarter') return t.value.quarter(quarterOf(group.start));
    return group.kind === 'month' ? options.monthName(group.start) : t.value.weekRange(options.md(group.start), options.md(group.end));
  };
  const groupTop = (group: DeckGroup) => {
    if (group.kind === 'year') return t.value.yearTop;
    return group.kind === 'month' || group.kind === 'quarter' ? group.start.slice(0, 4) : options.yearMonth(group.start);
  };

  let previous = new Map<string, GroupView>();
  const views: ComputedRef<Map<string, GroupView>> = computed(() => {
    const key = options.source().key;
    const picked = new Set(box.picks.value.filter((pick) => pick.key === key).map((pick) => pick.date));
    const ctx = options.coverage();
    const next = new Map<string, GroupView>();
    for (const level of options.levels()) {
      if (level.kind !== 'groups') continue;
      for (const group of level.groups) {
        const { summary, pickable, buckets } = factsOf(group);
        const title = groupTitle(group);
        const average = options.numberText(summary.average);
        const sub = t.value.recordedOf(summary.recorded, summary.total);
        const n = pickable.reduce((count, date) => count + (picked.has(date) ? 1 : 0), 0);
        const view: GroupView = {
          title,
          top: groupTop(group),
          value: average === null ? null : t.value.average(average),
          dots: buckets.map((days) => (days.some((day) => day.has && picked.has(day.date)) ? 'picked' : days.some((day) => day.has))),
          empty: !summary.recorded,
          coverage: groupCoverage(group, ctx),
          badge: n ? t.value.pickedOf(n, pickable.length) : null,
          picked: !n ? null : n >= pickable.length ? 'all' : 'some',
          aria: t.value.groupAria(title, sub),
          description: n && n === pickable.length ? t.value.holdToUnpick : t.value.holdToPick,
        };
        const before = previous.get(group.id);
        next.set(group.id, before && sameView(before, view) ? before : view);
      }
    }
    previous = next;
    return next;
  });

  return { views, groupTitle };
};

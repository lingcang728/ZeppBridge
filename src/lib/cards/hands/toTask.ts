/**
 * 一手牌 → 交给 AI 的任务里「交哪几类、哪几天、哪几次运动」。
 *
 * - 运动牌：那几次运动进 `workout_ids`（逐条细节），运动这一类只交那几天；
 * - 一晚的牌：睡眠、恢复、静息心率三类交那一天；
 * - 这手牌之外的那段日子（`span`）：指定的几类交整段。
 * 没被牌或 span 点到的类别不交（和收集箱交给任务时一样）。
 */
import type { AiTaskCategory } from '../../bridge/types';
import type { Hand, HandCard } from './types';
import { addDays } from './util';

const NIGHT_CATEGORIES: AiTaskCategory[] = ['sleep', 'recovery', 'resting_hr'];

export interface HandPicks {
  byCategory: Map<AiTaskCategory, string[]>;
  workoutIds: string[];
}

export const handPicks = (hand: Pick<Hand, 'cards' | 'span'>): HandPicks => {
  const byCategory = new Map<AiTaskCategory, Set<string>>();
  const add = (category: AiTaskCategory, date: string) => {
    const set = byCategory.get(category) ?? new Set<string>();
    set.add(date);
    byCategory.set(category, set);
  };
  const workoutIds: string[] = [];
  for (const card of hand.cards) {
    if (card.kind === 'workout') {
      workoutIds.push(card.workout.workout_id);
      add('workout', card.date);
    } else {
      for (const category of NIGHT_CATEGORIES) add(category, card.date);
    }
  }
  if (hand.span) {
    for (let day = hand.span.from; day <= hand.span.to; day = addDays(day, 1)) {
      for (const category of hand.span.categories) add(category, day);
    }
  }
  return {
    byCategory: new Map([...byCategory].map(([category, dates]) => [category, [...dates].sort()])),
    workoutIds: [...new Set(workoutIds)],
  };
};

/** 抽掉一张：从主牌挪进候补最前面。 */
export const drawOut = (hand: Hand, id: string): Hand => {
  const card = hand.cards.find((one) => one.id === id);
  if (!card) return hand;
  return { ...hand, cards: hand.cards.filter((one) => one.id !== id), bench: [card, ...hand.bench] };
};

/** 从候补换进来一张（按日期插回主牌）。`out` 给了就同时把那一张换下去。 */
export const swapIn = (hand: Hand, id: string, out: string | null = null): Hand => {
  const card = hand.bench.find((one) => one.id === id);
  if (!card) return hand;
  const leaving: HandCard | undefined = out ? hand.cards.find((one) => one.id === out) : undefined;
  const cards = [...hand.cards.filter((one) => one.id !== out), card].sort((a, b) => a.date.localeCompare(b.date));
  const bench = [...(leaving ? [leaving] : []), ...hand.bench.filter((one) => one.id !== id)];
  return { ...hand, cards, bench };
};

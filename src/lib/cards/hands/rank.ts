/**
 * 首页「今日一问」：今天能问哪几个问题、按什么顺序。
 *
 * 每个模板就是一手牌（规则在 question.ts / suggest.ts），发不出牌的模板不出，不放空牌。
 * 排序先写死：有当下的事（刚比完赛、刚刷了 PR、刚练完、昨晚恢复异常、昨晚睡得差、很久没动）就排在前面，
 * 其余垫底：通用的（排明天、昨晚睡得怎么样）在前，和运动项目有关的按用户画像（sport.ts）——常练的是跑、骑、游、徒步，
 * 先问同距离段和同一条路线；常练的是力量、拉伸、球类这些，先问最近几次同类训练。第一个就是今天推荐的那一问；卡上的刷新键按这个顺序一个个换过去，转一圈回到第一个。
 * 阈值在 constants.ts。
 */
import { PR_RECENT_DAYS, RACE_RECENT_DAYS } from './constants';
import { distanceBest, raceReview, recoveryNights, sameRoute } from './question';
import { comeback, planTomorrow, recoveryDay, reviewWorkout, sessionReview } from './suggest';
import { sportProfile } from './sport';
import type { Hand, HandFacts, HandResult } from './types';
import { dayDiff } from './util';
import type { Suggestion } from '../../../types/hands';

export type SuggestTemplate =
  | 'plan_tomorrow' | 'sleep_review' | 'review_workout' | 'race_review'
  | 'distance_best' | 'same_route' | 'recovery_nights' | 'comeback' | 'session_review';

export const SUGGEST_TEMPLATES: readonly SuggestTemplate[] = [
  'plan_tomorrow', 'sleep_review', 'review_workout', 'race_review', 'distance_best', 'same_route', 'recovery_nights', 'comeback', 'session_review',
];
export const isSuggestTemplate = (value: unknown): value is SuggestTemplate => SUGGEST_TEMPLATES.includes(value as SuggestTemplate);

export interface RankedSuggestion {
  template: SuggestTemplate;
  hand: Hand;
  /** 触发它的那张后端建议（刚练完 / 昨晚睡得差 / 很久没动）；用了这一问以后按它的 key 记成「这一次用过了」。 */
  suggestion: Suggestion | null;
}

/** 没有当下的事时垫底的顺序：通用的两问在前，`sport` 那几问按画像排，最后是恢复异常夜和比赛复盘。 */
const fallback = (sportFirst: boolean): SuggestTemplate[] => {
  const sport: SuggestTemplate[] = sportFirst ? ['distance_best', 'same_route', 'session_review'] : ['session_review', 'distance_best', 'same_route'];
  return ['plan_tomorrow', 'sleep_review', ...sport, 'recovery_nights', 'race_review'];
};

const handOf = (result: HandResult): Hand | null => (result.ok && result.hand.cards.length ? result.hand : null);

export const rankSuggestions = (facts: HandFacts, signals: readonly Suggestion[] = [], today = facts.today): RankedSuggestion[] => {
  const signal = <C extends Suggestion['code']>(code: C) => signals.find((s): s is Extract<Suggestion, { code: C }> => s.code === code) ?? null;
  const done = signal('workout_done');
  const poor = signal('sleep_poor');
  const idle = signal('long_idle');

  // 每个模板只发一次牌，排序和出牌共用。
  const cache = new Map<SuggestTemplate, RankedSuggestion | null>();
  const deal = (template: SuggestTemplate): RankedSuggestion | null => {
    if (cache.has(template)) return cache.get(template)!;
    let hand: Hand | null = null;
    let suggestion: Suggestion | null = null;
    switch (template) {
      case 'plan_tomorrow': hand = handOf(planTomorrow(facts)); break;
      case 'sleep_review': {
        // 昨晚睡得差有后端那张就照它那一晚；没有就看昨晚（今天醒来的那一晚）有没有睡眠。
        const night = poor?.night ?? (facts.nights.some((n) => n.date === today && n.duration_min !== null) ? today : null);
        hand = night ? handOf(recoveryDay(facts, night)) : null;
        suggestion = poor;
        break;
      }
      case 'review_workout':
        hand = done ? handOf(reviewWorkout(facts, done.workout_id, done.same_type_ids)) : null;
        suggestion = done;
        break;
      case 'race_review': hand = handOf(raceReview(facts)); break;
      case 'distance_best': hand = handOf(distanceBest(facts)); break;
      case 'same_route': hand = handOf(sameRoute(facts)); break;
      case 'recovery_nights': hand = handOf(recoveryNights(facts)); break;
      case 'session_review': hand = handOf(sessionReview(facts)); break;
      case 'comeback':
        hand = idle ? handOf(comeback(facts)) : null;
        suggestion = idle;
        break;
    }
    const ranked = hand ? { template, hand, suggestion } : null;
    cache.set(template, ranked);
    return ranked;
  };

  const within = (date: string | number | undefined, days: number) => {
    if (typeof date !== 'string') return false;
    const ago = dayDiff(date, today);
    return ago >= 0 && ago < days;
  };
  /** 刷了 PR：PR 链至少两张（第一次跑这个距离不算刷新），最新那张在近几天里。 */
  const freshPr = () => {
    const prs = deal('distance_best')?.hand.cards.filter((card) => card.role === 'pr') ?? [];
    if (prs.length < 2) return false;
    return within(prs.reduce((latest, card) => (card.date > latest ? card.date : latest), ''), PR_RECENT_DAYS);
  };
  /** 昨晚（今天醒来的那一晚）就是恢复偏离常态的一晚。 */
  const offLastNight = () => !!deal('recovery_nights')?.hand.cards.some((card) => card.role === 'outlier' && card.date === today);

  const order: SuggestTemplate[] = [];
  if (within(deal('race_review')?.hand.params.date, RACE_RECENT_DAYS)) order.push('race_review');
  if (freshPr()) order.push('distance_best');
  if (done) order.push('review_workout');
  if (offLastNight()) order.push('recovery_nights');
  if (poor) order.push('sleep_review');
  if (idle) order.push('comeback');
  const top = sportProfile(facts.workouts, today)[0];
  order.push(...fallback(!top || top === 'run' || top === 'ride' || top === 'swim' || top === 'hike'));

  const seen = new Set<SuggestTemplate>();
  const out: RankedSuggestion[] = [];
  for (const template of order) {
    if (seen.has(template)) continue;
    seen.add(template);
    const ranked = deal(template);
    if (ranked) out.push(ranked);
  }
  return out;
};

/** 今天推荐的那一问（没有能问的就是 null）。 */
export const pickSuggestion = (facts: HandFacts, signals: readonly Suggestion[] = [], today = facts.today): RankedSuggestion | null =>
  rankSuggestions(facts, signals, today)[0] ?? null;

/**
 * 发牌规则（「建议 → 发牌 → 交给 AI」）。纯函数，吃 `card_hand_facts` 的事实，吐一手牌。
 * 交给 AI 主面板的「按问题发牌」和首页建议卡用的是同一套规则。
 */
import type { HandFacts, HandResult, QuestionHandKind } from './types';
import { distanceBest, raceReview, recoveryNights, sameRoute } from './question';

export * from './types';
export * from './constants';
export { distanceBest, raceReview, recoveryNights, refineSameRoute, sameRoute, sameRouteRough, trackDistance, nightFlags, raceLike, bucketOf, ownBucketKm } from './question';
export { comeback, planTomorrow, recoveryDay, reviewWorkout } from './suggest';
export { isSuggestTemplate, pickSuggestion, rankSuggestions, SUGGEST_TEMPLATES, type RankedSuggestion, type SuggestTemplate } from './rank';
export { drawOut, handPicks, swapIn, type HandPicks } from './toTask';
export { byDate, paceOf, familyOf } from './util';

/** 交给 AI 主面板上「按问题发牌」的四种，按这个顺序摆。 */
export const QUESTION_KINDS: readonly QuestionHandKind[] = ['distance_best', 'same_route', 'race_review', 'recovery_nights'];

export const dealQuestion = (kind: QuestionHandKind, facts: HandFacts): HandResult => {
  switch (kind) {
    case 'same_route': return sameRoute(facts);
    case 'distance_best': return distanceBest(facts);
    case 'race_review': return raceReview(facts);
    default: return recoveryNights(facts);
  }
};

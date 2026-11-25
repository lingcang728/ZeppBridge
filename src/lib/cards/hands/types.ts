/**
 * 发牌（「建议 → 发牌 → 交给 AI」）的数据形状。
 *
 * 一手牌 = 几张牌（一次运动或一晚）+ 候补 + 这手牌之外一并交出去的那段日子（比如赛前四周的睡眠）。
 * 规则是纯函数，只吃 `card_hand_facts` 给的事实；文案、颜色在界面里。
 */
import type { AiTaskCategory } from '../../bridge/types';
import type { HandFacts, HandLines, HandNight, HandWorkout } from '../../../types/hands';

export type { HandFacts, HandLines, HandNight, HandWorkout };

/** 「按问题发牌」的四种（交给 AI 主面板上直接能选）。 */
export type QuestionHandKind = 'same_route' | 'distance_best' | 'race_review' | 'recovery_nights';
/** 首页建议卡点进来的几种。 */
export type SuggestHandKind = 'review_workout' | 'recovery_day' | 'comeback' | 'plan_tomorrow' | 'session_review';
export type HandKind = QuestionHandKind | SuggestHandKind;

/** 这张牌为什么在这手牌里（牌面角标按它写）。 */
export type CardRole =
  /** 这手牌围着它转的那一次（复盘的这次、比赛、最近一次跑这条路线）。 */
  | 'anchor'
  /** 刷新了个人最好。 */
  | 'pr'
  /** 比赛（或配速明显高于常态的一次）。 */
  | 'race'
  /** 赛前的训练。 */
  | 'build'
  /** 同一路线 / 同类的另一次。 */
  | 'same'
  /** 最近的几次。 */
  | 'recent'
  /** 恢复读数明显偏离基线的一晚。 */
  | 'outlier'
  /** 那一晚前一天的运动。 */
  | 'day_before'
  /** 普通的一晚。 */
  | 'night';

export type HandCard =
  | { kind: 'workout'; id: string; date: string; role: CardRole; workout: HandWorkout; /** 牌面角标的参数（PR 的距离段等）。 */ note?: string | null }
  | { kind: 'night'; id: string; date: string; role: CardRole; night: HandNight; /** 偏离了哪几项。 */ flags?: NightFlag[] };

export type NightFlag = 'hrv_low' | 'rhr_high' | 'sleep_short';

/** 这手牌之外一并交出去的一段日子：哪几类、从哪天到哪天（含两头）。 */
export interface HandSpan {
  from: string;
  to: string;
  categories: AiTaskCategory[];
}

export interface Hand {
  kind: HandKind;
  cards: HandCard[];
  /** 候补：能换进来的牌（按日期新 → 旧）。 */
  bench: HandCard[];
  span: HandSpan | null;
  /** 问题模板用的参数（界面按语言写句子）：距离段、比赛那天、路线距离、明天是哪天…… */
  params: Record<string, string | number>;
}

/** 没有可发的牌时为什么（界面按它写空状态）。 */
export type EmptyReason = 'no_routes' | 'no_distance' | 'no_race' | 'no_outliers' | 'no_data';

export type HandResult = { ok: true; hand: Hand } | { ok: false; kind: HandKind; reason: EmptyReason };

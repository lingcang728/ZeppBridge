/**
 * 牌桌的「连选」（3.0.4「自定义 = 在当前层级连续拖选卡」）：开着「连选」时先点起点那张、再点终点那张，
 * 中间（含两头）的每一张都放进收集箱；平时按住 Shift 点一张，从上一次点的那张连到这一张。
 * 范围按整张牌对齐、卡序不变，不提供自由日期。拖牌已经是「拖进箱子」，所以连选不靠拖。
 */
import { ref } from 'vue';
import { cardIdOf, spanBetween, type DeckLevel } from '../lib/cards/deck';
import type { useCardPicking } from './useCardPicking';

export const useCardSpan = (options: {
  level: () => DeckLevel | null;
  picking: ReturnType<typeof useCardPicking>;
  blocked: () => boolean;
}) => {
  const on = ref(false);
  /** 起点那张（平时是上一次点的那张，给 Shift 连选用）。 */
  const from = ref<string | null>(null);
  const reset = () => { on.value = false; from.value = null; };
  const toggle = () => { on.value = !on.value; from.value = null; };

  /** 这一下点击归连选处理了就返回 true（调用方不再翻牌 / 展开）。 */
  const tap = (event: MouseEvent, id: string): boolean => {
    const level = options.level();
    // 牌还在动时不接：连选开着就把这一下吞掉，别让它落回普通的翻牌 / 展开。
    if (!level || options.blocked()) return on.value;
    const ids = level.kind === 'days' ? level.days.map(cardIdOf) : level.groups.map((group) => group.id);
    const anchor = from.value && ids.includes(from.value) ? from.value : null;
    if ((!on.value && !event.shiftKey) || !anchor || (on.value && anchor === id)) {
      from.value = id;
      return on.value;
    }
    if (level.kind === 'days') void options.picking.pickAll(spanBetween(level.days, cardIdOf, anchor, id), null);
    else void options.picking.pickAll(null, spanBetween(level.groups, (group) => group.id, anchor, id));
    from.value = on.value ? null : id;
    on.value = false;
    return true;
  };

  return { on, from, reset, toggle, tap };
};

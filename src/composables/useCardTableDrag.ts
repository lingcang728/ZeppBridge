/**
 * 牌桌上的拖牌、叠牌接线（1B·B3，从 CardTable.vue 拆出来）：把 `useCardDrag`（拖 / 叠 / 进箱）和
 * `useCardPicking`（翻面、长按、飞进箱子）接在一起——
 * 日牌能叠、周 / 月叠只能拖进箱子；长按一叠最上面那张 = 整叠进箱子；叠里的牌进了箱子就从叠里拿掉；
 * 结构要变（推镜头、退层、换范围、收牌）之前 `scatter()` 让叠全部散掉、不放动画。
 */
import { ref, watch } from 'vue';
import { useCardDrag } from './useCardDrag';
import type { useCardPicking } from './useCardPicking';
import { cardIdOf, pickableDates, type DeckDay, type DeckLevel } from '../lib/cards/deck';
import { reducedMotion } from '../lib/motion/cards';

export const useCardTableDrag = (options: {
  /** 最上面这一层。 */
  level: () => DeckLevel | null;
  cardOf: (id: string) => HTMLElement | null;
  picking: ReturnType<typeof useCardPicking>;
  /** 牌桌结构在变：不许拖。 */
  blocked: () => boolean;
  /** 这一天已经在收集箱里了。 */
  has: (date: string) => boolean;
}) => {
  const { picking } = options;
  const topLevel = options.level;
  const dayOf = (id: string) => { const level = topLevel(); return level?.kind === 'days' ? level.days.find((day) => cardIdOf(day) === id) ?? null : null; };
  const groupOf = (id: string) => { const level = topLevel(); return level?.kind === 'groups' ? level.groups.find((group) => group.id === id) ?? null : null; };
  const drag = useCardDrag({
    cardOf: options.cardOf,
    isDay: (id) => !!dayOf(id),
    canDrag: (id) => {
      if (options.blocked()) return false;
      const day = dayOf(id);
      if (day) return day.has && picking.stateOf(id) === 'front';
      const group = groupOf(id);
      return !!group && pickableDates(group).some((date) => !options.has(date));
    },
    canPileOn: (id) => { const day = dayOf(id); return !!day && day.has && picking.stateOf(id) === 'front'; },
    onStart: () => picking.holdEnd(),
    dropInBox: (id, el) => {
      const day = dayOf(id);
      if (day) { void picking.sendDay(day, el); return; }
      const group = groupOf(id);
      if (group) void picking.pickGroup(group, el);
    },
  });
  /** 叠里的牌进了箱子（或被翻面送走）：从叠里拿掉，回各自的牌位显示虚线轮廓。 */
  watch(() => drag.piles.value.flatMap((pile) => pile.cards).filter((id) => picking.stateOf(id) === 'boxed'), (gone) => { if (gone.length) drag.unpile(gone); });
  /** 结构要变（推镜头、退层、换范围、收牌）之前：叠全部散掉、不放动画。 */
  const scatter = () => { drag.unpile(drag.piles.value.flatMap((pile) => pile.cards), false); drag.reset(); };
  /** 长按一叠的最上面那张：整叠飞进箱子。 */
  const sendPile = (id: string, el: HTMLElement) => {
    const pile = drag.pileOf(id);
    const days = (pile?.cards ?? [id]).map(dayOf).filter((day): day is DeckDay => !!day);
    void picking.sendDays(days, el);
  };
  /** 这张牌在一叠里：那一叠最上面那张的 id。 */
  const pileTop = (id: string) => { const pile = drag.pileOf(id); return pile ? pile.cards[pile.cards.length - 1]! : null; };
  /**
   * 叠在一起的牌只认长按（10-08 H9）：以前点最上面那张会翻面，点到露出来的下面几张的边（pointer-events: none）
   * 会穿到桌面上、当成「点空白收牌」——用户看到的是「点一下不知道触发了什么就直接退回去了」。
   * 现在按住叠里任何一张都是长按整叠；点一下只让那一叠晃一下、角标换成「长按整叠」。
   */
  const hintId = ref<string | null>(null);
  let hintTimer = 0;
  const nudge = (top: string) => {
    const el = options.cardOf(top);
    if (el && !reducedMotion()) {
      el.animate([{ transform: 'none' }, { transform: 'translateX(-5px) rotate(-1.5deg)' }, { transform: 'translateX(4px) rotate(1deg)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }],
        { duration: 360, easing: 'ease-in-out' });
    }
    hintId.value = top;
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => { hintId.value = null; }, 1800);
  };
  const onDayDown = (event: PointerEvent, day: DeckDay) => {
    const id = cardIdOf(day);
    drag.down(event, id);
    const top = pileTop(id);
    if (top) picking.holdStart({ id: top }, event, () => { const el = options.cardOf(top); if (el) sendPile(top, el); });
  };
  const onDayMove = (event: PointerEvent) => { drag.move(event); picking.holdMove(event); };
  const onDayUp = (event: PointerEvent) => { drag.up(event); picking.holdEnd(); };
  const onDayCancel = (event: PointerEvent) => { drag.cancelEvent(event); picking.holdEnd(); };
  const onDayTap = (day: DeckDay, event: MouseEvent) => {
    if (drag.consumeClick() || picking.consumeHold()) return;
    const top = pileTop(cardIdOf(day));
    if (top) { nudge(top); return; }
    void picking.onDayClick(day, event);
  };

  return { drag, scatter, hintId, onDayDown, onDayMove, onDayUp, onDayCancel, onDayTap };
};

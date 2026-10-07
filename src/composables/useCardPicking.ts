/**
 * 牌桌上挑牌（第三轮精修 A3 / B10，从 CardTable.vue 拆出来）：一张日牌要两步才进收集箱。
 *
 * 1. 点一下：牌先抬起来（160ms），再横向翻到背面「交给 AI ✓」——左右的牌往两边让一点；点空白、点别的牌、Esc 都是放下。
 * 2. 点背面的大圆勾：**真牌本身**离开牌位沿弧线飞进箱子，到了箱子才 +1（`box.add` 推迟到落地，飞行被取消就回滚）。
 *    牌位留下一圈虚线「在收集箱里」；点它，一张牌从箱子飞回来、翻回正面（= 拿出来，离开箱子那一刻就 −1）。
 * 一叠（周 / 月）长按 450ms 整叠一起飞进去（不再撒六张替身），满了再长按就整叠拿回来。
 * 箱子那边把牌拿出去时（收集箱铺开时拖走），牌桌上对应的虚线轮廓翻回正面，不硬切（`lagBoxed` 慢一拍跟着箱子）。
 */
import { computed, nextTick, reactive, ref, watch, type Ref } from 'vue';
import { useCardCollection } from './useCardCollection';
import { flipCard, flyCardHome, flyFromBox, reducedMotion } from '../lib/motion/cards';
import { cardIdOf, pickableDates, type DeckDay, type DeckGroup } from '../lib/cards/deck';
import type { DeckSource } from '../lib/cards/sources';

const HOLD_MS = 450;
const LIFT_MS = 160;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export type CardState = 'front' | 'confirm' | 'boxed';

export const useCardPicking = (options: {
  source: () => DeckSource;
  /** 牌桌这一刻在忙（发牌、推镜头、收牌）：不接受挑牌。 */
  busy: Ref<boolean>;
  /** 按牌的 id（日期 / 叠的 id）找到它的元素。 */
  cardOf: (id: string) => HTMLElement | null;
  /** 打断接力：还在发的牌先在很短时间里落定（点一张正在飞的牌，等它落下再翻面）。 */
  settle?: () => Promise<void>;
  /** 一张牌 / 一叠开始飞向箱子（牌桌让背景深一下，1A·A6）。 */
  onFly?: () => void;
}) => {
  const box = useCardCollection();
  const boxEl = () => document.getElementById('card-collection-box');
  const key = () => options.source().key;
  const confirmId = ref<string | null>(null);
  const liftId = ref<string | null>(null);
  const holdId = ref<string | null>(null);
  /** 正在飞进箱子的牌（牌位已经是虚线轮廓，箱子还没 +1）。 */
  const flying = reactive(new Set<string>());
  /** 正在从箱子飞回来的牌（背面朝上，落定后翻回正面）。 */
  const returning = reactive(new Set<string>());
  /** 箱子里有的这一项的日子，慢一拍：箱子那边拿走一张，这里先翻面再换。 */
  const mine = computed(() => {
    const source = options.source();
    const idOf = source.idOfPick ?? ((pick: { key: string; date: string }) => (pick.key === source.key ? pick.date : null));
    const ids = box.picks.value.map(idOf).filter((id): id is string => !!id);
    return [...new Set([...ids, ...(source.extraBoxed?.() ?? [])])];
  });
  const lagBoxed = reactive(new Set<string>(mine.value));

  watch(mine, (now, before) => {
    const kept = new Set(now);
    for (const date of now) lagBoxed.add(date);
    for (const date of before ?? []) {
      if (kept.has(date) || !lagBoxed.has(date)) continue;
      const el = returning.has(date) ? null : options.cardOf(date);
      if (!el || reducedMotion()) { lagBoxed.delete(date); continue; }
      void flipCard(el, async () => { lagBoxed.delete(date); await nextTick(); });
    }
  });

  const stateOf = (id: string): CardState => {
    if (returning.has(id) || confirmId.value === id) return 'confirm';
    if (flying.has(id) || lagBoxed.has(id)) return 'boxed';
    return 'front';
  };
  /** 正在翻面确认（或抬起）的那张的 id：牌桌据此让左右的牌让开。 */
  const raisedId = computed(() => confirmId.value ?? liftId.value);

  /** 放下正在确认的那张：翻回正面、落下。 */
  const cancelConfirm = async () => {
    const id = confirmId.value;
    if (!id) return;
    const el = options.cardOf(id);
    if (!el) { confirmId.value = null; return; }
    await flipCard(el, async () => { if (confirmId.value === id) confirmId.value = null; await nextTick(); });
  };

  const turnOver = async (id: string, el: HTMLElement) => {
    liftId.value = id;
    if (!reducedMotion()) await wait(LIFT_MS);
    if (liftId.value !== id) return;
    await flipCard(el, async () => { confirmId.value = id; liftId.value = null; await nextTick(); });
  };

  /** 真牌飞进箱子；落地才算数。 */
  const sendDay = async (day: DeckDay, el: HTMLElement) => {
    const { key: k, category } = options.source();
    const id = cardIdOf(day);
    options.onFly?.();
    const landed = flyCardHome(el, boxEl(), () => {
      box.add(day.pickKey ?? k, category, [day.date]);
      flying.delete(id);
    });
    flying.add(id);
    if (confirmId.value === id) confirmId.value = null;
    await nextTick();
    el.style.visibility = '';
    if (!(await landed)) flying.delete(id);
  };

  /**
   * 一叠日牌一起进箱子（拖成的一叠长按、1B·B3）：最上面那张替整叠飞，其余的同一刻隐身；落地才一起算数。
   */
  const sendDays = async (days: DeckDay[], el: HTMLElement) => {
    const { key: k, category } = options.source();
    const todo = days.filter((day) => day.has && stateOf(cardIdOf(day)) === 'front');
    if (!todo.length) return;
    const ids = todo.map(cardIdOf);
    const others = ids.map((id) => options.cardOf(id)).filter((card): card is HTMLElement => !!card && card !== el);
    options.onFly?.();
    for (const card of others) card.style.visibility = 'hidden';
    const landed = flyCardHome(el, boxEl(), () => {
      for (const day of todo) box.add(day.pickKey ?? k, category, [day.date]);
      for (const id of ids) flying.delete(id);
    });
    for (const id of ids) flying.add(id);
    if (confirmId.value && ids.includes(confirmId.value)) confirmId.value = null;
    await nextTick();
    el.style.visibility = '';
    for (const card of others) card.style.visibility = '';
    if (!(await landed)) for (const id of ids) flying.delete(id);
  };

  /** 从箱子拿回来：离开箱子那一刻 −1，飞回牌位后翻回正面。 */
  const takeBack = async (day: DeckDay, el: HTMLElement) => {
    const id = cardIdOf(day);
    returning.add(id);
    box.remove(day.pickKey ?? key(), [day.date]);
    options.source().release?.(id);
    lagBoxed.delete(id);
    await nextTick();
    await flyFromBox(boxEl(), el);
    await flipCard(el, async () => { returning.delete(id); await nextTick(); });
  };

  /** 牌自己身上有没有正在放的动画（发牌、扇回）。 */
  const inMotion = (el: HTMLElement) => el.getAnimations().some((a) => a.playState === 'running' || a.pending);

  const onDayClick = async (day: DeckDay, event: MouseEvent) => {
    const el = event.currentTarget as HTMLElement;
    const id = cardIdOf(day);
    // 同一张牌飞进 / 飞出箱子途中再点无效；发牌途中点它：先让它落定（≈120ms），再照常翻面。
    if (!day.has || options.busy.value || flying.has(id) || returning.has(id)) return;
    if (inMotion(el) && options.settle) {
      const target = (event.target as Element | null);
      await options.settle();
      if (options.busy.value) return;
      handleDay(day, el, id, target);
      return;
    }
    handleDay(day, el, id, event.target as Element | null);
  };
  const handleDay = (day: DeckDay, el: HTMLElement, id: string, target: Element | null) => {
    const state = stateOf(id);
    if (state === 'boxed') { void takeBack(day, el); return; }
    if (state === 'confirm') {
      if (target?.closest('.back-cancel')) void cancelConfirm();
      else void sendDay(day, el);
      return;
    }
    if (confirmId.value) void cancelConfirm();
    void turnOver(id, el);
  };

  /** 整叠飞进箱子（或整叠拿回来）。 */
  const pickGroup = async (group: DeckGroup, el: HTMLElement) => {
    const dates = pickableDates(group);
    if (!dates.length) return;
    const { key: k, category } = options.source();
    if (dates.every((date) => box.has(k, date))) {
      box.remove(k, dates);
      await flyFromBox(boxEl(), el);
      return;
    }
    options.onFly?.();
    const landed = await flyCardHome(el, boxEl(), () => box.add(k, category, dates));
    // 那一叠还在原处（带着「已挑 7/7」）：等替身进了箱子再淡回来。
    el.style.visibility = '';
    if (landed && !reducedMotion()) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
  };

  /** Shift+Enter：这一层能挑的全都飞进去（日牌一张接一张，不翻面确认）。 */
  const pickAll = async (days: DeckDay[] | null, groups: DeckGroup[] | null) => {
    if (options.busy.value) return;
    if (days) {
      const todo = days.filter((day) => day.has && stateOf(cardIdOf(day)) !== 'boxed');
      for (const [i, day] of todo.entries()) {
        const el = options.cardOf(cardIdOf(day));
        if (!el) continue;
        if (i) await wait(70);
        void sendDay(day, el);
      }
      return;
    }
    for (const group of groups ?? []) {
      const el = options.cardOf(group.id);
      const dates = pickableDates(group);
      if (el && dates.some((date) => !box.has(key(), date))) void pickGroup(group, el);
    }
  };

  /* 长按一叠：450ms 后整叠收进箱子；没按满就是普通的点（展开）。 */
  let hold: { id: string; x: number; y: number; timer: number; done: boolean } | null = null;
  /** 按住一叠（周 / 月叠，或拖成的一叠日牌）：`action` 默认是整叠进箱子。 */
  const holdStart = (group: DeckGroup | { id: string }, event: PointerEvent, action?: (el: HTMLElement) => void) => {
    if (event.button !== 0 || options.busy.value) return;
    const el = event.currentTarget as HTMLElement;
    holdId.value = group.id;
    hold = { id: group.id, x: event.clientX, y: event.clientY, done: false, timer: window.setTimeout(() => {
      if (!hold) return;
      hold.done = true;
      holdId.value = null;
      if (action) action(el);
      else void pickGroup(group as DeckGroup, el);
    }, HOLD_MS) };
  };
  const holdMove = (event: PointerEvent) => {
    if (hold && !hold.done && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 8) holdEnd();
  };
  const holdEnd = () => {
    if (hold && !hold.done) { clearTimeout(hold.timer); hold = null; }
    holdId.value = null;
  };
  /** 这一下点击是长按刚放完的那一下：吞掉它（不展开）。 */
  const consumeHold = (): boolean => {
    const done = !!hold?.done;
    hold = null;
    return done;
  };

  return {
    confirmId, liftId, raisedId, holdId, stateOf,
    onDayClick, cancelConfirm, pickGroup, pickAll, sendDay, sendDays,
    holdStart, holdMove, holdEnd, consumeHold,
  };
};

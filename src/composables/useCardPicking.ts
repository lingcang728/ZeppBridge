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
import { pickableDates, type DeckDay, type DeckGroup } from '../lib/cards/deck';
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
  const mine = computed(() => box.picks.value.filter((pick) => pick.key === key()).map((pick) => pick.date));
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
    const id = day.date;
    const landed = flyCardHome(el, boxEl(), () => {
      box.add(k, category, [day.date]);
      flying.delete(id);
    });
    flying.add(id);
    if (confirmId.value === id) confirmId.value = null;
    await nextTick();
    el.style.visibility = '';
    if (!(await landed)) flying.delete(id);
  };

  /** 从箱子拿回来：离开箱子那一刻 −1，飞回牌位后翻回正面。 */
  const takeBack = async (day: DeckDay, el: HTMLElement) => {
    const id = day.date;
    returning.add(id);
    box.remove(key(), [day.date]);
    lagBoxed.delete(id);
    await nextTick();
    await flyFromBox(boxEl(), el);
    await flipCard(el, async () => { returning.delete(id); await nextTick(); });
  };

  const onDayClick = (day: DeckDay, event: MouseEvent) => {
    const el = event.currentTarget as HTMLElement;
    if (!day.has || options.busy.value || flying.has(day.date) || returning.has(day.date)) return;
    const state = stateOf(day.date);
    if (state === 'boxed') { void takeBack(day, el); return; }
    if (state === 'confirm') {
      if ((event.target as Element | null)?.closest('.back-cancel')) void cancelConfirm();
      else void sendDay(day, el);
      return;
    }
    if (confirmId.value) void cancelConfirm();
    void turnOver(day.date, el);
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
    const landed = await flyCardHome(el, boxEl(), () => box.add(k, category, dates));
    // 那一叠还在原处（带着「已挑 7/7」）：等替身进了箱子再淡回来。
    el.style.visibility = '';
    if (landed && !reducedMotion()) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
  };

  /** Shift+Enter：这一层能挑的全都飞进去（日牌一张接一张，不翻面确认）。 */
  const pickAll = async (days: DeckDay[] | null, groups: DeckGroup[] | null) => {
    if (options.busy.value) return;
    if (days) {
      const todo = days.filter((day) => day.has && stateOf(day.date) !== 'boxed');
      for (const [i, day] of todo.entries()) {
        const el = options.cardOf(day.date);
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
  const holdStart = (group: DeckGroup, event: PointerEvent) => {
    if (event.button !== 0 || options.busy.value) return;
    const el = event.currentTarget as HTMLElement;
    holdId.value = group.id;
    hold = { id: group.id, x: event.clientX, y: event.clientY, done: false, timer: window.setTimeout(() => {
      if (!hold) return;
      hold.done = true;
      holdId.value = null;
      void pickGroup(group, el);
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
    onDayClick, cancelConfirm, pickGroup, pickAll,
    holdStart, holdMove, holdEnd, consumeHold,
  };
};

<script setup lang="ts">
/**
 * 牌桌（精修批次 7.2，第三轮 A 重做）：点哪里，一桌牌就从哪里抽出来铺满整个界面，背后整页静态模糊。
 *
 * - 7 天：七张大日牌排成一道微拱的扇面；点一张翻到背面等确认，点勾整张飞进收集箱（两步，见 useCardPicking）；
 * - 1 个月 / 6 个月：一叠叠自然周 / 月。点一叠 → 这一层的牌先收拢进那一叠、那一叠退到后面压暗，
 *   新一层再从那一叠里抽出来扇开（先后交替，不叠影）；长按整叠飞进箱子；
 * - 从「你的过去」的某一格点开（`focus`）：以那一天为中心发七张，那一张落在正中、落定后闪一下；
 * - 收牌（点空白 / Esc / ×）：先理成一叠，再整叠放回来处——下钻层落进被点的那一叠，最上层缩回按钮（按钮接住、亮一圈）；
 *   背景模糊、标题和放回同起同止。任何阶段再按 Esc 都是从此刻原路放回，不会半路消失。
 * - 换范围：洗牌 → 理成一叠停在正中 → 从这同一叠发出新的一副。
 * 没有记录的日子照样发牌、写「—」，但不能挑；减少动效时一律淡入淡出（见 lib/motion/cards）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import Icon from '../Icon.vue';
import SegmentTrack from '../SegmentTrack.vue';
import PlayingCard from './PlayingCard.vue';
import CoachTip from './CoachTip.vue';
import { useCardsText } from './cards.i18n';
import { useCardCollection } from '../../composables/useCardCollection';
import { useCardPicking } from '../../composables/useCardPicking';
import { useCardTableDrag } from '../../composables/useCardTableDrag';
import {
  animateFromNow, dealCards, fanBack, receive, recedeLayer, reducedMotion, relay, returnStack, shuffleCards, stackCards, type Landing, type Receded,
} from '../../lib/motion/cards';
import { CLOSE_EASE, OPEN_EASE } from '../../lib/motion/timing';
import { onMotionEscape } from '../../lib/motion/interrupt';
import { cardIdOf, expandGroup, focusWindow, groupSummary, pickableDates, rangeStart, rootLevel, type DeckDay, type DeckGroup, type DeckLevel, type DeckRange } from '../../lib/cards/deck';
import { deckToday, type DeckSource } from '../../lib/cards/sources';
import { tableLayerStyle, tableSlotStyle } from '../../lib/cards/tableLayout';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';

const props = withDefaults(defineProps<{ source: DeckSource; range: DeckRange; origin?: DOMRect | null; anchor?: Element | null; focus?: string | null }>(), { origin: null, anchor: null, focus: null });
const emit = defineEmits<{ close: [] }>();
const t = useCardsText();
const box = useCardCollection();
const RETURN_MS = 440;

interface Entry { id: string; level: DeckLevel; title: string; receded: (Receded & { ready: Promise<void> }) | null; pending: boolean }
const range = ref<DeckRange>(props.focus ? 7 : props.range);
const stack = shallowRef<Entry[]>([]);
const layers: HTMLElement[] = [];

const stage = ref<HTMLElement | null>(null);
const backdrop = ref<HTMLElement | null>(null);
const head = ref<HTMLElement | null>(null);
const foot = ref<HTMLElement | null>(null);
const stageBox = ref({ width: 1000, height: 560 });
/** 结构在变（推镜头、退层、收牌、换范围时理牌）：这一段里点牌不算挑牌。发牌不算——发牌途中的点击走打断接力。 */
const busy = ref(false);
const closing = ref(false);
const loadFailed = ref(false);
const focusDate = ref<string | null>(props.focus);
const titleId = `card-table-${Math.random().toString(36).slice(2, 8)}`;
/** 打断接力（1A·A2）：新指令立刻生效，在飞的发牌从此刻收尾。 */
const seq = relay();
let returnFocus: HTMLElement | null = null;
let entrySeq = 0;
let popping = false;
let boxOpen = false;

const setLayer = (depth: number, el: unknown) => { if (el instanceof HTMLElement) layers[depth] = el; };
const top = computed(() => stack.value[stack.value.length - 1] ?? null);
const cardsOf = (depth: number): HTMLElement[] => [...(layers[depth]?.querySelectorAll<HTMLElement>('.pcard') ?? [])];
const cardOf = (id: string) => layers[stack.value.length - 1]?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`) ?? null;
/** 牌飞进箱子时背景深一下（预先模糊好的那一层只淡入淡出，1A·A6）。连着挑几张时从此刻接着放，不叠。 */
const deep = ref<HTMLElement | null>(null);
const deepen = () => {
  if (!deep.value || reducedMotion()) return;
  animateFromNow(deep.value, [{ opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 760, easing: 'ease-in-out' }, ['opacity']);
};
const picking = useCardPicking({ source: () => props.source, busy, cardOf, settle: () => seq.settle(), onFly: deepen });

/* ---------- 拖牌、叠牌（1B·B3，composables/useCardTableDrag.ts） ---------- */
const { drag, scatter, hintId, onDayDown, onDayMove, onDayUp, onDayCancel, onDayTap } = useCardTableDrag({
  level: () => top.value?.level ?? null, cardOf, picking, blocked: () => busy.value || closing.value, has: (date) => box.has(props.source.key, date),
});

/* ---------- 文案 ---------- */
const md = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const weekday = (date: string) => displayDateTimeFormatter({ weekday: 'short' }).format(parseDisplayDate(date));
const monthName = (date: string) => displayDateTimeFormatter({ month: 'long' }).format(parseDisplayDate(date));
const yearMonth = (date: string) => displayDateTimeFormatter({ year: 'numeric', month: 'short' }).format(parseDisplayDate(date));
const numberText = (value: number | null) => (value === null || !props.source.format ? null : props.source.format(value));
const dayValue = (day: DeckDay) => day.text ?? numberText(day.value) ?? (day.has ? t.value.recorded : null);
const workouts = computed(() => props.source.kind === 'workouts');
const dayAriaValue = (day: DeckDay) => { const n = numberText(day.value); return n ? `${n}${props.source.unit ? ` ${props.source.unit}` : ''}` : day.has ? t.value.recorded : t.value.noRecord; };
const dayAria = (day: DeckDay) => {
  const state = picking.stateOf(cardIdOf(day));
  if (state === 'boxed') return t.value.boxedAria(md(day.date));
  if (state === 'confirm') return t.value.confirmAria(md(day.date));
  return t.value.dayAria(md(day.date), day.text ?? dayAriaValue(day), false);
};
const groupTitle = (group: DeckGroup) => (group.kind === 'month' ? monthName(group.start) : t.value.weekRange(md(group.start), md(group.end)));
const groupTop = (group: DeckGroup) => (group.kind === 'month' ? group.start.slice(0, 4) : yearMonth(group.start));
const groupValue = (group: DeckGroup) => { const average = numberText(groupSummary(group).average); return average === null ? null : t.value.average(average); };
const groupSub = (group: DeckGroup) => { const s = groupSummary(group); return t.value.recordedOf(s.recorded, s.total); };
const pickedIn = (group: DeckGroup) => pickableDates(group).filter((date) => box.has(props.source.key, date)).length;
const groupBadge = (group: DeckGroup) => { const n = pickedIn(group); return n ? t.value.pickedOf(n, pickableDates(group).length) : null; };
const rangeLabel = (value: DeckRange) => (value === 7 ? t.value.range7 : value === 30 ? t.value.range30 : t.value.range180);
const rangeItems = computed(() => ([7, 30, 180] as DeckRange[]).map((value) => ({ value: String(value), label: rangeLabel(value) })));
const crumbs = computed(() => stack.value.map((entry) => entry.title).join(' › '));
const hint = computed(() => (top.value?.level.kind === 'groups' ? t.value.hintGroups : t.value.tipDays));
const pickedCount = computed(() => box.picks.value.filter((pick) => pick.key === props.source.key).length);

/* ---------- 版式（lib/cards/tableLayout.ts）---------- */
const layerStyle = (level: DeckLevel) => tableLayerStyle(level, stageBox.value);
const slotStyle = (level: DeckLevel, i: number) => (reducedMotion() ? {} : tableSlotStyle(level, i, stageBox.value));
/** 翻面确认的那张左右的牌往两边让一点。 */
const slotClass = (depth: number, ids: string[], i: number) => {
  if (depth !== stack.value.length - 1 || !picking.raisedId.value) return null;
  const at = ids.indexOf(picking.raisedId.value);
  return at < 0 || at === i ? null : i < at ? 'shift-l' : 'shift-r';
};

/* ---------- 来处 ---------- */
const anchorLanding = (): Landing | null => {
  const rect = props.anchor?.isConnected ? props.anchor.getBoundingClientRect() : props.origin;
  return rect ? { rect, kind: 'button' } : null;
};
const stageCenter = () => {
  const r = stage.value?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined;
};
const firstPickable = (cards: HTMLElement[]) => cards.find((card) => card.classList.contains('focused'))
  ?? cards.find((card) => card.getAttribute('aria-disabled') !== 'true');
const pulse = (card: HTMLElement | undefined) => {
  if (!card || reducedMotion()) return;
  card.querySelector('.pcard-glow')?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 600, easing: 'ease-out' });
};

/* ---------- 发牌、推镜头、收牌 ---------- */
const loadLevel = async (): Promise<DeckLevel | null> => {
  try {
    loadFailed.value = false;
    const today = deckToday();
    if (focusDate.value || workouts.value) {
      // 运动牌：以那一天为中心的七天里的每一次运动；日牌：以那一天为中心的七天。
      const [start, end] = focusWindow(focusDate.value ?? today, today);
      return { kind: 'days', days: await props.source.loadDays(start, end) };
    }
    return rootLevel(await props.source.loadDays(rangeStart(today, range.value), today), range.value);
  } catch {
    loadFailed.value = true;
    return null;
  }
};
const rootTitle = () => (focusDate.value ? t.value.aroundDay(md(focusDate.value)) : workouts.value ? t.value.recentWorkouts : rangeLabel(range.value));

/**
 * 进场：取到数据就从按钮发牌。10-08 去掉了「图标先从按钮飞到左上角、落定再发牌」那一拍（1A·A3）——
 * 用户看到的是一张小牌先跑到左上角、再出一副牌，一卡一卡的；标题区只和背景一起淡入。
 */
const deal = async (id: number) => {
  const level = await loadLevel();
  if (!level || !seq.live(id)) return;
  layers.length = 0;
  stack.value = [{ id: `e${entrySeq++}`, level, title: rootTitle(), receded: null, pending: false }];
  await nextTick();
  const cards = cardsOf(0);
  await dealCards(cards, anchorLanding(), { track: seq.track });
  if (!seq.live(id)) return;
  const first = firstPickable(cards);
  first?.focus({ preventScroll: true });
  if (focusDate.value) pulse(cards.find((card) => card.classList.contains('focused')));
};

const push = async (group: DeckGroup, card: HTMLElement) => {
  if (busy.value || closing.value) return;
  const id = seq.handoff();
  scatter();
  busy.value = true;
  await picking.cancelConfirm();
  const depth = stack.value.length - 1;
  const entry: Entry = { id: `e${entrySeq++}`, level: expandGroup(group), title: groupTitle(group), receded: null, pending: true };
  const receded = recedeLayer(layers[depth]!, card, () => seq.live(id));
  const below = { ...stack.value[depth]!, receded };
  stack.value = [...stack.value.slice(0, depth), below, entry];
  await receded.ready;
  if (!seq.live(id)) return;
  stack.value = [...stack.value.slice(0, depth + 1), { ...entry, pending: false }];
  await nextTick();
  const cards = cardsOf(depth + 1);
  busy.value = false;
  await dealCards(cards, receded.now(), { track: seq.track });
  if (!seq.live(id)) return;
  firstPickable(cards)?.focus({ preventScroll: true });
};

const pop = async () => {
  if (popping || closing.value) return;
  const depth = stack.value.length - 1;
  if (depth <= 0) { await close(); return; }
  const id = seq.handoff();
  scatter();
  popping = true;
  busy.value = true;
  await picking.cancelConfirm();
  const leaving = stack.value[depth]!;
  const below = stack.value[depth - 1]!;
  const cards = leaving.pending ? [] : cardsOf(depth);
  if (cards.length) await stackCards(cards);
  if (seq.live(id)) await Promise.all([returnStack(cards, below.receded?.pile ?? null), below.receded?.restore()]);
  popping = false;
  if (!seq.live(id)) return;
  layers.length = depth;
  stack.value = [...stack.value.slice(0, depth - 1), { ...below, receded: null }];
  await nextTick();
  busy.value = false;
  firstPickable(cardsOf(depth - 1))?.focus({ preventScroll: true });
};

/** 背景、标题、底下的提示、退在后面的几层：从此刻的样子淡到 `to`，和放回同起同止。 */
const fadeChrome = (to: number, duration: number) => {
  const easing = to ? OPEN_EASE : CLOSE_EASE;
  const els = [backdrop.value, head.value, foot.value, ...layers.slice(0, -1)].filter((el): el is HTMLElement => !!el);
  return els.map((el) => animateFromNow(el, { opacity: to }, { duration, easing, fill: 'forwards' }, ['opacity']));
};
const setBoxOpen = (open: boolean) => {
  if (boxOpen === open) return;
  boxOpen = open;
  box.setTableOpen(open);
};

const close = async () => {
  if (closing.value) return;
  const id = seq.handoff();
  scatter();
  closing.value = true;
  busy.value = true;
  picking.holdEnd();
  const cards = cardsOf(stack.value.length - 1).filter((card) => card.style.visibility !== 'hidden');
  const receiver = receive(props.anchor);
  await stackCards(cards, stageCenter());
  if (!seq.live(id)) { receiver.cancel(); return; }
  // 放回：整叠缩回来处，背景模糊、标题、箱子（空的话）同一段时间里淡回去，牌落地那一刻页面正好清楚。
  setBoxOpen(false);
  const fades = fadeChrome(0, reducedMotion() ? 160 : RETURN_MS);
  await Promise.all([returnStack(cards, anchorLanding()), ...fades.map((a) => a.finished.catch(() => undefined))]);
  if (!seq.live(id)) { receiver.cancel(); return; }
  receiver.land(props.source.tint);
  for (const entry of stack.value) entry.receded?.drop();
  emit('close');
  returnFocus?.focus({ preventScroll: true });
};

/** 收到一半又点了来处：从此刻原路扇回来，背景淡回去。 */
const reopen = () => {
  if (!closing.value) return;
  seq.next();
  closing.value = false;
  busy.value = false;
  props.anchor?.classList.remove('is-receiving');
  setBoxOpen(true);
  fadeChrome(1, 360);
  void fanBack(cardsOf(stack.value.length - 1));
};

/**
 * 换范围（1A·A1）：以前在忙就直接 return，可分段控件的滑块已经移过去了——右上角写着「6 个月」，桌上还是 7 天。
 * 现在走打断接力：范围先改（分段控件永远和 `range` 一致），在飞的牌从此刻的样子理成一叠，再从这一叠发出新的一副；
 * 半路又换，旧的那次自己停下，新的接着从此刻的样子理牌（被打断时跳过洗牌，直接理）。
 */
const switchRange = async (value: string) => {
  const next = Number(value) as DeckRange;
  if ((next === range.value && !focusDate.value) || closing.value) return;
  const interrupted = busy.value || seq.moving;
  const id = seq.handoff();
  scatter();
  range.value = next;
  focusDate.value = null;
  busy.value = true;
  const loading = loadLevel();
  await picking.cancelConfirm();
  if (!seq.live(id)) return;
  const old = cardsOf(stack.value.length - 1);
  for (const layer of layers.slice(0, -1)) animateFromNow(layer, { opacity: 0 }, { duration: 260, fill: 'forwards' }, ['opacity']);
  if (!interrupted) await shuffleCards(old);
  if (!seq.live(id)) return;
  const center = stageCenter();
  await stackCards(old, center);
  const level = await loading;
  if (!seq.live(id)) return;
  if (!level) { busy.value = false; return; }
  // 这一叠就是落点：新的一副从同一个位置、同样大小发出来。
  const topCard = old[old.length - 1];
  const width = (topCard?.offsetWidth ?? 120);
  const at = center ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const from: Landing = { rect: new DOMRect(at.x - width / 2, at.y - width * 0.7, width, width * 1.4), kind: 'pile', angle: 0, width };
  for (const entry of stack.value) entry.receded?.drop();
  layers.length = 0;
  stack.value = [{ id: `e${entrySeq++}`, level, title: rootTitle(), receded: null, pending: false }];
  await nextTick();
  const cards = cardsOf(0);
  busy.value = false;
  await dealCards(cards, from, { fromStack: true, track: seq.track });
  if (!seq.live(id)) return;
  firstPickable(cards)?.focus({ preventScroll: true });
};

/** 点在牌堆四周 28px 以内：多半是想点牌、手一偏点到了牌缝，不当成「点空白收牌」（10-08 H9）。 */
const nearCards = (event: MouseEvent) => cardsOf(stack.value.length - 1).some((card) => {
  const r = card.getBoundingClientRect();
  return event.clientX > r.left - 28 && event.clientX < r.right + 28 && event.clientY > r.top - 28 && event.clientY < r.bottom + 28;
});
const onBlank = (event: MouseEvent) => {
  // 长按刚放完：那张牌正隐身飞向箱子，松手的 click 落到了空白处——不是「点空白收牌」。
  if (picking.consumeHold() || drag.consumeClick()) return;
  if (picking.confirmId.value) { void picking.cancelConfirm(); return; }
  if (nearCards(event)) return;
  void pop();
};
const tapGroup = (group: DeckGroup, event: MouseEvent) => {
  if (drag.consumeClick() || picking.consumeHold()) return;
  void push(group, event.currentTarget as HTMLElement);
};
const onCardKey = (event: KeyboardEvent, item: { group?: DeckGroup }) => {
  const level = top.value?.level;
  if (event.key === 'Enter' && event.shiftKey && level) {
    event.preventDefault();
    void picking.pickAll(level.kind === 'days' ? level.days : null, level.kind === 'groups' ? level.groups : null);
    return;
  }
  if (item.group && event.key === ' ') { event.preventDefault(); void picking.pickGroup(item.group, event.currentTarget as HTMLElement); }
};

/* ---------- 头部入场：标题、范围和背景一起淡入（不再有图标飞到左上角那一拍） ---------- */
const introHead = () => {
  if (reducedMotion()) return;
  [...(head.value?.querySelectorAll<HTMLElement>('[data-intro]') ?? [])].forEach((el, i) => el.animate(
    [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }],
    { duration: 360, delay: 60 + i * 50, easing: OPEN_EASE, fill: 'backwards' },
  ));
};

/* ---------- 生命周期 ---------- */
let releaseEscape: (() => void) | null = null;
let resize: ResizeObserver | null = null;
const measure = () => {
  const el = stage.value;
  if (el) stageBox.value = { width: el.clientWidth - 16, height: el.clientHeight - 24 };
  if (drag.piles.value.length) void nextTick(() => drag.layoutPiles(false));
};
onMounted(() => {
  returnFocus = document.activeElement as HTMLElement | null;
  releaseEscape = onMotionEscape(() => {
    if (drag.cancel()) return true;
    if (picking.confirmId.value) { void picking.cancelConfirm(); return true; }
    if (!closing.value) void pop();
    return true;
  });
  measure();
  resize = new ResizeObserver(measure);
  if (stage.value) resize.observe(stage.value);
  setBoxOpen(true);
  backdrop.value?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion() ? 140 : 420, easing: OPEN_EASE, fill: 'backwards' });
  introHead();
  void deal(seq.next());
});
onBeforeUnmount(() => {
  releaseEscape?.();
  resize?.disconnect();
  picking.holdEnd();
  setBoxOpen(false);
  for (const entry of stack.value) entry.receded?.drop();
});
defineExpose({ reopen, isClosing: () => closing.value });
</script>

<template>
  <Teleport to="body">
    <div :class="['card-table', { closing }]" role="dialog" aria-modal="true" :aria-labelledby="titleId" :aria-describedby="`${titleId}-keys`" :style="{ '--tint': source.tint }">
      <div ref="backdrop" class="table-backdrop" aria-hidden="true" @click="onBlank"></div>
      <div ref="deep" class="table-backdrop deep" aria-hidden="true"></div>
      <header ref="head" class="table-head">
        <button v-if="stack.length > 1" type="button" class="table-icon" :aria-label="t.back" @click="pop"><Icon name="arrow-left" :size="17" /></button>
        <span v-else class="table-mark" data-intro aria-hidden="true"><Icon name="cards" :size="18" /></span>
        <div class="table-titles" data-intro>
          <h2 :id="titleId">{{ source.label }}</h2>
          <p>{{ t.pickSubtitle }} · {{ crumbs }}<template v-if="pickedCount"> · <b>{{ t.pickedHere(pickedCount) }}</b></template></p>
        </div>
        <span v-if="!workouts" data-intro><SegmentTrack compact intro :items="rangeItems" :model-value="String(range)" :aria-label="t.rangeAria" @update:model-value="switchRange" /></span>
        <button type="button" class="table-icon" data-intro :aria-label="t.close" @click="close"><Icon name="x" :size="17" /></button>
      </header>
      <div ref="stage" class="table-stage" @click.self="onBlank">
        <p v-if="loadFailed || (top && top.level.kind === 'days' && !top.level.days.length)" class="table-empty">{{ workouts ? t.noWorkouts : t.noRecord }}</p>
        <template v-for="(entry, depth) in stack" :key="entry.id">
          <div :ref="(el) => setLayer(depth, el)" :class="['table-layer', { pending: entry.pending, holding: !!picking.holdId.value }]" :style="layerStyle(entry.level)" @click.self="onBlank">
            <template v-if="entry.level.kind === 'days'">
              <span v-for="(day, i) in entry.level.days" :key="cardIdOf(day)" :class="['pslot', slotClass(depth, entry.level.days.map(cardIdOf), i)]" :style="slotStyle(entry.level, i)">
                <PlayingCard kind="day" :data-card-id="cardIdOf(day)" :top="weekday(day.date)" :title="md(day.date)" :corner="String(Number(day.date.slice(8)))"
                  :value="source.second ? numberText(day.value) : dayValue(day)" :unit="!day.text && numberText(day.value) ? source.unit : null"
                  :value2="source.second && day.value2 != null ? source.second.format(day.value2) : null" :unit2="source.second?.unit ?? null" :tint2="source.second?.tint ?? null" :icon="day.icon" :state="day.has ? picking.stateOf(cardIdOf(day)) : 'front'"
                  :class="{ lifting: picking.liftId.value === cardIdOf(day), buried: drag.buried(cardIdOf(day)), 'drop-target': drag.targetId.value === cardIdOf(day) }"
                  :disabled="!day.has" :focused="day.date === focusDate && (!workouts || i === entry.level.days.findIndex((d) => d.date === focusDate))" :tint="source.tint"
                  :badge="drag.pileCount(cardIdOf(day)) ? (hintId === cardIdOf(day) ? t.holdPile : `×${drag.pileCount(cardIdOf(day))}`) : null" :holding="picking.holdId.value === cardIdOf(day)"
                  :aria-label="dayAria(day)" :aria-pressed="picking.stateOf(cardIdOf(day)) === 'boxed'"
                  @pointerdown="onDayDown($event, day)" @pointermove="onDayMove" @pointerup="onDayUp" @pointercancel="onDayCancel"
                  @click="onDayTap(day, $event)" @keydown="onCardKey($event, {})" />
              </span>
            </template>
            <template v-else>
              <span v-for="(group, i) in entry.level.groups" :key="group.id" :class="['pslot', { 'is-holding': picking.holdId.value === group.id }]" :style="slotStyle(entry.level, i)">
                <PlayingCard kind="group" :data-card-id="group.id" :top="groupTop(group)" :title="groupTitle(group)" :value="groupValue(group)"
                  :dots="group.days.map((d) => (d.has && box.has(source.key, d.date) ? 'picked' : d.has))" :empty="!groupSummary(group).recorded" :badge="groupBadge(group)" :holding="picking.holdId.value === group.id" :tint="source.tint"
                  :aria-label="t.groupAria(groupTitle(group), groupSub(group))" :aria-description="pickedIn(group) === pickableDates(group).length && pickedIn(group) ? t.holdToUnpick : t.holdToPick"
                  @pointerdown="picking.holdStart(group, $event); drag.down($event, group.id)" @pointermove="picking.holdMove($event); drag.move($event)"
                  @pointerup="picking.holdEnd(); drag.up($event)" @pointercancel="picking.holdEnd(); drag.cancelEvent($event)"
                  @click="tapGroup(group, $event)" @keydown="onCardKey($event, { group })" />
              </span>
            </template>
          </div>
        </template>
      </div>
      <footer ref="foot" class="table-foot">
        <CoachTip id="card-table" :text="hint" />
        <p :id="`${titleId}-keys`" class="sr-only">{{ hint }} {{ t.keyboardTip }}</p>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped src="./CardTable.css"></style>

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
import {
  animateFromNow, dealCards, fanBack, receive, recedeLayer, reducedMotion, returnStack, sequence, shuffleCards, stackCards, type Landing, type Receded,
} from '../../lib/motion/cards';
import { CLOSE_EASE, OPEN_EASE } from '../../lib/motion/timing';
import { onMotionEscape } from '../../lib/motion/interrupt';
import { expandGroup, focusWindow, groupSummary, pickableDates, rangeStart, rootLevel, type DeckDay, type DeckGroup, type DeckLevel, type DeckRange } from '../../lib/cards/deck';
import { deckToday, type DeckSource } from '../../lib/cards/sources';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';

const props = withDefaults(defineProps<{ source: DeckSource; range: DeckRange; origin?: DOMRect | null; anchor?: Element | null; focus?: string | null }>(), { origin: null, anchor: null, focus: null });
const emit = defineEmits<{ close: [] }>();
const t = useCardsText();
const box = useCardCollection();
const GAP = 18;
const RETURN_MS = 440;

interface Entry { id: string; level: DeckLevel; title: string; receded: (Receded & { ready: Promise<void> }) | null; pending: boolean }
const range = ref<DeckRange>(props.focus ? 7 : props.range);
const stack = shallowRef<Entry[]>([]);
const layers: HTMLElement[] = [];

const stage = ref<HTMLElement | null>(null);
const backdrop = ref<HTMLElement | null>(null);
const head = ref<HTMLElement | null>(null);
const mark = ref<HTMLElement | null>(null);
const foot = ref<HTMLElement | null>(null);
const stageBox = ref({ width: 1000, height: 560 });
const busy = ref(false);
const closing = ref(false);
const loadFailed = ref(false);
const focusDate = ref<string | null>(props.focus);
const titleId = `card-table-${Math.random().toString(36).slice(2, 8)}`;
const seq = sequence();
let returnFocus: HTMLElement | null = null;
let entrySeq = 0;
let popping = false;
let boxOpen = false;

const setLayer = (depth: number, el: unknown) => { if (el instanceof HTMLElement) layers[depth] = el; };
const top = computed(() => stack.value[stack.value.length - 1] ?? null);
const cardsOf = (depth: number): HTMLElement[] => [...(layers[depth]?.querySelectorAll<HTMLElement>('.pcard') ?? [])];
const cardOf = (id: string) => layers[stack.value.length - 1]?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`) ?? null;
const picking = useCardPicking({ source: () => props.source, busy, cardOf });

/* ---------- 文案 ---------- */
const md = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const weekday = (date: string) => displayDateTimeFormatter({ weekday: 'short' }).format(parseDisplayDate(date));
const monthName = (date: string) => displayDateTimeFormatter({ month: 'long' }).format(parseDisplayDate(date));
const yearMonth = (date: string) => displayDateTimeFormatter({ year: 'numeric', month: 'short' }).format(parseDisplayDate(date));
const numberText = (value: number | null) => (value === null || !props.source.format ? null : props.source.format(value));
const dayValue = (day: DeckDay) => numberText(day.value) ?? (day.has ? t.value.recorded : null);
const dayAriaValue = (day: DeckDay) => { const n = numberText(day.value); return n ? `${n}${props.source.unit ? ` ${props.source.unit}` : ''}` : day.has ? t.value.recorded : t.value.noRecord; };
const dayAria = (day: DeckDay) => {
  const state = picking.stateOf(day.date);
  if (state === 'boxed') return t.value.boxedAria(md(day.date));
  if (state === 'confirm') return t.value.confirmAria(md(day.date));
  return t.value.dayAria(md(day.date), dayAriaValue(day), false);
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

/* ---------- 版式：牌按桌面大小排开，一层一道微拱的扇面 ---------- */
const countOf = (level: DeckLevel) => (level.kind === 'days' ? level.days.length : level.groups.length);
const layout = (level: DeckLevel) => {
  const n = Math.max(1, countOf(level));
  const { width, height } = stageBox.value;
  const byHeight = (rows: number) => ((height - GAP * (rows - 1)) / rows) * 0.84 * (5 / 7);
  let perRow = n;
  let w = Math.min(232, byHeight(1), (width - GAP * (perRow - 1)) / perRow);
  if (w < 104 && n > 4) {
    perRow = Math.ceil(n / 2);
    w = Math.min(200, byHeight(2), (width - GAP * (perRow - 1)) / perRow);
  }
  return { w: Math.max(72, Math.floor(w)), perRow, rows: Math.ceil(n / perRow) };
};
const layerStyle = (level: DeckLevel) => {
  const { w, perRow } = layout(level);
  // 层自己左右各有 8px 内边距（border-box）：算宽度时带上，不然最后一张会被挤到第二行。
  return { '--card-w': `${w}px`, maxWidth: `${perRow * w + (perRow - 1) * GAP + 24}px` };
};
/** 扇面：一行里越靠边越往下、往外歪一点；两行时不拱。 */
const slotStyle = (level: DeckLevel, i: number) => {
  const { perRow, rows } = layout(level);
  if (rows > 1 || perRow < 3 || reducedMotion()) return {};
  const mid = (perRow - 1) / 2;
  const off = (i - mid) / mid;
  const tilt = off * Math.min(5, 26 / perRow);
  const drop = off * off * Math.min(28, 6 + perRow * 3);
  return { transform: `translateY(${drop.toFixed(1)}px) rotate(${tilt.toFixed(2)}deg)` };
};
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
    if (focusDate.value) {
      const [start, end] = focusWindow(focusDate.value, today);
      return { kind: 'days', days: await props.source.loadDays(start, end) };
    }
    return rootLevel(await props.source.loadDays(rangeStart(today, range.value), today), range.value);
  } catch {
    loadFailed.value = true;
    return null;
  }
};
const rootTitle = () => (focusDate.value ? t.value.aroundDay(md(focusDate.value)) : rangeLabel(range.value));

const deal = async (id: number) => {
  const level = await loadLevel();
  if (!level || !seq.live(id)) return;
  layers.length = 0;
  stack.value = [{ id: `e${entrySeq++}`, level, title: rootTitle(), receded: null, pending: false }];
  await nextTick();
  const cards = cardsOf(0);
  await dealCards(cards, anchorLanding());
  if (!seq.live(id)) return;
  const first = firstPickable(cards);
  first?.focus({ preventScroll: true });
  if (focusDate.value) pulse(cards.find((card) => card.classList.contains('focused')));
};

const push = async (group: DeckGroup, card: HTMLElement) => {
  if (busy.value || closing.value) return;
  const id = seq.next();
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
  await dealCards(cards, receded.now());
  if (!seq.live(id)) return;
  busy.value = false;
  firstPickable(cards)?.focus({ preventScroll: true });
};

const pop = async () => {
  if (popping || closing.value) return;
  const depth = stack.value.length - 1;
  if (depth <= 0) { await close(); return; }
  const id = seq.next();
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
  const id = seq.next();
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

const switchRange = async (value: string) => {
  const next = Number(value) as DeckRange;
  if ((next === range.value && !focusDate.value) || busy.value || closing.value) return;
  const id = seq.next();
  busy.value = true;
  await picking.cancelConfirm();
  range.value = next;
  focusDate.value = null;
  const loading = loadLevel();
  const old = cardsOf(stack.value.length - 1);
  for (const layer of layers.slice(0, -1)) animateFromNow(layer, { opacity: 0 }, { duration: 260, fill: 'forwards' }, ['opacity']);
  await shuffleCards(old);
  if (!seq.live(id)) return;
  const center = stageCenter();
  await stackCards(old, center);
  const level = await loading;
  if (!seq.live(id) || !level) { busy.value = false; return; }
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
  await dealCards(cards, from, { fromStack: true });
  if (!seq.live(id)) return;
  busy.value = false;
  firstPickable(cards)?.focus({ preventScroll: true });
};

const onBlank = () => {
  if (picking.confirmId.value) { void picking.cancelConfirm(); return; }
  void pop();
};
const tapGroup = (group: DeckGroup, event: MouseEvent) => {
  if (picking.consumeHold()) return;
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

/* ---------- 头部入场：图标从来处飞到左上角，标题、范围依次浮上 ---------- */
const introHead = () => {
  if (reducedMotion()) return;
  const icon = props.anchor?.querySelector('svg')?.getBoundingClientRect() ?? props.origin;
  const target = mark.value?.getBoundingClientRect();
  if (icon && target && mark.value) {
    const dx = icon.left + icon.width / 2 - (target.left + target.width / 2);
    const dy = icon.top + icon.height / 2 - (target.top + target.height / 2);
    const s = Math.max(0.3, Math.min(1, icon.width / Math.max(target.width, 1)));
    mark.value.animate([{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(2)})`, opacity: 0.4 }, { transform: 'none', opacity: 1 }],
      { duration: 520, easing: OPEN_EASE, fill: 'backwards' });
  }
  [...(head.value?.querySelectorAll<HTMLElement>('[data-intro]') ?? [])].forEach((el, i) => el.animate(
    [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }],
    { duration: 380, delay: 140 + i * 70, easing: OPEN_EASE, fill: 'backwards' },
  ));
};

/* ---------- 生命周期 ---------- */
let releaseEscape: (() => void) | null = null;
let resize: ResizeObserver | null = null;
const measure = () => {
  const el = stage.value;
  if (el) stageBox.value = { width: el.clientWidth - 16, height: el.clientHeight - 24 };
};
onMounted(() => {
  returnFocus = document.activeElement as HTMLElement | null;
  releaseEscape = onMotionEscape(() => {
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
      <header ref="head" class="table-head">
        <button v-if="stack.length > 1" type="button" class="table-icon" :aria-label="t.back" @click="pop"><Icon name="arrow-left" :size="17" /></button>
        <span v-else ref="mark" class="table-mark" aria-hidden="true"><Icon name="cards" :size="18" /></span>
        <div class="table-titles" data-intro>
          <h2 :id="titleId">{{ source.label }}</h2>
          <p>{{ t.pickSubtitle }} · {{ crumbs }}<template v-if="pickedCount"> · <b>{{ t.pickedHere(pickedCount) }}</b></template></p>
        </div>
        <span data-intro><SegmentTrack compact intro :items="rangeItems" :model-value="String(range)" :aria-label="t.rangeAria" @update:model-value="switchRange" /></span>
        <button type="button" class="table-icon" data-intro :aria-label="t.close" @click="close"><Icon name="x" :size="17" /></button>
      </header>
      <div ref="stage" class="table-stage" @click.self="onBlank">
        <p v-if="loadFailed" class="table-empty">{{ t.noRecord }}</p>
        <template v-for="(entry, depth) in stack" :key="entry.id">
          <div :ref="(el) => setLayer(depth, el)" :class="['table-layer', { pending: entry.pending, holding: !!picking.holdId.value }]" :style="layerStyle(entry.level)" @click.self="onBlank">
            <template v-if="entry.level.kind === 'days'">
              <span v-for="(day, i) in entry.level.days" :key="day.date" :class="['pslot', slotClass(depth, entry.level.days.map((d) => d.date), i)]" :style="slotStyle(entry.level, i)">
                <PlayingCard kind="day" :data-card-id="day.date" :top="weekday(day.date)" :title="md(day.date)" :corner="String(Number(day.date.slice(8)))"
                  :value="dayValue(day)" :unit="numberText(day.value) ? source.unit : null" :state="day.has ? picking.stateOf(day.date) : 'front'"
                  :class="{ lifting: picking.liftId.value === day.date }" :disabled="!day.has" :focused="day.date === focusDate" :tint="source.tint"
                  :aria-label="dayAria(day)" :aria-pressed="picking.stateOf(day.date) === 'boxed'"
                  @click="picking.onDayClick(day, $event)" @keydown="onCardKey($event, {})" />
              </span>
            </template>
            <template v-else>
              <span v-for="(group, i) in entry.level.groups" :key="group.id" :class="['pslot', { 'is-holding': picking.holdId.value === group.id }]" :style="slotStyle(entry.level, i)">
                <PlayingCard kind="group" :data-card-id="group.id" :top="groupTop(group)" :title="groupTitle(group)" :value="groupValue(group)"
                  :dots="group.days.map((d) => d.has)" :empty="!groupSummary(group).recorded" :badge="groupBadge(group)" :holding="picking.holdId.value === group.id" :tint="source.tint"
                  :aria-label="t.groupAria(groupTitle(group), groupSub(group))" :aria-description="pickedIn(group) === pickableDates(group).length && pickedIn(group) ? t.holdToUnpick : t.holdToPick"
                  @pointerdown="picking.holdStart(group, $event)" @pointermove="picking.holdMove" @pointerup="picking.holdEnd" @pointercancel="picking.holdEnd" @pointerleave="picking.holdEnd"
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

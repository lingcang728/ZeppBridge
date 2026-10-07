<script setup lang="ts">
/**
 * 牌桌（精修批次 7.2，10-07 第二轮重做）：点哪里，一桌牌就从哪里飞出来铺满整个界面，背后整页静态模糊。
 *
 * - 7 天：七张大日牌排成一道微微拱起的扇面；点一张翻到背面「交给 AI ✓」并飞进收集箱，再点放回去；
 * - 1 个月 / 6 个月：一叠叠自然周 / 月。点一叠 → 镜头往前推（上一层退后、换成预先模糊好的静态拷贝），
 *   这一叠在正中发开；长按 450ms（带进度环）整叠收进箱子；
 * - 从「你的过去」的某一格点开（`focus`）：以那一天为中心发七张，那一张落在正中、描一圈这一项的颜色；
 * - 点空白 / Esc：收牌，原路拉回上一层；最上层再收就整桌收回点开它的地方，背景跟着牌一起淡回去（不硬切）。
 * - 键盘：空格挑这一张（一叠就是整叠），Enter 展开一叠，Shift+Enter 整层都挑。
 * 没有记录的日子照样发牌、写「—」，但不能挑；减少动效时一律淡入淡出（见 lib/motion/cards）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import Icon from '../Icon.vue';
import SegmentTrack from '../SegmentTrack.vue';
import PlayingCard from './PlayingCard.vue';
import { useCardsText } from './cards.i18n';
import { useCardCollection } from '../../composables/useCardCollection';
import { collectCards, dealCards, flipCard, flyToTarget, recedeLayer, reducedMotion, shuffleCards, type Receded } from '../../lib/motion/cards';
import { onMotionEscape } from '../../lib/motion/interrupt';
import { expandGroup, focusWindow, groupSummary, pickableDates, rangeStart, rootLevel, type DeckDay, type DeckGroup, type DeckLevel, type DeckRange } from '../../lib/cards/deck';
import { deckToday, type DeckSource } from '../../lib/cards/sources';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';

const props = withDefaults(defineProps<{ source: DeckSource; range: DeckRange; origin?: DOMRect | null; focus?: string | null }>(), { origin: null, focus: null });
const emit = defineEmits<{ close: [] }>();
const t = useCardsText();
const box = useCardCollection();
const HOLD_MS = 450;
const GAP = 18;

interface Entry { id: string; level: DeckLevel; title: string; origin: DOMRect | null; receded: Receded | null }
const range = ref<DeckRange>(props.focus ? 7 : props.range);
const stack = shallowRef<Entry[]>([]);
const layers: HTMLElement[] = [];

const stage = ref<HTMLElement | null>(null);
const backdrop = ref<HTMLElement | null>(null);
const chrome = ref<HTMLElement[]>([]);
const stageBox = ref({ width: 1000, height: 560 });
const busy = ref(false);
const loadFailed = ref(false);
const holdId = ref<string | null>(null);
const focusDate = ref<string | null>(props.focus);
const titleId = `card-table-${Math.random().toString(36).slice(2, 8)}`;
let returnFocus: HTMLElement | null = null;
let entrySeq = 0;
let backdropIn: Animation | null = null;

const setLayer = (depth: number, el: unknown) => { if (el instanceof HTMLElement) layers[depth] = el; };
const top = computed(() => stack.value[stack.value.length - 1] ?? null);
const cardsOf = (depth: number): HTMLElement[] => [...(layers[depth]?.querySelectorAll<HTMLElement>('.pcard') ?? [])];
const boxEl = () => document.getElementById('card-collection-box');

/* ---------- 文案 ---------- */
const md = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const weekday = (date: string) => displayDateTimeFormatter({ weekday: 'short' }).format(parseDisplayDate(date));
const monthName = (date: string) => displayDateTimeFormatter({ month: 'long' }).format(parseDisplayDate(date));
const yearMonth = (date: string) => displayDateTimeFormatter({ year: 'numeric', month: 'short' }).format(parseDisplayDate(date));
const numberText = (value: number | null) => (value === null || !props.source.format ? null : props.source.format(value));
const dayValue = (day: DeckDay) => numberText(day.value) ?? (day.has ? t.value.recorded : null);
const dayAriaValue = (day: DeckDay) => { const n = numberText(day.value); return n ? `${n}${props.source.unit ? ` ${props.source.unit}` : ''}` : day.has ? t.value.recorded : t.value.noRecord; };
const groupTitle = (group: DeckGroup) => (group.kind === 'month' ? monthName(group.start) : t.value.weekRange(md(group.start), md(group.end)));
const groupTop = (group: DeckGroup) => (group.kind === 'month' ? group.start.slice(0, 4) : yearMonth(group.start));
const groupValue = (group: DeckGroup) => { const average = numberText(groupSummary(group).average); return average === null ? null : t.value.average(average); };
const groupSub = (group: DeckGroup) => { const s = groupSummary(group); return t.value.recordedOf(s.recorded, s.total); };
const pickedIn = (group: DeckGroup) => pickableDates(group).filter((date) => box.has(props.source.key, date)).length;
const groupBadge = (group: DeckGroup) => { const n = pickedIn(group); return n ? t.value.pickedOf(n, pickableDates(group).length) : null; };
const rangeLabel = (value: DeckRange) => (value === 7 ? t.value.range7 : value === 30 ? t.value.range30 : t.value.range180);
const rangeItems = computed(() => ([7, 30, 180] as DeckRange[]).map((value) => ({ value: String(value), label: rangeLabel(value) })));
const crumbs = computed(() => stack.value.map((entry) => entry.title).join(' › '));
const hint = computed(() => (top.value?.level.kind === 'groups' ? t.value.hintGroups : t.value.hintDays));
const pickedCount = computed(() => box.picks.value.filter((pick) => pick.key === props.source.key).length);

/* ---------- 版式：牌按桌面大小排开，一层一道微拱的扇面 ---------- */
const countOf = (level: DeckLevel) => (level.kind === 'days' ? level.days.length : level.groups.length);
const layout = (level: DeckLevel) => {
  const n = Math.max(1, countOf(level));
  const { width, height } = stageBox.value;
  const byHeight = (rows: number) => ((height - GAP * (rows - 1)) / rows) * 0.86 * (5 / 7);
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
const stageOrigin = (): DOMRect | null => {
  const box = stage.value?.getBoundingClientRect();
  return box ? new DOMRect(box.left + box.width / 2 - 50, box.bottom - 40, 100, 140) : null;
};
const firstPickable = (cards: HTMLElement[]) => cards.find((card) => card.classList.contains('focused'))
  ?? cards.find((card) => card.getAttribute('aria-disabled') !== 'true');

const deal = async (origin: DOMRect | null) => {
  const level = await loadLevel();
  if (!level) return;
  layers.length = 0;
  const title = focusDate.value ? t.value.aroundDay(md(focusDate.value)) : rangeLabel(range.value);
  stack.value = [{ id: `e${entrySeq++}`, level, title, origin, receded: null }];
  await nextTick();
  const cards = cardsOf(0);
  await dealCards(cards, origin ?? stageOrigin());
  firstPickable(cards)?.focus({ preventScroll: true });
};

const push = async (group: DeckGroup, card: HTMLElement) => {
  if (busy.value) return;
  busy.value = true;
  const depth = stack.value.length - 1;
  const rect = card.getBoundingClientRect();
  const receded = recedeLayer(layers[depth]!, rect);
  const current = stack.value[depth]!;
  stack.value = [...stack.value.slice(0, depth), { ...current, receded }, { id: `e${entrySeq++}`, level: expandGroup(group), title: groupTitle(group), origin: rect, receded: null }];
  await nextTick();
  const cards = cardsOf(depth + 1);
  await dealCards(cards, rect);
  firstPickable(cards)?.focus({ preventScroll: true });
  busy.value = false;
};

const pop = async () => {
  if (busy.value) return;
  const depth = stack.value.length - 1;
  if (depth <= 0) { await close(); return; }
  busy.value = true;
  const leaving = stack.value[depth]!;
  const below = stack.value[depth - 1]!;
  await Promise.all([collectCards(cardsOf(depth), leaving.origin), below.receded?.restore()]);
  layers.length = depth;
  stack.value = [...stack.value.slice(0, depth - 1), { ...below, receded: null }];
  await nextTick();
  busy.value = false;
  firstPickable(cardsOf(depth - 1))?.focus({ preventScroll: true });
};

/** 从此刻的样子淡到 0（开到一半就收，也不会先跳到「开好」）。 */
const fadeOut = (el: HTMLElement | null | undefined, duration: number) => {
  if (!el) return null;
  const from = getComputedStyle(el).opacity;
  return el.animate([{ opacity: from }, { opacity: 0 }], { duration, easing: 'ease-in', fill: 'forwards' });
};

const closing = ref(false);
const close = async () => {
  if (closing.value) return;
  closing.value = true;
  busy.value = true;
  const depth = stack.value.length - 1;
  const target = depth === 0 ? props.origin : stack.value[depth]!.origin;
  // 牌往回飞的同时，背景模糊和标题一起淡回去——牌落地那一刻页面正好清楚（以前牌还在半空背景就啪地没了）。
  backdropIn?.cancel();
  const fades = [fadeOut(backdrop.value, 380), ...chrome.value.map((el) => fadeOut(el, 220))];
  for (const entry of stack.value.slice(0, -1)) {
    const layer = layers[stack.value.indexOf(entry)];
    fadeOut(layer?.nextElementSibling as HTMLElement | null, 260);
  }
  await Promise.all([collectCards(cardsOf(depth), target), ...fades.map((a) => a?.finished.catch(() => undefined))]);
  for (const entry of stack.value) entry.receded?.drop();
  emit('close');
  returnFocus?.focus({ preventScroll: true });
};

const switchRange = async (value: string) => {
  const next = Number(value) as DeckRange;
  if ((next === range.value && !focusDate.value) || busy.value) return;
  busy.value = true;
  range.value = next;
  focusDate.value = null;
  for (const entry of stack.value) entry.receded?.drop();
  const old = cardsOf(stack.value.length - 1);
  await shuffleCards(old);
  await collectCards(old, stageOrigin());
  await deal(stageOrigin());
  busy.value = false;
};

/* ---------- 挑牌 ---------- */
const toggleDay = async (day: DeckDay, card: HTMLElement) => {
  if (!day.has || busy.value) return;
  const picked = box.has(props.source.key, day.date);
  await flipCard(card, async () => {
    if (picked) box.remove(props.source.key, [day.date]);
    else box.add(props.source.key, props.source.category, [day.date]);
    await nextTick();
  });
  if (!picked) void flyToTarget(card, boxEl());
};

const pickDates = async (dates: string[], from: HTMLElement[]) => {
  if (!dates.length) return;
  const all = dates.every((date) => box.has(props.source.key, date));
  if (all) { box.remove(props.source.key, dates); return; }
  box.add(props.source.key, props.source.category, dates);
  await nextTick();
  // 整组飞：最多飞六张替身，再多只是在屏幕上撒一把。
  for (const card of from.slice(0, 6)) void flyToTarget(card, boxEl());
};

const pickGroup = (group: DeckGroup, card: HTMLElement) => pickDates(pickableDates(group), [card]);

const pickLayer = () => {
  const entry = top.value;
  if (!entry || busy.value) return;
  const cards = cardsOf(stack.value.length - 1).filter((card) => card.getAttribute('aria-disabled') !== 'true');
  const dates = entry.level.kind === 'days'
    ? entry.level.days.filter((day) => day.has).map((day) => day.date)
    : entry.level.groups.flatMap(pickableDates);
  void pickDates(dates, cards);
};

/* 长按一叠：450ms 后整叠收进箱子；没按满就是普通的点（展开）。 */
let hold: { id: string; x: number; y: number; timer: number; done: boolean } | null = null;
const holdStart = (group: DeckGroup, event: PointerEvent) => {
  if (event.button !== 0 || busy.value) return;
  const card = event.currentTarget as HTMLElement;
  holdId.value = group.id;
  hold = { id: group.id, x: event.clientX, y: event.clientY, done: false, timer: window.setTimeout(() => {
    if (!hold) return;
    hold.done = true;
    holdId.value = null;
    void pickGroup(group, card);
  }, HOLD_MS) };
};
const holdMove = (event: PointerEvent) => {
  if (hold && !hold.done && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 8) holdEnd();
};
const holdEnd = () => {
  if (hold && !hold.done) { clearTimeout(hold.timer); hold = null; }
  holdId.value = null;
};
const tapGroup = (group: DeckGroup, event: MouseEvent) => {
  if (hold?.done) { hold = null; return; }
  hold = null;
  void push(group, event.currentTarget as HTMLElement);
};

const onCardKey = (event: KeyboardEvent, item: { day?: DeckDay; group?: DeckGroup }) => {
  if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); pickLayer(); return; }
  if (item.group && event.key === ' ') { event.preventDefault(); void pickGroup(item.group, event.currentTarget as HTMLElement); }
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
    if (!busy.value) void pop();
    return true;
  });
  measure();
  resize = new ResizeObserver(measure);
  if (stage.value) resize.observe(stage.value);
  backdropIn = backdrop.value?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion() ? 140 : 420, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' }) ?? null;
  for (const [i, el] of chrome.value.entries()) {
    el.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 120 + i * 60, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' });
  }
  void deal(props.origin);
});
onBeforeUnmount(() => {
  releaseEscape?.();
  resize?.disconnect();
  holdEnd();
  for (const entry of stack.value) entry.receded?.drop();
});
</script>

<template>
  <Teleport to="body">
    <div :class="['card-table', { closing }]" role="dialog" aria-modal="true" :aria-labelledby="titleId" :style="{ '--tint': source.tint }">
      <div ref="backdrop" class="table-backdrop" aria-hidden="true" @click="pop"></div>
      <header :ref="(el) => { if (el) chrome[0] = el as HTMLElement; }" class="table-head">
        <button v-if="stack.length > 1" type="button" class="table-icon" :aria-label="t.back" @click="pop"><Icon name="arrow-left" :size="17" /></button>
        <span v-else class="table-mark" aria-hidden="true"><Icon name="cards" :size="18" /></span>
        <div class="table-titles">
          <h2 :id="titleId">{{ source.label }}</h2>
          <p>{{ t.pickSubtitle }} · {{ crumbs }}<template v-if="pickedCount"> · <b>{{ t.pickedHere(pickedCount) }}</b></template></p>
        </div>
        <SegmentTrack compact :items="rangeItems" :model-value="focusDate ? '' : String(range)" :aria-label="t.rangeAria" @update:model-value="switchRange" />
        <button type="button" class="table-icon" :aria-label="t.close" @click="close"><Icon name="x" :size="17" /></button>
      </header>
      <div ref="stage" class="table-stage" @click.self="pop">
        <p v-if="loadFailed" class="table-empty">{{ t.noRecord }}</p>
        <template v-for="(entry, depth) in stack" :key="entry.id">
          <div :ref="(el) => setLayer(depth, el)" class="table-layer" :style="layerStyle(entry.level)" @click.self="pop">
            <template v-if="entry.level.kind === 'days'">
              <span v-for="(day, i) in entry.level.days" :key="day.date" class="pslot" :style="slotStyle(entry.level, i)">
                <PlayingCard kind="day" :top="weekday(day.date)" :title="md(day.date)" :value="dayValue(day)" :unit="numberText(day.value) ? source.unit : null"
                  :picked="box.has(source.key, day.date)" :disabled="!day.has" :focused="day.date === focusDate" :tint="source.tint"
                  :aria-label="t.dayAria(md(day.date), dayAriaValue(day), box.has(source.key, day.date))" :aria-pressed="box.has(source.key, day.date)"
                  @click="toggleDay(day, $event.currentTarget as HTMLElement)" @keydown="onCardKey($event, { day })" />
              </span>
            </template>
            <template v-else>
              <span v-for="(group, i) in entry.level.groups" :key="group.id" class="pslot" :style="slotStyle(entry.level, i)">
                <PlayingCard kind="group" :top="groupTop(group)" :title="groupTitle(group)" :value="groupValue(group)"
                  :sub="groupSub(group)" :badge="groupBadge(group)" :holding="holdId === group.id" :tint="source.tint"
                  :aria-label="t.groupAria(groupTitle(group), groupSub(group))" :aria-description="pickedIn(group) === pickableDates(group).length && pickedIn(group) ? t.holdToUnpick : t.holdToPick"
                  @pointerdown="holdStart(group, $event)" @pointermove="holdMove" @pointerup="holdEnd" @pointercancel="holdEnd" @pointerleave="holdEnd"
                  @click="tapGroup(group, $event)" @keydown="onCardKey($event, { group })" />
              </span>
            </template>
          </div>
        </template>
      </div>
      <p :ref="(el) => { if (el) chrome[1] = el as HTMLElement; }" class="table-hint">{{ hint }} <span>{{ t.keyboardHint }}</span></p>
    </div>
  </Teleport>
</template>

<style scoped src="./CardTable.css"></style>

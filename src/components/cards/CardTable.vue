<script setup lang="ts">
/**
 * 牌桌（精修批次 7.2）：把一项指标（或一整类）最近的日子发成一张张牌，挑出要交给 AI 的那几天。
 *
 * - 7 天：七张日牌，点一张翻到背面「交给 AI ✓」并飞进收集箱，再点放回去；
 * - 1 个月：4–5 叠自然周；6 个月：6 叠月。点一叠 → 镜头往前推，上一层退到后面、换成预先模糊好的
 *   静态拷贝，这一叠在正中发开；长按（450ms，带进度环）→ 整叠收进箱子（全在箱子里时长按是拿出来）；
 * - 点空白处 / Esc：收牌，原路拉回上一层；最上层再返回就收起牌桌（嵌在页面里时不收）。
 * - 键盘：空格挑这一张（一叠就是整叠），Enter 展开一叠，Shift+Enter 整层都挑上。
 * 没有记录的日子照样发牌、写「—」，但不能挑；减少动效时一律淡入淡出（见 lib/motion/cards）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import Icon from '../Icon.vue';
import SegmentTrack from '../SegmentTrack.vue';
import PlayingCard from './PlayingCard.vue';
import { useCardsText } from './cards.i18n';
import { useCardCollection } from '../../composables/useCardCollection';
import { collectCards, dealCards, flipCard, flyToTarget, recedeLayer, shuffleCards, type Receded } from '../../lib/motion/cards';
import { onMotionEscape } from '../../lib/motion/interrupt';
import { expandGroup, groupSummary, pickableDates, rootLevel, type DeckDay, type DeckGroup, type DeckLevel, type DeckRange } from '../../lib/cards/deck';
import { deckToday, type DeckSource } from '../../lib/cards/sources';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';

const props = withDefaults(defineProps<{ source: DeckSource; range: DeckRange; origin?: DOMRect | null; inline?: boolean }>(), { origin: null, inline: false });
const emit = defineEmits<{ close: [] }>();
const t = useCardsText();
const box = useCardCollection();
const HOLD_MS = 450;

interface Entry { id: string; level: DeckLevel; title: string; origin: DOMRect | null; receded: Receded | null }
const range = ref<DeckRange>(props.range);
const stack = shallowRef<Entry[]>([]);
const layers: HTMLElement[] = [];
const root = ref<HTMLElement | null>(null);
const busy = ref(false);
const loadFailed = ref(false);
const holdId = ref<string | null>(null);
const titleId = `card-table-${Math.random().toString(36).slice(2, 8)}`;
let returnFocus: HTMLElement | null = null;
let entrySeq = 0;

const setLayer = (depth: number, el: unknown) => { if (el instanceof HTMLElement) layers[depth] = el; };
const top = computed(() => stack.value[stack.value.length - 1] ?? null);
const cardsOf = (depth: number): HTMLElement[] => [...(layers[depth]?.querySelectorAll<HTMLElement>(':scope > .pcard') ?? [])];
const boxEl = () => document.getElementById('card-collection-box');

/* ---------- 文案 ---------- */
const md = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const weekday = (date: string) => displayDateTimeFormatter({ weekday: 'short' }).format(parseDisplayDate(date));
const monthName = (date: string) => displayDateTimeFormatter({ month: 'long' }).format(parseDisplayDate(date));
const yearMonth = (date: string) => displayDateTimeFormatter({ year: 'numeric', month: 'short' }).format(parseDisplayDate(date));
const valueText = (value: number | null) => (value === null || !props.source.format ? null : `${props.source.format(value)}${props.source.unit ? ` ${props.source.unit}` : ''}`);
const dayValue = (day: DeckDay) => valueText(day.value) ?? (day.has ? t.value.recorded : null);
const groupTitle = (group: DeckGroup) => (group.kind === 'month' ? monthName(group.start) : t.value.weekRange(md(group.start), md(group.end)));
const groupTop = (group: DeckGroup) => (group.kind === 'month' ? group.start.slice(0, 4) : yearMonth(group.start));
const groupValue = (group: DeckGroup) => { const average = groupSummary(group).average; return average === null ? null : t.value.average(valueText(average) ?? ''); };
const groupSub = (group: DeckGroup) => { const s = groupSummary(group); return t.value.recordedOf(s.recorded, s.total); };
const pickedIn = (group: DeckGroup) => pickableDates(group).filter((date) => box.has(props.source.key, date)).length;
const groupBadge = (group: DeckGroup) => { const n = pickedIn(group); return n ? t.value.pickedOf(n, pickableDates(group).length) : null; };
const rangeLabel = (value: DeckRange) => (value === 7 ? t.value.range7 : value === 30 ? t.value.range30 : t.value.range180);
const rangeItems = computed(() => ([7, 30, 180] as DeckRange[]).map((value) => ({ value: String(value), label: rangeLabel(value) })));
const crumbs = computed(() => stack.value.map((entry) => entry.title).join(' › '));
const hint = computed(() => (top.value?.level.kind === 'groups' ? t.value.hintGroups : t.value.hintDays));

/* ---------- 发牌、推镜头、收牌 ---------- */
const load = async (): Promise<DeckLevel | null> => {
  try {
    loadFailed.value = false;
    return rootLevel(await props.source.load(range.value, deckToday()), range.value);
  } catch {
    loadFailed.value = true;
    return null;
  }
};
const stageOrigin = (): DOMRect | null => {
  const stage = root.value?.querySelector('.table-stage')?.getBoundingClientRect();
  return stage ? new DOMRect(stage.left + stage.width / 2 - 40, stage.bottom - 60, 80, 110) : null;
};

const deal = async (origin: DOMRect | null) => {
  const level = await load();
  if (!level) return;
  layers.length = 0;
  stack.value = [{ id: `e${entrySeq++}`, level, title: rangeLabel(range.value), origin, receded: null }];
  await nextTick();
  const cards = cardsOf(0);
  await dealCards(cards, origin ?? stageOrigin());
  if (!props.inline) cards.find((card) => card.getAttribute('aria-disabled') !== 'true')?.focus({ preventScroll: true });
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
  cards.find((c) => c.getAttribute('aria-disabled') !== 'true')?.focus({ preventScroll: true });
  busy.value = false;
};

const pop = async () => {
  if (busy.value) return;
  const depth = stack.value.length - 1;
  if (depth <= 0) { if (!props.inline) await close(); return; }
  busy.value = true;
  const leaving = stack.value[depth]!;
  const below = stack.value[depth - 1]!;
  await Promise.all([collectCards(cardsOf(depth), leaving.origin), below.receded?.restore()]);
  layers.length = depth;
  stack.value = [...stack.value.slice(0, depth - 1), { ...below, receded: null }];
  await nextTick();
  busy.value = false;
  cardsOf(depth - 1)[0]?.focus({ preventScroll: true });
};

const closing = ref(false);
const close = async () => {
  if (closing.value) return;
  closing.value = true;
  busy.value = true;
  const depth = stack.value.length - 1;
  await collectCards(cardsOf(depth), depth === 0 ? props.origin : stack.value[depth]!.origin);
  for (const entry of stack.value) entry.receded?.drop();
  emit('close');
  returnFocus?.focus({ preventScroll: true });
};

const switchRange = async (value: string) => {
  const next = Number(value) as DeckRange;
  if (next === range.value || busy.value) return;
  busy.value = true;
  range.value = next;
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
onMounted(() => {
  returnFocus = document.activeElement as HTMLElement | null;
  releaseEscape = onMotionEscape(() => {
    if (props.inline && stack.value.length <= 1) return false;
    if (!busy.value) void pop();
    return true;
  });
  void deal(props.origin);
});
onBeforeUnmount(() => {
  releaseEscape?.();
  holdEnd();
  for (const entry of stack.value) entry.receded?.drop();
});
// 嵌在页面里时，页面的回溯范围变了，牌桌跟着换一副（牌桌上自己也能换）。
watch(() => props.range, (value) => { if (props.inline) void switchRange(String(value)); });
watch(() => props.source.key, () => { range.value = props.range; void deal(null); });
</script>

<template>
  <Teleport to="body" :disabled="inline">
    <div ref="root" :class="['card-table', { inline, closing }]" :role="inline ? 'region' : 'dialog'" :aria-modal="inline ? undefined : 'true'" :aria-labelledby="titleId">
      <div v-if="!inline" class="table-backdrop" aria-hidden="true" @click="pop"></div>
      <header class="table-head">
        <button v-if="stack.length > 1" type="button" class="table-icon" :aria-label="t.back" @click="pop"><Icon name="arrow-left" :size="16" /></button>
        <div class="table-titles">
          <h2 :id="titleId">{{ t.tableTitle(source.label) }}</h2>
          <p>{{ crumbs }}</p>
        </div>
        <SegmentTrack compact :items="rangeItems" :model-value="String(range)" :aria-label="t.rangeAria" @update:model-value="switchRange" />
        <button v-if="!inline" type="button" class="table-icon" :aria-label="t.close" @click="close"><Icon name="x" :size="16" /></button>
      </header>
      <p class="table-hint">{{ hint }} <span>{{ t.keyboardHint }}</span></p>
      <div class="table-stage" :style="{ '--tint': source.tint }" @click.self="pop">
        <p v-if="loadFailed" class="table-empty">{{ t.noRecord }}</p>
        <div v-for="(entry, depth) in stack" :key="entry.id" :ref="(el) => setLayer(depth, el)" class="table-layer" @click.self="pop">
          <template v-if="entry.level.kind === 'days'">
            <PlayingCard v-for="day in entry.level.days" :key="day.date" kind="day" :top="weekday(day.date)" :title="md(day.date)" :value="dayValue(day)"
              :picked="box.has(source.key, day.date)" :disabled="!day.has" :tint="source.tint"
              :aria-label="t.dayAria(md(day.date), dayValue(day) ?? t.noRecord, box.has(source.key, day.date))" :aria-pressed="box.has(source.key, day.date)"
              @click="toggleDay(day, $event.currentTarget as HTMLElement)" @keydown="onCardKey($event, { day })" />
          </template>
          <template v-else>
            <PlayingCard v-for="group in entry.level.groups" :key="group.id" kind="group" :top="groupTop(group)" :title="groupTitle(group)" :value="groupValue(group)"
              :sub="groupSub(group)" :badge="groupBadge(group)" :holding="holdId === group.id" :tint="source.tint"
              :aria-label="t.groupAria(groupTitle(group), groupSub(group))" :aria-description="pickedIn(group) === pickableDates(group).length && pickedIn(group) ? t.holdToUnpick : t.holdToPick"
              @pointerdown="holdStart(group, $event)" @pointermove="holdMove" @pointerup="holdEnd" @pointercancel="holdEnd" @pointerleave="holdEnd"
              @click="tapGroup(group, $event)" @keydown="onCardKey($event, { group })" />
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped src="./CardTable.css"></style>

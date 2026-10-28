<script setup lang="ts">
/* 纪元与事件的横向时间轴（宽屏；窄屏退回 EpochSection 里的竖向列表）。
   轴线上方是事件的圆点（相近的日子自动分泳道），下方是纪元的色带，最底下一行月份。
   默认看截至今天的最近 12 个月，右边留半个月：「今天」不贴边，还在持续的纪元 / 事件在它右边渐隐，表示「至今」。
   「今天」不再是一整条黄竖线（用户 2026-10-28 嫌丑）：轴上一个带呼吸光晕的小圆点，月份那一行一枚「今天」小胶囊，
   今天往右的轴线变成渐隐的虚线——还没发生。
   按住拖动或横向滚轮往前翻，最早到第一条记录或第一年运动数据所在的月份（以前只认事件，没记事件时整条轴正好
   一屏宽、根本拖不动）。点空白的日子：以那天为开始新建事件，编辑器从点击处长出来。
   指针在空白处移动时，一条竖线吸附在指着的那一天、顶上写着日期；点下去以后那一天一直标着，直到编辑器关上
   （用户 2026-10-27：「翻到具体时间时，根本看不出自己点到了哪一天」）。 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from '../Icon.vue';
import { useLifeEvents } from '../../composables/useLifeEvents';
import { useAnnualRings } from '../../composables/useAnnualRings';
import { eventIcon, eventTone } from '../../lib/lifeEvents';
import { journalDay, journalShortDay, todayKey } from '../../lib/logbook/display';
import { daysBetween } from '../../lib/logbook/clock';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { newWheelAccel, wheelSteps } from '../../lib/wheel/momentum';
import { useRepairText } from './repair.i18n';
import { useJournalText } from './journal.i18n';
import type { LifeEvent } from '../../types';

const t = useRepairText();
const j = useJournalText();
const life = useLifeEvents();
/* 运动数据从哪一年开始（履历页年轮区块读的同一份，已经在内存里）：轴最早能拖到那年一月。 */
const rings = useAnnualRings();
const viewport = ref<HTMLElement>();
const anchor = ref<HTMLElement>();
const width = ref(900);
const offset = ref(0);
const hovered = ref<{ event: LifeEvent; x: number; y: number; below: boolean } | null>(null);
/** 指着的那天（cursor）和点下去的那天（picked）：轴上的中心位置 + 日期。 */
const cursor = ref<{ x: number; date: string } | null>(null);
const picked = ref<{ x: number; date: string } | null>(null);
const mark = computed(() => picked.value ?? cursor.value);
/* 日期签不被视口两头切掉：中心夹在看得见的那段里。 */
const markLabelX = computed(() => {
  const left = maxOffset.value - offset.value;
  return mark.value ? Math.max(left + 56, Math.min(left + width.value - 56, mark.value.x)) : 0;
});
watch(() => life.draft.value, draft => { if (!draft) picked.value = null; });
const today = todayKey();

/* 竖向尺寸（px）：事件泳道往上叠，纪元泳道往下叠。 */
const DOT = 28, EVENT_LANE = 36, BAND_LANE = 34, GAP = 8;

const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
const daysIn = (month: number) => new Date(Math.floor(month / 12), month % 12 + 1, 0).getDate();
const last = monthIndex(today);
const dataStart = computed(() => { const year = rings.data.value?.years[0]?.year; return year ? year * 12 : last; });
const first = computed(() => Math.min(last - 11, dataStart.value, ...life.events.value.map(e => monthIndex(e.startDate))));
const monthWidth = computed(() => width.value / 12.5);
const totalWidth = computed(() => (last - first.value + 1.5) * monthWidth.value);
const maxOffset = computed(() => Math.max(0, totalWidth.value - width.value));
const clamp = (n: number) => Math.max(0, Math.min(maxOffset.value, n));
/** 某天在轴上的左边缘；`end` 给那天的右边缘（区间的结束日要包含进去）。 */
const x = (date: string, end = false) => {
  const month = monthIndex(date);
  return ((month - first.value) + (Number(date.slice(8, 10)) - (end ? 0 : 1)) / daysIn(month)) * monthWidth.value;
};
const todayX = computed(() => x(today, true));
const months = computed(() => Array.from({ length: last - first.value + 1 }, (_, i) => {
  const month = first.value + i;
  return { i, label: displayDateTimeFormatter({ year: '2-digit', month: 'short' }).format(new Date(Math.floor(month / 12), month % 12, 1)) };
}));
/* 「今天」胶囊和它压着的那个月份名：撞上了就把月份名让开（胶囊更要紧）。 */
const todayPillHalf = computed(() => (labelWidth(t.value.timelineToday) + 18) / 2);
const hiddenMonth = computed(() => months.value.find(m => {
  const left = m.i * monthWidth.value + 6, right = left + labelWidth(m.label) * (12 / 13);
  return right > todayX.value - todayPillHalf.value - 4 && left < todayX.value + todayPillHalf.value + 4;
})?.i ?? -1);

/* 纪元名写在色带里；色带比名字短时名字照样写全、往右伸出去，排泳道时按两者里更长的算，不会压到下一条。 */
/* 字体只读一次、量过的字记住：以前每量一个名字都 getComputedStyle(body) 一次，每次都逼整页重算样式，
   刚打开履历页时光这一项就占了一百多毫秒（CPU 降速 4× 量的），形变因此晚开跑。 */
let measureCtx: CanvasRenderingContext2D | null = null;
const measured = new Map<string, number>();
const labelWidth = (text: string) => {
  const known = measured.get(text);
  if (known !== undefined) return known;
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d');
    if (measureCtx) measureCtx.font = `600 13px ${getComputedStyle(document.body).fontFamily}`;
  }
  const width = measureCtx ? measureCtx.measureText(text).width : text.length * 13;
  measured.set(text, width);
  return width;
};
function pack<T>(items: T[], span: (item: T) => [number, number]) {
  const ends: number[] = [];
  return items.map(item => {
    const [left, right] = span(item);
    let lane = ends.findIndex(end => end + GAP <= left);
    if (lane < 0) lane = ends.length;
    ends[lane] = right;
    return { item, lane };
  });
}
const byStart = computed(() => [...life.events.value].sort((a, b) => a.startDate.localeCompare(b.startDate)));
const epochs = computed(() => pack(byStart.value.filter(e => e.epoch), event => {
  const left = x(event.startDate);
  const right = event.endDate ? x(event.endDate, true) : totalWidth.value;
  return [left, Math.max(right, left + labelWidth(event.title) + 40)];
}).map(({ item: event, lane }) => {
  const left = x(event.startDate);
  const right = event.endDate ? Math.max(left + 6, x(event.endDate, true)) : totalWidth.value;
  return { event, lane, left, width: right - left, solid: event.endDate ? 1 : Math.min(1, (todayX.value - left) / Math.max(1, right - left)) };
}));
const events = computed(() => pack(byStart.value.filter(e => !e.epoch), event => {
  const at = x(event.startDate) + monthWidth.value / daysIn(monthIndex(event.startDate)) / 2;
  const end = event.endDate && event.endDate !== event.startDate ? x(event.endDate, true) : event.endDate ? at : totalWidth.value;
  return [at - DOT / 2, Math.max(at + DOT / 2, end)];
}).map(({ item: event, lane }) => {
  const at = x(event.startDate) + monthWidth.value / daysIn(monthIndex(event.startDate)) / 2;
  const end = event.endDate ? Math.max(at, x(event.endDate, true)) : totalWidth.value;
  return { event, lane, at, line: end - at, ongoing: !event.endDate };
}));
const eventLanes = computed(() => Math.max(1, ...events.value.map(e => e.lane + 1)));
const epochLanes = computed(() => Math.max(1, ...epochs.value.map(e => e.lane + 1)));
const axisY = computed(() => 16 + eventLanes.value * EVENT_LANE + 6);
const monthY = computed(() => axisY.value + GAP + epochLanes.value * BAND_LANE + 4);
const height = computed(() => monthY.value + 26);
const eventTop = (lane: number) => axisY.value - 10 - DOT - lane * EVENT_LANE;
const bandTop = (lane: number) => axisY.value + GAP + lane * BAND_LANE;
/* 键盘按开始日期在所有点和色带之间走，和读屏顺序一致。 */
const ordered = computed(() => [...epochs.value.map(e => ({ event: e.event, x: e.left })), ...events.value.map(e => ({ event: e.event, x: e.at }))]
  .sort((a, b) => a.event.startDate.localeCompare(b.event.startDate)));

const span = (e: LifeEvent) => e.endDate === e.startDate ? journalShortDay(e.startDate) : `${journalShortDay(e.startDate)} – ${e.endDate ? journalShortDay(e.endDate) : t.value.untilNow}`;
const label = (e: LifeEvent) => `${e.title}，${span(e)}`;
const tipParts = (e: LifeEvent) => [e.title, span(e), j.value.dayCount(daysBetween(e.startDate, e.endDate ?? today) + 1)];
function showTip(event: LifeEvent, target: EventTarget | null) {
  if (drag || !(target instanceof HTMLElement) || !viewport.value) return;
  const box = target.getBoundingClientRect(), view = viewport.value.getBoundingClientRect();
  const left = Math.max(box.left, view.left);
  // 最上面一条泳道的上方放不下小签：改放到它下面。
  const below = box.top - view.top < 48;
  hovered.value = { event, x: Math.max(8, Math.min(view.width - 296, left - view.left)), y: below ? box.bottom - view.top + 8 : box.top - view.top, below };
}

let observer: ResizeObserver | undefined;
let raf = 0;
let drag: { x: number; offset: number; last: number; time: number; velocity: number } | null = null;
let moved = false;
const accel = newWheelAccel();
function stop() { cancelAnimationFrame(raf); hovered.value = null; }
function down(e: PointerEvent) {
  if (e.button !== 0) return;
  stop(); moved = false;
  drag = { x: e.clientX, offset: offset.value, last: e.clientX, time: e.timeStamp, velocity: 0 };
}
function move(e: PointerEvent) {
  if (!drag || !moved) cursor.value = (e.target as Element).closest('button') ? null : dayAt(e.clientX);
  if (!drag) return;
  if (!moved && Math.abs(e.clientX - drag.x) > 5) { moved = true; viewport.value?.setPointerCapture(e.pointerId); hovered.value = null; cursor.value = null; }
  if (!moved) return;
  drag.velocity = (e.clientX - drag.last) / Math.max(1, e.timeStamp - drag.time);
  offset.value = clamp(drag.offset + e.clientX - drag.x);
  drag.last = e.clientX; drag.time = e.timeStamp;
}
function up(e: PointerEvent) {
  if (!drag) return;
  const velocity = drag.velocity; drag = null;
  if (!moved) { if (!(e.target as Element).closest('button')) add(e); return; }
  // 松手后照着手速滑一段、先快后慢停下（时间常数 150ms），不回弹。
  let v = velocity, then = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(32, now - then); then = now;
    v *= Math.exp(-dt / 150); offset.value = clamp(offset.value + v * dt);
    if (Math.abs(v) > .015) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
/* 拖过以后松手会补一个 click：别让它打开松手处那个点的编辑器。 */
function swallowClick(e: MouseEvent) { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }
function wheel(e: WheelEvent) {
  if (!e.deltaX && !e.shiftKey) return;
  e.preventDefault(); stop();
  offset.value = clamp(offset.value - wheelSteps(accel, e.deltaX || e.deltaY, e.deltaMode, e.timeStamp) * monthWidth.value / 3);
}
/** 视口里的横坐标 → 那一天（不晚于今天）和它在轴上的中心。 */
function dayAt(clientX: number) {
  const rect = viewport.value!.getBoundingClientRect();
  const pos = (clientX - rect.left + maxOffset.value - offset.value) / monthWidth.value;
  const month = Math.min(last, first.value + Math.floor(pos));
  const day = Math.min(daysIn(month), Math.floor((pos - (month - first.value)) * daysIn(month)) + 1);
  const raw = `${Math.floor(month / 12)}-${String(month % 12 + 1).padStart(2, '0')}-${String(Math.max(1, day)).padStart(2, '0')}`;
  const date = raw > today ? today : raw;
  return { date, x: x(date) + monthWidth.value / daysIn(monthIndex(date)) / 2 };
}
function add(e: PointerEvent) {
  const rect = viewport.value!.getBoundingClientRect();
  const at = dayAt(e.clientX);
  picked.value = at; cursor.value = null;
  // 锚点先摆到那一天的竖线上（同步布局），编辑器量它的矩形、从那里长出来，关上时也缩回这里。
  anchor.value!.style.left = `${at.x + offset.value - maxOffset.value - 12}px`;
  anchor.value!.style.top = `${e.clientY - rect.top - 16}px`;
  life.open(undefined, at.date, anchor.value);
}
function key(e: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const buttons = [...viewport.value!.querySelectorAll<HTMLButtonElement>('[data-timeline-event]')]
    .sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order));
  if (!buttons.length) return;
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = index < 0 ? (e.key === 'ArrowRight' ? 0 : buttons.length - 1) : Math.max(0, Math.min(buttons.length - 1, index + (e.key === 'ArrowRight' ? 1 : -1)));
  const item = ordered.value[next];
  if (item) offset.value = clamp(maxOffset.value - item.x + width.value / 2);
  buttons[next]?.focus({ preventScroll: true });
}
const order = (event: LifeEvent) => ordered.value.findIndex(item => item.event.id === event.id);
onMounted(() => {
  void rings.load();
  observer = new ResizeObserver(entries => { width.value = entries[0].contentRect.width; offset.value = clamp(offset.value); });
  observer.observe(viewport.value!);
});
onBeforeUnmount(() => { observer?.disconnect(); stop(); });
</script>

<template>
  <div ref="viewport" class="timeline" tabindex="0" :aria-label="j.epochs" @keydown="key" @pointerdown="down" @pointermove="move" @pointerup="up"
    @pointercancel="drag = null" @pointerleave="cursor = null" @click.capture="swallowClick" @wheel="wheel">
    <span ref="anchor" class="day-anchor" aria-hidden="true" />
    <div class="timeline-track" :style="{ width: `${totalWidth}px`, height: `${height}px`, transform: `translateX(${offset - maxOffset}px)`, '--axis': `${axisY}px` }">
      <template v-for="month in months" :key="month.i">
        <i class="month-rule" :style="{ left: `${month.i * monthWidth}px` }" aria-hidden="true" />
        <span class="month" :class="{ yielded: month.i === hiddenMonth }" :style="{ left: `${month.i * monthWidth}px`, top: `${monthY}px` }">{{ month.label }}</span>
      </template>
      <i class="axis" :style="{ width: `${todayX}px` }" aria-hidden="true" />
      <i class="axis-future" :style="{ left: `${todayX}px` }" aria-hidden="true" />
      <span class="today-dot" :style="{ left: `${todayX}px` }" aria-hidden="true" />
      <span class="today-pill" :style="{ left: `${todayX}px`, top: `${monthY - 2}px` }">{{ t.timelineToday }}</span>
      <template v-if="mark">
        <i :class="['day-mark', { picked: !!picked }]" :style="{ left: `${mark.x}px` }" aria-hidden="true" />
        <span :class="['day-label', { picked: !!picked }]" :style="{ left: `${markLabelX}px` }" aria-hidden="true">{{ journalDay(mark.date) }}</span>
      </template>
      <button v-for="item in epochs" :key="item.event.id" type="button" data-timeline-event :data-order="order(item.event)" class="epoch-band"
        :style="{ left: `${item.left}px`, top: `${bandTop(item.lane)}px`, width: `${item.width}px`, '--event-tone': eventTone(item.event.category), '--solid': `${item.solid * 100}%` }"
        :aria-label="label(item.event)" @pointerenter="showTip(item.event, $event.currentTarget)" @pointerleave="hovered = null" @focus="showTip(item.event, $event.currentTarget)" @blur="hovered = null"
        @click="life.open(item.event, undefined, $event.currentTarget as HTMLElement)">
        <span class="band-name">{{ item.event.title }}</span>
      </button>
      <template v-for="item in events" :key="item.event.id">
        <i v-if="item.line > 1" :class="['event-line', { ongoing: item.ongoing }]" :style="{ left: `${item.at}px`, top: `${eventTop(item.lane) + DOT / 2 - 1}px`, width: `${item.line}px`, '--event-tone': eventTone(item.event.category) }" aria-hidden="true" />
        <button type="button" data-timeline-event :data-order="order(item.event)" class="event-dot"
          :style="{ left: `${item.at - DOT / 2}px`, top: `${eventTop(item.lane)}px`, '--event-tone': eventTone(item.event.category) }"
          :aria-label="label(item.event)" @pointerenter="showTip(item.event, $event.currentTarget)" @pointerleave="hovered = null" @focus="showTip(item.event, $event.currentTarget)" @blur="hovered = null"
          @click="life.open(item.event, undefined, $event.currentTarget as HTMLElement)">
          <Icon :name="eventIcon(item.event.category)" :size="15" />
        </button>
      </template>
    </div>
    <p v-if="!life.events.value.length" class="timeline-empty" :style="{ top: `${axisY - 34}px` }">{{ t.timelineEmpty }}</p>
    <div v-if="hovered" :class="['timeline-tip', { below: hovered.below }]" role="tooltip" :style="{ left: `${hovered.x}px`, top: `${hovered.y}px` }"><span v-for="(part, i) in tipParts(hovered.event)" :key="i">{{ part }}</span></div>
  </div>
</template>

<style scoped>
.timeline { position: relative; overflow: hidden; touch-action: pan-y; user-select: none; border-radius: 12px; cursor: grab; outline: none; }
.timeline:focus-visible { box-shadow: 0 0 0 2px var(--focus); }
.timeline:active { cursor: grabbing; }
.timeline-track { position: relative; will-change: transform; }
.month-rule { position: absolute; top: 0; bottom: 22px; width: 1px; background: color-mix(in srgb, var(--mat-line) 55%, transparent); }
.month { position: absolute; padding-left: 6px; color: var(--muted); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.month.yielded { opacity: 0; }
.axis { position: absolute; left: 0; top: var(--axis); height: 1px; background: var(--mat-line); }
/* 今天往右：还没发生，轴线是渐隐的虚线。 */
.axis-future { position: absolute; right: 0; top: var(--axis); height: 1px; opacity: .9;
  background: repeating-linear-gradient(90deg, var(--mat-line) 0 4px, transparent 4px 9px);
  -webkit-mask-image: linear-gradient(90deg, #000, transparent); mask-image: linear-gradient(90deg, #000, transparent); }
/* 今天：轴上一个小圆点，外面一圈很淡的光晕慢慢呼吸（只动 transform / opacity）。 */
.today-dot { position: absolute; top: var(--axis); width: 9px; height: 9px; margin: -4px 0 0 -4.5px; border-radius: 50%; background: var(--accent);
  box-shadow: 0 0 0 2px var(--surface); pointer-events: none; }
.today-dot::after { content: ''; position: absolute; inset: -5px; border-radius: 50%; background: var(--accent); opacity: .18; animation: today-breathe 2.8s ease-in-out infinite; }
@keyframes today-breathe { 0%, 100% { transform: scale(.6); opacity: .28; } 50% { transform: scale(1.25); opacity: .06; } }
.today-pill { position: absolute; padding: 1px 9px; border-radius: 999px; transform: translateX(-50%); background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent); font-size: 12px; font-weight: 600; line-height: 18px; white-space: nowrap; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .today-dot::after { animation: none; } }
.day-mark { position: absolute; top: 22px; bottom: 22px; width: 1px; margin-left: -.5px; background: color-mix(in srgb, var(--ink) 40%, transparent); pointer-events: none; }
.day-mark.picked { width: 2px; margin-left: -1px; background: var(--accent); }
.day-label { position: absolute; top: 0; padding: 1px 8px; border-radius: 999px; background: var(--mat-glass-strong); box-shadow: inset 0 0 0 1px var(--mat-line);
  color: var(--ink); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; transform: translateX(-50%); pointer-events: none; }
.day-label.picked { background: var(--accent); box-shadow: none; color: var(--accent-ink); }
button { font: inherit; color: var(--ink); cursor: pointer; }
button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.epoch-band { position: absolute; height: 26px; padding: 0; border: 0; border-radius: 7px; background: none; text-align: left; overflow: visible; }
/* 色带本身画在伪元素上：还在持续的纪元到「今天」为止是实的，之后渐隐到轴的右端。 */
.epoch-band::before { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 3px 0 var(--event-tone);
  background: linear-gradient(90deg, color-mix(in srgb, var(--event-tone) 28%, var(--surface)) var(--solid), transparent); }
.epoch-band:hover::before { background: linear-gradient(90deg, color-mix(in srgb, var(--event-tone) 40%, var(--surface)) var(--solid), transparent); }
.band-name { position: relative; display: block; padding: 0 10px 0 12px; line-height: 26px; font-size: 13px; font-weight: 600; white-space: nowrap; }
.event-dot { position: absolute; display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%;
  background: color-mix(in srgb, var(--event-tone) 26%, var(--surface)); color: var(--event-tone); box-shadow: 0 0 0 2px var(--surface); }
.event-dot:hover { background: color-mix(in srgb, var(--event-tone) 40%, var(--surface)); }
.event-line { position: absolute; height: 2px; border-radius: 1px; background: var(--event-tone); opacity: .55; }
.event-line.ongoing { background: linear-gradient(90deg, var(--event-tone), transparent); }
.timeline-tip { position: absolute; z-index: 2; max-width: 288px; padding: 8px 12px; border: 1px solid var(--line-control); border-radius: 10px; background: var(--mat-glass-strong);
  color: var(--ink); font-size: var(--fs-sm); box-shadow: 0 4px 12px rgba(0, 0, 0, .2); transform: translateY(calc(-100% - 8px)); pointer-events: none; }
.timeline-tip span { white-space: nowrap; }
.timeline-tip span + span::before { content: ' · '; }
.timeline-tip.below { transform: none; }
.timeline-empty { position: absolute; left: 0; right: 0; margin: 0; text-align: center; color: var(--subtle); font-size: var(--fs-sm); pointer-events: none; }
.day-anchor { position: absolute; width: 24px; height: 32px; pointer-events: none; }
</style>

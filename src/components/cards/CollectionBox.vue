<script setup lang="ts">
/**
 * 收集箱（精修批次 7.3，10-07 第二轮重做成「手里的一把牌」）：右下角悬浮，叠着几张小牌、写着数量；空的时候不出现。
 *
 * 点箱子 → 牌从箱子里飞出来，在屏幕下方展开成一手扇形的牌，按项分成几小把（每把头上一枚「睡眠 · 3 天」）。
 * 悬停的牌沿自己的方向抽高一截；往上拖出去或点 × 把它拿出去。扇面底下正中是箭头：用这些「类别 × 天」
 * 新开一个任务、去「交给 AI」。真交出去以后才清空（useCardCollection 的 clearAfterHandoff）。
 * 只动 transform / opacity；背景是一层静态模糊，只淡入淡出它自己。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '../Icon.vue';
import { useCardsText } from './cards.i18n';
import { useCardCollection } from '../../composables/useCardCollection';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { cutDeck, reducedMotion, SPRINGS, springCurve } from '../../lib/motion/cards';
import { onMotionEscape } from '../../lib/motion/interrupt';
import { AI_TASK_CATEGORY_META, categoryLabel } from '../../lib/aiTask/categories';
import { metricLabel } from '../../lib/aiTask/metrics';
import { dayKey } from '../../lib/aiTask/bridgeScale';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import type { AiTaskCategory } from '../../lib/bridge/types';

const t = useCardsText();
const box = useCardCollection();
const ctl = useAiTaskDraft();
const route = useRoute();
const router = useRouter();
const open = ref(false);
const busy = ref(false);
const boxButton = ref<HTMLElement | null>(null);
const hand = ref<HTMLElement | null>(null);
const backdrop = ref<HTMLElement | null>(null);
const viewport = ref({ width: window.innerWidth, height: window.innerHeight });
const MAX_SHOWN = 40;

const labelOf = (key: string) => (key.startsWith('cat:') ? categoryLabel(key.slice(4) as AiTaskCategory) : metricLabel(key));
const tintOf = (category: AiTaskCategory) => AI_TASK_CATEGORY_META[category]?.tint ?? 'var(--accent)';
const md = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const weekday = (date: string) => displayDateTimeFormatter({ weekday: 'short' }).format(parseDisplayDate(date));
/* 「交给 AI」页底下有底栏：箱子往上让一让。 */
const lifted = computed(() => route.path === '/ai' || route.path.startsWith('/ai/'));

/**
 * 一手牌：圆心在屏幕下方很远处，牌沿一段平缓的圆弧排开、各自转到圆弧的切向；一把与一把之间空半张牌。
 * 牌多了就把牌缩小、挨得更紧。
 */
const layout = computed(() => {
  const shown: Array<{ id: string; key: string; date: string; tint: string; label: string; group: number }> = [];
  const groups = box.groups.value;
  groups.forEach((group, g) => {
    for (const date of group.dates) {
      if (shown.length >= MAX_SHOWN) break;
      shown.push({ id: `${group.key}@${date}`, key: group.key, date, tint: tintOf(group.category), label: labelOf(group.key), group: g });
    }
  });
  const n = shown.length;
  const { width, height } = viewport.value;
  const w = Math.round(Math.max(76, Math.min(132, (width - 200) / Math.max(5, n * 0.62))));
  const h = Math.round(w * 1.4);
  const R = Math.max(900, width * 0.9);
  // 牌少时一张张摊开（几乎不压），牌多了才像手里那样压成一把。
  const overlap = Math.max(0.58, Math.min(1.06, 1.12 - n * 0.035));
  const step = (w * overlap) / R;
  const gaps = new Set<number>();
  shown.forEach((card, i) => { if (i > 0 && shown[i - 1]!.group !== card.group) gaps.add(i); });
  const units = Math.max(0, n - 1) + gaps.size * 0.6;
  let at = -(units * step) / 2;
  const cx = width / 2;
  const topY = height - 150 - h / 2 - Math.min(80, height * 0.08);
  const pivotY = topY + R;
  const cards = shown.map((card, i) => {
    if (i > 0) at += step * (gaps.has(i) ? 1.6 : 1);
    const x = cx + R * Math.sin(at);
    const y = pivotY - R * Math.cos(at);
    const deg = (at * 180) / Math.PI;
    return {
      ...card, angle: at,
      style: {
        left: `${(x - w / 2).toFixed(1)}px`, top: `${(y - h / 2).toFixed(1)}px`, width: `${w}px`, height: `${h}px`,
        transform: `rotate(${deg.toFixed(2)}deg)`, '--tint': card.tint,
        '--lx': `${(Math.sin(at) * 30).toFixed(1)}px`, '--ly': `${(-Math.cos(at) * 30).toFixed(1)}px`, zIndex: String(i + 1),
      } as Record<string, string>,
    };
  });
  // 每一把头上一枚标签：放在这一把中间那张牌的正上方。
  const labels = groups.map((group, g) => {
    const mine = cards.filter((card) => card.group === g);
    if (!mine.length) return null;
    const mid = (mine[0]!.angle + mine[mine.length - 1]!.angle) / 2;
    const r = R + h / 2 + 30;
    return {
      key: group.key, text: t.value.boxGroup(labelOf(group.key), group.dates.length), tint: tintOf(group.category),
      style: { left: `${(cx + r * Math.sin(mid)).toFixed(1)}px`, top: `${(pivotY - r * Math.cos(mid)).toFixed(1)}px` },
    };
  }).filter((label): label is NonNullable<typeof label> => label !== null);
  return { cards, labels, more: box.count.value - shown.length, cardW: w };
});

const handCards = () => [...(hand.value?.querySelectorAll<HTMLElement>('.hand-card') ?? [])];
const boxCenter = () => {
  const b = boxButton.value?.getBoundingClientRect();
  return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : { x: viewport.value.width - 60, y: viewport.value.height - 50 };
};
/** 牌在箱子里时的样子：缩小、摆正，叠在箱子中心。 */
const inBox = (card: HTMLElement) => {
  const c = boxCenter();
  const r = card.getBoundingClientRect();
  return `translate(${(c.x - (r.left + r.width / 2)).toFixed(1)}px, ${(c.y - (r.top + r.height / 2)).toFixed(1)}px) rotate(0deg) scale(.28)`;
};
const settle = (animations: Animation[]) => Promise.all(animations.map((a) => a.finished.catch(() => undefined)));

const deal = () => {
  const cards = handCards();
  if (reducedMotion()) return settle(cards.map((card) => card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'backwards' })));
  const { easing, duration } = springCurve(SPRINGS.deal);
  return settle(cards.map((card, i) => {
    const end = card.style.transform;
    return card.animate([{ transform: `${inBox(card)}`, opacity: 0 }, { opacity: 1, offset: 0.18 }, { transform: end, opacity: 1 }],
      { duration: duration + 60, delay: i * 26, easing, fill: 'backwards' });
  }));
};
const gather = (toBox = true) => {
  const cards = handCards();
  const count = cards.length;
  return settle(cards.map((card, i) => {
    const now = getComputedStyle(card).transform;
    const end = toBox ? inBox(card) : `${card.style.transform} translateY(40px) scale(.8)`;
    return card.animate([{ transform: now === 'none' ? card.style.transform : now, opacity: 1 }, { transform: end, opacity: 0 }],
      { duration: reducedMotion() ? 140 : 360, delay: reducedMotion() ? 0 : (count - 1 - i) * 14, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
  }));
};
const fade = (el: HTMLElement | null, to: number, duration: number) => {
  if (!el) return null;
  const from = getComputedStyle(el).opacity;
  return el.animate([{ opacity: from }, { opacity: to }], { duration, easing: to ? 'cubic-bezier(.2, .8, .2, 1)' : 'ease-in', fill: 'forwards' });
};

const show = async () => {
  if (busy.value || !box.count.value) return;
  busy.value = true;
  viewport.value = { width: window.innerWidth, height: window.innerHeight };
  open.value = true;
  await nextTick();
  fade(backdrop.value, 1, 380);
  await deal();
  busy.value = false;
  document.querySelector<HTMLElement>('.hand-go')?.focus({ preventScroll: true });
};
const hide = async () => {
  if (busy.value || !open.value) return;
  busy.value = true;
  await Promise.all([gather(), fade(backdrop.value, 0, 360)?.finished.catch(() => undefined)]);
  open.value = false;
  busy.value = false;
  boxButton.value?.focus({ preventScroll: true });
};

/* 拿出去：往上飞走、淡掉，再从箱子里删掉（剩下的牌顺着补位）。 */
const fling = (card: HTMLElement | null, key: string, date: string) => {
  const out = card?.animate([{ opacity: 1 }, { opacity: 0, translate: `${card.style.translate || '0px 0px'}`, transform: `${card.style.transform} translateY(-160px) scale(.9)` }],
    { duration: 260, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
  void (out?.finished ?? Promise.resolve()).catch(() => undefined).then(() => {
    box.remove(key, [date]);
    if (!box.count.value) open.value = false;
  });
};
const removeCard = (event: Event, key: string, date: string) => {
  fling((event.currentTarget as HTMLElement).closest<HTMLElement>('.hand-card'), key, date);
};
const removeGroup = async (key: string) => {
  const group = box.groups.value.find((g) => g.key === key);
  if (!group) return;
  box.remove(key, group.dates);
  if (!box.count.value) { open.value = false; return; }
  await nextTick();
  void cutDeck(handCards());
};

/* 拖牌：往上拖出去 90px 就拿走，没拖够弹回原位。 */
let drag: { el: HTMLElement; key: string; date: string; x: number; y: number; id: number; moved: boolean } | null = null;
const dragStart = (event: PointerEvent, key: string, date: string) => {
  if (event.button !== 0 || busy.value || (event.target as Element).closest('.hand-remove')) return;
  const el = event.currentTarget as HTMLElement;
  drag = { el, key, date, x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
  el.setPointerCapture(event.pointerId);
};
const dragMove = (event: PointerEvent) => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;
  drag.moved = true;
  drag.el.classList.add('dragging');
  drag.el.style.translate = `${dx}px ${dy}px`;
};
const dragEnd = (event: PointerEvent) => {
  if (!drag || event.pointerId !== drag.id) return;
  const { el, key, date, y, moved } = drag;
  drag = null;
  el.classList.remove('dragging');
  if (!moved) { el.style.translate = ''; return; }
  if (y - event.clientY > 90) { fling(el, key, date); return; }
  const from = el.style.translate;
  el.style.translate = '';
  const { easing, duration } = springCurve(SPRINGS.settle);
  el.animate([{ translate: from }, { translate: '0px 0px' }], { duration, easing });
};

/** 箭头：新开一个任务，只勾收集箱里的「类别 × 天」，去「交给 AI」。 */
const go = async () => {
  if (!box.count.value) return;
  ctl.resetDraft();
  ctl.applyPicks(box.byCategory(), dayKey());
  box.handedToTask.value = true;
  await hide();
  await router.push('/ai');
};
const clearAll = async () => {
  busy.value = true;
  await Promise.all([gather(false), fade(backdrop.value, 0, 320)?.finished.catch(() => undefined)]);
  box.clear();
  open.value = false;
  busy.value = false;
};

const releaseEscape = onMotionEscape(() => {
  if (!open.value) return false;
  void hide();
  return true;
});
const onResize = () => { viewport.value = { width: window.innerWidth, height: window.innerHeight }; };
window.addEventListener('resize', onResize);
onBeforeUnmount(() => { releaseEscape(); window.removeEventListener('resize', onResize); });
watch(() => box.count.value, (count) => { if (!count) open.value = false; });
</script>

<template>
  <Teleport to="body">
    <Transition name="box-pop">
      <button v-show="box.count.value > 0" id="card-collection-box" ref="boxButton" type="button" :class="['collection-box', { lifted, open }]"
        :aria-label="t.boxAria(box.count.value)" :aria-expanded="open" @click="open ? hide() : show()">
        <span class="box-stack" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="box-copy"><small>{{ t.boxTitle }}</small><em>{{ box.count.value }}</em></span>
      </button>
    </Transition>
    <div v-if="open" class="box-spread" role="dialog" aria-modal="true" :aria-label="t.boxTitle">
      <div ref="backdrop" class="spread-backdrop" aria-hidden="true" @click="hide"></div>
      <div ref="hand" class="hand" :style="{ '--card-w': `${layout.cardW}px` }">
        <div v-for="card in layout.cards" :key="card.id" class="hand-card" :style="card.style"
          @pointerdown="dragStart($event, card.key, card.date)" @pointermove="dragMove" @pointerup="dragEnd" @pointercancel="dragEnd">
          <span class="hand-face">
            <span class="hand-corner"><i></i>{{ weekday(card.date) }}</span>
            <strong>{{ md(card.date) }}</strong>
            <small>{{ card.label }}</small>
          </span>
          <button type="button" class="hand-remove" :aria-label="t.removeCard(card.label, md(card.date))" @click="removeCard($event, card.key, card.date)"><Icon name="x" :size="12" /></button>
        </div>
        <button v-for="label in layout.labels" :key="label.key" type="button" class="hand-label" :style="{ ...label.style, '--tint': label.tint }"
          :aria-label="t.removeCard(label.text, '')" @click="removeGroup(label.key)"><i></i>{{ label.text }}<Icon name="x" :size="11" /></button>
      </div>
      <footer class="spread-foot">
        <p>{{ t.boxHint }}<template v-if="layout.more > 0"> · {{ t.more(layout.more) }}</template></p>
        <div class="foot-row">
          <button type="button" class="foot-button" @click="clearAll"><Icon name="trash" :size="14" />{{ t.boxClear }}</button>
          <button type="button" class="hand-go" :title="t.boxGo" @click="go">
            <span class="go-icon"><span class="go-box"><Icon name="box" :size="20" /></span><span class="go-arrow"><Icon name="arrow-right" :size="20" /></span></span>
            <span>{{ t.boxGo }}</span>
          </button>
          <button type="button" class="foot-button" @click="hide">{{ t.boxClose }}</button>
        </div>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped src="./CollectionBox.css"></style>

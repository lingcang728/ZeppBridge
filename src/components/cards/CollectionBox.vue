<script setup lang="ts">
/**
 * 收集箱（精修批次 7.3，第三轮 A4 / A5 重做进出与拖拽）：右下角悬浮，叠着几张小牌、写着数量。
 *
 * - 进出：有牌时常驻；牌桌开着时哪怕是空的也跟着牌桌一起从右下角滑进来（虚线空槽「放到这里」），第一张牌飞到时
 *   「接住」——变实、数字从 0 翻到 1；牌桌收起且箱子仍空就跟着滑出去。不再 `scale(.6)` 凭空弹出。
 * - 铺开：背景淡入 → 牌从箱子里一张张扇出成一手牌 → 分组标签、底部按钮最后浮上；
 *   收回反序：按钮和标签先淡下去 → 牌依次收回箱子（背景同时淡回）。中途再点箱子 / Esc = 从此刻原路收回或展开。
 * - 拖出去 / × / 整把移除：见 useHandGestures（rAF 合帧、惯性抛出、FLIP 补位）；拿空了也按收回的编排退场，不硬切。
 * 箭头：用这些「类别 × 天」新开一个任务、去「交给 AI」。真交出去以后才清空（useCardCollection 的 clearAfterHandoff）。
 * 只动 transform / opacity；背景是一层静态模糊，只淡入淡出它自己。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '../Icon.vue';
import CoachTip from './CoachTip.vue';
import { useCardsText } from './cards.i18n';
import { useCardCollection } from '../../composables/useCardCollection';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useHandGestures } from '../../composables/useHandGestures';
import { animateFromNow, reducedMotion, sequence, settled, SPRINGS, springCurve } from '../../lib/motion/cards';
import { CLOSE_EASE, OPEN_EASE } from '../../lib/motion/timing';
import { onMotionEscape } from '../../lib/motion/interrupt';
import { handLayout, labelOfPick } from '../../lib/cards/hand';
import { dayKey } from '../../lib/aiTask/bridgeScale';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';

const t = useCardsText();
const box = useCardCollection();
const ctl = useAiTaskDraft();
const route = useRoute();
const router = useRouter();
const open = ref(false);
/** 想要的状态：展开（或正在展开）。中途再点箱子 / Esc 就是朝反方向从此刻起放。 */
const showing = ref(false);
const chromeIn = ref(false);
const present = ref(false);
const boxButton = ref<HTMLElement | null>(null);
const hand = ref<HTMLElement | null>(null);
const backdrop = ref<HTMLElement | null>(null);
const viewport = ref({ width: window.innerWidth, height: window.innerHeight });
const seq = sequence();
const SLIDE_MS = 420;
const CHROME_MS = 160;

const md = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const weekday = (date: string) => displayDateTimeFormatter({ weekday: 'short' }).format(parseDisplayDate(date));
/* 「交给 AI」页底下有底栏：箱子往上让一让。 */
const lifted = computed(() => route.path === '/ai' || route.path.startsWith('/ai/'));
const layout = computed(() => handLayout(box.groups.value, viewport.value, (key, n) => (key === 'workout' ? t.value.boxWorkouts(labelOfPick(key), n) : t.value.boxGroup(labelOfPick(key), n))));
const empty = computed(() => box.count.value === 0);

const handCards = () => [...(hand.value?.querySelectorAll<HTMLElement>('.hand-card') ?? [])];
const boxCenter = () => {
  const b = boxButton.value?.getBoundingClientRect();
  return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : { x: viewport.value.width - 60, y: viewport.value.height - 50 };
};
/** 牌在箱子里时的样子：缩小、摆正，叠在箱子中心。 */
const inBox = (card: HTMLElement) => {
  const c = boxCenter();
  const left = Number.parseFloat(card.style.left) || 0;
  const top = Number.parseFloat(card.style.top) || 0;
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  return `translate(${(c.x - (left + w / 2)).toFixed(1)}px, ${(c.y - (top + h / 2)).toFixed(1)}px) rotate(0deg) scale(.28)`;
};

/* ---------- 箱子本身：跟着牌桌滑进滑出 ---------- */
const shouldShow = computed(() => box.count.value > 0 || box.tableOpen.value);
let slide: Animation | null = null;
const slideIn = async () => {
  present.value = true;
  await nextTick();
  const el = boxButton.value;
  if (!el) return;
  const from = slide ? null : { translate: '36px 56px', opacity: 0 };
  slide?.cancel();
  slide = from
    ? el.animate([from, { translate: '0px 0px', opacity: 1 }], { duration: reducedMotion() ? 140 : SLIDE_MS, easing: OPEN_EASE })
    : animateFromNow(el, { translate: '0px 0px', opacity: 1 }, { duration: SLIDE_MS, easing: OPEN_EASE }, ['translate', 'opacity']);
  await settled([slide]);
  slide = null;
};
const slideOut = async () => {
  const el = boxButton.value;
  if (!el) { present.value = false; return; }
  const anim = animateFromNow(el, { translate: '36px 56px', opacity: 0 }, { duration: reducedMotion() ? 140 : SLIDE_MS, easing: CLOSE_EASE, fill: 'forwards' }, ['translate', 'opacity']);
  slide = anim;
  await settled([anim]);
  if (slide === anim && !shouldShow.value) { present.value = false; slide = null; }
};
watch(shouldShow, (show) => { void (show ? slideIn() : slideOut()); }, { immediate: true });

/* ---------- 铺开 / 收回 ---------- */
const deal = (fresh: boolean) => {
  const cards = handCards();
  if (reducedMotion()) return settled(cards.map((card) => card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'backwards' })));
  const { easing, duration } = springCurve(SPRINGS.deal);
  return settled(cards.map((card, i) => {
    const end = { transform: card.style.transform, opacity: 1 };
    const options: KeyframeAnimationOptions = { duration: duration + 60, delay: i * 26, easing, fill: 'backwards' };
    return fresh
      ? card.animate([{ transform: inBox(card), opacity: 0 }, { opacity: 1, offset: 0.18 }, end], options)
      : animateFromNow(card, end, options);
  }));
};
const gather = (toBox = true) => {
  const cards = handCards();
  const count = cards.length;
  return settled(cards.map((card, i) => animateFromNow(
    card,
    { transform: toBox ? inBox(card) : `${card.style.transform} translateY(40px) scale(.8)`, opacity: 0 },
    { duration: reducedMotion() ? 140 : 360, delay: reducedMotion() ? 0 : (count - 1 - i) * 14, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' },
  )));
};
const fadeBackdrop = (to: number, duration: number) => {
  const el = backdrop.value;
  return el ? settled([animateFromNow(el, { opacity: to }, { duration, easing: to ? OPEN_EASE : CLOSE_EASE, fill: 'forwards' }, ['opacity'])]) : Promise.resolve();
};
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const show = async () => {
  if (empty.value) return;
  const id = seq.next();
  showing.value = true;
  const fresh = !open.value;
  viewport.value = { width: window.innerWidth, height: window.innerHeight };
  open.value = true;
  await nextTick();
  void fadeBackdrop(1, 380);
  await deal(fresh);
  if (!seq.live(id)) return;
  chromeIn.value = true;
  document.querySelector<HTMLElement>('.hand-go')?.focus({ preventScroll: true });
};
const hide = async (toBox = true) => {
  if (!open.value) return;
  const id = seq.next();
  showing.value = false;
  chromeIn.value = false;
  if (!reducedMotion()) await wait(CHROME_MS);
  if (!seq.live(id)) return;
  await Promise.all([gather(toBox), fadeBackdrop(0, 360)]);
  if (!seq.live(id)) return;
  open.value = false;
  boxButton.value?.focus({ preventScroll: true });
};
const toggle = () => { void (showing.value ? hide() : show()); };

const gestures = useHandGestures({
  cards: handCards,
  remove: (ids) => {
    for (const id of ids) {
      const at = id.lastIndexOf('@');
      box.remove(id.slice(0, at), [id.slice(at + 1)]);
    }
  },
  afterRemove: () => { if (empty.value) void hide(); },
  blocked: () => !chromeIn.value,
});
const removeCard = (event: Event, id: string) => {
  const el = (event.currentTarget as HTMLElement).closest<HTMLElement>('.hand-card');
  if (el) void gestures.fling([el], [id]);
};
const removeGroup = (key: string) => {
  const els = handCards().filter((el) => el.dataset.key === key);
  const ids = (box.groups.value.find((group) => group.key === key)?.items ?? []).map((item) => `${item.key}@${item.date}`);
  void gestures.fling(els, ids);
};

/** 箭头：新开一个任务，只勾收集箱里的「类别 × 天」，去「交给 AI」。 */
const go = async () => {
  if (empty.value) return;
  ctl.resetDraft();
  ctl.applyPicks(box.byCategory(), dayKey(), box.workoutIds());
  box.handedToTask.value = true;
  await hide();
  await router.push('/ai');
};
const clearAll = async () => {
  await hide(false);
  box.clear();
};

const releaseEscape = onMotionEscape(() => {
  if (!open.value) return false;
  void hide();
  return true;
});
const onResize = () => { viewport.value = { width: window.innerWidth, height: window.innerHeight }; };
window.addEventListener('resize', onResize);
onBeforeUnmount(() => { releaseEscape(); window.removeEventListener('resize', onResize); });
</script>

<template>
  <Teleport to="body">
    <button v-if="present" id="card-collection-box" ref="boxButton" type="button" :class="['collection-box', { lifted, open, empty }]"
      :aria-label="t.boxAria(box.count.value)" :aria-expanded="open" @click="empty ? undefined : toggle()">
      <span class="box-stack" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="box-copy">
        <small>{{ empty ? t.boxDrop : t.boxTitle }}</small>
        <span class="box-count"><Transition name="count-roll"><em :key="box.count.value">{{ box.count.value }}</em></Transition></span>
      </span>
    </button>
    <div v-if="open" :class="['box-spread', { 'chrome-in': chromeIn }]" role="dialog" aria-modal="true" :aria-label="t.boxTitle">
      <div ref="backdrop" class="spread-backdrop" aria-hidden="true" @click="hide()"></div>
      <div ref="hand" class="hand" :style="{ '--card-w': `${layout.cardW}px` }">
        <div v-for="card in layout.cards" :key="card.id" class="hand-card" :data-id="card.id" :data-key="card.key" :style="card.style"
          @pointerdown="gestures.dragStart($event, card.id)" @pointermove="gestures.dragMove" @pointerup="gestures.dragEnd" @pointercancel="gestures.dragEnd">
          <span class="hand-face">
            <span class="hand-corner"><i></i>{{ weekday(card.date) }}</span>
            <strong>{{ md(card.date) }}</strong>
            <small>{{ card.label }}</small>
          </span>
          <span class="hand-drop" aria-hidden="true">{{ t.dragOut }}</span>
          <button type="button" class="hand-remove" :aria-label="t.removeCard(card.label, md(card.date))" @click="removeCard($event, card.id)"><Icon name="x" :size="12" /></button>
        </div>
        <button v-for="label in layout.labels" :key="label.key" type="button" class="hand-label" :style="{ ...label.style, '--tint': label.tint }"
          :aria-label="t.removeCard(label.text, '')" @click="removeGroup(label.key)"><i></i>{{ label.text }}<Icon name="x" :size="11" /></button>
      </div>
      <footer class="spread-foot">
        <CoachTip id="collection-box" :text="t.tipBox" />
        <p v-if="layout.more > 0" class="spread-more">{{ t.more(layout.more) }}</p>
        <div class="foot-row">
          <button type="button" class="foot-button" @click="clearAll"><Icon name="trash" :size="14" />{{ t.boxClear }}</button>
          <button type="button" class="hand-go" :title="t.boxGo" @click="go">
            <span class="go-icon"><span class="go-box"><Icon name="box" :size="20" /></span><span class="go-arrow"><Icon name="arrow-right" :size="20" /></span></span>
            <span>{{ t.boxGo }}</span>
          </button>
          <button type="button" class="foot-button" @click="hide()">{{ t.boxClose }}</button>
        </div>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped src="./CollectionBox.css"></style>

<script setup lang="ts">
/**
 * 收集箱（精修批次 7.3；第四轮 1A·A4 / A8 / A9 / A12 + 1B·B1 / B2 重做）。
 *
 * - 箱子是一只**合盖的小丑盒**（侧面印数量），右下角悬浮。牌飞进来时盖子弹开接住、落进去再合上（fly.ts → box.ts）。
 *   空箱写「收集箱 · 空」，不画虚线框；有牌被拖着悬在箱子上方时亮起「松手放进来」（`dropHover`，拖拽在牌桌那边做）。
 *   牌桌开着时哪怕是空的也跟着牌桌一起从右下角滑进来；牌桌收起且箱子仍空就跟着滑出去。
 * - 铺开：盖子弹起 → 牌像弹簧一样从盒口蹦出来，再落到各自的位置（按项分组、一周一排、上下错开，见 lib/cards/hand.ts）
 *   → 盖子合上 → 分组标签、底部按钮最后浮上。收起反过来：按钮和标签先淡下去 → 盖子弹开 → 牌依次落回盒子 → 合上。
 *   中途再点箱子 / Esc = 从此刻原路收回或展开（打断接力 `relay`）。
 * - 某一项挑了一整月：折成一张月牌（点阵点亮挑了的日子），点开按周摊开。
 * - 往上甩出去 / × / 整把移除：见 useHandGestures（甩出屏幕、FLIP 补位）；拿空了也按收回的编排退场。
 * 箭头：用这些「类别 × 天」新开一个任务、去「交给 AI」。真交出去以后才清空（useCardCollection 的 clearAfterHandoff）。
 * 颜色：一项指标就是那项指标的颜色（lib/cards/handTint.ts → metricColor），不按类别。
 * 只动 transform / opacity；背景是一层静态模糊，只淡入淡出它自己。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../Icon.vue';
import CoachTip from './CoachTip.vue';
import { useCardsText } from './cards.i18n';
import { useCardCollection } from '../../composables/useCardCollection';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useHandGestures } from '../../composables/useHandGestures';
import { animateFromNow, lidClose, lidOpen, reducedMotion, relay, settled, SPRINGS, springCurve } from '../../lib/motion/cards';
import { CLOSE_EASE, OPEN_EASE } from '../../lib/motion/timing';
import { onMotionEscape } from '../../lib/motion/interrupt';
import { handLayout } from '../../lib/cards/hand';
import { labelOfPick, tintOfGroup } from '../../lib/cards/handTint';
import { PAIRED_METRICS } from '../../lib/cards/sources';
import { metricColor } from '../../lib/metricTone';
import { dayKey } from '../../lib/aiTask/bridgeScale';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';

const t = useCardsText();
const box = useCardCollection();
const ctl = useAiTaskDraft();
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
/** 点开摊成周排的月牌。收起铺开层时清空。 */
const expanded = ref<ReadonlySet<string>>(new Set());
const seq = relay();
const SLIDE_MS = 420;
const CHROME_MS = 160;

const md = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const weekday = (date: string) => displayDateTimeFormatter({ weekday: 'short' }).format(parseDisplayDate(date));
const monthName = (month: string) => displayDateTimeFormatter({ month: 'long' }).format(parseDisplayDate(`${month}-01`));
const groupText = (key: string, n: number) => (key === 'workout' ? t.value.boxWorkouts(labelOfPick(key), n) : t.value.boxGroup(labelOfPick(key), n));
const layout = computed(() => handLayout(box.groups.value, viewport.value, {
  groupText, tintOf: tintOfGroup, labelOf: labelOfPick, expanded: expanded.value,
  insets: { top: 72, bottom: 170 + (viewport.value.width <= 700 ? 66 : 0), side: 24 },
}));
const empty = computed(() => box.count.value === 0);
/** 在舞台上箭头是「放进这次任务」，别处是「用这些日子开一个任务」。 */
const goLabel = computed(() => (router.currentRoute.value.path === '/ai' ? t.value.boxPour : t.value.boxGo));
/** 成对的指标（乳酸阈值）：小牌也是对角斜切双色。 */
const duoStyle = (key: string, style: Record<string, string>) => (PAIRED_METRICS[key] ? { ...style, '--tint2': metricColor(PAIRED_METRICS[key]!) } : style);
const boxLabel = computed(() => (box.dropHover.value ? t.value.boxDropHere : empty.value ? t.value.boxEmptyLabel : t.value.boxTitle));

const handCards = () => [...(hand.value?.querySelectorAll<HTMLElement>('.hand-card') ?? [])];
const boxCenter = () => {
  const b = boxButton.value?.querySelector('.jack')?.getBoundingClientRect() ?? boxButton.value?.getBoundingClientRect();
  return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : { x: viewport.value.width - 60, y: viewport.value.height - 50 };
};
/** 牌在盒子里 / 刚蹦出盒口时的样子：缩小、摆正，压在盒口上（`lift` = 往上蹦多高）。 */
const atBox = (card: HTMLElement, scale: number, lift = 0, spin = 0) => {
  const c = boxCenter();
  const left = Number.parseFloat(card.style.left) || 0;
  const top = Number.parseFloat(card.style.top) || 0;
  return `translate(${(c.x - (left + card.offsetWidth / 2)).toFixed(1)}px, ${(c.y - lift - (top + card.offsetHeight / 2)).toFixed(1)}px) rotate(${spin}deg) scale(${scale})`;
};
const restTransform = (card: HTMLElement) => card.style.transform || 'none';

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
/** 铺开：新开时从盒口蹦出来（先往上弹一截、再落到位）；半路掉头时从此刻的样子落回位。 */
const deal = (fresh: boolean) => {
  const cards = handCards();
  if (reducedMotion()) return settled(cards.map((card) => card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'backwards' })));
  const { easing, duration } = springCurve(SPRINGS.deal);
  const n = cards.length;
  return settled(seq.track(cards.map((card, i) => {
    const end = { transform: restTransform(card), opacity: 1 };
    const options: KeyframeAnimationOptions = { duration: duration + 120, delay: Math.min(i, 24) * 22, easing, fill: 'backwards' };
    const spin = ((i * 37) % 17) - 8;
    return fresh
      ? card.animate([{ transform: atBox(card, 0.22), opacity: 0 }, { opacity: 1, offset: 0.12 },
        { transform: atBox(card, 0.62, 150 + (i % 5) * 14 - (n > 20 ? 30 : 0), spin), opacity: 1, offset: 0.34 }, end], options)
      : animateFromNow(card, end, options);
  })));
};
const gather = (toBox = true) => {
  const cards = handCards();
  const count = cards.length;
  return settled(seq.track(cards.map((card, i) => animateFromNow(
    card,
    toBox ? [{ transform: atBox(card, 0.5, 90), opacity: 1, offset: 0.6 }, { transform: atBox(card, 0.22), opacity: 0 }]
      : { transform: `${restTransform(card)} translateY(40px) scale(.8)`, opacity: 0 },
    { duration: reducedMotion() ? 140 : 420, delay: reducedMotion() ? 0 : Math.min(count - 1 - i, 24) * 12, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' },
  ))));
};
const fadeBackdrop = (to: number, duration: number) => {
  const el = backdrop.value;
  return el ? settled([animateFromNow(el, { opacity: to }, { duration, easing: to ? OPEN_EASE : CLOSE_EASE, fill: 'forwards' }, ['opacity'])]) : Promise.resolve();
};
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const show = async () => {
  if (empty.value) return;
  const id = seq.handoff();
  showing.value = true;
  const fresh = !open.value;
  viewport.value = { width: window.innerWidth, height: window.innerHeight };
  open.value = true;
  await nextTick();
  void fadeBackdrop(1, 380);
  lidOpen(boxButton.value, 'wide');
  if (fresh && !reducedMotion()) await wait(90);
  if (!seq.live(id)) return;
  await deal(fresh);
  if (!seq.live(id)) return;
  lidClose(boxButton.value);
  chromeIn.value = true;
  document.querySelector<HTMLElement>('.hand-go')?.focus({ preventScroll: true });
};
const hide = async (toBox = true) => {
  if (!open.value) return;
  const id = seq.handoff();
  showing.value = false;
  chromeIn.value = false;
  if (!reducedMotion()) await wait(CHROME_MS);
  if (!seq.live(id)) return;
  if (toBox) lidOpen(boxButton.value, 'wide');
  await Promise.all([gather(toBox), fadeBackdrop(0, 380)]);
  if (!seq.live(id)) return;
  lidClose(boxButton.value);
  open.value = false;
  expanded.value = new Set();
  boxButton.value?.focus({ preventScroll: true });
};
const toggle = () => { void (showing.value ? hide() : show()); };

/** 一张牌的 id 展开成箱子里的几项：月牌是那个月挑的每一天。 */
const idsOf = (id: string) => layout.value.months.find((month) => month.id === id)?.ids ?? [id];
const gestures = useHandGestures({
  cards: handCards,
  remove: (ids) => {
    for (const id of ids.flatMap(idsOf)) {
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

/** 点开一张月牌：这个月按周摊开，其余的牌 FLIP 让位，新摊出来的从月牌那里落下来。 */
const expandMonth = async (id: string) => {
  if (gestures.consumeDrag()) return;
  const before = new Map(handCards().map((el) => [el.dataset.id!, el.getBoundingClientRect()]));
  const from = before.get(id);
  expanded.value = new Set([...expanded.value, id]);
  await nextTick();
  if (reducedMotion()) return;
  const { easing, duration } = springCurve(SPRINGS.settle);
  handCards().forEach((el, i) => {
    const now = el.getBoundingClientRect();
    const old = before.get(el.dataset.id!) ?? from;
    if (!old || !now.width) return;
    const dx = old.left + old.width / 2 - (now.left + now.width / 2);
    const dy = old.top + old.height / 2 - (now.top + now.height / 2);
    const scale = old.width / now.width;
    const fresh = !before.has(el.dataset.id!);
    el.animate([{ translate: `${dx.toFixed(1)}px ${dy.toFixed(1)}px`, scale: scale.toFixed(3), opacity: fresh ? 0 : 1 }, { translate: '0px 0px', scale: '1', opacity: 1 }],
      { duration, delay: fresh ? Math.min(i, 30) * 10 : 0, easing, fill: 'backwards' });
  });
};
const monthAria = (month: { month: string; label: string; count: number }) => t.value.monthAria(monthName(month.month), month.label, month.count);

/** 箭头：新开一个任务，只勾收集箱里的「类别 × 天」，去「交给 AI」。
    已经在「交给 AI」舞台上：收起铺开层，让舞台把箱子倒进左边的牌（合进当前任务，useBoxPour）。 */
const go = async () => {
  if (empty.value) return;
  if (router.currentRoute.value.path === '/ai') {
    await hide();
    box.pourRequest.value += 1;
    return;
  }
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
    <button v-if="present" id="card-collection-box" ref="boxButton" type="button" :class="['collection-box', { open, empty, hover: box.dropHover.value }]"
      :aria-label="t.boxAria(box.count.value)" :aria-expanded="open" @click="empty ? undefined : toggle()">
      <span class="jack" aria-hidden="true">
        <span class="box-lid"></span>
        <span class="jack-body"><Transition name="count-roll"><em v-if="!empty" :key="box.count.value">{{ box.count.value }}</em></Transition></span>
      </span>
      <span class="box-copy">{{ boxLabel }}</span>
    </button>
    <div v-if="open" :class="['box-spread', { 'chrome-in': chromeIn }]" role="dialog" aria-modal="true" :aria-label="t.boxTitle">
      <div ref="backdrop" class="spread-backdrop" aria-hidden="true" @click="hide()"></div>
      <div ref="hand" class="hand" :style="{ '--card-w': `${layout.cardW}px` }">
        <div v-for="card in layout.cards" :key="card.id" :class="['hand-card', { duo: !!PAIRED_METRICS[card.key] }]" :data-id="card.id" :data-key="card.key" :style="duoStyle(card.key, card.style)"
          @pointerdown="gestures.dragStart($event, card.id)" @pointermove="gestures.dragMove" @pointerup="gestures.dragEnd" @pointercancel="gestures.dragEnd">
          <span class="hand-face">
            <span class="hand-corner"><i></i>{{ weekday(card.date) }}</span>
            <strong>{{ md(card.date) }}</strong>
            <small>{{ card.label }}</small>
          </span>
          <button type="button" class="hand-remove" :aria-label="t.removeCard(card.label, md(card.date))" @click="removeCard($event, card.id)"><Icon name="x" :size="12" /></button>
        </div>
        <div v-for="month in layout.months" :key="month.id" class="hand-card month" role="button" tabindex="0" :data-id="month.id" :data-key="month.key" :style="month.style"
          :aria-label="monthAria(month)" @click="expandMonth(month.id)" @keydown.enter.prevent="expandMonth(month.id)" @keydown.space.prevent="expandMonth(month.id)"
          @pointerdown="gestures.dragStart($event, month.id)" @pointermove="gestures.dragMove" @pointerup="gestures.dragEnd" @pointercancel="gestures.dragEnd">
          <span class="hand-face">
            <span class="hand-corner"><i></i>{{ monthName(month.month) }}</span>
            <strong>{{ t.monthDays(month.count) }}</strong>
            <span class="month-dots" aria-hidden="true"><i v-for="(cell, i) in month.cells" :key="i" :class="{ on: cell === true, pad: cell === null }"></i></span>
          </span>
          <button type="button" class="hand-remove" :aria-label="t.removeCard(month.label, monthName(month.month))" @click.stop="removeCard($event, month.id)"><Icon name="x" :size="12" /></button>
        </div>
        <button v-for="label in layout.labels" :key="label.key" type="button" class="hand-label" :style="{ ...label.style, '--tint': label.tint }"
          :aria-label="t.removeCard(label.text, '')" @click="removeGroup(label.key)"><i></i>{{ label.text }}<Icon name="x" :size="11" /></button>
      </div>
      <footer class="spread-foot">
        <CoachTip id="collection-box" :text="t.tipBox" />
        <p v-if="layout.more > 0" class="spread-more">{{ t.more(layout.more) }}</p>
        <div class="foot-row">
          <button type="button" class="foot-button" @click="clearAll"><Icon name="trash" :size="14" />{{ t.boxClear }}</button>
          <button type="button" class="hand-go" :title="goLabel" @click="go">
            <span class="go-icon"><span class="go-box"><Icon name="box" :size="20" /></span><span class="go-arrow"><Icon name="arrow-right" :size="20" /></span></span>
            <span>{{ goLabel }}</span>
          </button>
          <button type="button" class="foot-button" @click="hide()">{{ t.boxClose }}</button>
        </div>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped src="./CollectionBox.css"></style>

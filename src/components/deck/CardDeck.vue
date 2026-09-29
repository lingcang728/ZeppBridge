<script setup lang="ts" generic="C extends { id: string; tone?: string; title: string }">
/* 设置卡组：三种形态，同一批卡在它们之间形变过去。
 *
 *   coverflow（默认）：正中一张立着，左右叠在两边，左右拖动挑一张。
 *   卡包（「展开全部」）：像 Apple Wallet 的卡包——卡纵向叠放、每张只露出卡头，
 *       指针停在哪张，它下面的卡就往下让一让；点一张像抽卡一样长成整页。底部
 *       居中一枚「收起」，卡自下而上叠回第一张身后，再换成 coverflow。
 *   打开（/settings/:card）：那张卡从它在总览里的位置长成整页；总览不消失，而是
 *       往后退一层——缩小、按深度变糊、往下渐隐——看得出卡是从哪一层里抽出来的。
 *       关掉时卡缩回原位，总览从模糊里浮回来。打开以后仍可左右拖卡头翻到相邻
 *       一张（整张甩出去）、←/→ 或下面的圆点跳过去，Esc / × / 点卡片外面的空白处关掉。
 *
 * 形变都是 Web Animations 直接动真实的卡（composables/useDeckMorph.ts），所以随时
 * 可以打断：打开到一半关掉就原路倒回，展开到一半收起就从半路飞回去。
 * 卡的内容和卡头都由调用方通过插槽给；这里只管排布、手势和过渡。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteUpdate } from 'vue-router';
import Icon from '../Icon.vue';
import DeckCoverflow from './DeckCoverflow.vue';
import { useCardDeck } from '../../composables/useCardDeck';
import { useDeckMorph } from '../../composables/useDeckMorph';
import { staggerOrder } from '../../lib/deck/morph';
import { wrapIndex } from '../../lib/deck/physics';
import { deferSettle, onMotionEscape } from '../../lib/motion/interrupt';
import { defineMessages, useMessages } from '../../i18n';

const messages = defineMessages(
  {
    stackLabel: '设置分组',
    previous: '上一张',
    next: '下一张',
    close: '收起，回到全部设置',
    goTo: (index: number, total: number) => `第 ${index} 张，共 ${total} 张`,
    dragHint: '按住卡头左右拖动可以翻到相邻的一张',
    unbox: '展开全部',
    collapse: '收起',
    listLabel: '全部设置分组',
  },
  {
    stackLabel: 'Settings groups',
    previous: 'Previous card',
    next: 'Next card',
    close: 'Close and show all settings',
    goTo: (index: number, total: number) => `Card ${index} of ${total}`,
    dragHint: 'Drag the card header sideways to flip to the next card',
    unbox: 'Show all',
    collapse: 'Collapse',
    listLabel: 'All settings groups',
  },
  {
    stackLabel: 'Grupos de configuración',
    previous: 'Tarjeta anterior',
    next: 'Tarjeta siguiente',
    close: 'Cerrar y ver toda la configuración',
    goTo: (index: number, total: number) => `Tarjeta ${index} de ${total}`,
    dragHint: 'Arrastra la cabecera de la tarjeta hacia los lados para pasar a la siguiente',
    unbox: 'Ver todas',
    collapse: 'Recoger',
    listLabel: 'Todos los grupos de configuración',
  },
  'components/deck/CardDeck',
);
const t = useMessages(messages);

const props = defineProps<{
  cards: C[];
  /** 展开的是哪一张；为空时显示总览。 */
  activeId: string | null;
}>();
const emit = defineEmits<{
  open: [id: string];
  close: [];
  /** 翻到相邻一张。调用方负责换内容，返回的 Promise 结束时新内容应已渲染。 */
  change: [id: string, done: () => void];
  /** 总览现在是平铺还是卡组（页头的说明按它换一句）。挂载时报一次，切换后再报。 */
  layout: [layout: 'cover' | 'list'];
}>();

defineSlots<{
  /** coverflow 里那张立着的卡的正面。 */
  face(props: { card: C; centered: boolean }): unknown;
  head(props: { card: C; expanded: boolean }): unknown;
  body(props: { card: C }): unknown;
  quick?(props: { card: C }): unknown;
}>();

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* —— 总览形态：coverflow 还是平铺。记在本机，下次进来还是用户上次选的那种。
   默认平铺：coverflow 一次只读得清中间三张（正对面那张完全透明），只想改个保留时间的人
   得先学会这套翻法。卡组留给选过它的人。 —— */
type Layout = 'cover' | 'list';
const LAYOUT_KEY = 'zeppbridge-settings-layout';
const readLayout = (): Layout => {
  try {
    return window.localStorage.getItem(LAYOUT_KEY) === 'cover' ? 'cover' : 'list';
  } catch {
    return 'list';
  }
};
const layout = ref<Layout>(readLayout());
watch(layout, (value) => emit('layout', value), { immediate: true });

const root = ref<HTMLElement | null>(null);
const overview = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const cardEl = ref<HTMLElement | null>(null);
/** coverflow 第一帧就按真实宽度摆，形变量出来的终点才准。 */
const deckWidth = ref(0);

/** coverflow 停在哪一张。打开过的卡关掉以后，coverflow 仍停在它上面。 */
const centerId = ref<string | null>(props.activeId ?? props.cards[0]?.id ?? null);

const morph = useDeckMorph({ overview, card: cardEl, reducedMotion });

/* 卡包 ↔ coverflow：像洗牌一样——先记下每张卡此刻在画面上的位置（半路打断时就是它们
   正飞到的位置），换形态，再让每张卡从那儿飞到新位置：抽出来时从正中那张往两边依次出发，
   插回去时反过来。（上一版改成了「叠起 / 发牌」，用户更喜欢这种飞出、收拢。）
   随时可以再按一次：从每张卡此刻的位置接着飞回去。
   过渡期间整组卡不接指针（is-switching）；展开以后，指针要真的挪动过一段，卡包的悬停
   让位才生效（armed）——否则「展开全部」那一下指针正好落在某张卡上，后面的卡立刻往下
   一让，看上去就是点完闪一下、排版跳一下。 */
const switching = ref(false);
const armed = ref(false);
let armFrom: { x: number; y: number } | null = null;
let switchToken = 0;
const switchLayout = async (next: Layout) => {
  if (next === layout.value) return;
  const mine = ++switchToken;
  switching.value = true;
  armed.value = false;
  armFrom = null;
  const before = morph.snapshot();
  deckWidth.value = root.value?.clientWidth ?? deckWidth.value;
  layout.value = next;
  await nextTick();
  const landed = morph.fly(before, staggerOrder(props.cards.map((card) => card.id), centerId.value, next === 'cover'));
  void landed.then(() => { if (mine === switchToken) switching.value = false; });
  try {
    window.localStorage.setItem(LAYOUT_KEY, next);
  } catch {
    // 记不住就算了，下次还是默认的平铺。
  }
};

/* —— 打开态 —— */
/** 正在关上的那张：关卡动画放完之前它还得留在画面上。 */
const closingId = ref<string | null>(null);
const shownId = computed(() => props.activeId ?? closingId.value);
const shownIndex = computed(() => props.cards.findIndex((card) => card.id === shownId.value));
const shownCard = computed(() => (shownIndex.value >= 0 ? props.cards[shownIndex.value] : null));
const activeIndex = computed(() => props.cards.findIndex((card) => card.id === props.activeId));

const step = (direction: -1 | 1) => new Promise<void>((resolve) => {
  const next = props.cards[wrapIndex(activeIndex.value + direction, props.cards.length)];
  if (!next) { resolve(); return; }
  emit('change', next.id, resolve);
});

const {
  dragging, cycle, reset, onPointerDown, onPointerMove, onPointerUp, onPointerCancel,
} = useCardDeck({ stage, card: cardEl, step, reducedMotion });

/* 连点保护：「打开」和打开后的「×」落在同一片区域，手快连点两下，卡会刚飞出来又
   飞回去、来回折腾。两次开关之间少于 320ms 的点击当作误触忽略；Esc、拖动、圆点不受限。 */
const TOGGLE_GUARD_MS = 320;
let lastToggleAt = -Infinity;
const guardedToggle = (fn: () => void) => {
  const now = performance.now();
  if (now - lastToggleAt < TOGGLE_GUARD_MS) return;
  lastToggleAt = now;
  fn();
};
const requestOpen = (id: string) => guardedToggle(() => emit('open', id));
const requestClose = () => guardedToggle(() => emit('close'));

const jumpTo = (id: string) => {
  if (id === props.activeId) return;
  reset();
  emit('change', id, () => morph.swap());
};

/* 关卡时大卡从人刚才看到的位置缩回去：路由一换，滚动区就被拉回顶部（lib/returnScroll.ts），
   所以要在路由真正换过去之前记下大卡此刻在屏幕上的位置。 */
let closeFromTop: number | null = null;
onBeforeRouteUpdate(() => {
  closeFromTop = props.activeId && cardEl.value ? cardEl.value.getBoundingClientRect().top : null;
});

const onListPointerMove = (event: PointerEvent) => {
  if (armed.value || switching.value) return;
  if (!armFrom) { armFrom = { x: event.clientX, y: event.clientY }; return; }
  if (Math.hypot(event.clientX - armFrom.x, event.clientY - armFrom.y) > 14) armed.value = true;
};

watch(() => props.activeId, async (id, previous) => {
  if (id) centerId.value = id;
  lastToggleAt = performance.now();
  if (id && !previous) {
    closingId.value = null;
    reset();
    await nextTick();
    morph.open(id);
  } else if (!id && previous) {
    reset();
    closingId.value = previous;
    const fromTop = closeFromTop;
    closeFromTop = null;
    await nextTick();
    morph.close(previous, () => {
      if (closingId.value === previous) closingId.value = null;
    }, fromTop);
  }
});

const FORM_TARGET = 'input, textarea, select, [contenteditable], [role="radiogroup"], [role="combobox"], [role="listbox"], [role="slider"]';
const onKeydown = (event: KeyboardEvent) => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  if (document.querySelector('[data-modal-dialog]')) return;
  const target = event.target as Element | null;
  if (target?.closest(FORM_TARGET)) return;
  if (!props.activeId) {
    if (event.key === 'Escape' && layout.value === 'list') {
      event.preventDefault();
      void switchLayout('cover');
    }
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
  } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
    event.preventDefault();
    void cycle(1);
  } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault();
    void cycle(-1);
  }
};

/* 点卡片外面的空白处也能关：卡是从后面那一层抽出来的，点回后面那一层就是「放回去」。
   只认按下和松开都在卡外、落点不是任何控件的那一下——从卡里拖出来选字、点页头的
   提示条按钮、点滚动条、弹窗开着，都不算。 */
const CONTROL = 'button, a, input, select, textarea, label, summary, [role="button"], [role="switch"], [role="slider"], [contenteditable]';
let downOutside = false;
const outsideCard = (event: MouseEvent) => {
  const target = event.target as Element | null;
  const main = document.getElementById('main-content');
  if (!target || !main || !main.contains(target)) return false;
  if (target.closest('.open-card, .deck-dots, .shell-head, [data-modal-dialog]') || target.closest(CONTROL)) return false;
  // 滚动条那一条：落点在滚动区可视宽度以外。
  const box = main.getBoundingClientRect();
  return event.clientX < box.left + main.clientWidth;
};
const onDocPointerDown = (event: PointerEvent) => {
  downOutside = Boolean(props.activeId) && event.button === 0 && outsideCard(event);
};
const onDocClick = (event: MouseEvent) => {
  const wasOutside = downOutside;
  downOutside = false;
  if (!wasOutside || !props.activeId || !outsideCard(event)) return;
  if (document.querySelector('[data-modal-dialog]') || window.getSelection()?.toString()) return;
  requestClose();
};

/* 打开到一半按 Esc：不开了——大卡和板一起倒回源卡（lib/motion/interrupt.ts 先问这里）。
   紧接着的路由切换会调 settleMotion，先让它这一次别快进，不然倒放会被压成一下跳。 */
let forgetEscape: (() => void) | null = null;

onMounted(() => {
  forgetEscape = onMotionEscape(() => {
    if (!props.activeId || !morph.opening()) return false;
    deferSettle();
    lastToggleAt = performance.now();
    emit('close');
    return true;
  });
  deckWidth.value = root.value?.clientWidth ?? 0;
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('pointerdown', onDocPointerDown, true);
  document.addEventListener('click', onDocClick);
});
onBeforeUnmount(() => {
  forgetEscape?.();
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  document.removeEventListener('click', onDocClick);
});
</script>

<template>
  <div ref="root" :class="['card-deck', `deck-mode-${layout}`, { 'has-open': activeId, 'is-closing': !activeId && closingId, 'is-switching': switching }]">
    <!-- 总览：coverflow 或卡包。打开一张卡时它整体往后退一层（不消失、不收起高度——
         以前退到底会把高度收成 0，关卡时再撑开，页面跳一下就是「切回去闪一下」）。 -->
    <div ref="overview" :class="['deck-overview', { 'is-receded': activeId }]" :inert="activeId ? true : undefined">
      <DeckCoverflow
        v-if="layout === 'cover'"
        v-model="centerId"
        :cards="cards"
        :initial-width="deckWidth"
        @open="requestOpen"
      >
        <template #face="{ card, centered }"><slot name="face" :card="card" :centered="centered" /></template>
        <template v-if="$slots.quick" #quick="{ card }"><slot name="quick" :card="card" /></template>
        <template #actions>
          <button type="button" class="deck-unbox glass-control" @click="switchLayout('list')">
            <Icon name="grid" :size="16" />{{ t.unbox }}
          </button>
        </template>
      </DeckCoverflow>

      <template v-else>
        <ol :class="['deck-list', { 'is-armed': armed }]" :aria-label="t.listLabel" @pointermove.passive="onListPointerMove">
          <li
            v-for="(card, index) in cards"
            :key="card.id"
            class="deck-card list-card"
            :data-deck-card="card.id"
            :style="{ '--card-tone': card.tone, zIndex: index + 1 }"
          >
            <button type="button" class="list-open" :aria-label="t.goTo(index + 1, cards.length)" @click="requestOpen(card.id)"></button>
            <div class="deck-head">
              <slot name="head" :card="card" :expanded="false" />
              <div class="list-quick">
                <slot name="quick" :card="card" />
                <Icon name="chevron-right" :size="18" class="list-chevron" />
              </div>
            </div>
          </li>
        </ol>
        <div class="deck-collapse-dock">
          <button type="button" class="deck-collapse glass-control" @click="switchLayout('cover')">
            <Icon name="chevron-down" :size="16" class="flip" />{{ t.collapse }}
          </button>
        </div>
      </template>
    </div>

    <!-- 打开：一张放大，从它在总览里的位置长出来。 -->
    <div v-if="shownCard" ref="stage" :class="['deck-stage', { 'is-dragging': dragging }]">
      <article
        ref="cardEl"
        class="deck-card open-card"
        :style="{ '--card-tone': shownCard.tone }"
        :aria-roledescription="t.goTo(shownIndex + 1, cards.length)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @lostpointercapture="onPointerCancel"
      >
        <header class="deck-head open-head" :title="t.dragHint" @pointerdown="onPointerDown">
          <span class="deck-grip" aria-hidden="true"></span>
          <slot name="head" :card="shownCard" :expanded="true" />
          <button type="button" class="deck-close" :aria-label="t.close" :title="t.close" @click="requestClose">
            <Icon name="x" :size="16" />
          </button>
        </header>
        <div class="deck-body">
          <slot name="body" :card="shownCard" />
        </div>
      </article>
      <nav class="deck-dots" :aria-label="t.stackLabel">
        <button
          v-for="(card, index) in cards"
          :key="card.id"
          type="button"
          :class="['deck-dot', { on: card.id === shownCard.id }]"
          :aria-label="t.goTo(index + 1, cards.length)"
          :title="card.title"
          :aria-current="card.id === shownCard.id ? 'true' : undefined"
          @click="jumpTo(card.id)"
        ></button>
      </nav>
    </div>
  </div>
</template>

<style scoped src="./CardDeck.css"></style>

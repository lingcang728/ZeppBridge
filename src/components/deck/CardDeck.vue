<script setup lang="ts" generic="C extends { id: string; tone?: string; title: string }">
/* 设置卡组：三种形态，同一批卡在它们之间形变过去（View Transitions，每张卡
 * 一个 view-transition-name）。
 *
 *   coverflow（默认）：正中一张立着，左右叠在两边，左右拨动挑一张。
 *   平铺（「展开全部」）：卡从 coverflow 里依次抽出来、纵向铺开，方便一眼扫完；
 *       底部一枚醒目的「收起」，按下去卡片按相反顺序插回卡组。
 *   打开（/settings/:card）：那张卡放大成整页，其余的卡随背景一起变糊、淡出；
 *       关掉时它缩回原位，其余的卡从模糊里浮回来。打开以后仍可左右拖卡头、
 *       按按钮或方向键翻到相邻一张，Esc 回到总览。
 *
 * 卡的内容和卡头都由调用方通过插槽给；这里只管排布、手势和过渡。 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from '../Icon.vue';
import DeckCoverflow from './DeckCoverflow.vue';
import { useCardDeck } from '../../composables/useCardDeck';
import { wrapIndex } from '../../lib/deck/physics';
import { withViewTransition } from '../../lib/deck/viewTransition';
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
}>();

defineSlots<{
  /** coverflow 里那张立着的卡的正面。 */
  face(props: { card: C; centered: boolean }): unknown;
  head(props: { card: C; expanded: boolean }): unknown;
  body(props: { card: C }): unknown;
  quick?(props: { card: C }): unknown;
}>();

/* —— 总览形态：coverflow 还是平铺。记在本机，下次进来还是用户上次选的那种。 —— */
type Layout = 'cover' | 'list';
const LAYOUT_KEY = 'zeppbridge-settings-layout';
const readLayout = (): Layout => {
  try {
    return window.localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'cover';
  } catch {
    return 'cover';
  }
};
const layout = ref<Layout>(readLayout());

/** coverflow 停在哪一张。打开过的卡关掉以后，coverflow 仍停在它上面。 */
const centerId = ref<string | null>(props.activeId ?? props.cards[0]?.id ?? null);
watch(() => props.activeId, (id) => { if (id) centerId.value = id; });

/* 平铺 ↔ coverflow：每张卡错开几十毫秒出发，像一张张从卡包里抽出来 / 插回去。
   错开的时间只能写在 ::view-transition-group(名字) 上，名字又是动态的，
   所以临时往 head 里挂一段样式，过渡结束就摘掉。 */
let staggerStyle: HTMLStyleElement | null = null;
const setStagger = (order: string[]) => {
  staggerStyle?.remove();
  staggerStyle = document.createElement('style');
  staggerStyle.textContent = order
    .map((id, index) => `::view-transition-group(deck-${CSS.escape(id)}){animation-delay:${index * 26}ms}`)
    .join('\n');
  document.head.appendChild(staggerStyle);
};
const clearStagger = () => {
  staggerStyle?.remove();
  staggerStyle = null;
};
const switchLayout = async (next: Layout) => {
  if (next === layout.value) return;
  const ids = props.cards.map((card) => card.id);
  // 抽出来时从正中那张往两边依次出发；插回去时反过来。
  const center = Math.max(0, ids.indexOf(centerId.value ?? ''));
  const byDistance = [...ids].sort((a, b) => Math.abs(ids.indexOf(a) - center) - Math.abs(ids.indexOf(b) - center));
  setStagger(next === 'list' ? byDistance : [...byDistance].reverse());
  document.documentElement.dataset.deckMorph = next;
  await withViewTransition(() => { layout.value = next; });
  delete document.documentElement.dataset.deckMorph;
  clearStagger();
  try {
    window.localStorage.setItem(LAYOUT_KEY, next);
  } catch {
    // 记不住就算了，下次还是 coverflow。
  }
};

/* —— 打开态 —— */
const stage = ref<HTMLElement | null>(null);
const cardEl = ref<HTMLElement | null>(null);
const activeIndex = computed(() => props.cards.findIndex((card) => card.id === props.activeId));
const activeCard = computed(() => (activeIndex.value >= 0 ? props.cards[activeIndex.value] : null));

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const step = (direction: -1 | 1) => new Promise<void>((resolve) => {
  const next = props.cards[wrapIndex(activeIndex.value + direction, props.cards.length)];
  if (!next) { resolve(); return; }
  emit('change', next.id, resolve);
});

const {
  dragging, cycle, reset, onPointerDown, onPointerMove, onPointerUp, onPointerCancel,
} = useCardDeck({ stage, card: cardEl, step, reducedMotion });

/* 按住「上一张 / 下一张」连翻：先等 450ms，之后每 260ms 翻一张。 */
let holdDelay = 0;
let holdRepeat = 0;
const stopHold = () => {
  window.clearTimeout(holdDelay);
  window.clearInterval(holdRepeat);
  holdDelay = 0;
  holdRepeat = 0;
};
const startHold = (event: PointerEvent, direction: -1 | 1) => {
  if (event.button !== 0 || !event.isPrimary) return;
  stopHold();
  void cycle(direction);
  holdDelay = window.setTimeout(() => {
    holdRepeat = window.setInterval(() => { void cycle(direction); }, 260);
  }, 450);
};
// 键盘激活按钮时 click 的 detail 为 0；鼠标已经在 pointerdown 里处理过。
const onNavClick = (event: MouseEvent, direction: -1 | 1) => {
  if (event.detail === 0) void cycle(direction);
};

const jumpTo = (id: string) => {
  if (id === props.activeId) return;
  const target = props.cards.findIndex((card) => card.id === id);
  if (target < 0) return;
  reset();
  emit('change', id, () => {});
};

const FORM_TARGET = 'input, textarea, select, [contenteditable], [role="radiogroup"], [role="combobox"], [role="listbox"], [role="slider"]';
const onKeydown = (event: KeyboardEvent) => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  if (document.querySelector('[data-modal-dialog]')) return;
  const target = event.target as Element | null;
  if (target?.closest(FORM_TARGET)) return;
  if (!activeCard.value) {
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

watch(() => props.activeId, (id, previous) => {
  // 从总览打开 / 收回总览时，别让上一张卡的内联变换残留。
  if (!id || !previous) reset();
});

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => {
  stopHold();
  clearStagger();
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div :class="['card-deck', activeCard ? 'deck-mode-open' : `deck-mode-${layout}`]">
    <!-- 总览一：coverflow -->
    <DeckCoverflow
      v-if="!activeCard && layout === 'cover'"
      v-model="centerId"
      :cards="cards"
      @open="(id) => emit('open', id)"
    >
      <template #face="{ card, centered }"><slot name="face" :card="card" :centered="centered" /></template>
      <template v-if="$slots.quick" #quick="{ card }"><slot name="quick" :card="card" /></template>
      <template #actions>
        <button type="button" class="deck-unbox glass-control" @click="switchLayout('list')">
          <Icon name="grid" :size="16" />{{ t.unbox }}
        </button>
      </template>
    </DeckCoverflow>

    <!-- 总览二：平铺 -->
    <template v-else-if="!activeCard">
      <ol class="deck-list" :aria-label="t.listLabel">
        <li
          v-for="(card, index) in cards"
          :key="card.id"
          class="deck-card list-card"
          :style="{ viewTransitionName: `deck-${card.id}`, '--card-tone': card.tone }"
        >
          <button type="button" class="list-open" :aria-label="t.goTo(index + 1, cards.length)" @click="emit('open', card.id)"></button>
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

    <!-- 打开：一张放大，其余隐进背景 -->
    <div v-else ref="stage" :class="['deck-stage', { 'is-dragging': dragging }]">
      <article
        ref="cardEl"
        class="deck-card open-card"
        :style="{ viewTransitionName: `deck-${activeCard.id}`, '--card-tone': activeCard.tone }"
        :aria-roledescription="t.goTo(activeIndex + 1, cards.length)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @lostpointercapture="onPointerCancel"
      >
        <header class="deck-head open-head" :title="t.dragHint" @pointerdown="onPointerDown">
          <span class="deck-grip" aria-hidden="true"></span>
          <slot name="head" :card="activeCard" :expanded="true" />
          <div class="deck-nav">
            <button type="button" class="deck-nav-btn" :aria-label="t.previous" :title="t.previous"
              @pointerdown="(event) => startHold(event, -1)" @pointerup="stopHold" @pointerleave="stopHold" @pointercancel="stopHold"
              @click="(event) => onNavClick(event, -1)"><Icon name="arrow-left" :size="16" /></button>
            <button type="button" class="deck-nav-btn" :aria-label="t.next" :title="t.next"
              @pointerdown="(event) => startHold(event, 1)" @pointerup="stopHold" @pointerleave="stopHold" @pointercancel="stopHold"
              @click="(event) => onNavClick(event, 1)"><Icon name="arrow-right" :size="16" /></button>
            <button type="button" class="deck-nav-btn is-close" :aria-label="t.close" :title="t.close" @click="emit('close')">
              <Icon name="x" :size="16" />
            </button>
          </div>
        </header>
        <div class="deck-body">
          <slot name="body" :card="activeCard" />
        </div>
      </article>
      <nav class="deck-dots" :aria-label="t.stackLabel">
        <button
          v-for="(card, index) in cards"
          :key="card.id"
          type="button"
          :class="['deck-dot', { on: card.id === activeCard.id }]"
          :aria-label="t.goTo(index + 1, cards.length)"
          :aria-current="card.id === activeCard.id ? 'true' : undefined"
          @click="jumpTo(card.id)"
        ></button>
      </nav>
    </div>
  </div>
</template>

<style scoped src="./CardDeck.css"></style>

<style>
/* 形态之间的形变（View Transitions）。
   同一张卡在两处都有：group 做位置和尺寸的形变。
   只在一边出现的卡（打开时其余的卡、收起时浮回来的卡）：变糊、缩小、淡出 / 反过来。 */
::view-transition-group(*) { animation-duration: 460ms; animation-timing-function: cubic-bezier(.22, 1, .36, 1); }
::view-transition-old(*):only-child { animation: deck-sink 340ms cubic-bezier(.4, 0, .2, 1) both; }
::view-transition-new(*):only-child { animation: deck-rise 420ms cubic-bezier(.22, 1, .36, 1) 60ms both; }
@keyframes deck-sink { to { opacity: 0; transform: scale(.9); filter: blur(14px); } }
@keyframes deck-rise { from { opacity: 0; transform: scale(.92); filter: blur(14px); } }
/* 平铺 ↔ coverflow 时，同一张卡两种样子之间交叉淡化得快一点，形变本身慢一点。 */
html[data-deck-morph] ::view-transition-group(*) { animation-duration: 560ms; }
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
}
</style>

<script setup lang="ts" generic="C extends { id: string; tone?: string; title: string }">
/* 设置卡组：三种形态，同一批卡在它们之间形变过去。
 *
 *   coverflow（默认）：正中一张立着，左右叠在两边，左右拖动挑一张。
 *   平铺（「展开全部」）：卡从 coverflow 里依次抽出来、纵向铺开，方便一眼扫完；
 *       底部一枚醒目的「收起」，按下去卡片按相反顺序插回卡组。
 *   打开（/settings/:card）：那张卡从它在总览里的位置长成整页，总览往后退、变糊、
 *       淡出；关掉时它缩回原位，总览从模糊里浮回来。打开以后仍可左右拖卡头
 *       翻到相邻一张、←/→ 或下面的圆点跳过去，Esc / × 关掉。
 *
 * 形变都是 Web Animations 直接动真实的卡（composables/useDeckMorph.ts），所以随时
 * 可以打断：打开到一半关掉就原路倒回，展开到一半收起就从半路飞回去。
 * 卡的内容和卡头都由调用方通过插槽给；这里只管排布、手势和过渡。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from '../Icon.vue';
import DeckCoverflow from './DeckCoverflow.vue';
import { useCardDeck } from '../../composables/useCardDeck';
import { useDeckMorph } from '../../composables/useDeckMorph';
import { staggerOrder } from '../../lib/deck/morph';
import { wrapIndex } from '../../lib/deck/physics';
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

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

const root = ref<HTMLElement | null>(null);
const overview = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const cardEl = ref<HTMLElement | null>(null);
/** coverflow 第一帧就按真实宽度摆，形变量出来的终点才准。 */
const deckWidth = ref(0);

/** coverflow 停在哪一张。打开过的卡关掉以后，coverflow 仍停在它上面。 */
const centerId = ref<string | null>(props.activeId ?? props.cards[0]?.id ?? null);

const morph = useDeckMorph({ overview, card: cardEl, reducedMotion });

/* 平铺 ↔ coverflow：先记下每张卡此刻在画面上的位置（半路打断时就是它们正飞到的
   位置），换形态，再让每张卡从那儿飞到新位置——抽出来时从正中那张往两边依次出发，
   插回去时反过来。 */
const switchLayout = async (next: Layout) => {
  if (next === layout.value) return;
  const before = morph.snapshot();
  deckWidth.value = root.value?.clientWidth ?? deckWidth.value;
  layout.value = next;
  await nextTick();
  morph.fly(before, staggerOrder(props.cards.map((card) => card.id), centerId.value, next === 'cover'));
  try {
    window.localStorage.setItem(LAYOUT_KEY, next);
  } catch {
    // 记不住就算了，下次还是 coverflow。
  }
};

/* —— 打开态 —— */
/** 正在关上的那张：关卡动画放完之前它还得留在画面上。 */
const closingId = ref<string | null>(null);
/** 总览退到底了（淡出放完）：这时才让它不占高度。 */
const overviewGone = ref(false);
let goneTimer = 0;
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

const jumpTo = (id: string) => {
  if (id === props.activeId) return;
  reset();
  emit('change', id, () => morph.swap());
};

watch(() => props.activeId, async (id, previous) => {
  if (id) centerId.value = id;
  window.clearTimeout(goneTimer);
  if (id) goneTimer = window.setTimeout(() => { overviewGone.value = true; }, reducedMotion() ? 0 : 380);
  else overviewGone.value = false;
  if (id && !previous) {
    closingId.value = null;
    reset();
    await nextTick();
    morph.open(id);
  } else if (!id && previous) {
    reset();
    closingId.value = previous;
    await nextTick();
    morph.close(previous, () => {
      if (closingId.value === previous) closingId.value = null;
    });
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

onMounted(() => {
  deckWidth.value = root.value?.clientWidth ?? 0;
  overviewGone.value = Boolean(props.activeId);
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  window.clearTimeout(goneTimer);
});
</script>

<template>
  <div ref="root" :class="['card-deck', `deck-mode-${layout}`, { 'has-open': activeId, 'is-closing': !activeId && closingId }]">
    <!-- 总览：coverflow 或平铺。打开一张卡时它整体往后退、变糊、淡出，卡关上再浮回来。 -->
    <div ref="overview" :class="['deck-overview', { 'is-receded': activeId, 'is-gone': overviewGone }]" :inert="activeId ? true : undefined">
      <DeckCoverflow
        v-if="layout === 'cover'"
        v-model="centerId"
        :cards="cards"
        :initial-width="deckWidth"
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

      <template v-else>
        <ol class="deck-list" :aria-label="t.listLabel">
          <li
            v-for="(card, index) in cards"
            :key="card.id"
            class="deck-card list-card"
            :data-deck-card="card.id"
            :style="{ '--card-tone': card.tone }"
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
          <button type="button" class="deck-close" :aria-label="t.close" :title="t.close" @click="emit('close')">
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
          :aria-current="card.id === shownCard.id ? 'true' : undefined"
          @click="jumpTo(card.id)"
        ></button>
      </nav>
    </div>
  </div>
</template>

<style scoped src="./CardDeck.css"></style>

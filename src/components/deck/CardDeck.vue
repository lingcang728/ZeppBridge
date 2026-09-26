<script setup lang="ts" generic="C extends { id: string; tone?: string }">
/* 钱包式卡叠。
 *
 * 总览：所有卡纵向叠着，每张只露出卡头（图标 + 标题 + 一句状态），悬停时抬起一点。
 * 展开：点开的那张卡升到最上面、摊开全部内容，其余的卡缩成它身后两层模糊的压底卡。
 * 翻卡：按住卡头拖，拖过阈值或快速一甩就把这张甩走、下一张从后面浮上来；也可以
 *       用「上一张 / 下一张」（按住连翻）、←/→、PageUp/PageDown，Esc 回到总览。
 *
 * 卡的内容和卡头都由调用方通过插槽给；这里只管排布和手势。 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from '../Icon.vue';
import { useCardDeck } from '../../composables/useCardDeck';
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
  },
  {
    stackLabel: 'Settings groups',
    previous: 'Previous card',
    next: 'Next card',
    close: 'Close and show all settings',
    goTo: (index: number, total: number) => `Card ${index} of ${total}`,
    dragHint: 'Drag the card header sideways to flip to the next card',
  },
  {
    stackLabel: 'Grupos de configuración',
    previous: 'Tarjeta anterior',
    next: 'Tarjeta siguiente',
    close: 'Cerrar y ver toda la configuración',
    goTo: (index: number, total: number) => `Tarjeta ${index} de ${total}`,
    dragHint: 'Arrastra la cabecera de la tarjeta hacia los lados para pasar a la siguiente',
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
  head(props: { card: C; expanded: boolean }): unknown;
  body(props: { card: C }): unknown;
  quick?(props: { card: C }): unknown;
}>();

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
  if (!activeCard.value || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  if (document.querySelector('[data-modal-dialog]')) return;
  const target = event.target as Element | null;
  if (target?.closest(FORM_TARGET)) return;
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
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div :class="['card-deck', activeCard ? 'deck-mode-open' : 'deck-mode-stack']">
    <!-- 总览：钱包式叠放 -->
    <ol v-if="!activeCard" class="deck-stack" :aria-label="t.stackLabel">
      <li
        v-for="(card, index) in cards"
        :key="card.id"
        class="deck-card stack-card"
        :style="{ zIndex: index + 1, viewTransitionName: `deck-${card.id}`, '--card-tone': card.tone }"
      >
        <button type="button" class="stack-open" :aria-label="t.goTo(index + 1, cards.length)" @click="emit('open', card.id)"></button>
        <div class="deck-head">
          <slot name="head" :card="card" :expanded="false" />
          <div class="stack-quick">
            <slot name="quick" :card="card" />
            <Icon name="chevron-right" :size="18" class="stack-chevron" />
          </div>
        </div>
      </li>
    </ol>

    <!-- 展开：一张在上，其余压在身后 -->
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

<style scoped>
.card-deck { position: relative; min-width: 0; }

/* ── 卡片材质（总览与展开共用）── */
.deck-card {
  position: relative;
  min-width: 0;
  border: 1px solid var(--mat-line);
  border-radius: 22px;
  background: var(--mat-card);
  box-shadow: var(--mat-rim), var(--mat-shadow);
}

/* ── 总览：钱包式叠放 ── */
.deck-stack {
  display: grid;
  margin: 0;
  padding: 0 0 8px;
  list-style: none;
}
/* 每张卡带一点自己类别的颜色（左上角的微光），像钱包里颜色不同的卡；
   向上的阴影落在前一张卡上，叠放的层次才看得出来。 */
.stack-card {
  --card-tone: var(--accent);
  min-height: 118px;
  background:
    radial-gradient(520px 150px at 0 0, color-mix(in srgb, var(--card-tone) 13%, transparent), transparent 72%),
    var(--mat-card);
  box-shadow: var(--mat-rim), var(--mat-stack-shadow), var(--mat-shadow);
  transition: transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) ease;
}
/* 后一张压住前一张的下半截，只露出卡头。 */
.stack-card + .stack-card { margin-top: -40px; }
.stack-card::before {
  /* 顶边一条亮线，叠在一起时每张卡的边缘都分得清。 */
  content: '';
  position: absolute;
  inset: 0 18px auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--ink) 18%, transparent), transparent);
  pointer-events: none;
}
.stack-card:hover, .stack-card:focus-within { transform: translateY(-8px); box-shadow: var(--mat-rim), var(--mat-stack-shadow), var(--mat-shadow-lift); }
.stack-card:hover + .stack-card, .stack-card:focus-within + .stack-card { transform: translateY(4px); }
.stack-open {
  position: absolute;
  inset: 0;
  z-index: 1;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
}
.stack-open:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.deck-head {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  pointer-events: none;
}
.stack-quick { display: flex; flex: 0 0 auto; align-items: center; gap: 12px; margin-left: auto; }
/* 卡头上能直接拨的开关要能点到，盖在「打开」按钮上面。 */
.stack-quick :deep(button), .stack-quick :deep(a) { position: relative; z-index: 2; pointer-events: auto; }
.stack-chevron { color: var(--subtle); }

/* ── 展开态 ── */
.deck-stage {
  --deck-dx: 0px;
  --deck-dy: 0px;
  --deck-p: 0;
  position: relative;
  isolation: isolate;
  padding-bottom: 26px;
}
/* 身后两层压底卡：跟着拖动做一点反向视差，拖得越远越清楚。 */
.deck-stage::before, .deck-stage::after {
  content: '';
  position: absolute;
  z-index: -1;
  border: 1px solid var(--mat-line);
  border-radius: 22px;
  background: var(--mat-card);
  box-shadow: var(--mat-shadow);
  pointer-events: none;
  transition: transform .16s ease-out, filter .16s ease-out, opacity .16s ease-out;
}
.deck-stage::before {
  inset: 14px 16px 12px;
  transform: translate(calc(var(--deck-dx) * -.05), calc(4px - var(--deck-p) * 7px + var(--deck-dy) * -.03)) scale(calc(.985 + var(--deck-p) * .014));
  filter: blur(calc((1 - var(--deck-p)) * .6px));
}
.deck-stage::after {
  inset: 26px 34px 0;
  opacity: .6;
  transform: translate(calc(var(--deck-dx) * -.03), calc(4px - var(--deck-p) * 3px + var(--deck-dy) * -.02)) scale(calc(.985 + var(--deck-p) * .006));
  filter: blur(calc(1.4px + var(--deck-p) * 1.5px));
}
.deck-stage.is-dragging::before, .deck-stage.is-dragging::after { transition: none; }
.open-card {
  --card-tone: var(--accent);
  transform-origin: center top;
  background:
    radial-gradient(640px 180px at 0 0, color-mix(in srgb, var(--card-tone) 10%, transparent), transparent 70%),
    var(--mat-card);
}
.deck-stage.is-dragging .open-card { will-change: transform, filter; }
.open-head {
  padding: 14px 18px 14px 20px;
  border-bottom: 1px solid var(--mat-line);
  pointer-events: auto;
  cursor: grab;
  touch-action: pan-y;
  user-select: none;
}
.deck-stage.is-dragging .open-head { cursor: grabbing; }
.deck-grip {
  position: absolute;
  top: 6px;
  left: 50%;
  width: 34px;
  height: 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ink) 18%, transparent);
  transform: translateX(-50%);
}
.deck-nav { display: flex; flex: 0 0 auto; gap: 6px; margin-left: auto; }
.deck-nav-btn {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  padding: 0;
  border: 1px solid var(--mat-line-hover);
  border-radius: 50%;
  background: var(--mat-raised);
  box-shadow: var(--mat-raised-rim);
  color: var(--muted);
  cursor: pointer;
}
.deck-nav-btn:hover { color: var(--ink); background: var(--mat-raised-hover); }
.deck-nav-btn:active { transform: translateY(1px); }
.deck-body { padding: 20px; }

.deck-dots { position: absolute; right: 0; bottom: 0; left: 0; display: flex; justify-content: center; gap: 8px; }
.deck-dot {
  width: 7px;
  height: 7px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 22%, transparent);
  cursor: pointer;
  transition: width var(--dur-base) var(--ease-out), background var(--dur-base) ease;
}
.deck-dot.on { width: 22px; background: var(--accent); }

@media (max-width: 720px) {
  .deck-head { padding: 14px 14px; gap: 10px; }
  .deck-body { padding: 14px; }
  .deck-nav-btn:not(.is-close) { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .stack-card, .deck-stage::before, .deck-stage::after, .deck-dot { transition: none; }
}
</style>

<style>
/* 从总览打开 / 收回时，同一张卡在两个位置之间做形变过渡（View Transitions）。 */
::view-transition-group(*) { animation-duration: 380ms; animation-timing-function: cubic-bezier(.22, 1, .36, 1); }
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
}
</style>

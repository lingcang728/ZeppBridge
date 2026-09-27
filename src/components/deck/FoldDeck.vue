<script setup lang="ts" generic="C extends { id: string; title: string; summary?: string; icon: DesignIconName; tone?: GlyphTone }">
/* 收纳卡包：把「平时不用一直摊开看」的区块收成一叠只露卡头的卡（和设置的「展开全部」同一种
 * 卡包），点一张它就从卡包里飞出来、长成完整的卡；× 或 Esc 飞回去。
 *
 * 首屏因此只留真正常看的几张主卡，其余按需展开——设置页那种「初始简洁，要看细节自己点开」
 * 的气质。可以同时开好几张；开着的卡按原顺序排在卡包里，后面的卡接着叠。
 *
 * 飞入飞出用 FLIP：开合前量每张卡的位置，开合后量新位置，用 Web Animations 从旧位置
 * 平移回来；开的那张用 clip-path 从卡头的高度长到完整高度。动画中再点是就地打断重来。 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import GlyphTile from '../GlyphTile.vue';
import Icon from '../Icon.vue';
import type { DesignIconName } from '../DesignIcon.vue';
import type { GlyphTone } from '../../lib/glyphs';
import { defineMessages, useMessages } from '../../i18n';

const props = withDefaults(defineProps<{
  cards: C[];
  label: string;
  /** 一开始就开着的卡。 */
  initialOpen?: string[];
}>(), { initialOpen: () => [] });

defineSlots<{ [key: string]: (props: { card: C }) => unknown }>();

const t = useMessages(defineMessages(
  { open: (title: string) => `展开「${title}」`, close: '收起', expandAll: '全部展开', collapseAll: '全部收起' },
  { open: (title: string) => `Open "${title}"`, close: 'Collapse', expandAll: 'Expand all', collapseAll: 'Collapse all' },
  { open: (title: string) => `Abrir «${title}»`, close: 'Recoger', expandAll: 'Expandir todo', collapseAll: 'Recoger todo' },
  'components/deck/FoldDeck',
));

const opened = ref<Set<string>>(new Set(props.initialOpen));
const root = ref<HTMLElement | null>(null);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
let running: Animation[] = [];

const boxes = () => {
  const out = new Map<string, DOMRect>();
  for (const el of root.value?.querySelectorAll<HTMLElement>('[data-fold]') ?? []) out.set(el.dataset.fold!, el.getBoundingClientRect());
  return out;
};

/** 开合一次：量 → 改 → 再量 → 从旧位置飞到新位置。 */
const morph = async (change: () => void, focusId?: string) => {
  for (const animation of running) animation.cancel();
  running = [];
  const before = boxes();
  change();
  await nextTick();
  if (reducedMotion()) return;
  for (const el of root.value?.querySelectorAll<HTMLElement>('[data-fold]') ?? []) {
    const id = el.dataset.fold!;
    const from = before.get(id);
    if (!from) continue;
    const to = el.getBoundingClientRect();
    const dy = from.top - to.top;
    const grew = to.height - from.height;
    const frames: Keyframe[] = [
      { transform: `translateY(${dy}px)`, clipPath: grew > 1 ? `inset(0 0 ${grew}px 0 round 28px)` : 'inset(0 round 28px)' },
      { transform: 'none', clipPath: 'inset(0 round 28px)' },
    ];
    if (Math.abs(dy) < 1 && Math.abs(grew) < 1) continue;
    running.push(el.animate(frames, { duration: 460, easing: 'cubic-bezier(.2, .85, .25, 1)' }));
    if (id === focusId && grew > 1) {
      const body = el.querySelector<HTMLElement>('.fold-body');
      if (body) running.push(body.animate([{ opacity: 0, filter: 'blur(6px)', transform: 'translateY(10px)' }, { opacity: 1, filter: 'blur(0px)', transform: 'none' }], { duration: 380, delay: 90, easing: 'ease-out', fill: 'backwards' }));
    }
  }
};

const toggle = (id: string) => morph(() => {
  const next = new Set(opened.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  opened.value = next;
}, id);
const allOpen = () => opened.value.size === props.cards.length;
const toggleAll = () => morph(() => {
  opened.value = allOpen() ? new Set() : new Set(props.cards.map((card) => card.id));
});

const onKey = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || !opened.value.size) return;
  const inside = (event.target as Element | null)?.closest?.('[data-fold]') as HTMLElement | null;
  if (inside?.dataset.fold && opened.value.has(inside.dataset.fold)) { event.preventDefault(); void toggle(inside.dataset.fold); }
};
onMounted(() => root.value?.addEventListener('keydown', onKey));
onBeforeUnmount(() => {
  root.value?.removeEventListener('keydown', onKey);
  for (const animation of running) animation.cancel();
});
</script>

<template>
  <section ref="root" class="fold-deck" :aria-label="label">
    <div class="fold-bar">
      <button type="button" class="pill-button quiet fold-all" @click="toggleAll">
        <Icon :name="allOpen() ? 'chevron-down' : 'grid'" :size="14" :class="{ flip: allOpen() }" />{{ allOpen() ? t.collapseAll : t.expandAll }}
      </button>
    </div>
    <ol class="fold-list">
      <li v-for="(card, index) in cards" :key="card.id" :data-fold="card.id"
        :class="['fold-card', opened.has(card.id) ? 'is-open' : 'is-closed']" :style="{ zIndex: index + 1 }">
        <template v-if="opened.has(card.id)">
          <button type="button" class="fold-close" :aria-label="t.close" :title="t.close" @click="toggle(card.id)"><Icon name="x" :size="15" /></button>
          <div class="fold-body"><slot :name="card.id" :card="card" /></div>
        </template>
        <button v-else type="button" class="fold-head" :aria-expanded="false" :aria-label="t.open(card.title)" @click="toggle(card.id)">
          <GlyphTile :name="card.icon" :tone="card.tone" :size="40" />
          <span class="fold-copy"><strong>{{ card.title }}</strong><small v-if="card.summary">{{ card.summary }}</small></span>
          <Icon name="chevron-right" :size="18" class="fold-chevron" />
        </button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.fold-deck { display: grid; gap: 10px; min-width: 0; }
.fold-bar { display: flex; justify-content: flex-end; }
.fold-all { min-height: 32px; padding: 0 14px; font-size: var(--fs-xs); }
.flip { rotate: 180deg; }
.fold-list {
  --fold-card: 150px;
  --fold-peek: 74px;
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
/* 收着的卡有一张卡片该有的高度，下一张压在它下半截上，只露卡头（和设置卡包同一种）。 */
.fold-card { position: relative; min-width: 0; border-radius: 28px; }
.fold-card.is-closed {
  min-height: var(--fold-card);
  background: var(--mat-card-solid);
  box-shadow: 0 -1px 0 color-mix(in srgb, #fff 6%, transparent) inset, 0 -10px 26px -14px rgba(0, 0, 0, .4);
  transition: translate .42s var(--ease-out);
}
.fold-card.is-closed + .fold-card.is-closed { margin-top: calc(var(--fold-peek) - var(--fold-card)); }
.fold-card.is-open + .fold-card, .fold-card + .fold-card.is-open { margin-top: 16px; }
.fold-card.is-closed:last-child { box-shadow: var(--mat-shadow); }
.fold-card.is-closed:hover ~ .fold-card.is-closed { translate: 0 34px; }
.fold-card.is-closed:hover { translate: 0 -3px; }
.fold-head {
  display: flex;
  width: 100%;
  min-height: var(--fold-peek);
  align-items: center;
  gap: 14px;
  padding: 16px 22px;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.fold-head:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.fold-copy { display: grid; flex: 1; min-width: 0; gap: 2px; }
.fold-copy strong { font-size: var(--fs-md); font-weight: 650; }
.fold-copy small { overflow: hidden; color: var(--muted); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.fold-chevron { flex: 0 0 auto; color: var(--subtle); }
/* 开着的卡：就是区块自己（它有自己的卡片外观和标题），右上角压一枚收起。 */
.fold-close {
  position: absolute;
  /* 压在卡的右上角外沿：不挡住区块自己标题行右侧的文字。 */
  top: -10px;
  right: -10px;
  z-index: 5;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: var(--cap-thumb);
  box-shadow: var(--cap-thumb-rim);
  color: var(--muted);
  cursor: pointer;
}
.fold-close:hover { color: var(--ink); }
.fold-body { min-width: 0; }
@media (prefers-reduced-motion: reduce) {
  .fold-card.is-closed, .fold-card.is-closed:hover ~ .fold-card.is-closed { transition: none; translate: none; }
}
</style>

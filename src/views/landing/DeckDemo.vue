<script setup lang="ts">
/**
 * 设置页「钱包式卡叠」的落地页版本：卡片叠在一起只露出一条边，悬停散开，点一张抽出来，
 * 其余的收到底下；抽出来的那张跟着指针轻轻倾斜。只动 transform / opacity。
 */
import { computed, ref } from 'vue';
import DesignIcon from '../../components/DesignIcon.vue';
import type { LandingCopy } from './types';

const props = defineProps<{ copy: LandingCopy['deck'] }>();

const TONES = ['accent', 'heart', 'activity', 'sleep', 'awake'] as const;
const PEEK = 54;
const FAN = 74;
const CARD_H = 210;

const hovered = ref(false);
const openIndex = ref<number | null>(null);
const tilt = ref({ x: 0, y: 0 });

const count = computed(() => props.copy.cards.length);
const height = computed(() => CARD_H + (count.value - 1) * FAN + 24);

const styleFor = (index: number) => {
  const open = openIndex.value;
  if (open === null) {
    const gap = hovered.value ? FAN : PEEK;
    return { transform: `translate3d(0, ${index * gap}px, 0)`, zIndex: String(index + 1) };
  }
  if (index === open) {
    return {
      transform: `translate3d(0, 0, 60px) rotateX(${tilt.value.y}deg) rotateY(${tilt.value.x}deg)`,
      zIndex: '20',
    };
  }
  // 其余几张收到底下叠成一小摞：实色、不露字，只露出一条条边。
  const order = index < open ? index : index - 1;
  return {
    transform: `translate3d(0, ${CARD_H + 30 + order * 14}px, 0) scale(${0.92 - order * 0.03})`,
    zIndex: String(10 - order),
  };
};

const toggle = (index: number) => {
  openIndex.value = openIndex.value === index ? null : index;
  tilt.value = { x: 0, y: 0 };
};

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const onMove = (event: PointerEvent, index: number) => {
  if (openIndex.value !== index || reduced() || event.pointerType !== 'mouse') return;
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width - 0.5;
  const y = (event.clientY - box.top) / box.height - 0.5;
  tilt.value = { x: x * 10, y: -y * 10 };
};
const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && openIndex.value !== null) openIndex.value = null;
};
</script>

<template>
  <div class="deck" :style="{ height: `${height}px` }" @pointerenter="hovered = true" @pointerleave="hovered = false; tilt = { x: 0, y: 0 }" @keydown="onKey">
    <button
      v-for="(card, index) in copy.cards"
      :key="card.title"
      type="button"
      :class="['deck-card', `tone-${TONES[index % TONES.length]}`, { open: openIndex === index, tucked: openIndex !== null && openIndex !== index }]"
      :style="styleFor(index)"
      :aria-expanded="openIndex === index"
      @click="toggle(index)"
      @pointermove="onMove($event, index)"
      @pointerleave="openIndex === index && (tilt = { x: 0, y: 0 })"
    >
      <span class="deck-head">
        <DesignIcon :name="card.icon" :size="30" />
        <strong>{{ card.title }}</strong>
      </span>
      <span class="deck-copy">{{ card.copy }}</span>
      <span v-if="openIndex === index" class="deck-close">{{ copy.close }}</span>
    </button>
  </div>
</template>

<style scoped>
.deck { position: relative; width: 100%; max-width: 440px; margin: 0 auto; perspective: 1400px; transition: height 420ms cubic-bezier(.2, .9, .22, 1); }
.deck-card {
  position: absolute; inset: 0 0 auto; height: 210px; display: grid; align-content: start; gap: 14px; padding: 18px 22px;
  border: 0; border-radius: 24px; color: #F4F6F1; text-align: left; font: inherit; cursor: pointer;
  background: linear-gradient(150deg, var(--tone) 0%, color-mix(in srgb, var(--tone) 55%, #0E1013) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .18), 0 -6px 18px -10px rgba(0, 0, 0, .45), 0 24px 40px -26px rgba(0, 0, 0, .6);
  transform-origin: 50% 0; transition: transform 460ms cubic-bezier(.2, .9, .22, 1), opacity 300ms ease;
  will-change: transform;
}
.deck-card:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
.tone-accent { --tone: #5F8A2E; }
.tone-heart { --tone: #B8454E; }
.tone-activity { --tone: #1F8A95; }
.tone-sleep { --tone: #5563B8; }
.tone-awake { --tone: #B8672C; }
.deck-head { display: flex; align-items: center; gap: 12px; font-size: 16px; }
.deck-copy { max-width: 34ch; color: rgba(244, 246, 241, .82); font-size: 14px; line-height: 1.6; opacity: 0; transition: opacity 240ms ease; }
.deck-card:last-child .deck-copy, .deck-card.open .deck-copy { opacity: 1; }
.deck-card.tucked .deck-head, .deck-card.tucked .deck-copy { opacity: 0; }
.deck-head { transition: opacity 200ms ease; }
.deck-close { position: absolute; right: 18px; bottom: 16px; padding: 4px 12px; border-radius: 999px; background: rgba(255, 255, 255, .16); font-size: 12.5px; }
@media (prefers-reduced-motion: reduce) {
  .deck, .deck-card, .deck-copy { transition: none; }
}
</style>

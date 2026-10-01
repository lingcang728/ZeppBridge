<script setup lang="ts">
/* 第 01 章开头：机场翻牌式的计数板。滚到这里时每一格先乱翻一阵，再一格格落定在示例数字上。
 * 每一格是一块上下两半的牌，换字时新字从上半翻下来（rotateX，合成器上做）。 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { prefersReducedMotion, useSeen } from './motion';
import type { LandingCopy } from './types';

const props = defineProps<{ copy: LandingCopy['flap']; chapter: string; sample: string }>();

const board = ref<HTMLElement | null>(null);
const seen = useSeen(board, 0.4);

/** 每块牌此刻显示的字。数字乱翻，其它字符（逗号、点、M）原样不动。 */
const shown = ref<string[][]>(props.copy.tiles.map((tile) => Array.from(tile.value).map(() => ' ')));
const DIGITS = '0123456789';
const timers: number[] = [];
const clear = () => { while (timers.length) window.clearTimeout(timers.pop()); };

const play = () => {
  clear();
  const tiles = props.copy.tiles.map((tile) => Array.from(tile.value));
  if (prefersReducedMotion()) { shown.value = tiles; return; }
  shown.value = tiles.map((chars) => chars.map(() => ' '));
  tiles.forEach((chars, t) => {
    chars.forEach((final, c) => {
      const flips = 5 + c * 2 + t * 3;
      for (let k = 0; k <= flips; k += 1) {
        timers.push(window.setTimeout(() => {
          const row = [...shown.value[t]];
          row[c] = k === flips || !DIGITS.includes(final) ? final : DIGITS[(k * 7 + c * 3 + t) % 10];
          const next = [...shown.value];
          next[t] = row;
          shown.value = next;
        }, 120 + t * 140 + k * 70));
      }
    });
  });
};

watch(seen, (value) => { if (value) play(); });
watch(() => props.copy.tiles, () => { if (seen.value) play(); else shown.value = props.copy.tiles.map((tile) => Array.from(tile.value).map(() => ' ')); });
onBeforeUnmount(clear);

const tiles = computed(() => props.copy.tiles.map((tile, index) => ({ ...tile, chars: shown.value[index] ?? [] })));
</script>

<template>
  <section class="lp-section flap">
    <div class="flap-head" data-reveal>
      <p class="lp-chapter">{{ chapter }}</p>
      <h2 class="lp-h2">{{ copy.heading }}</h2>
      <p class="lp-lead">{{ copy.lead }}</p>
    </div>
    <div ref="board" class="board lp-panel" data-reveal style="--i: 1">
      <span class="lp-sample board-tag">{{ sample }}</span>
      <div v-for="(tile, t) in tiles" :key="t" class="tile">
        <div class="cells" :aria-label="tile.value" role="img">
          <span v-for="(char, c) in tile.chars" :key="c" :class="['cell', { narrow: !/[0-9]/.test(tile.value[c] ?? '') }]" aria-hidden="true">
            <span :key="char" class="ch">{{ char }}</span>
          </span>
        </div>
        <p class="tile-label">{{ tile.label }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.flap-head { max-width: 760px; }
.board {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin-top: 56px;
  padding: 44px 32px 34px;
}
.board-tag { position: absolute; top: 16px; right: 18px; }
.tile { display: grid; justify-items: center; gap: 16px; }
.cells { display: flex; gap: 5px; }
.cell {
  position: relative;
  display: grid;
  width: clamp(30px, 3.6vw, 50px);
  height: clamp(46px, 5.4vw, 74px);
  place-items: center;
  overflow: hidden;
  border-radius: 8px;
  background: linear-gradient(180deg, #1b2129 0 49.5%, #12171d 50.5% 100%);
  box-shadow: 0 1px 0 rgba(255, 255, 255, .06) inset, 0 10px 20px -10px rgba(0, 0, 0, .7);
  color: #f4f6ef;
  font-family: var(--font-mono);
  font-size: clamp(24px, 3vw, 44px);
  font-weight: 650;
  perspective: 300px;
}
:root[data-theme='light'] .cell { background: linear-gradient(180deg, #2a312b 0 49.5%, #1f2520 50.5% 100%); }
.cell.narrow { width: clamp(16px, 1.8vw, 26px); background: transparent; box-shadow: none; color: var(--lp-muted); }
.cell::after { content: ''; position: absolute; right: 0; left: 0; top: 50%; height: 1px; background: rgba(0, 0, 0, .55); }
.cell.narrow::after { display: none; }
.ch { display: block; animation: flip .16s cubic-bezier(.3, .6, .4, 1) both; transform-origin: 50% 100%; backface-visibility: hidden; }
@keyframes flip { from { transform: rotateX(-80deg); opacity: .3; } }
.tile-label { margin: 0; color: var(--lp-muted); font-size: 14.5px; text-align: center; }

@media (max-width: 860px) {
  .board { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 36px; }
}
@media (max-width: 420px) {
  .board { padding: 44px 14px 28px; gap: 12px; }
}
</style>

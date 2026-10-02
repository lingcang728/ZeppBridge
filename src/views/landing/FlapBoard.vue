<script setup lang="ts">
/* 第一个片段里的翻牌计数板：滚到这里时每一格先乱翻一阵，再一格格落定在示例数字上。
 * 每一格是一块上下两半的牌，换字时新字从上半翻下来（rotateX，合成器上做）。
 * 板子是机场翻牌的样子（深色牌），放在纸上很醒目——这是整页里唯一一处像实物的东西。 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { prefersReducedMotion } from './motion';
import type { LandingCopy } from './types';

const props = defineProps<{ copy: LandingCopy['flap']; sample: string; active: boolean }>();

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

/* 这个片段轮到的那一刻开演；离开再回来重新翻一遍。 */
watch(() => props.active, (value) => { if (value) play(); }, { immediate: true });
watch(() => props.copy.tiles, () => { if (props.active) play(); else shown.value = props.copy.tiles.map((tile) => Array.from(tile.value).map(() => ' ')); });
onBeforeUnmount(clear);

const tiles = computed(() => props.copy.tiles.map((tile, index) => ({ ...tile, chars: shown.value[index] ?? [] })));
</script>

<template>
  <div class="board">
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
</template>

<style scoped>
.board {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px 16px;
  padding: 40px 22px 24px;
  border: 1px solid var(--lp-line);
  border-radius: 22px;
  background: linear-gradient(180deg, var(--lp-panel), var(--lp-panel-2));
  box-shadow: var(--lp-shadow);
}
.board-tag { position: absolute; top: 12px; right: 14px; }
.tile { display: grid; justify-items: start; gap: 10px; }
.cells { display: flex; gap: 4px; }
.cell {
  position: relative;
  display: grid;
  width: clamp(20px, 2.1vw, 30px);
  height: clamp(32px, 3.3vw, 46px);
  place-items: center;
  overflow: hidden;
  border-radius: 6px;
  background: linear-gradient(180deg, #232a22 0 49.5%, #181d17 50.5% 100%);
  box-shadow: 0 1px 0 rgba(255, 255, 255, .08) inset, 0 8px 16px -8px rgba(0, 0, 0, .6);
  color: #f4f6ef;
  font-family: var(--font-mono);
  font-size: clamp(17px, 1.8vw, 26px);
  font-weight: 650;
  perspective: 300px;
}
.cell.narrow { width: clamp(10px, 1.1vw, 16px); background: transparent; box-shadow: none; color: var(--lp-muted); }
.cell::after { content: ''; position: absolute; right: 0; left: 0; top: 50%; height: 1px; background: rgba(0, 0, 0, .55); }
.cell.narrow::after { display: none; }
.ch { display: block; animation: flip .16s cubic-bezier(.3, .6, .4, 1) both; transform-origin: 50% 100%; backface-visibility: hidden; }
@keyframes flip { from { transform: rotateX(-80deg); opacity: .3; } }
.tile-label { margin: 0; color: var(--lp-muted); font-size: 13.5px; }
@media (max-width: 420px) { .board { padding: 40px 14px 20px; } }
</style>

<script setup lang="ts">
/* 会滚的数字：接收排好版的字符串（`243.8 km`、`1:58:11`、`15 次`），逐位拆开，每一位数字是一根 0–9 竖条，换值时竖条上下滚
   （值变大往上滚、变小往下滚，9 → 1 往上会经过 0）。位数或单位变了就整串交叉淡入。拆格和方向在 lib/motion/rolling.ts。
   滚到一半又换值：从竖条此刻的位置接着滚，不排队、不闪回。少动模式（lessMotion）直接换。读屏只读完整的值。
   只动 transform / opacity。用在履历页年轮区块的小结卡，年轮页的运动卡也用它。 */
import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import { lessMotion } from '../lib/motion/lessMotion';
import { cancelOn } from '../lib/motion/cards/reversible';
import { restCell, rollDirection, rollingSlots, rollTarget, sameShape, STRIP_CELLS } from '../lib/motion/rolling';

const props = defineProps<{ value: string }>();
const slots = computed(() => rollingSlots(props.value));
const CELLS = Array.from({ length: STRIP_CELLS }, (_, i) => i % 10);
const ROLL_MS = 460, FADE_MS = 300;
const EASE = 'cubic-bezier(.2, .7, .2, 1)';
const shift = (cell: number) => `translateY(${(-cell * 100) / STRIP_CELLS}%)`;

const face = ref<HTMLElement | null>(null);
const root = ref<HTMLElement | null>(null);
const strips = new Map<string, HTMLElement>();
const setStrip = (key: string, el: unknown) => { if (el) strips.set(key, el as HTMLElement); else strips.delete(key); };
/** 竖条此刻停在第几格（滚到一半时带着动画值，是小数）。 */
const stripCell = (strip: HTMLElement, fallback: number) => {
  const transform = getComputedStyle(strip).transform;
  const cell = strip.offsetHeight / STRIP_CELLS;
  return cell && transform && transform !== 'none' ? -new DOMMatrixReadOnly(transform).m42 / cell : fallback;
};

/* 整串换掉时，旧值留一层从此刻的透明度淡出。字色、字号、字重也照旧的记下：外面常常同时换样式（数字 ↔ 灰色的「—」），
   不记的话旧值会先跳成新样式再淡出。 */
interface Ghost { id: number; text: string; from: number; look: Record<string, string> }
const ghosts = shallowRef<Ghost[]>([]);
let ghostId = 0;

watch(() => props.value, (now, before) => {
  if (lessMotion() || !face.value) return;
  const was = rollingSlots(before), next = rollingSlots(now);
  if (sameShape(was, next)) {
    const direction = rollDirection(before, now);
    // 改值之前读：DOM 还是旧的样子，竖条要是正在滚，读到的是滚到一半的位置。
    const moves = next.flatMap((slot, i) => {
      const old = was[i]!.digit, strip = strips.get(slot.key);
      return slot.digit === null || old === null || slot.digit === old || !strip ? [] : [{ strip, digit: slot.digit, at: stripCell(strip, restCell(old)) }];
    });
    void nextTick(() => {
      for (const move of moves) {
        const { from, to } = rollTarget(move.at, move.digit, direction);
        cancelOn(move.strip);
        // 终点和静止位置是同一个数字（差整十格），放完不用 fill，回到样式里的位置看不出跳。
        move.strip.animate([{ transform: shift(from) }, { transform: shift(to) }], { duration: ROLL_MS, easing: EASE });
      }
    });
    return;
  }
  const id = ++ghostId;
  const style = getComputedStyle(face.value);
  const look = { color: style.color, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight };
  ghosts.value = [...ghosts.value.slice(-2), { id, text: before, from: Number(style.opacity) || 0, look }];
  void nextTick(() => {
    const host = face.value;
    if (!host) return;
    // 留着的竖条可能还在往旧数字滚，新值淡入前停掉，免得放完跳一下。
    for (const strip of strips.values()) cancelOn(strip);
    cancelOn(host);
    host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' });
    const ghost = root.value?.querySelector<HTMLElement>(`[data-ghost="${id}"]`);
    const out = ghost?.animate([{ opacity: ghosts.value.find(g => g.id === id)?.from ?? 1 }, { opacity: 0 }], { duration: FADE_MS * 0.8, easing: 'ease-out', fill: 'forwards' });
    const drop = () => { ghosts.value = ghosts.value.filter(g => g.id !== id); };
    if (out) out.finished.then(drop, () => undefined); else drop();
  });
}, { flush: 'pre' });
</script>

<template>
  <span ref="root" class="rolling">
    <span class="sr-only">{{ value }}</span>
    <span ref="face" class="face" aria-hidden="true">
      <template v-for="slot in slots" :key="slot.key">
        <span v-if="slot.digit !== null" class="digit"><span class="hold">0</span><span :ref="el => setStrip(slot.key, el)" class="strip"
          :style="{ transform: shift(restCell(slot.digit)) }"><span v-for="(n, i) in CELLS" :key="i">{{ n }}</span></span></span>
        <span v-else class="text">{{ slot.text }}</span>
      </template>
    </span>
    <span v-for="ghost in ghosts" :key="ghost.id" class="ghost" :data-ghost="ghost.id" aria-hidden="true" :style="{ ...ghost.look, opacity: ghost.from }">{{ ghost.text }}</span>
  </span>
</template>

<style scoped>
.rolling { position: relative; display: inline-block; white-space: nowrap; font-variant-numeric: tabular-nums; }
.face { display: inline-block; }
/* 一位数字：占位的 0 撑出宽高和基线，竖条绝对定位叠在上面，clip-path 只露一格（不用 overflow，免得基线掉到底边）。 */
.digit { position: relative; display: inline-block; clip-path: inset(0); }
.hold { visibility: hidden; }
.strip { position: absolute; inset: 0 0 auto; display: flex; flex-direction: column; align-items: center; }
.strip > span { display: block; }
.text, .ghost { white-space: pre; }
.ghost { position: absolute; top: 0; left: 0; pointer-events: none; }
</style>

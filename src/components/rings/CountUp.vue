<script setup lang="ts">
/**
 * 一段已经排好版的文字（「114 次」「1,069.1 km」「4,329,618 步」），里面的数字从 0 滚到原值。
 *
 * 只认当前语言的千分位和小数点（Intl 拆出来的那两个符号），滚的时候按原来的小数位和分组重新排；
 * 文字其余部分一个字不动。`run` 变成 true 才开始（年轮页的数据要等舞台落到第一幕才出场），
 * 换了 `text` 就从 0 再滚一遍。减弱动态时直接显示终值。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { intlLocale } from '../../i18n';
import { lessMotion } from '../../lib/motion/lessMotion';

const props = withDefaults(defineProps<{ text: string; run?: boolean; delay?: number; duration?: number }>(), { run: true, delay: 0, duration: 900 });

type Piece = { text: string } | { value: number; decimals: number; grouped: boolean };
const parts = computed<Piece[]>(() => {
  const sample = new Intl.NumberFormat(intlLocale()).formatToParts(12345.6);
  const group = sample.find(p => p.type === 'group')?.value ?? ',';
  const decimal = sample.find(p => p.type === 'decimal')?.value ?? '.';
  const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const number = new RegExp(`\\d+(?:${esc(group)}\\d{3})*(?:${esc(decimal)}\\d+)?`, 'g');
  const out: Piece[] = [];
  let last = 0;
  for (const match of props.text.matchAll(number)) {
    const raw = match[0];
    if (match.index! > last) out.push({ text: props.text.slice(last, match.index) });
    const [whole, frac = ''] = raw.split(decimal);
    out.push({ value: Number(`${whole.split(group).join('')}.${frac || '0'}`), decimals: frac.length, grouped: whole.includes(group) });
    last = match.index! + raw.length;
  }
  if (last < props.text.length) out.push({ text: props.text.slice(last) });
  return out;
});

const progress = ref(props.run && lessMotion() ? 1 : 0);
let frame = 0;
let timer = 0;
const easeOut = (k: number) => 1 - Math.pow(1 - k, 4);
function play() {
  cancelAnimationFrame(frame);
  window.clearTimeout(timer);
  if (lessMotion()) { progress.value = 1; return; }
  progress.value = 0;
  timer = window.setTimeout(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / props.duration);
      progress.value = easeOut(k);
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }, props.delay);
}
watch(() => [props.run, props.text] as const, ([run]) => { if (run) play(); }, { immediate: true });
onBeforeUnmount(() => { cancelAnimationFrame(frame); window.clearTimeout(timer); });

const shown = computed(() => parts.value.map(piece => {
  if ('text' in piece) return piece.text;
  const value = piece.value * progress.value;
  return new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: piece.decimals, maximumFractionDigits: piece.decimals, useGrouping: piece.grouped }).format(value);
}).join(''));
</script>

<template>
  <span class="count-up" :aria-label="text">{{ shown }}</span>
</template>

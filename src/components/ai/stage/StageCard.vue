<script setup lang="ts">
/**
 * 舞台左边的一张牌（2026-10-08）：和牌桌上的牌同一种板（--mat-raised + 顶上一抹这一类的颜色），
 * 但只说三件事——叫什么、交多长一段、里面几天有数据。字号跟牌宽走（--w）。
 * 浮动、拖拽、飞进锁都在外层牌位上做，这里只是牌面。
 */
import TintIcon from '../TintIcon.vue';
import type { StageCardModel } from '../../../composables/ai/useStageCards';
import { textFit } from '../../../lib/cards/faceValue';

defineProps<{ card: StageCardModel }>();
/** 拼音文字里超过 10 个字母的名字算长（汉字不算：四个字也就一行）。 */
const isLong = (title: string) => title.length > 10 && ![...title].some((ch) => ch.charCodeAt(0) >= 0x3400 && ch.charCodeAt(0) <= 0x9fff);
/**
 * 名字里最长的那个词有多宽（em，粗体再放宽一成）：字号按它缩，保证每个词都放得进一行、不在词中间断开
 * （10-08 H13：西语「Recuperación」在窄牌上被拆成「Recuperació / n」、「Carga de entrenamient」被截掉）。
 */
const longestWord = (title: string) => Math.max(1, ...title.split(/\s+/).map((word) => textFit(word) * 1.1));
</script>

<template>
  <span :class="['scard', card.kind, { quiet: card.kind === 'data' && card.have === 0, long: isLong(card.title) }]" :style="{ '--tint': card.tint, '--wfit': longestWord(card.title) }">
      <TintIcon class="scard-icon" :name="card.icon" :tint="card.tint" :size="26" />
      <strong class="scard-title">{{ card.title }}</strong>
      <span class="scard-line">{{ card.line }}</span>
      <span v-if="card.kind === 'data'" class="scard-value"><b>{{ card.have ?? '—' }}</b><small v-if="card.total !== null">/{{ card.total }}</small></span>
      <span v-if="card.sub" class="scard-sub">{{ card.sub }}</span>
  </span>
</template>

<style scoped>
.scard { --w: var(--card-w, 130px); position: relative; display: grid; grid-template-rows: auto auto auto 1fr auto; align-content: start; gap: calc(var(--w) * .035);
  width: var(--w); height: calc(var(--w) * 1.26); padding: calc(var(--w) * .1) calc(var(--w) * .1) calc(var(--w) * .09); border-radius: calc(var(--w) * .11);
  background: radial-gradient(130% 70% at 50% 0%, color-mix(in srgb, var(--tint) 15%, transparent), transparent 70%), var(--mat-raised);
  box-shadow: var(--mat-raised-rim), inset 0 0 0 1px color-mix(in srgb, var(--tint) 14%, transparent), 0 22px 36px -22px rgba(0, 0, 0, .75);
  color: var(--ink); text-align: left; transition: box-shadow var(--dur-base) ease; }
.scard-icon { margin-bottom: calc(var(--w) * .03); }
.scard-title { display: block; max-height: 2.5em; overflow: hidden; font-size: min(max(12px, calc(var(--w) * .118)), calc(var(--w) * .8 / var(--wfit, 6))); font-weight: 700; line-height: 1.2;
  letter-spacing: -.01em; overflow-wrap: normal; word-break: normal; hyphens: manual; }
/* 长名字（俄 / 德「全天心率」「训练负荷」）小一号，三行内放下；最长的那个词决定字号上限，词不从中间断开。 */
.scard.long .scard-title { max-height: 3.7em; font-size: min(max(10px, calc(var(--w) * .094)), calc(var(--w) * .8 / var(--wfit, 6))); }
.scard-line { overflow: hidden; color: var(--muted); font-size: max(10px, calc(var(--w) * .084)); text-overflow: ellipsis; white-space: nowrap; }
.scard-value { align-self: end; color: var(--tint); line-height: 1; white-space: nowrap; }
.scard-value b { font: 700 calc(var(--w) * .25) / 1 var(--font-mono); font-variant-numeric: tabular-nums; letter-spacing: -.03em; }
.scard-value small { margin-left: 2px; color: var(--subtle); font: 600 calc(var(--w) * .1) var(--font-mono); }
.scard-sub { overflow: hidden; color: var(--subtle); font-size: max(10px, calc(var(--w) * .078)); text-overflow: ellipsis; white-space: nowrap; }
.scard.quiet .scard-value { color: var(--subtle); }
/* 个人档案：没有大数字，副行（档案前几个字）落在底边。 */
.scard.profile { grid-template-rows: auto auto auto 1fr; }
.scard.profile .scard-sub { align-self: end; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.35; }
</style>

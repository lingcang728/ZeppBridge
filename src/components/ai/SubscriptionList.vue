<script setup lang="ts">
/**
 * 每个 AI 各自记住「免费版 / 已订阅」（批次 5.2）：寄出前检查里一行一个，玻璃两档。底栏的发送胶囊上只显示
 * 当前那家的一枚小角标，改在这里改。订阅了能读更长的文件（导出时的预算放宽），免费版会控制在读得完的量以内。
 * 第三轮 B1：排成「名字列 | 分段列」两列对齐的表（名字列按最长的名字走），两档缩成「免费 / 订阅」、永不折行——
 * 以前每格 minmax(250px) 放不下，分段折成上下两行、右边空一大片，荷兰语更甚。
 * 10-08 H20：表头一行「全部」——一下把七家都设成免费或已订阅（大多数人要么都没订、要么都订了）；各家不一样时滑块不停在任何一档。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import SegmentTrack from '../SegmentTrack.vue';
import { AI_PROVIDERS, type AiProviderId } from '../../lib/aiProviders';
import { isSubscribed, setSubscribed } from '../../lib/aiTask/budget';
import { reducedMotion } from '../../lib/motion/cards';
import { useHandoffText } from './HandoffDock.i18n';

const t = useHandoffText();
const items = computed(() => [{ value: 'free', label: t.value.planFreeShort, title: t.value.planFree }, { value: 'paid', label: t.value.planPaidShort, title: t.value.planPaid }]);
const set = (id: AiProviderId, value: string) => setSubscribed(id, value === 'paid');
/** 「全部」拨过去以后、各家还没依次跟上的那一小段：表头先停在新的那一档，不闪成「各家不一样」。 */
const pendingAll = ref<string | null>(null);
const all = computed(() => {
  if (pendingAll.value) return pendingAll.value;
  const paid = AI_PROVIDERS.filter((provider) => isSubscribed(provider.id)).length;
  return paid === AI_PROVIDERS.length ? 'paid' : paid === 0 ? 'free' : 'mixed';
});
/**
 * 10-09（用户：从免费切到订阅时下面几行一起刷过去，很笨拙）：七家的滑块从上往下依次拨过去，一行接一行，
 * 像一道波；以前七块玻璃在同一帧一起起飞。
 */
const WAVE_MS = 55;
let timers: number[] = [];
const setAll = (value: string) => {
  timers.forEach((id) => window.clearTimeout(id));
  timers = [];
  const targets = AI_PROVIDERS.filter((provider) => isSubscribed(provider.id) !== (value === 'paid'));
  if (reducedMotion() || targets.length <= 1) { for (const provider of targets) set(provider.id, value); return; }
  pendingAll.value = value;
  targets.forEach((provider, i) => {
    timers.push(window.setTimeout(() => {
      set(provider.id, value);
      if (i === targets.length - 1) pendingAll.value = null;
    }, i * WAVE_MS));
  });
};
onBeforeUnmount(() => {
  timers.forEach((id) => window.clearTimeout(id));
  if (pendingAll.value) for (const provider of AI_PROVIDERS) set(provider.id, pendingAll.value);
});
</script>

<template>
  <div class="subs">
    <p class="hint">{{ t.subscribedHint }}</p>
    <ul>
      <li class="all">
        <span class="who">{{ t.planAll }}</span>
        <SegmentTrack compact no-wrap :items="items" :model-value="all" :aria-label="t.planAll" @update:model-value="setAll" />
      </li>
      <li v-for="provider in AI_PROVIDERS" :key="provider.id">
        <span class="who"><img v-if="provider.localIcon" :src="provider.localIcon" alt="" />{{ provider.label }}</span>
        <SegmentTrack compact no-wrap :items="items" :model-value="isSubscribed(provider.id) ? 'paid' : 'free'" :aria-label="t.planTitle(provider.label)"
          @update:model-value="set(provider.id, $event)" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.subs { display: grid; gap: 10px; }
.hint { margin: 0; color: var(--subtle); font-size: var(--fs-2xs); line-height: 1.6; }
/* 两列对齐的表：名字列按最长的名字走，分段列紧跟其后；宽的时候并排两组。 */
ul { display: grid; grid-template-columns: max-content max-content; justify-content: start; align-items: center; gap: 8px 16px; margin: 0; padding: 0; list-style: none; }
@media (min-width: 900px) { ul { grid-template-columns: repeat(2, max-content max-content); column-gap: 16px; } li:nth-child(even) .who { padding-left: 22px; } }
li { display: contents; }
/* 「全部」独占表头一行，下面一道细线和各家隔开。 */
li.all { display: flex; grid-column: 1 / -1; align-items: center; gap: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--mat-line); }
li.all .who { min-width: 0; color: var(--muted); font-weight: 650; }
.who { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); font-size: var(--fs-sm); white-space: nowrap; }
.who img { width: 18px; height: 18px; object-fit: contain; }
</style>

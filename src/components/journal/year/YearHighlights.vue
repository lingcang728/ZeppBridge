<script setup lang="ts">
/* 年轮区块最下面一排四张：活跃月份、最长连续、单月最多里程、跑得最远的一次。
   前三张点开是弹窗（从卡里长出来，YearDetailDialog），最后一张直接形变进那次运动的详情页。
   没有的就写「—」，不编。翻年时数字逐位滚（RollingNumber，和「—」之间交叉淡入），排行条和单月里程小柱从旧长度缩放过去（只动 transform），
   翻到没数据的一年再翻回来：日期这类小字也走 RollingNumber 交叉淡入（空串也占着一行，卡里不跳），柱子用透明度淡出淡入；
   最后一张有没有那次运动是两种元素（链接 / div），换的时候内容淡入（第一次进页面不淡）。 */
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../../Icon.vue';
import RollingNumber from '../../RollingNumber.vue';
import { useRingsText } from '../../rings/rings.i18n';
import { useYearText } from './year.i18n';

export type HighlightKind = 'months' | 'streak' | 'distance';
interface Month { month: number; label: string; count: number; text: string; distance: number; km: string | null }
defineProps<{
  activeMonths: Month[];
  months: Month[];
  streak: { text: string; range: string; days: number } | null;
  bestMonth: Month | null;
  longestRun: { id: string; value: string; date: string } | null;
}>();
const emit = defineEmits<{ open: [kind: HighlightKind, origin: HTMLElement] }>();
const t = useRingsText();
const y = useYearText();
const open = (kind: HighlightKind, event: MouseEvent) => emit('open', kind, event.currentTarget as HTMLElement);
const tallest = (months: Month[]) => Math.max(1, ...months.map(m => m.distance));
// 只淡入：旧的那份立刻拿掉。不给离场钩子的话 Transition 会把它多留一帧，和新的叠在一起把卡撑高、整页往下跳一下。
const dropNow = (_el: Element, done: () => void) => done();
const settled = ref(false);
onMounted(() => { settled.value = true; });
</script>

<template>
  <div class="highlights">
    <button type="button" class="highlight" :disabled="!activeMonths.length" @click="open('months', $event)">
      <span class="head"><Icon name="bars" :size="18" />{{ y.activeMonths }}</span>
      <Transition name="fresh" @leave="dropNow"><ol v-if="activeMonths.length" class="ranks">
        <li v-for="(m, i) in activeMonths.slice(0, 3)" :key="i" :style="{ '--share': m.count / activeMonths[0].count }">
          <span class="rank">{{ i + 1 }}</span><RollingNumber class="month" :value="m.label" /><span class="bar" /><b><RollingNumber :value="m.text" /></b>
        </li>
      </ol>
      <strong v-else class="none">—</strong></Transition>
    </button>
    <button type="button" class="highlight" :disabled="!streak" @click="open('streak', $event)">
      <span class="head"><Icon name="flame" :size="18" />{{ y.streak }}</span>
      <strong :class="streak ? 'big' : 'none'"><RollingNumber :value="streak?.text ?? '—'" /></strong>
      <small><RollingNumber :value="streak?.range ?? ''" /></small>
    </button>
    <button type="button" class="highlight" :disabled="!bestMonth" @click="open('distance', $event)">
      <span class="head"><Icon name="map" :size="18" />{{ y.bestMonth }}</span>
      <strong :class="bestMonth ? 'big' : 'none'"><RollingNumber :value="bestMonth?.km ?? '—'" /></strong>
      <small><RollingNumber :value="bestMonth?.label ?? ''" /></small>
      <span :class="['columns', { blank: !bestMonth }]" aria-hidden="true">
        <i v-for="m in months" :key="m.month" :class="{ top: m.month === bestMonth?.month }" :style="{ '--share': m.distance / tallest(months) }" />
      </span>
    </button>
    <component :is="longestRun ? RouterLink : 'div'" class="highlight" :to="longestRun ? `/workouts/${longestRun.id}` : undefined" :data-morph-card="longestRun ? '' : undefined">
      <span class="head"><Icon name="run" :size="18" />{{ t.longestRun }}</span>
      <Transition name="fresh" :appear="settled"><strong :class="longestRun ? 'big' : 'none'"><RollingNumber :value="longestRun?.value ?? '—'" /></strong></Transition>
      <Transition name="fresh" :appear="settled"><small><RollingNumber :value="longestRun?.date ?? ''" /></small></Transition>
    </component>
  </div>
</template>

<style scoped>
.highlights { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.highlight { display: grid; align-content: start; gap: 10px; min-width: 0; min-height: 168px; padding: 18px 20px; border: 0; border-radius: var(--radius-lg);
  background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); color: var(--ink); font: inherit; text-align: left; text-decoration: none; cursor: pointer;
  transition: background var(--dur-base) ease; }
.highlight:disabled, div.highlight { cursor: default; }
button.highlight:not(:disabled):hover, a.highlight:hover { background: color-mix(in srgb, var(--ink) 3%, var(--mat-card)); }
.highlight:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.head :deep(svg) { color: var(--kintsugi); flex: none; }
.big { font-size: clamp(26px, 2.4vw, 32px); font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.15; }
.none { color: var(--muted); font-size: 28px; font-weight: 400; }
small { color: var(--muted); font-size: var(--fs-sm); }
.ranks { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.ranks li { display: grid; grid-template-columns: 20px 3em minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.rank { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: color-mix(in srgb, var(--kintsugi) 22%, transparent); color: var(--kintsugi); font-size: 12px; font-weight: 600; }
.month { color: var(--muted); }
.bar { height: 6px; border-radius: 3px; background: linear-gradient(90deg, var(--kintsugi), color-mix(in srgb, var(--kintsugi) 60%, transparent));
  transform: scaleX(var(--share)); transform-origin: left; transition: transform var(--dur-std, 400ms) cubic-bezier(.2, .7, .2, 1); }
.ranks b { font-weight: 500; font-variant-numeric: tabular-nums; }
.columns { display: grid; grid-template-columns: repeat(12, 1fr); align-items: end; gap: 3px; height: 40px; margin-top: auto; }
.columns i { height: 40px; border-radius: 2px; background: color-mix(in srgb, var(--kintsugi) 32%, transparent);
  transform: scaleY(calc((4 + 36 * var(--share)) / 40)); transform-origin: bottom; transition: transform var(--dur-std, 400ms) cubic-bezier(.2, .7, .2, 1); }
.columns i.top { background: var(--kintsugi); }
.columns { transition: opacity 300ms ease-out; }
.columns.blank { opacity: 0; }
/* 只淡入不淡出：卡片是一列排下来的，旧的留着会把新的挤下去。 */
.fresh-enter-active, .fresh-appear-active { transition: opacity 300ms ease-out; }
.fresh-enter-from, .fresh-appear-from { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .bar, .columns, .columns i, .fresh-enter-active, .fresh-appear-active { transition: none; } }
@container journal (max-width: 1000px) { .highlights { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container journal (max-width: 520px) { .highlights { grid-template-columns: minmax(0, 1fr); } }
</style>

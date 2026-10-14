<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive } from 'vue';
import SegmentTrack from '../../components/SegmentTrack.vue';
import CapsuleWheel from '../../components/CapsuleWheel.vue';
import type { IconName } from '../../components/Icon.vue';
import { messages as appMessages } from '../../App.i18n';
import { LOCALE_LABELS, LOCALES, locale, useMessages } from '../../i18n';
import { focusChoiceItems } from '../../composables/useFocusAreas';
import { useCardsText } from '../../components/cards/cards.i18n';
import { eventCategories, lifeEventMessages } from '../../lib/lifeEvents';
import { AI_PROVIDERS } from '../../lib/aiProviders';

/**
 * 宣传片的「玻璃墙」（10-14 用户：别一页页切，像两排手表那样并排滚）：应用里各处的玻璃条摆在同一面墙上，
 * 三排反向缓缓滚动，每根的透镜各自错开地在选项间滑动；背后流过彩色曲线，折射才看得见。
 * 只在演示 iframe 里由 presentation.wall('glass') 挂上，全是应用自己的组件和文案。
 */
interface Bar { id: string; wheel?: boolean; items: { value: string; label: string; icon?: IconName; image?: string }[]; iconOnly?: boolean; span?: number; compact?: boolean }

const app = useMessages(appMessages);
const cards = useCardsText();
const events = useMessages(lifeEventMessages);
const rows = computed<Bar[][]>(() => [
  [
    { id: 'nav', items: [{ value: 'o', label: app.value.navOverview }, { value: 'a', label: app.value.navHandoff }, { value: 's', label: app.value.navSettings }] },
    { id: 'theme', iconOnly: true, items: [{ value: 'dark', label: 'dark', icon: 'moon' }, { value: 'light', label: 'light', icon: 'sun' }, { value: 'system', label: 'system', icon: 'monitor' }] },
    { id: 'focus', items: focusChoiceItems.value.map((item) => ({ value: String(item.value), label: item.label })) },
    { id: 'units', items: [{ value: 'km', label: 'km' }, { value: 'mi', label: 'mi' }] },
  ],
  [
    { id: 'range', items: [{ value: '7', label: cards.value.range7 }, { value: '30', label: cards.value.range30 }, { value: '180', label: cards.value.range180 }] },
    { id: 'ai', wheel: true, span: 210, items: AI_PROVIDERS.map((p) => ({ value: p.id, label: p.label, image: p.localIcon })) },
    { id: 'events', compact: true, items: eventCategories.map((c) => ({ value: c, label: events.value.categoryShort[c] })) },
  ],
  [
    { id: 'formats', items: ['JSON', 'CSV', 'GPX', 'FIT'].map((f) => ({ value: f, label: f })) },
    { id: 'locale', wheel: true, span: 190, items: LOCALES.map((l) => ({ value: l, label: LOCALE_LABELS[l] })) },
    { id: 'clock', items: [{ value: '12', label: '12h' }, { value: '24', label: '24h' }] },
    { id: 'nav2', items: [{ value: 'o', label: app.value.navOverview }, { value: 'a', label: app.value.navHandoff }, { value: 's', label: app.value.navSettings }] },
  ],
  [
    { id: 'theme2', iconOnly: true, items: [{ value: 'light', label: 'light', icon: 'sun' }, { value: 'dark', label: 'dark', icon: 'moon' }, { value: 'system', label: 'system', icon: 'monitor' }] },
    { id: 'range2', items: [{ value: '180', label: cards.value.range180 }, { value: '30', label: cards.value.range30 }, { value: '7', label: cards.value.range7 }] },
    { id: 'ai2', wheel: true, span: 210, items: [...AI_PROVIDERS].reverse().map((p) => ({ value: p.id, label: p.label, image: p.localIcon })) },
    { id: 'focus2', items: [...focusChoiceItems.value].reverse().map((item) => ({ value: String(item.value), label: item.label })) },
  ],
]);

const values = reactive<Record<string, string>>({});
const pick = (bar: Bar) => values[bar.id] ?? (bar.id === 'locale' ? locale.value : bar.items[0]!.value);
const timers: number[] = [];
onMounted(() => {
  // 每根各走各的节拍：1.1–1.9 秒换一项，起步错开，透镜此起彼伏。
  rows.value.flat().forEach((bar, index) => {
    const step = () => {
      const items = rows.value.flat().find((b) => b.id === bar.id)!.items;
      const at = items.findIndex((item) => item.value === pick(bar));
      values[bar.id] = items[(at + 1) % items.length]!.value;
    };
    timers.push(window.setTimeout(() => timers.push(window.setInterval(step, 1100 + (index % 5) * 200)), 250 + index * 170));
  });
});
onBeforeUnmount(() => timers.forEach((id) => { clearTimeout(id); clearInterval(id); }));
</script>

<template>
  <div class="film-wall glass" aria-hidden="true">
    <svg class="waves" viewBox="0 0 1280 800" preserveAspectRatio="none">
      <path class="w1" d="M-40 230 C 140 150 260 330 420 250 S 700 140 860 250 S 1140 330 1320 210" />
      <path class="w2" d="M-40 420 C 120 520 300 330 460 430 S 760 520 900 400 S 1180 330 1320 450" />
      <path class="w3" d="M-40 610 C 160 520 320 690 500 600 S 820 520 960 640 S 1200 690 1320 580" />
    </svg>
    <div v-for="(row, r) in rows" :key="r" :class="['wall-row', r % 2 ? 'rtl' : 'ltr']" :style="{ '--dur': `${30 + (r % 2) * 6 + r * 3}s` }">
      <div class="wall-track">
        <div v-for="pass in 2" :key="pass" class="wall-pass">
          <div v-for="bar in row" :key="`${pass}-${bar.id}`" class="wall-chip">
            <CapsuleWheel v-if="bar.wheel" loop :span="bar.span" :items="bar.items" :model-value="pick(bar)" :aria-label="bar.id" />
            <SegmentTrack v-else variant="glass" :compact="bar.compact" :icon-only="bar.iconOnly" :items="bar.items" :model-value="pick(bar)" :aria-label="bar.id" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.film-wall { position: fixed; inset: 0; z-index: 9000; display: grid; align-content: center; gap: 46px; overflow: hidden; background: var(--bg); }
.waves { position: absolute; inset: -10% -6%; width: 112%; height: 120%; animation: wave-drift 9s ease-in-out infinite alternate; }
.waves path { fill: none; stroke-width: 16; stroke-linecap: round; opacity: .38; filter: blur(3px); }
.w1 { stroke: #ff6b6b; } .w2 { stroke: #7c8cff; } .w3 { stroke: #8fc24a; }
.wall-row { position: relative; overflow: hidden; padding: 10px 0; }
.wall-track { display: flex; width: max-content; animation: wall-slide var(--dur) linear infinite; }
.rtl .wall-track { animation-direction: reverse; }
.wall-pass { display: flex; align-items: center; gap: 64px; padding-right: 64px; }
/* zoom 而不是 transform：放大后照样占位，相邻的条不会叠在一起。 */
.wall-chip { display: flex; align-items: center; zoom: 1.65; }
@keyframes wall-slide { to { transform: translateX(-50%); } }
@keyframes wave-drift { to { transform: translateX(-4%) translateY(2%); } }
</style>

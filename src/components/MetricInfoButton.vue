<script setup lang="ts">
/**
 * 指标卡上的「?」（D6）：三层固定解释——这是什么 / 这张图展示什么 / 怎么算的与来源。
 *
 * 内容按指标 id 从 `lib/metricInfo/` 各域文件取，这里只做渲染：一枚安静的小圆按钮放在
 * 标题旁边，点开一块玻璃浮层（GlassPopover，和「问 AI」同一套：从按钮里弹出来、Esc /
 * 点空白缩回去、焦点回到按钮）。认不出的指标 id 不渲染按钮，避免开一块空浮层。
 * 卡片下面那行一句话说明挪进了这里：同一句话只在浮层里出现，不在卡上再排一遍。
 */
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import GlassPopover from './GlassPopover.vue';
import { metricInfo } from '../lib/metricInfo';
import { metricTrust } from '../lib/metricInfo/trust';
import GlassSwitch from './GlassSwitch.vue';
import { isDesktop } from '../lib/bridge';
import { useMetricExclusions } from '../composables/useMetricExclusions';
import { useMetricInfoText } from './MetricInfo.i18n';

const props = defineProps<{
  /** 指标 id：`lib/metricInfo` 注册表里的键。 */
  metric: string;
  /** 卡片标题（浮层名字与无障碍标签用）。 */
  label: string;
}>();

const t = useMetricInfoText();
const info = computed(() => metricInfo(props.metric));
const trust = computed(() => metricTrust(props.metric));
const { isExcluded, setExcluded } = useMetricExclusions();
const excluded = computed(() => isExcluded(props.metric));
const toggleUse = (use: boolean) => { void setExcluded(props.metric, !use).catch(() => undefined); };
const trustText = computed(() => {
  if (trust.value === 'measured') return t.value.trustMeasured;
  if (trust.value === 'computed') return t.value.trustComputed;
  if (trust.value === 'inferred') return t.value.trustInferred;
  return t.value.trustEstimated;
});
/** 按钮角上的那粒点：用户排除的（灰色斜杠，优先）、黑盒估算的（琥珀），其余不挂。 */
const flag = computed(() => (excluded.value ? 'excluded' : trust.value === 'modeled' ? 'modeled' : null));
const buttonLabel = computed(() => {
  const about = t.value.about(props.label);
  if (flag.value === 'excluded') return `${about} · ${t.value.excludedChipTitle}`;
  if (flag.value === 'modeled') return `${about} · ${t.value.trustChipTitle}`;
  return about;
});
const open = ref(false);
const button = ref<HTMLElement | null>(null);
const titleId = computed(() => `metric-info-${props.metric}`);
</script>

<template>
  <!-- 来历不再单独贴胶囊（2026-10-28 睡眠页曾三粒黄标挤着四个问号）：只有黑盒估算在「?」角上挂琥珀点，
       用户排除的挂灰色斜杠点；常识推算、测量、换算都不挂，来历一律写进浮层。 -->
  <button
    v-if="info"
    ref="button"
    type="button"
    class="metric-info"
    :data-flag="flag ?? undefined"
    :title="buttonLabel"
    :aria-label="buttonLabel"
    aria-haspopup="dialog"
    :aria-expanded="open"
    @click="open = true"
  >
    <Icon name="help" :size="15" />
  </button>
  <GlassPopover
    v-if="open && info"
    :anchor="button"
    :labelledby="titleId"
    @close="open = false"
  >
    <h2 :id="titleId" class="info-title" data-pop-item>{{ label }}</h2>
    <section class="info-section" data-pop-item>
      <h3>{{ t.sectionWhat }}</h3>
      <p>{{ info.what }}</p>
    </section>
    <section class="info-section" data-pop-item>
      <h3>{{ t.sectionChart }}</h3>
      <p>{{ info.chart }}</p>
    </section>
    <section class="info-section" data-pop-item>
      <h3>{{ t.sectionHow }}</h3>
      <p>{{ info.how }}</p>
    </section>
    <section v-if="trust" class="info-section" data-pop-item>
      <h3>{{ t.sectionTrust }}</h3>
      <p>{{ trustText }}</p>
    </section>
    <section v-if="isDesktop()" class="info-section use-row" data-pop-item>
      <div class="use-copy">
        <h3>{{ t.useInAnalysis }}</h3>
        <p>{{ t.useInAnalysisHint }}</p>
      </div>
      <GlassSwitch :model-value="!excluded" :aria-label="t.useInAnalysis" @update:model-value="toggleUse" />
    </section>
  </GlassPopover>
</template>

<style scoped>
/* 和同一行「挑日子」「问 AI」同一族的小胶囊，只是只有一枚图标：安静，但按得到。 */
.metric-info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 999px;
  background: var(--mat-inset);
  box-shadow: var(--mat-inset-shadow);
  color: var(--muted);
  font: inherit;
  cursor: pointer;
  vertical-align: middle;
  transition: background var(--dur-base) ease, color var(--dur-base) ease, transform 160ms ease;
}
.metric-info:hover { background: color-mix(in srgb, var(--ink) 8%, var(--mat-inset)); color: var(--ink); }
.metric-info:active { transform: scale(.92); }
.metric-info[aria-expanded='true'] { color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, var(--mat-inset)); }
.metric-info:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

.metric-info { position: relative; }
/* 角上的点压一圈卡底色，看起来像嵌在按钮边上，不是浮在外面。 */
.metric-info[data-flag]::after {
  content: '';
  position: absolute;
  top: 1px;
  right: 1px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--mat-card-solid);
  pointer-events: none;
}
.metric-info[data-flag='modeled']::after { background: var(--warning); }
.metric-info[data-flag='excluded']::after {
  background: linear-gradient(135deg, transparent 42%, var(--mat-card-solid) 42% 58%, transparent 58%), var(--subtle);
}
.use-row { display: flex; align-items: center; gap: 12px; }
.use-copy { flex: 1; min-width: 0; }

.info-title { margin: 0; color: var(--ink); font-size: var(--fs-md); line-height: 1.3; }
.info-section h3 {
  margin: 0 0 2px;
  color: var(--subtle);
  font-size: var(--fs-2xs);
  font-weight: 600;
  letter-spacing: 0.02em;
}
.info-section p { margin: 0; color: var(--muted); font-size: var(--fs-sm); line-height: 1.55; }
</style>

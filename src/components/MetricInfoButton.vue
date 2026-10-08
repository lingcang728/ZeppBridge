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
import { useMetricInfoText } from './MetricInfo.i18n';

const props = defineProps<{
  /** 指标 id：`lib/metricInfo` 注册表里的键。 */
  metric: string;
  /** 卡片标题（浮层名字与无障碍标签用）。 */
  label: string;
}>();

const t = useMetricInfoText();
const info = computed(() => metricInfo(props.metric));
const open = ref(false);
const button = ref<HTMLElement | null>(null);
const titleId = computed(() => `metric-info-${props.metric}`);
</script>

<template>
  <button
    v-if="info"
    ref="button"
    type="button"
    class="metric-info"
    :title="t.about(label)"
    :aria-label="t.about(label)"
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

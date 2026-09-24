<script setup lang="ts">
/**
 * 关系网里一个节点的长相：类别是带图标和覆盖弧的圆，指标是小点，
 * 中心是主题圆。只画，不管交互——拖拽和点击归 TaskGraph。
 * 图标的渲染直接嵌套 Icon 组件的 <svg>（SVG 里套 <svg> 是合法的）。
 */
import { computed } from 'vue';
import Icon from '../Icon.vue';
import type { GraphNode } from '../../lib/aiTask/graph/model';
import { NODE_RADIUS } from '../../lib/aiTask/graph/layout';

const props = withDefaults(defineProps<{
  node: GraphNode;
  x: number;
  y: number;
  hovered?: boolean;
  dimmed?: boolean;
  /** 正在被拖动的是它的「影子」，本体淡掉。 */
  ghosted?: boolean;
  /** 拖动提示：松手会加入还是移出。 */
  dropHint?: 'include' | 'exclude' | null;
}>(), { hovered: false, dimmed: false, ghosted: false, dropHint: null });

const radius = computed(() => NODE_RADIUS[props.node.kind]);
/** 覆盖弧的周长，按覆盖比例截取。 */
const COVER_GAP = 4;
const coverLength = computed(() => {
  const r = radius.value + COVER_GAP;
  return 2 * Math.PI * r;
});
const coverDash = computed(() => {
  const ratio = props.node.coverage ?? 0;
  return `${(coverLength.value * ratio).toFixed(1)} ${coverLength.value.toFixed(1)}`;
});
/** 指标多的时候平时藏标签，悬停才出现，免得糊成一团。 */
const showLabel = computed(() =>
  props.node.kind !== 'metric' || props.node.siblings <= 8 || props.hovered || props.ghosted);
</script>

<template>
  <g :class="['gnode', `kind-${node.kind}`, {
    'is-included': node.included, 'is-effective': node.effective,
    'is-missing': node.missing, 'is-hovered': hovered, 'is-dimmed': dimmed,
    'is-ghosted': ghosted, 'is-expanded': node.expanded,
  }]" :transform="`translate(${x} ${y})`" :aria-label="node.label">
    <!-- 覆盖弧：类别/指标的外圈进度环 -->
    <circle v-if="node.coverage !== null" class="cover" :r="radius + COVER_GAP" fill="none"
      :stroke-dasharray="coverDash" transform="rotate(-90)" />
    <circle class="body" :r="radius" />
    <g v-if="node.icon" :transform="`translate(${-radius * 0.62} ${-radius * 0.62})`">
      <Icon :name="node.icon" :size="radius * 1.24" class="glyph" />
    </g>
    <!-- 拖放提示圈 -->
    <circle v-if="dropHint" class="drop-hint" :class="dropHint" :r="radius + 8" fill="none" />
    <circle v-if="node.badge" class="badge" :cx="radius * 0.72" :cy="-radius * 0.72" r="8" />
    <text v-if="node.badge" class="badge-text" :x="radius * 0.72" :y="-radius * 0.72 + 3.4">{{ node.badge }}</text>
    <text v-if="showLabel" class="label" :y="radius + 15">{{ node.label }}</text>
    <text v-if="node.sublabel && showLabel" class="sublabel" :y="radius + 27">{{ node.sublabel }}</text>
    <!-- 展开/收起的小把手 -->
    <g v-if="node.expandable" class="expander" :transform="`translate(${-radius * 0.72} ${-radius * 0.72})`">
      <circle r="7" />
      <text y="3.2">{{ node.expanded ? '−' : '+' }}</text>
    </g>
  </g>
</template>

<style scoped>
.gnode { cursor: pointer; }
.body { fill: var(--surface-raised); stroke: var(--line-control); stroke-width: 1.2; transition: stroke .15s, fill .15s, opacity .15s; }
.glyph { color: var(--muted); }
.label, .sublabel, .badge-text { text-anchor: middle; pointer-events: none; user-select: none; }
.label { fill: var(--ink); font-size: 11px; }
.sublabel { fill: var(--subtle); font-size: 9.5px; }
.cover { stroke: var(--accent); stroke-width: 2.5; opacity: .85; transition: opacity .15s; }
.drop-hint { stroke-width: 2; stroke-dasharray: 5 4; }
.drop-hint.include { stroke: var(--accent); }
.drop-hint.exclude { stroke: var(--danger); }
.badge { fill: var(--accent); }
.badge-text { fill: var(--accent-ink); font-size: 9px; font-weight: 700; }
.expander circle { fill: var(--surface-raised); stroke: var(--line-control); }
.expander text { fill: var(--muted); font-size: 10px; text-anchor: middle; pointer-events: none; }
/* 中心：主题 */
.kind-center .body { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.kind-center .glyph { color: var(--accent); }
.kind-center .label { font-size: 12.5px; font-weight: 700; }
/* 类别：交给 AI = 描边强调 + 图标点亮；不交 = 淡 */
.kind-category.is-included .body { stroke: var(--accent); }
.kind-category.is-included .glyph { color: var(--accent); }
.kind-category:not(.is-included) { opacity: .62; }
/* 指标 */
.kind-metric .body { fill: var(--surface); }
.kind-metric.is-effective .body { fill: var(--accent-soft); stroke: var(--accent); }
.kind-metric:not(.is-effective) { opacity: .4; }
.kind-metric .label { font-size: 10px; fill: var(--muted); }
.is-missing .body { stroke: var(--warning); stroke-dasharray: 3 3; }
.is-hovered .body { stroke: var(--accent); stroke-width: 2; }
.is-dimmed { opacity: .22; }
.is-ghosted { opacity: .25; }
</style>

<script setup lang="ts">
/**
 * 关系网里一个节点的长相：类别是带图标的圆，外面一圈「日环」——每天（或每几天）一格，
 * 有数据的亮、缺的灰；指标是小点，中心是主题圆。只画，不管交互——拖拽和点击归 TaskGraph。
 * 图标的渲染直接嵌套 Icon 组件的 <svg>（SVG 里套 <svg> 是合法的）。
 *
 * 日环没有逐日数据（旧载荷、几段不相连的窗口）时退回一段连续的覆盖弧，不去猜哪几天有。
 */
import { computed } from 'vue';
import Icon from '../Icon.vue';
import type { GraphNode } from '../../lib/aiTask/graph/model';
import { NODE_RADIUS } from '../../lib/aiTask/graph/layout';
import { AI_TASK_CATEGORY_META } from '../../lib/aiTask/categories';

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
  /** 聚焦别的类别时，它退成模糊的背景。 */
  backdrop?: boolean;
  /** 聚焦的这一类和它的指标：放大一点、标签全部亮出来。 */
  emphasis?: boolean;
}>(), { hovered: false, dimmed: false, ghosted: false, dropHint: null, backdrop: false, emphasis: false });

/** 看不见的点击区：比画出来的圆大一圈。指标点只有 10px 半径，以前点歪一点就点到了背景或者邻居。 */
const HIT_PAD = { center: 6, category: 16, metric: 12 } as const;

const radius = computed(() => NODE_RADIUS[props.node.kind]);
const tint = computed(() => (props.node.category ? AI_TASK_CATEGORY_META[props.node.category].tint : 'var(--accent)'));

/** 连续覆盖弧（没有逐日数据时的退路）。 */
const COVER_GAP = 5;
const coverLength = computed(() => 2 * Math.PI * (radius.value + COVER_GAP));
const coverDash = computed(() => {
  const ratio = props.node.coverage ?? 0;
  return `${(coverLength.value * ratio).toFixed(1)} ${coverLength.value.toFixed(1)}`;
});

/** 日环：从正上方顺时针，窗口第一天 → 最后一天；最后一格（今天）长一点。 */
const ticks = computed(() => {
  const ring = props.node.dayRing;
  if (!ring || props.node.kind !== 'category') return [];
  const count = ring.cells.length;
  const inner = radius.value + 7;
  return ring.cells.map((value, index) => {
    const angle = ((-90 + (index * 360) / count) * Math.PI) / 180;
    const outer = inner + (index === count - 1 ? 8 : 5);
    return {
      x1: +(inner * Math.cos(angle)).toFixed(2), y1: +(inner * Math.sin(angle)).toFixed(2),
      x2: +(outer * Math.cos(angle)).toFixed(2), y2: +(outer * Math.sin(angle)).toFixed(2),
      state: value >= 1 ? 'on' : value > 0 ? 'part' : 'off',
      opacity: value >= 1 || value <= 0 ? undefined : +(0.35 + 0.65 * value).toFixed(2),
    };
  });
});
const tickWidth = computed(() => (ticks.value.length > 20 ? 2.4 : 3.4));
const labelOffset = computed(() => radius.value + (ticks.value.length ? 26 : 20));

/** 指标多的时候平时藏标签，悬停才出现，免得糊成一团。 */
const showLabel = computed(() =>
  props.node.kind !== 'metric' || props.node.siblings <= 8 || props.hovered || props.ghosted || props.emphasis);
</script>

<template>
  <g :class="['gnode', `kind-${node.kind}`, {
    'is-included': node.included, 'is-effective': node.effective,
    'is-missing': node.missing, 'is-hovered': hovered, 'is-dimmed': dimmed,
    'is-ghosted': ghosted, 'is-expanded': node.expanded, 'is-backdrop': backdrop, 'is-emphasis': emphasis,
  }]" :transform="`translate(${x} ${y})`" :style="{ '--tint': tint }" :aria-label="node.label">
    <circle class="hit" :r="radius + HIT_PAD[node.kind]" />
    <!-- 日环：每格一天 -->
    <g v-if="ticks.length" class="dayring" aria-hidden="true">
      <line v-for="(tick, index) in ticks" :key="index" :class="['tick', tick.state]"
        :x1="tick.x1" :y1="tick.y1" :x2="tick.x2" :y2="tick.y2" :stroke-width="tickWidth" :opacity="tick.opacity" />
    </g>
    <!-- 没有逐日数据：一段连续的覆盖弧 -->
    <circle v-else-if="node.coverage !== null" class="cover" :r="radius + COVER_GAP" fill="none"
      :stroke-dasharray="coverDash" transform="rotate(-90)" />
    <circle class="body" :r="radius" />
    <g v-if="node.icon" :transform="`translate(${-radius * 0.5} ${-radius * 0.5})`">
      <Icon :name="node.icon" :size="radius" class="glyph" />
    </g>
    <!-- 拖放提示圈 -->
    <circle v-if="dropHint" class="drop-hint" :class="dropHint" :r="radius + 18" fill="none" />
    <circle v-if="node.badge" class="badge" :cx="radius * 0.72" :cy="-radius * 0.72" r="9" />
    <text v-if="node.badge" class="badge-text" :x="radius * 0.72" :y="-radius * 0.72 + 3.6">{{ node.badge }}</text>
    <text v-if="showLabel" class="label" :y="labelOffset">{{ node.label }}</text>
    <text v-if="node.sublabel && showLabel" class="sublabel" :y="labelOffset + 17">{{ node.sublabel }}</text>
    <!-- 展开/收起的小把手 -->
    <g v-if="node.expandable" class="expander" :transform="`translate(${-radius * 0.78} ${-radius * 0.78})`">
      <circle r="8" />
      <!-- 展开 / 收起是一个箭头，不再是像「加入」的小加号（U07）。 -->
      <path :d="node.expanded ? 'M-3.4 1.8 0-1.6 3.4 1.8' : 'M-3.4-1.6 0 1.8 3.4-1.6'" />
    </g>
  </g>
</template>

<style scoped>
.gnode { cursor: pointer; transition: opacity .28s ease, filter .4s ease; }
.hit { fill: transparent; stroke: none; }
.body { fill: var(--surface-raised); stroke: var(--mat-line); stroke-width: 1.2; transition: stroke .15s, fill .15s, opacity .15s; }
.glyph { color: var(--muted); }
.label, .sublabel, .badge-text { text-anchor: middle; pointer-events: none; user-select: none; }
/* 图谱文字的下限（U17）：节点标签在 100% 缩放下是 15px，不用放大就能读；拥挤靠藏标签、拉间距解决，不再缩字。 */
.label { fill: var(--ink); font-size: 15px; font-weight: 700; }
.sublabel { fill: var(--subtle); font-size: 12.5px; }
.cover { stroke: var(--tint); stroke-width: 2.6; opacity: .85; transition: opacity .15s; }
/* 日环：有数据的格子点亮成这一类的颜色，缺的天是灰格（不是空白，空白会让人以为那里没有这一天）。 */
.tick { stroke-linecap: round; transition: stroke .2s ease, opacity .2s ease; }
.tick.on, .tick.part { stroke: var(--tint); }
.tick.off { stroke: var(--line-strong); }
.drop-hint { stroke-width: 2; stroke-dasharray: 5 4; }
.drop-hint.include { stroke: var(--accent); }
.drop-hint.exclude { stroke: var(--danger); }
.badge { fill: var(--accent); }
.badge-text { fill: var(--accent-ink); font-size: 10px; font-weight: 700; }
.expander circle { fill: var(--surface-raised); stroke: var(--line-control); }
.expander path { fill: none; stroke: var(--muted); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
/* 中心：主题 */
.kind-center .body { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.8; }
.kind-center .glyph { color: var(--accent); }
.kind-center .label { font-size: 17px; font-weight: 700; }
/* 类别：交给 AI = 图标点亮成这一类的颜色；不交 = 淡 */
.kind-category.is-included .glyph { color: var(--tint); }
.kind-category:not(.is-included) { opacity: .6; }
.kind-category:not(.is-included) .label { font-weight: 500; fill: var(--muted); }
/* 指标 */
.kind-metric .body { fill: var(--surface); }
.kind-metric.is-effective .body { fill: var(--accent-soft); stroke: var(--accent); }
.kind-metric:not(.is-effective) { opacity: .4; }
.kind-metric .label { font-size: 12.5px; font-weight: 500; fill: var(--muted); }
.is-missing .body { stroke: var(--warning); stroke-dasharray: 3 3; }
.is-hovered .body { stroke: var(--line-control); stroke-width: 2; }
.kind-center.is-hovered .body { stroke: var(--accent); }
.is-dimmed { opacity: .38; }
/* 背景：退远、变糊，但仍能点（点背景里的另一类会飞过去）。 */
.is-backdrop { opacity: .3; filter: blur(1.6px); }
.is-backdrop:hover { opacity: .6; filter: blur(.4px); }
.is-emphasis.kind-metric .label { fill: var(--ink); font-size: 13px; }
.is-emphasis.kind-category .body { stroke-width: 2.2; }
.is-ghosted { opacity: .25; }
</style>

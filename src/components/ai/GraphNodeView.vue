<script setup lang="ts">
/**
 * 关系网里一个节点的长相。只画，不管交互——拖拽和点击归 TaskGraph。
 *
 *   类别：一枚小圆盘（实底 + 类别色从左上角透进来的微光 + 顶边高光），里面一个双色图标
 *         （GraphGlyph）；外面一圈「日环」——和大圈同一套表盘刻度，一天一根、今天在 12 点，
 *         有数据的亮成类别色、缺的天是灰刻度。
 *   中心：大一号的圆盘；「最近 N 天」时盘里直接写 N，选了运动时是秒表图标 + 下面一行运动名。
 *   指标：小圆点。
 *
 * 日环没有逐日数据（旧载荷、几段不相连的窗口）时退回一段连续的覆盖弧，不去猜哪几天有。
 * 渐变（微光、高光、影子）定义在 TaskGraph 的 <defs> 里，按类别取 id。
 */
import { computed } from 'vue';
import GraphGlyph from './GraphGlyph.vue';
import type { GraphNode } from '../../lib/aiTask/graph/model';
import { NODE_RADIUS } from '../../lib/aiTask/graph/layout';
import { dialPaths } from '../../lib/aiTask/graph/dial';
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
  /** 被拿在手里的那一份：放大一点、底下垫一层影子。 */
  lifted?: boolean;
  /** 中心是「最近 N 天」时的 N。 */
  centerDays?: number | null;
  /** 盘里 N 下面的小字（「天」）。 */
  daysUnit?: string;
}>(), {
  hovered: false, dimmed: false, ghosted: false, dropHint: null, backdrop: false, emphasis: false, lifted: false,
  centerDays: null, daysUnit: '',
});

/** 看不见的点击区：比画出来的圆大一圈。指标点只有 10px 半径，以前点歪一点就点到了背景或者邻居。 */
const HIT_PAD = { center: 6, category: 16, metric: 12 } as const;
/** 日环：刻度内端离圆盘边多远、多长。 */
const RING_GAP = 5;
const RING_LENGTH = 4.5;

const radius = computed(() => NODE_RADIUS[props.node.kind]);
const tint = computed(() => (props.node.category ? AI_TASK_CATEGORY_META[props.node.category].tint : 'var(--accent)'));
const washId = computed(() => (props.node.category ? `gwash-${props.node.category}` : 'gwash-center'));

/** 连续覆盖弧（没有逐日数据时的退路）。 */
const coverRadius = computed(() => radius.value + RING_GAP + 2);
const coverDash = computed(() => {
  const length = 2 * Math.PI * coverRadius.value;
  const ratio = props.node.coverage ?? 0;
  return `${(length * ratio).toFixed(1)} ${length.toFixed(1)}`;
});

/** 日环：和大圈同一套表盘（今天在 12 点、顺时针一天一根），节点小，不补分刻度、不画周刻度。 */
const ring = computed(() => {
  const dial = props.node.dayRing;
  if (!dial || props.node.kind !== 'category') return null;
  return dialPaths(dial.cells, dial.cells.length, { radius: radius.value + RING_GAP, length: RING_LENGTH, weekLength: RING_LENGTH + 2.5, perCell: 99 });
});
const tickWidth = computed(() => {
  const count = props.node.dayRing?.cells.length ?? 0;
  return count > 20 ? 1.9 : 2.6;
});
const labelOffset = computed(() => radius.value + (ring.value || props.node.coverage !== null ? 25 : 18));
const glyphSize = computed(() => Math.round(radius.value * 1.2));

/** 指标多的时候平时藏标签，悬停才出现，免得糊成一团。 */
const showLabel = computed(() =>
  props.node.kind !== 'metric' || props.node.siblings <= 8 || props.hovered || props.ghosted || props.emphasis);
const showCenterNumber = computed(() => props.node.kind === 'center' && props.centerDays !== null);
const transform = computed(() => `translate(${props.x} ${props.y})${props.lifted ? ' scale(1.08)' : ''}`);
</script>

<template>
  <g :class="['gnode', `kind-${node.kind}`, {
    'is-included': node.included, 'is-effective': node.effective,
    'is-missing': node.missing, 'is-hovered': hovered, 'is-dimmed': dimmed,
    'is-ghosted': ghosted, 'is-expanded': node.expanded, 'is-backdrop': backdrop, 'is-emphasis': emphasis,
    'is-lifted': lifted,
  }]" :transform="transform" :style="{ '--tint': tint }" :aria-label="node.label">
    <circle class="hit" :r="radius + HIT_PAD[node.kind]" />
    <!-- 拿在手里时底下一团软影子（径向渐变，不用滤镜：逐帧重画也便宜）。 -->
    <circle v-if="lifted" class="lift-shadow" :r="radius + 16" cy="9" fill="url(#gshadow)" />

    <!-- 日环：一天一根，今天在 12 点 -->
    <g v-if="ring" class="dayring" aria-hidden="true" :stroke-width="tickWidth">
      <path class="tick off" :d="ring.ticks.off" />
      <path class="tick plain" :d="ring.ticks.plain" />
      <path class="tick part" :d="ring.ticks.part" :opacity="ring.partOpacity" />
      <path class="tick on" :d="ring.ticks.on" />
      <path :class="['tick', 'today', ring.todayState]" :d="ring.today" />
    </g>
    <!-- 没有逐日数据：一段连续的覆盖弧 -->
    <circle v-else-if="node.coverage !== null && node.kind === 'category'" class="cover" :r="coverRadius" fill="none"
      :stroke-dasharray="coverDash" transform="rotate(-90)" />

    <circle class="body" :r="radius" />
    <circle v-if="node.kind !== 'metric'" class="wash" :r="radius" :fill="`url(#${washId})`" />
    <circle v-if="node.kind !== 'metric'" class="rim" :r="radius - 0.75" fill="none" stroke="url(#grim)" />

    <template v-if="node.kind === 'category' && node.category">
      <GraphGlyph class="glyph" :name="node.category" :size="glyphSize" :y="node.expandable ? -2 : 0" />
      <!-- 能展开指标：盘底一道小箭头（展开后朝上）。 -->
      <path v-if="node.expandable" class="expander" :transform="`translate(0 ${radius - 8})`"
        :d="node.expanded ? 'M-3.2 1.4 0-1.4 3.2 1.4' : 'M-3.2-1.4 0 1.4 3.2-1.4'" />
    </template>
    <template v-else-if="node.kind === 'center'">
      <template v-if="showCenterNumber">
        <text class="center-num" y="7">{{ centerDays }}</text>
        <text class="center-unit" y="25">{{ daysUnit }}</text>
      </template>
      <GraphGlyph v-else class="glyph" name="workout" :size="40" />
    </template>

    <!-- 拖放提示圈 -->
    <circle v-if="dropHint" class="drop-hint" :class="dropHint" :r="radius + 18" fill="none" />
    <circle v-if="node.badge" class="badge" :cx="radius * 0.74" :cy="-radius * 0.74" r="9" />
    <text v-if="node.badge" class="badge-text" :x="radius * 0.74" :y="-radius * 0.74 + 3.6">{{ node.badge }}</text>
    <template v-if="showLabel && !showCenterNumber">
      <text class="label" :y="labelOffset">{{ node.label }}</text>
      <text v-if="node.sublabel" class="sublabel" :y="labelOffset + 17">{{ node.sublabel }}</text>
    </template>
  </g>
</template>

<style scoped>
.gnode { cursor: pointer; transition: opacity .28s ease, filter .4s ease; }
.hit { fill: transparent; stroke: none; }
.body { fill: var(--surface-raised); stroke: var(--mat-line); stroke-width: 1; transition: stroke .15s, fill .15s, opacity .15s; }
.wash { pointer-events: none; transition: opacity .25s ease; }
.rim { stroke-width: 1.2; pointer-events: none; }
.glyph { color: var(--tint); transition: color .2s ease; }
.label, .sublabel, .badge-text, .center-num, .center-unit { text-anchor: middle; pointer-events: none; user-select: none; }
/* 标签描一圈底色：压在连线上也读得清（paint-order 先画描边再画字）。
   图谱文字的下限（U17）：节点标签在 100% 缩放下是 15px，不用放大就能读；拥挤靠藏标签、拉间距解决，不再缩字。 */
.label, .sublabel { paint-order: stroke; stroke: var(--surface); stroke-width: 4px; stroke-linejoin: round; stroke-opacity: .85; }
.label { fill: var(--ink); font-size: 15px; font-weight: 650; letter-spacing: .01em; }
.sublabel { fill: var(--subtle); font-size: 12px; font-variant-numeric: tabular-nums; }
.cover { stroke: var(--tint); stroke-width: 2.4; stroke-linecap: round; opacity: .85; transition: opacity .15s; }
/* 日环：有数据的刻度亮成这一类的颜色，缺的天是灰刻度（不是空白，空白会让人以为那里没有这一天）。 */
.tick { fill: none; stroke-linecap: round; transition: stroke .2s ease, opacity .2s ease; }
.tick.on, .tick.part { stroke: var(--tint); }
.tick.off, .tick.plain { stroke: var(--line-strong); }
.tick.today { stroke-width: 3; }
.tick.today.off { stroke: color-mix(in srgb, var(--ink) 38%, transparent); }
.expander { fill: none; stroke: color-mix(in srgb, var(--tint) 70%, var(--muted)); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
.drop-hint { stroke-width: 2; stroke-dasharray: 5 4; }
.drop-hint.include { stroke: var(--accent); }
.drop-hint.exclude { stroke: var(--danger); }
.badge { fill: var(--accent); }
.badge-text { fill: var(--accent-ink); font-size: 10px; font-weight: 700; }

/* 中心：主题盘，品牌色微光更足一点；「最近 N 天」时盘里写数字。 */
.kind-center .body { stroke: color-mix(in srgb, var(--accent) 55%, transparent); stroke-width: 1.4; }
.kind-center .glyph { color: var(--accent); }
.kind-center .label { font-size: 16px; font-weight: 700; }
.center-num { fill: var(--ink); font-size: 30px; font-weight: 750; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.center-unit { fill: var(--muted); font-size: 11.5px; font-weight: 600; letter-spacing: .08em; }

/* 类别：不交给 AI = 图标褪成灰、微光收掉、圆盘虚边。 */
.kind-category:not(.is-included) { opacity: .62; }
.kind-category:not(.is-included) .wash { opacity: 0; }
.kind-category:not(.is-included) .glyph { color: var(--muted); }
.kind-category:not(.is-included) .body { fill: transparent; stroke: var(--line-strong); stroke-dasharray: 3 3.5; }
.kind-category:not(.is-included) .label { font-weight: 500; fill: var(--muted); }
/* 指标 */
.kind-metric .body { fill: var(--surface); }
.kind-metric.is-effective .body { fill: color-mix(in srgb, var(--tint) 30%, var(--surface)); stroke: var(--tint); }
.kind-metric:not(.is-effective) { opacity: .4; }
.kind-metric .label { font-size: 12.5px; font-weight: 500; fill: var(--muted); }
.is-missing .body { stroke: var(--warning); stroke-dasharray: 3 3; }
.is-hovered .body { stroke: color-mix(in srgb, var(--tint) 70%, transparent); stroke-width: 1.8; }
.kind-center.is-hovered .body { stroke: var(--accent); }
.is-dimmed { opacity: .38; }
/* 背景：退远、变糊，但仍能点（点背景里的另一类会飞过去）。 */
.is-backdrop { opacity: .3; filter: blur(1.6px); }
.is-backdrop:hover { opacity: .6; filter: blur(.4px); }
.is-emphasis.kind-metric .label { fill: var(--ink); font-size: 13px; }
.is-emphasis.kind-category .body { stroke: color-mix(in srgb, var(--tint) 60%, transparent); stroke-width: 1.8; }
.is-ghosted { opacity: .22; }
.lift-shadow { pointer-events: none; }
</style>

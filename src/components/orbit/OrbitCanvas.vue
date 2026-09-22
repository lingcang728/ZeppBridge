<!-- BETA1-STUB：S3 的正式 OrbitCanvas 交付前，这里用最朴素的同心圆布局
     让 AiComposer 可以编译并联调 P5 契约。没有力导向、没有碰撞、没有拖拽——
     集成时整个文件由 S3 的实现替换，不要在桩上堆物理。 -->
<script lang="ts">
// BETA1-STUB
/* P5 契约类型（与 beta1.md A7 一致；集成时此类型随 S3 实现迁往 lib/orbit）。
   <script setup> 不能写 ES export，类型从这个普通 script 块出。 */
import type { IconName } from '../Icon.vue';
import type { AiTaskCategory } from '../../lib/bridge/types';

export interface OrbitNode {
  id: string;
  category: AiTaskCategory;
  label: string;
  sublabel?: string;
  icon?: IconName;
  state: 'member' | 'candidate' | 'disabled';
  count?: number;
  orbitSlot?: number;
}
</script>

<script setup lang="ts">
// BETA1-STUB
import { computed, nextTick, onMounted, ref, watch } from 'vue';

defineOptions({ name: 'OrbitCanvas' });

const props = withDefaults(defineProps<{
  center: { label: string; sublabel?: string };
  nodes: OrbitNode[];
  zoom: number;
  activeId?: string | null;
  reducedMotion?: boolean;
  readonly?: boolean;
}>(), {
  activeId: null,
  reducedMotion: undefined,
  readonly: false,
});

const emit = defineEmits<{
  (event: 'node-join', id: string): void;
  (event: 'node-leave', id: string): void;
  (event: 'node-open', id: string): void;
  (event: 'node-focus', id: string | null): void;
  (event: 'update:zoom', zoom: number): void;
  (event: 'undo'): void;
  (event: 'layout-settled'): void;
}>();

/* 固定逻辑画布，缩放靠 viewBox 外的 transform——桩不量真实尺寸。 */
const W = 720;
const H = 540;
const CX = W / 2;
const CY = H / 2;
const R_MEMBER = Math.min(W, H) * 0.30;
const R_CANDIDATE = R_MEMBER * 1.55;

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.8;
const clampZoom = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

interface PlacedNode extends OrbitNode {
  x: number;
  y: number;
  ring: 'member' | 'outer';
}

/** 同心圆布局：member 内环均布，candidate/disabled 外环均布。 */
const placed = computed<PlacedNode[]>(() => {
  const members = props.nodes.filter((node) => node.state === 'member');
  const outer = props.nodes.filter((node) => node.state !== 'member');
  const place = (list: OrbitNode[], radius: number, ring: PlacedNode['ring']) =>
    list.map((node, index) => {
      // 从正上方起顺时针排，orbitSlot 优先（父级可钉位置）。
      const slot = node.orbitSlot ?? index;
      const angle = -Math.PI / 2 + (slot / Math.max(1, list.length)) * Math.PI * 2;
      return { ...node, x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle), ring };
    });
  return [...place(members, R_MEMBER, 'member'), ...place(outer, R_CANDIDATE, 'outer')];
});

const focusIndex = ref(-1);
const focusedId = computed(() => placed.value[focusIndex.value]?.id ?? null);

const setFocus = (index: number) => {
  if (!placed.value.length) return;
  const count = placed.value.length;
  focusIndex.value = ((index % count) + count) % count;
  emit('node-focus', focusedId.value);
};

const openNode = (id: string) => emit('node-open', id);
const joinNode = (id: string) => {
  if (props.readonly) return;
  emit('node-join', id);
};
const leaveNode = (id: string) => {
  if (props.readonly) return;
  emit('node-leave', id);
};

/** 点击：member 打开配置，candidate 加入，disabled 只聚焦。 */
const activateNode = (node: PlacedNode) => {
  focusIndex.value = placed.value.indexOf(node);
  emit('node-focus', node.id);
  if (node.state === 'member') openNode(node.id);
  else if (node.state === 'candidate') joinNode(node.id);
};

const onNodeKeydown = (node: PlacedNode, event: KeyboardEvent) => {
  switch (event.key) {
    case 'Enter':
      event.preventDefault();
      openNode(node.id);
      break;
    case ' ':
    case 'j':
    case 'J':
      event.preventDefault();
      if (node.state === 'member') leaveNode(node.id);
      else if (node.state === 'candidate') joinNode(node.id);
      break;
    case 'Delete':
    case 'Backspace':
      event.preventDefault();
      leaveNode(node.id);
      break;
    case 'ArrowLeft':
      event.preventDefault();
      setFocus(focusIndex.value - 1);
      break;
    case 'ArrowRight':
      event.preventDefault();
      setFocus(focusIndex.value + 1);
      break;
    default:
      break;
  }
};

const onWheel = (event: WheelEvent) => {
  event.preventDefault();
  const step = event.deltaY < 0 ? 0.1 : -0.1;
  emit('update:zoom', clampZoom(props.zoom + step));
};

const onCanvasKeydown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (!props.readonly) emit('undo');
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === '+' || event.key === '=') emit('update:zoom', clampZoom(props.zoom + 0.1));
  else if (event.key === '-') emit('update:zoom', clampZoom(props.zoom - 0.1));
  else if (event.key === '0') emit('update:zoom', 1);
};

const announceSettled = () => void nextTick(() => emit('layout-settled'));
onMounted(announceSettled);
watch(() => props.nodes.map((node) => `${node.id}:${node.state}`).join('|'), announceSettled);
</script>

<template>
  <div
    class="orbit-stub"
    tabindex="0"
    role="application"
    @wheel="onWheel"
    @keydown="onCanvasKeydown"
  >
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      class="orbit-svg"
      :style="{ transform: `scale(${props.zoom})` }"
      role="group"
    >
      <circle :cx="CX" :cy="CY" :r="R_MEMBER" class="orbit-ring" />
      <circle :cx="CX" :cy="CY" :r="R_CANDIDATE" class="orbit-ring outer" />

      <g class="orbit-center">
        <circle :cx="CX" :cy="CY" r="52" class="center-disc" />
        <text :x="CX" :y="CY - 4" text-anchor="middle" class="center-label">{{ center.label }}</text>
        <text v-if="center.sublabel" :x="CX" :y="CY + 16" text-anchor="middle" class="center-sub">{{ center.sublabel }}</text>
      </g>

      <g
        v-for="node in placed"
        :key="node.id"
        :class="['orbit-node', `state-${node.state}`, { 'is-active': node.id === activeId, 'is-focused': node.id === focusedId }]"
        :transform="`translate(${node.x}, ${node.y})`"
        tabindex="0"
        role="button"
        :aria-label="node.label"
        :aria-pressed="node.state === 'member'"
        @click="activateNode(node)"
        @keydown="onNodeKeydown(node, $event)"
        @focus="setFocus(placed.indexOf(node))"
      >
        <circle r="30" class="node-disc" />
        <text text-anchor="middle" y="6" class="node-label">{{ node.label }}</text>
        <text v-if="node.sublabel" text-anchor="middle" y="36" class="node-sub">{{ node.sublabel }}</text>
        <text v-if="node.count !== undefined" text-anchor="middle" y="-34" class="node-count">{{ node.count }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.orbit-stub { display: grid; place-items: center; width: 100%; height: 100%; min-height: 320px; overflow: hidden; outline: none; }
.orbit-stub:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.orbit-svg { width: 100%; height: 100%; transition: transform 120ms ease; }
.orbit-ring { fill: none; stroke: var(--line); stroke-dasharray: 3 6; }
.orbit-ring.outer { opacity: .6; }
.center-disc { fill: var(--surface-raised); stroke: var(--line-strong); }
.center-label { fill: var(--ink); font-size: 15px; font-weight: 600; }
.center-sub { fill: var(--muted); font-size: 12px; }
.orbit-node { cursor: pointer; outline: none; }
.orbit-node .node-disc { fill: var(--surface-raised); stroke: var(--line-control); }
.orbit-node.state-member .node-disc { stroke: var(--accent); fill: var(--accent-soft); }
.orbit-node.state-disabled { opacity: .4; cursor: default; }
.orbit-node.is-focused .node-disc, .orbit-node:focus-visible .node-disc { stroke: var(--focus); stroke-width: 2.4; }
.orbit-node.is-active .node-disc { stroke: var(--accent); stroke-width: 2.4; }
.node-icon { color: var(--muted); }
.state-member .node-icon { color: var(--accent); }
.node-label { fill: var(--ink); font-size: 12.5px; }
.node-sub { fill: var(--subtle); font-size: 11px; }
.node-count { fill: var(--muted); font-size: 11px; }
</style>

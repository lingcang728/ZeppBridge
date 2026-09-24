<script setup lang="ts">
/**
 * Obsidian 风格的二维关系网：中心是任务主题，内圈是要交给 AI 的类别，
 * 外圈是不交的；展开的类别把指标扇形排开，排除的指标被甩到圈外。
 *
 * 交互约定（和旧圆环一致，但实现换掉了）：
 *   - 把类别拖进虚线圈 = 交给 AI；拖出去 = 不交。
 *   - 把指标拖离父类别 = 排除；拖回来 = 保留。
 *   - 点节点 = 弹小面板（天数、含当天、展开指标都在里面）。
 *   - 拖空白 = 平移；滚轮 = 缩放；Ctrl+Z = 撤销。
 *
 * 为什么这次拖拽稳：拖动时只改节点的世界坐标，DOM 顺序和层级一概不动；
 * 指针事件挂在 window 上（不靠 setPointerCapture——旧版就是 DOM 重排把
 * capture 弄丢才拖不动的）；被拖节点原地淡化、顶层画一个影子。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from '../Icon.vue';
import GraphNodeView from './GraphNodeView.vue';
import GraphNodePopover from './GraphNodePopover.vue';
import type { AiTaskCategory } from '../../lib/bridge/types';
import type { GraphModel, GraphNode } from '../../lib/aiTask/graph/model';
import { neighborIds } from '../../lib/aiTask/graph/model';
import {
  createLayout, fitZoom, graphRadii, snapLayout, stepLayout, syncLayout, wakeLayout,
  type LayoutState,
} from '../../lib/aiTask/graph/layout';
import { dropIncludes } from '../../lib/aiTask/graph/hit';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{ model: GraphModel; canUndo: boolean }>();
const emit = defineEmits<{
  (event: 'set-category', category: AiTaskCategory, included: boolean): void;
  (event: 'set-metric', category: AiTaskCategory, metric: string, included: boolean): void;
  (event: 'set-days', category: AiTaskCategory, days: number): void;
  (event: 'set-include-day', category: AiTaskCategory, include: boolean): void;
  (event: 'toggle-expand', category: AiTaskCategory): void;
  (event: 'undo'): void;
}>();

const t = useMessages(defineMessages(
  {
    label: '任务数据关系网',
    zone: '交给 AI',
    hint: '拖节点进圈 = 交给，拖出 = 移出 · 点节点看选项 · 拖空白平移，滚轮缩放',
    undo: '撤销', fit: '适应画布', zoomIn: '放大', zoomOut: '缩小', resetView: '重置视图',
    includeNode: '交给 AI', excludeNode: '不交给 AI',
  },
  {
    label: 'Task data graph',
    zone: 'To the AI',
    hint: 'Drag a node inside the circle to include, out to exclude · click for options · drag empty space to pan, scroll to zoom',
    undo: 'Undo', fit: 'Fit', zoomIn: 'Zoom in', zoomOut: 'Zoom out', resetView: 'Reset view',
    includeNode: 'Include', excludeNode: 'Exclude',
  },
  {
    label: 'Grafo de datos',
    zone: 'A la IA',
    undo: 'Deshacer', fit: 'Ajustar', zoomIn: 'Acercar', zoomOut: 'Alejar', resetView: 'Restablecer',
  },
  'components/ai/TaskGraph',
));

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.8;
const CLICK_TOLERANCE = 6;

const viewport = ref<HTMLElement | null>(null);
const size = ref({ width: 720, height: 540 });
const camera = ref({ x: 0, y: 0, zoom: 1 });
const radii = computed(() => graphRadii(size.value.width, size.value.height));
const layout: LayoutState = createLayout();
const reducedMotion = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const frame = ref(0);
const hoverId = ref<string | null>(null);
const openId = ref<string | null>(null);
const drag = ref<{ id: string; grabX: number; grabY: number; startX: number; startY: number; moved: boolean } | null>(null);
const dropHint = ref<'include' | 'exclude' | null>(null);

/* —— 模拟循环：未收敛或被拖动时逐帧推进，收敛后停下省电 —— */
let raf = 0;
let lastTs = 0;
const tick = (ts: number) => {
  const dt = lastTs ? ts - lastTs : 16.7;
  lastTs = ts;
  stepLayout(layout, props.model, radii.value, dt);
  frame.value += 1;
  if (!layout.settled || drag.value) {
    raf = requestAnimationFrame(tick);
  } else {
    raf = 0;
    lastTs = 0;
  }
};
const wake = () => {
  wakeLayout(layout);
  if (!raf) raf = requestAnimationFrame(tick);
};

watch(
  () => props.model,
  (model) => {
    const fresh = layout.nodes.size === 0;
    syncLayout(layout, model, radii.value);
    if (fresh || reducedMotion) {
      snapLayout(layout, model, radii.value);
      frame.value += 1;
      return;
    }
    if (!raf) raf = requestAnimationFrame(tick);
  },
  { immediate: true },
);
watch(radii, () => wake());

/* —— 坐标换算：viewport 局部 px（自动归一 CSS zoom 差异）↔ 世界 —— */
const toLocal = (event: PointerEvent | WheelEvent) => {
  const rect = viewport.value!.getBoundingClientRect();
  const scale = rect.width > 0 ? size.value.width / rect.width : 1;
  return { x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale };
};
const localToWorld = (p: { x: number; y: number }) => ({
  x: (p.x - size.value.width / 2) / camera.value.zoom + camera.value.x,
  y: (p.y - size.value.height / 2) / camera.value.zoom + camera.value.y,
});
const worldToScreen = (p: { x: number; y: number }) => ({
  x: (p.x - camera.value.x) * camera.value.zoom + size.value.width / 2,
  y: (p.y - camera.value.y) * camera.value.zoom + size.value.height / 2,
});

const cameraTransform = computed(
  () => `translate(${size.value.width / 2 - camera.value.x * camera.value.zoom} ${size.value.height / 2 - camera.value.y * camera.value.zoom}) scale(${camera.value.zoom})`,
);

const pos = (id: string) => layout.nodes.get(id) ?? { x: 0, y: 0, vx: 0, vy: 0, dragging: false };
const positioned = computed(() => {
  void frame.value;
  return props.model.nodes.map((node) => ({ node, ...pos(node.id) }));
});
const nodeById = computed(() => new Map(props.model.nodes.map((node) => [node.id, node])));
const linkLines = computed(() => {
  void frame.value;
  return props.model.links.map((link) => {
    const a = pos(link.source);
    const b = pos(link.target);
    return { ...link, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
});
const dimSet = computed(() => {
  void frame.value;
  const focus = drag.value?.id ?? hoverId.value;
  return focus ? neighborIds(props.model, focus) : null;
});
const isDim = (id: string) => dimSet.value !== null && !dimSet.value.has(id);
const openNode = computed(() => (openId.value ? nodeById.value.get(openId.value) ?? null : null));
const openAnchor = computed(() => {
  void frame.value;
  return openId.value ? worldToScreen(pos(openId.value)) : { x: 0, y: 0 };
});
const ghostNode = computed(() =>
  drag.value?.moved ? positioned.value.find((entry) => entry.node.id === drag.value!.id) ?? null : null);
/** 拖指标时父节点亮一下——要拖回来/拖出去都看它。 */
const dragParentId = computed(() => {
  const id = drag.value?.id;
  return id ? nodeById.value.get(id)?.parentId ?? null : null;
});

/* —— 节点拖动（window 监听，不用 pointer capture） —— */
const updateDropHint = () => {
  const id = drag.value?.id;
  const node = id ? nodeById.value.get(id) : null;
  if (!id || !node) {
    dropHint.value = null;
    return;
  }
  const include = dropIncludes(node, pos(id), node.parentId ? pos(node.parentId) : null, radii.value);
  dropHint.value = include === null ? null : include ? 'include' : 'exclude';
};
const onNodeDown = (event: PointerEvent, node: GraphNode) => {
  if (event.button !== 0) return;
  event.stopPropagation();
  event.preventDefault();
  // 中心是分析对象不是开关：不进入拖拽，点击直接开面板。
  if (node.kind === 'center') {
    openId.value = openId.value === node.id ? null : node.id;
    return;
  }
  const local = toLocal(event);
  const world = localToWorld(local);
  const item = pos(node.id);
  drag.value = { id: node.id, grabX: item.x - world.x, grabY: item.y - world.y, startX: local.x, startY: local.y, moved: false };
  item.dragging = true;
  openId.value = null;
  wake();
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd, { once: true });
  window.addEventListener('pointercancel', onDragEnd, { once: true });
};
const onDragMove = (event: PointerEvent) => {
  const active = drag.value;
  if (!active) return;
  const local = toLocal(event);
  const world = localToWorld(local);
  const item = pos(active.id);
  item.x = world.x + active.grabX;
  item.y = world.y + active.grabY;
  // 起步判定用累计位移：超过阈值才算「拖」，不然算点击。
  active.moved = active.moved
    || Math.hypot(local.x - active.startX, local.y - active.startY) >= CLICK_TOLERANCE;
  updateDropHint();
  frame.value += 1;
};
const onDragEnd = () => {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointercancel', onDragEnd);
  const active = drag.value;
  drag.value = null;
  dropHint.value = null;
  if (!active) return;
  const node = nodeById.value.get(active.id);
  const item = pos(active.id);
  item.dragging = false;
  if (!node) return;
  if (!active.moved) {
    openId.value = active.id === openId.value ? null : active.id;
    wake();
    return;
  }
  const include = dropIncludes(node, item, node.parentId ? pos(node.parentId) : null, radii.value);
  if (include !== null) {
    if (node.kind === 'category' && node.category && include !== node.included) {
      emit('set-category', node.category, include);
    } else if (node.kind === 'metric' && node.category && node.metric && include !== node.included) {
      emit('set-metric', node.category, node.metric, include);
    }
  }
  wake();
};

/* —— 空白拖动 = 平移 —— */
let pan: { x: number; y: number; camX: number; camY: number } | null = null;
const onBackgroundDown = (event: PointerEvent) => {
  if (event.button !== 0) return;
  const local = toLocal(event);
  pan = { x: local.x, y: local.y, camX: camera.value.x, camY: camera.value.y };
  window.addEventListener('pointermove', onPanMove);
  window.addEventListener('pointerup', onPanEnd, { once: true });
};
const onPanMove = (event: PointerEvent) => {
  if (!pan) return;
  const local = toLocal(event);
  camera.value = {
    ...camera.value,
    x: pan.camX - (local.x - pan.x) / camera.value.zoom,
    y: pan.camY - (local.y - pan.y) / camera.value.zoom,
  };
};
const onPanEnd = () => {
  window.removeEventListener('pointermove', onPanMove);
  pan = null;
};

/* —— 缩放 —— */
const zoomTo = (zoom: number, local?: { x: number; y: number }) => {
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  if (!local || Math.abs(next - camera.value.zoom) < 1e-6) {
    camera.value = { ...camera.value, zoom: next };
    return;
  }
  const center = { x: size.value.width / 2, y: size.value.height / 2 };
  camera.value = {
    zoom: next,
    x: camera.value.x + (local.x - center.x) * (1 / camera.value.zoom - 1 / next),
    y: camera.value.y + (local.y - center.y) * (1 / camera.value.zoom - 1 / next),
  };
};
const onWheel = (event: WheelEvent) => zoomTo(camera.value.zoom * Math.exp(-event.deltaY * 0.0012), toLocal(event));
const fit = () => {
  camera.value = { x: 0, y: 0, zoom: 1 };
  zoomTo(fitZoom(layout, size.value.width, size.value.height));
};

/* —— 键盘 —— */
const onKeydown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    emit('undo');
  } else if (event.key === 'Escape') {
    openId.value = null;
  }
};
const onNodeKey = (event: KeyboardEvent, node: GraphNode) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openId.value = node.id;
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && node.kind !== 'center') {
    event.preventDefault();
    if (node.kind === 'category' && node.category) emit('set-category', node.category, !node.included);
    if (node.kind === 'metric' && node.category && node.metric) emit('set-metric', node.category, node.metric, !node.included);
  }
};

let observer: ResizeObserver | undefined;
onMounted(() => {
  if (!viewport.value) return;
  observer = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect;
    if (box && box.width > 0 && box.height > 0) size.value = { width: box.width, height: box.height };
  });
  observer.observe(viewport.value);
  size.value = { width: viewport.value.clientWidth || 720, height: viewport.value.clientHeight || 540 };
});
onBeforeUnmount(() => {
  observer?.disconnect();
  cancelAnimationFrame(raf);
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointermove', onPanMove);
});
</script>

<template>
  <div ref="viewport" class="graph" role="application" :aria-label="t.label" tabindex="0" @keydown="onKeydown">
    <svg class="canvas" :width="size.width" :height="size.height" @pointerdown="onBackgroundDown" @wheel.prevent="onWheel">
      <g :transform="cameraTransform">
        <circle class="zone" :r="radii.boundary" />
        <circle class="ring-inner" :r="radii.inner" />
        <text class="zone-label" :y="-radii.boundary + 18">{{ t.zone }}</text>
        <line v-for="link in linkLines" :key="link.id" :class="['link', { 'is-active': link.active }]"
          :x1="link.x1" :y1="link.y1" :x2="link.x2" :y2="link.y2" />
        <GraphNodeView v-for="entry in positioned" :key="entry.node.id" :node="entry.node" :x="entry.x" :y="entry.y"
          :hovered="hoverId === entry.node.id || dragParentId === entry.node.id"
          :dimmed="isDim(entry.node.id)" :ghosted="drag?.id === entry.node.id && drag.moved"
          tabindex="0" role="button" :aria-pressed="entry.node.included"
          @pointerdown="onNodeDown($event, entry.node)" @keydown="onNodeKey($event, entry.node)"
          @pointerenter="hoverId = entry.node.id" @pointerleave="hoverId = null" />
        <GraphNodeView v-if="ghostNode" :node="ghostNode.node" :x="ghostNode.x" :y="ghostNode.y"
          :drop-hint="dropHint" class="ghost" />
      </g>
    </svg>

    <div class="toolbar">
      <button type="button" class="ai-tool" :disabled="!canUndo" @click="emit('undo')"><Icon name="undo" :size="13" />{{ t.undo }}</button>
      <span class="gap" />
      <button type="button" class="ai-tool" :aria-label="t.zoomOut" @click="zoomTo(camera.zoom - 0.15)">−</button>
      <button type="button" class="ai-tool" @click="zoomTo(1); camera.x = 0; camera.y = 0">{{ t.resetView }}</button>
      <button type="button" class="ai-tool" :aria-label="t.zoomIn" @click="zoomTo(camera.zoom + 0.15)">+</button>
      <button type="button" class="ai-tool" @click="fit">{{ t.fit }}</button>
    </div>
    <p class="hint">{{ t.hint }}</p>

    <GraphNodePopover v-if="openNode" :node="openNode" :anchor="openAnchor" :viewport="size"
      @close="openId = null" @set-category="emit('set-category', openNode!.category!, $event)"
      @set-metric="emit('set-metric', openNode!.category!, openNode!.metric!, $event)"
      @set-days="emit('set-days', openNode!.category!, $event)"
      @set-include-day="emit('set-include-day', openNode!.category!, $event)"
      @toggle-expand="emit('toggle-expand', openNode!.category!)" />
  </div>
</template>

<style scoped>
.graph { position: relative; height: 100%; min-height: 480px; overflow: hidden; border-radius: var(--radius-md); outline: none; touch-action: none; }
.graph:focus-visible { box-shadow: 0 0 0 2px var(--focus); }
.canvas { display: block; cursor: grab; }
.canvas:active { cursor: grabbing; }
.zone { fill: color-mix(in srgb, var(--accent) 4%, transparent); stroke: var(--accent); stroke-width: 1.4; stroke-dasharray: 7 6; opacity: .8; }
.ring-inner { fill: none; stroke: var(--line); stroke-dasharray: 2 6; }
.zone-label { fill: var(--accent); font-size: 11px; font-weight: 600; text-anchor: middle; opacity: .8; pointer-events: none; }
.link { stroke: var(--line); stroke-width: 1; }
.link.is-active { stroke: color-mix(in srgb, var(--accent) 55%, transparent); stroke-width: 1.6; }
.ghost { pointer-events: none; }
.gnode:focus-visible { outline: none; }
.gnode:focus-visible .body { stroke: var(--focus); stroke-width: 2.5; }
.toolbar { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; gap: 6px; pointer-events: none; }
.toolbar .ai-tool { pointer-events: auto; background: color-mix(in srgb, var(--surface) 88%, transparent); }
.gap { flex: 1; }
.hint { position: absolute; left: 12px; right: 12px; bottom: 8px; margin: 0; color: var(--subtle); font-size: var(--fs-xs); text-align: center; pointer-events: none; }
</style>

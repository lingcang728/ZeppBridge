<script setup lang="ts">
/**
 * Obsidian 风格的二维关系网：中心是任务主题，内圈是要交给 AI 的类别，
 * 外圈是不交的；展开的类别把指标扇形排开，排除的指标被甩到圈外。
 *
 * 交互约定：
 *   - 把类别拖进虚线圈 = 交给 AI；拖出去 = 不交。
 *   - 把指标拖离父类别 = 排除；拖回来 = 保留。
 *   - 点节点 = 弹小面板（天数、含当天、展开指标都在里面）。
 *   - 展开某一类 = 镜头从上方俯冲进这一类，其余节点退成模糊的背景；
 *     左上角「全部类别」或 Esc 飞回全景。
 *   - 拖空白 = 平移；Ctrl+滚轮 = 缩放；Ctrl+Z = 撤销。
 *
 * 为什么拖拽稳：拖动时只改节点的世界坐标，DOM 顺序和层级一概不动；
 * 指针事件挂在 window 上（不靠 setPointerCapture）；被拖节点原地淡化、顶层画影子。
 *
 * 为什么不再闪：悬停聚焦要停稳 160ms 才生效、离开也缓 120ms 才撤，而且淡入淡出
 * 有过渡。以前一碰到节点就把其余全部压到 22% 不透明度——鼠标扫过一片密集的
 * 指标点，或者布局还在收敛、节点从静止的光标底下滑过，整张图就一亮一暗地频闪。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from '../Icon.vue';
import GraphNodeView from './GraphNodeView.vue';
import GraphNodePopover from './GraphNodePopover.vue';
import type { AiTaskCategory } from '../../lib/bridge/types';
import type { GraphModel, GraphNode } from '../../lib/aiTask/graph/model';
import { categoryNodeId, neighborIds } from '../../lib/aiTask/graph/model';
import {
  createLayout, fitZoom, focusFrame, graphRadii, snapLayout, stepLayout, syncLayout, wakeLayout,
  type LayoutState,
} from '../../lib/aiTask/graph/layout';
import { dropIncludes } from '../../lib/aiTask/graph/hit';
import { useGraphCamera } from '../../composables/useGraphCamera';
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
    hint: '拖入圆圈以选用，拖出以移除 · 点击节点查看选项 · 拖动空白处平移',
    undo: '撤销', fit: '适应画布', zoomIn: '放大', zoomOut: '缩小', resetView: '重置视图',
    includeNode: '交给 AI', excludeNode: '不交给 AI',
    backToAll: '全部类别',
    dismissHint: '知道了',
  },
  {
    label: 'Task data graph',
    zone: 'To the AI',
    hint: 'Drag into the circle to include, out to remove · Click for options · Drag empty space to pan',
    undo: 'Undo', fit: 'Fit', zoomIn: 'Zoom in', zoomOut: 'Zoom out', resetView: 'Reset view',
    includeNode: 'Include', excludeNode: 'Exclude',
    backToAll: 'All categories',
    dismissHint: 'Got it',
  },
  {
    label: 'Grafo de datos',
    zone: 'A la IA',
    hint: 'Arrastra al círculo para incluir, fuera para quitar · Haz clic para ver opciones · Arrastra el fondo para desplazar',
    undo: 'Deshacer', fit: 'Ajustar', zoomIn: 'Acercar', zoomOut: 'Alejar', resetView: 'Restablecer',
    backToAll: 'Todas las categorías',
    dismissHint: 'Entendido',
  },
  'components/ai/TaskGraph',
));

/** 起拖的门槛：小于它算点击。指标点很小，手一抖就成了拖动，所以比以前的 6px 宽一些。 */
const CLICK_TOLERANCE = 9;
const HOVER_IN_MS = 160;
const HOVER_OUT_MS = 120;

const viewport = ref<HTMLElement | null>(null);
const size = ref({ width: 720, height: 540 });
const radii = computed(() => graphRadii(size.value.width, size.value.height));
const layout: LayoutState = createLayout();
const reducedMotion = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const { camera, flying, flyTo, zoomAt, cancel: cancelFlight } = useGraphCamera();

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

/* —— 聚焦：展开的那一类。展开新的一类就飞过去，收起它就飞回全景。 —— */
const focusId = ref<string | null>(null);
const expandedIds = (model: GraphModel) =>
  new Set(model.nodes.filter((node) => node.kind === 'category' && node.expanded).map((node) => node.id));
const focusGroup = computed(() => {
  const id = focusId.value;
  if (!id) return null;
  const set = new Set([id]);
  for (const node of props.model.nodes) if (node.parentId === id) set.add(node.id);
  return set;
});
const flyToFocus = (id: string) => {
  // 俯冲的时候把小面板收掉：它挡着要飞进去的那一片，而且锚点跟着镜头飘。
  openId.value = null;
  const target = focusFrame(props.model, id, radii.value, size.value);
  if (target) void flyTo(target);
};
const flyHome = () => { void flyTo({ x: 0, y: 0, zoom: 1 }); };
const leaveFocus = () => {
  const node = focusId.value ? props.model.nodes.find((entry) => entry.id === focusId.value) : null;
  focusId.value = null;
  openId.value = null;
  flyHome();
  if (node?.category && node.expanded) emit('toggle-expand', node.category);
};

watch(
  () => props.model,
  (model, previous) => {
    const fresh = layout.nodes.size === 0;
    syncLayout(layout, model, radii.value);
    if (fresh || reducedMotion) {
      snapLayout(layout, model, radii.value);
      frame.value += 1;
    } else if (!raf) {
      raf = requestAnimationFrame(tick);
    }
    const now = expandedIds(model);
    const before = previous ? expandedIds(previous) : new Set<string>();
    const opened = [...now].find((id) => !before.has(id));
    if (opened) {
      focusId.value = opened;
      flyToFocus(opened);
    } else if (focusId.value && !now.has(focusId.value)) {
      focusId.value = null;
      flyHome();
    }
  },
  { immediate: true },
);
watch(radii, () => {
  wake();
  if (focusId.value) flyToFocus(focusId.value);
});

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

/* 悬停高亮：停稳一小会儿才生效，离开也缓一下才撤。聚焦某一类时不做悬停高亮——
   层级已经由「聚焦 / 背景」表达了，再叠一层明暗只会更乱。 */
let hoverTimer = 0;
const onNodeEnter = (id: string) => {
  window.clearTimeout(hoverTimer);
  hoverTimer = window.setTimeout(() => { hoverId.value = id; }, hoverId.value ? 0 : HOVER_IN_MS);
};
const onNodeLeave = () => {
  window.clearTimeout(hoverTimer);
  hoverTimer = window.setTimeout(() => { hoverId.value = null; }, HOVER_OUT_MS);
};
const dimSet = computed(() => {
  if (focusGroup.value) return null;
  const focus = drag.value?.id ?? hoverId.value;
  if (!focus || focus === 'center') return null;
  return neighborIds(props.model, focus);
});
const isDim = (id: string) => dimSet.value !== null && !dimSet.value.has(id);
const isBackdrop = (id: string) => focusGroup.value !== null && !focusGroup.value.has(id);
const linkBackdrop = (source: string, target: string) =>
  focusGroup.value !== null && !(focusGroup.value.has(source) && focusGroup.value.has(target));

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
const focusNode = computed(() => (focusId.value ? nodeById.value.get(focusId.value) ?? null : null));

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
  // 聚焦时点背景里的另一类：直接飞到那一类去（展开它），不是拖它。
  if (isBackdrop(node.id) && node.kind === 'category' && node.category && node.expandable) {
    const current = focusNode.value;
    if (current?.category && current.expanded) emit('toggle-expand', current.category);
    emit('toggle-expand', node.category);
    return;
  }
  cancelFlight();
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
  // 起步判定用累计位移：超过阈值才算「拖」，不然算点击；没起步之前节点不动。
  active.moved = active.moved
    || Math.hypot(local.x - active.startX, local.y - active.startY) >= CLICK_TOLERANCE;
  if (!active.moved) return;
  const world = localToWorld(local);
  const item = pos(active.id);
  item.x = world.x + active.grabX;
  item.y = world.y + active.grabY;
  updateDropHint();
  frame.value += 1;
};
const onDragEnd = (event?: Event) => {
  window.removeEventListener('pointerup', onDragEnd);
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
  if (event && event.type !== 'pointerup') { wake(); return; }
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
  cancelFlight();
  openId.value = null;
  const local = toLocal(event);
  pan = { x: local.x, y: local.y, camX: camera.value.x, camY: camera.value.y };
  window.addEventListener('pointermove', onPanMove);
  window.addEventListener('pointerup', onPanEnd, { once: true });
  window.addEventListener('pointercancel', onPanEnd, { once: true });
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
  window.removeEventListener('pointerup', onPanEnd);
  window.removeEventListener('pointercancel', onPanEnd);
  window.removeEventListener('pointermove', onPanMove);
  pan = null;
};

/* —— 缩放：Ctrl+滚轮以光标为锚；不按 Ctrl 的滚轮留给页面滚动 —— */
const onWheel = (event: WheelEvent) => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  zoomAt(camera.value.zoom * Math.exp(-event.deltaY * 0.0015), size.value, toLocal(event));
};
const stepZoom = (factor: number) => zoomAt(camera.value.zoom * factor, size.value);
const fit = () => {
  if (focusId.value) { flyToFocus(focusId.value); return; }
  void flyTo({ x: 0, y: 0, zoom: fitZoom(layout, size.value.width, size.value.height) });
};

/* —— 首次使用的提示：一枚可以关掉的小胶囊，关掉就记住。 —— */
const HINT_KEY = 'zeppbridge-graph-hint-seen';
const hintVisible = ref(true);
try { hintVisible.value = window.localStorage.getItem(HINT_KEY) !== '1'; } catch { /* 读不到就照常显示 */ }
const dismissHint = () => {
  hintVisible.value = false;
  try { window.localStorage.setItem(HINT_KEY, '1'); } catch { /* 记不住就下次再显示 */ }
};

/* —— 键盘 —— */
const onKeydown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    emit('undo');
  } else if (event.key === 'Escape') {
    if (openId.value) openId.value = null;
    else if (focusId.value) leaveFocus();
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

const onBlur = (event: Event) => { onDragEnd(event); onPanEnd(); };
const onVisibility = () => { if (document.hidden) onBlur(new Event('blur')); };
let observer: ResizeObserver | undefined;
onMounted(() => {
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  if (!viewport.value) return;
  viewport.value.addEventListener('wheel', onWheel, { passive: false });
  observer = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect;
    if (box && box.width > 0 && box.height > 0) size.value = { width: box.width, height: box.height };
  });
  observer.observe(viewport.value);
  size.value = { width: viewport.value.clientWidth || 720, height: viewport.value.clientHeight || 540 };
});
onBeforeUnmount(() => {
  observer?.disconnect();
  viewport.value?.removeEventListener('wheel', onWheel);
  onBlur(new Event('blur'));
  window.clearTimeout(hoverTimer);
  window.removeEventListener('blur', onBlur);
  document.removeEventListener('visibilitychange', onVisibility);
  cancelAnimationFrame(raf);
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointermove', onPanMove);
});

defineExpose({ focusCategory: (category: AiTaskCategory) => flyToFocus(categoryNodeId(category)) });
</script>

<template>
  <div :class="['graph', { 'is-focused': focusId, 'is-flying': flying }]" role="application" :aria-label="t.label" tabindex="0" @keydown="onKeydown">
    <div ref="viewport" class="canvas-wrap">
      <svg class="canvas" :width="size.width" :height="size.height" @pointerdown="onBackgroundDown">
        <defs>
          <radialGradient id="zone-fill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity=".16" />
            <stop offset="70%" stop-color="var(--accent)" stop-opacity=".05" />
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
          </radialGradient>
        </defs>
        <g :transform="cameraTransform">
          <g class="scenery">
            <circle class="zone-glow" :r="radii.boundary * 1.08" fill="url(#zone-fill)" />
            <circle class="zone" :r="radii.boundary" />
            <circle class="ring-inner" :r="radii.inner" />
            <text class="zone-label" :y="-radii.boundary + 18">{{ t.zone }}</text>
          </g>
          <line v-for="link in linkLines" :key="link.id"
            :class="['link', { 'is-active': link.active, 'is-backdrop': linkBackdrop(link.source, link.target) }]"
            :x1="link.x1" :y1="link.y1" :x2="link.x2" :y2="link.y2" />
          <GraphNodeView v-for="entry in positioned" :key="entry.node.id" :node="entry.node" :x="entry.x" :y="entry.y"
            :hovered="hoverId === entry.node.id || dragParentId === entry.node.id"
            :dimmed="isDim(entry.node.id)" :backdrop="isBackdrop(entry.node.id)"
            :ghosted="drag?.id === entry.node.id && drag.moved"
            :emphasis="focusId !== null && !isBackdrop(entry.node.id)"
            tabindex="0" role="button" :aria-pressed="entry.node.included"
            @pointerdown="onNodeDown($event, entry.node)" @keydown="onNodeKey($event, entry.node)"
            @pointerenter="onNodeEnter(entry.node.id)" @pointerleave="onNodeLeave" />
          <GraphNodeView v-if="ghostNode" :node="ghostNode.node" :x="ghostNode.x" :y="ghostNode.y"
            :drop-hint="dropHint" class="ghost" />
        </g>
      </svg>

      <!-- 浮在画布上的玻璃控件：左上是层级面包屑，右下是镜头，左下是撤销。 -->
      <Transition name="crumb">
        <button v-if="focusNode" type="button" class="crumb glass-control" @click="leaveFocus">
          <Icon name="arrow-left" :size="15" />
          <span class="crumb-root">{{ t.backToAll }}</span>
          <span class="crumb-sep" aria-hidden="true">/</span>
          <strong>{{ focusNode.label }}</strong>
        </button>
      </Transition>

      <Transition name="crumb">
        <div v-if="hintVisible && !focusNode" class="hint glass-control" role="note">
          <span>{{ t.hint }}</span>
          <button type="button" class="hint-close" @click="dismissHint">{{ t.dismissHint }}</button>
        </div>
      </Transition>

      <div class="dock dock-left">
        <button type="button" class="undo-pill glass-control" :disabled="!canUndo" :title="`${t.undo} · Ctrl+Z`" @click="emit('undo')">
          <Icon name="undo" :size="15" /><span>{{ t.undo }}</span>
        </button>
      </div>
      <div class="dock dock-right glass-control">
        <button type="button" class="dock-btn" :aria-label="t.zoomOut" :title="t.zoomOut" @click="stepZoom(1 / 1.2)">−</button>
        <button type="button" class="dock-btn" :aria-label="t.fit" :title="t.fit" @click="fit"><Icon name="compass" :size="15" /></button>
        <button type="button" class="dock-btn" :aria-label="t.zoomIn" :title="t.zoomIn" @click="stepZoom(1.2)">+</button>
      </div>

      <GraphNodePopover v-if="openNode" :node="openNode" :anchor="openAnchor" :viewport="size"
        @close="openId = null" @set-category="emit('set-category', openNode!.category!, $event)"
        @set-metric="emit('set-metric', openNode!.category!, openNode!.metric!, $event)"
        @set-days="emit('set-days', openNode!.category!, $event)"
        @set-include-day="emit('set-include-day', openNode!.category!, $event)"
        @toggle-expand="emit('toggle-expand', openNode!.category!)" />
    </div>
  </div>
</template>

<style scoped>
.graph { position: relative; height: 100%; min-height: 480px; overflow: hidden; border-radius: inherit; outline: none; touch-action: pan-y; }
.graph:focus-visible { box-shadow: inset 0 0 0 2px var(--focus); }
.canvas-wrap { position: absolute; inset: 0; overflow: hidden; }
.canvas { display: block; width: 100%; height: 100%; cursor: grab; }
.canvas:active { cursor: grabbing; }

.zone { fill: none; stroke: var(--accent); stroke-width: 1.4; stroke-dasharray: 7 6; opacity: .75; }
.ring-inner { fill: none; stroke: var(--line); stroke-dasharray: 2 6; }
.zone-label { fill: var(--accent); font-size: 11px; font-weight: 600; letter-spacing: .08em; text-anchor: middle; opacity: .85; pointer-events: none; }
.scenery { transition: opacity .45s ease, filter .45s ease; }
.link { stroke: var(--line); stroke-width: 1; transition: opacity .35s ease, stroke .2s ease; }
.link.is-active { stroke: color-mix(in srgb, var(--accent) 55%, transparent); stroke-width: 1.6; }
.link.is-backdrop { opacity: .18; }
.ghost { pointer-events: none; }

/* 聚焦时：舞台（圈、标签）退到背景里，变糊变淡；镜头飞的那一段再多糊一点，像俯冲时的运动模糊。 */
.graph.is-focused .scenery { opacity: .35; filter: blur(2.5px); }
.graph.is-flying :deep(.gnode.is-backdrop) { filter: blur(3px); }

/* —— 浮在画布上的玻璃控件 —— */
.crumb {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 16px 0 12px;
  border-radius: 999px;
  color: var(--ink);
  font-size: var(--fs-sm);
  cursor: pointer;
}
.crumb-root { color: var(--muted); }
.crumb-sep { color: var(--subtle); }
.crumb:active { scale: .97; }
.hint {
  position: absolute;
  top: 14px;
  left: 50%;
  z-index: 3;
  display: flex;
  max-width: calc(100% - 28px);
  align-items: center;
  gap: 12px;
  padding: 7px 8px 7px 16px;
  border-radius: 999px;
  color: var(--muted);
  font-size: var(--fs-xs);
  translate: -50% 0;
}
.hint span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hint-close { flex: 0 0 auto; padding: 4px 12px; border: 0; border-radius: 999px; background: var(--glass-press); color: var(--ink); font-size: var(--fs-xs); cursor: pointer; }
.dock { position: absolute; bottom: 14px; z-index: 3; display: flex; align-items: center; }
.dock-left { left: 14px; }
.dock-right { right: 14px; gap: 2px; padding: 3px; border-radius: 999px; }
.undo-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 16px;
  border-radius: 999px;
  color: var(--ink);
  font-size: var(--fs-sm);
  cursor: pointer;
  transition: opacity var(--dur-base) ease, scale var(--dur-fast) var(--ease-out);
}
.undo-pill:disabled { opacity: .4; cursor: default; }
.undo-pill:active:not(:disabled) { scale: .96; }
.dock-btn { display: grid; width: 34px; height: 34px; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--ink); font-size: 18px; line-height: 1; cursor: pointer; }
.dock-btn:hover { background: var(--glass-press); }

.crumb-enter-active, .crumb-leave-active { transition: opacity .28s ease, translate .38s var(--ease-out), filter .28s ease; }
.crumb-enter-from, .crumb-leave-to { opacity: 0; filter: blur(6px); }
.crumb.crumb-enter-from, .crumb.crumb-leave-to { translate: -8px 0; }
</style>

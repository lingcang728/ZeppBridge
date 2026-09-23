<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  shallowRef,
  useId,
  watch,
} from 'vue';
import Icon from '../Icon.vue';
import { defineMessages, useMessages } from '../../i18n';
import {
  CENTER_RADIUS,
  LABEL_GAP,
  NODE_RADIUS,
  createSim,
  snapToAnchors,
  step,
  syncSim,
  type OrbitSimNode,
  type OrbitSimState,
} from '../../lib/orbit/simulation';
import { classifyDrop, dragIntentFor, hitThresholds } from '../../lib/orbit/hit';
import {
  clampZoom,
  clientToView,
  panForZoom,
  pointerToWorld,
  zoomFromWheel,
  type Vec,
} from '../../lib/orbit/zoom';
import { effectiveReducedMotion, systemReducedMotion, watchReducedMotion } from '../../lib/orbit/motion';
import {
  orbitIconFor,
  type OrbitCanvasEmits,
  type OrbitCanvasProps,
  type OrbitNode,
  type OrbitNodeState,
} from '../../lib/orbit/types';

const messages = defineMessages(
  {
    canvasLabel: (center: string) => `任务图谱：${center}`,
    canvasHint:
      'Tab 移到节点；回车打开；空格或 J 切换加入；Delete 移出；左右方向键按角度移动焦点；加减键缩放；0 重置视图；Ctrl+Z 撤销',
    stateMember: '已加入',
    stateCandidate: '候选',
    stateDisabled: '不可用',
    nodeAria: (label: string, state: string, count: number | null) =>
      count === null ? `${label}，${state}` : `${label}，${state}，${count} 项`,
    zoomIn: '放大',
    zoomOut: '缩小',
    resetView: '重置视图',
  },
  {
    canvasLabel: (center: string) => `Task graph: ${center}`,
    canvasHint:
      'Tab to a node; Enter opens; Space or J toggles membership; Delete removes; Left/Right move focus along the ring; +/- zoom; 0 resets the view; Ctrl+Z undoes',
    stateMember: 'added',
    stateCandidate: 'candidate',
    stateDisabled: 'unavailable',
    nodeAria: (label: string, state: string, count: number | null) =>
      count === null ? `${label}, ${state}` : `${label}, ${state}, ${count} items`,
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetView: 'Reset view',
  },
  {
    canvasLabel: (center: string) => `Gráfico de la tarea: ${center}`,
    stateMember: 'añadido',
    stateCandidate: 'candidato',
    stateDisabled: 'no disponible',
    nodeAria: (label: string, state: string, count: number | null) =>
      count === null ? `${label}, ${state}` : `${label}, ${state}, ${count} elementos`,
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    resetView: 'Restablecer vista',
  },
  'components/orbit/OrbitCanvas',
);
const t = useMessages(messages);

/*
 * Contract P5: the canvas owns the local 2D simulation and view state only.
 * Join/leave/undo arrive here as pointer/keyboard input and leave as *intent*
 * emits; the parent flips `nodes[].state` and the sim re-flows.
 */
const props = withDefaults(defineProps<OrbitCanvasProps>(), {
  activeId: null,
  readonly: false,
});
const emit = defineEmits<OrbitCanvasEmits>();

const hostEl = ref<HTMLElement | null>(null);
/** Container px = viewBox units (1:1). Sensible default so SSR/first paint lays out. */
const viewSize = ref({ w: 800, h: 600 });
const pan = ref<Vec>({ x: 0, y: 0 });
const hintId = useId();

const metaById = computed(() => new Map(props.nodes.map((n) => [n.id, n])));
const thresholds = computed(() => hitThresholds(viewSize.value.w, viewSize.value.h));
const memberR = computed(() => thresholds.value.memberR);
const candidateR = computed(() => thresholds.value.candidateR);
const centerPx = computed<Vec>(() => ({ x: viewSize.value.w / 2, y: viewSize.value.h / 2 }));
const rootTransform = computed(
  () => `translate(${centerPx.value.x + pan.value.x} ${centerPx.value.y + pan.value.y}) scale(${props.zoom})`,
);

/* ── Simulation lifecycle ─────────────────────────────────────────── */

// Created in setup (not onMounted) so SSR renders nodes on their anchors.
const sim = shallowRef<OrbitSimState>(createSim(props.nodes, viewSize.value.w, viewSize.value.h));
/** Positions live in the plain sim object; this bumps Vue once per frame. */
const frameVersion = ref(0);
const systemRM = ref(systemReducedMotion());
const reduced = computed(() => effectiveReducedMotion(props.reducedMotion, () => systemRM.value));

let rafId = 0;
let lastTs = 0;
let running = false;
/** layout-settled fires on every settle *transition*; starts un-emitted. */
let settledEmitted = false;

/** Dev-aid frame probe (exposed; OrbitLab polls it — not part of the P5 emits). */
const frameStats = {
  lastMs: 0,
  avgMs: 0,
  maxMs: 0,
  windowFrames: 0,
  tick: 0,
  running: false,
  settled: true,
};
let statAcc = 0;
let statMax = 0;
let statN = 0;
const recordFrame = (ms: number) => {
  statAcc += ms;
  statN += 1;
  if (ms > statMax) statMax = ms;
  frameStats.lastMs = ms;
  frameStats.tick = sim.value.tick;
  frameStats.running = running;
  frameStats.settled = sim.value.settled;
  if (statN >= 60) {
    frameStats.avgMs = statAcc / statN;
    frameStats.maxMs = statMax;
    frameStats.windowFrames = statN;
    statAcc = 0;
    statN = 0;
    statMax = 0;
  }
};
defineExpose({ frameStats });

const emitSettled = () => {
  if (settledEmitted) return;
  settledEmitted = true;
  frameStats.settled = true;
  emit('layout-settled');
};

const loop = (ts: number) => {
  rafId = 0;
  const dt = lastTs === 0 ? 16.7 : ts - lastTs;
  lastTs = ts;
  const t0 = performance.now();
  step(sim.value, dt);
  recordFrame(performance.now() - t0);
  frameVersion.value += 1;
  if (sim.value.settled && drag.id === null) {
    running = false;
    frameStats.running = false;
    emitSettled();
    return;
  }
  rafId = window.requestAnimationFrame(loop);
};

const wake = () => {
  if (running || reduced.value || typeof window === 'undefined') return;
  settledEmitted = false;
  running = true;
  lastTs = 0;
  rafId = window.requestAnimationFrame(loop);
};

const stopLoop = () => {
  if (rafId !== 0) window.cancelAnimationFrame(rafId);
  rafId = 0;
  running = false;
  frameStats.running = false;
};

/*
 * The member/candidate layer sort reorders <g> elements in the DOM; Chromium
 * drops focus when a focused element is moved (blur → activeElement=body).
 * Remember which node held focus across a rebuild and put it back post-patch,
 * so Space/Delete/Ctrl+Z keep working on the node the user is on.
 */
let refocusNodeId: string | null = null;

const rebuildSim = () => {
  const focused =
    typeof document !== 'undefined' && document.activeElement instanceof Element
      ? document.activeElement.getAttribute('data-node-id')
      : null;
  if (focused) refocusNodeId = focused;
  const { w, h } = viewSize.value;
  if (sim.value.nodes.length === 0) sim.value = createSim(props.nodes, w, h);
  else syncSim(sim.value, props.nodes, w, h);
  if (reduced.value) {
    snapToAnchors(sim.value);
    frameVersion.value += 1;
    emitSettled();
  } else {
    settledEmitted = false;
    wake();
  }
  if (refocusNodeId) {
    const id = refocusNodeId;
    void nextTick(() => {
      const el = nodeEls.get(id) as HTMLElement | undefined;
      if (el) el.focus();
      else emit('node-focus', null);
      if (refocusNodeId === id) refocusNodeId = null;
    });
  }
};

watch(() => props.nodes, rebuildSim, { deep: true });
watch(viewSize, rebuildSim);
watch(reduced, (isReduced) => {
  if (!isReduced) return;
  stopLoop();
  snapToAnchors(sim.value);
  frameVersion.value += 1;
  emitSettled();
});

const onVisibility = () => {
  if (document.hidden) stopLoop();
  else if (!sim.value.settled || drag.id !== null) wake();
};

let stopWatchRM: (() => void) | undefined;
let resizeObserver: ResizeObserver | undefined;
onMounted(() => {
  if (typeof ResizeObserver === 'function' && hostEl.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width < 1 || rect.height < 1) return;
      if (rect.width !== viewSize.value.w || rect.height !== viewSize.value.h) {
        viewSize.value = { w: rect.width, h: rect.height };
      }
    });
    resizeObserver.observe(hostEl.value);
  }
  document.addEventListener('visibilitychange', onVisibility);
  stopWatchRM = watchReducedMotion((v) => {
    systemRM.value = v;
  });
  rebuildSim();
});
onDeactivated(stopLoop); // KeepAlive keeps the page alive; the sim must still stop.
onActivated(() => {
  if (!sim.value.settled || drag.id !== null) wake();
});
onBeforeUnmount(() => {
  stopLoop();
  resizeObserver?.disconnect();
  document.removeEventListener('visibilitychange', onVisibility);
  stopWatchRM?.();
});

/* ── Rendering model ──────────────────────────────────────────────── */

const STATE_LAYER: Record<OrbitNodeState, number> = { disabled: 0, candidate: 1, member: 2 };
const dragId = ref<string | null>(null);
const dragIntent = ref<'join' | 'leave' | null>(null);
const nodeEls = new Map<string, Element>();
const setNodeEl = (id: string, el: Element | null) => {
  if (el) nodeEls.set(id, el);
  else nodeEls.delete(id);
};

const renderNodes = computed(() => {
  void frameVersion.value; // positions live outside reactivity
  return sim.value.nodes
    .map((sn) => ({ sn, meta: metaById.value.get(sn.id) }))
    .filter((r): r is { sn: OrbitSimNode; meta: OrbitNode } => r.meta !== undefined)
    .sort(
      (a, b) =>
        STATE_LAYER[a.meta.state] - STATE_LAYER[b.meta.state]
        || (a.sn.id === dragId.value ? 1 : b.sn.id === dragId.value ? -1 : 0)
        || a.sn.id.localeCompare(b.sn.id),
    );
});

/** Member nodes get a solid link to the centre; a join-preview adds a dashed one. */
const links = computed(() =>
  renderNodes.value.flatMap(({ sn, meta }) => {
    const previewJoin = dragId.value === sn.id && dragIntent.value === 'join';
    const leaving = dragId.value === sn.id && dragIntent.value === 'leave';
    if (meta.state !== 'member' && !previewJoin) return [];
    return [{ id: sn.id, x: sn.x, y: sn.y, cls: previewJoin ? 'link preview' : leaving ? 'link leaving' : 'link' }];
  }),
);

const stateText = (state: OrbitNodeState): string =>
  state === 'member' ? t.value.stateMember : state === 'candidate' ? t.value.stateCandidate : t.value.stateDisabled;

const onNodeFocus = (id: string) => emit('node-focus', id);
const onNodeBlur = (id: string) => {
  // A DOM-move blur during rebuild is a rendering artifact, not a user action.
  if (refocusNodeId === id) return;
  emit('node-focus', null);
};

const nodeAria = (meta: OrbitNode): string =>
  t.value.nodeAria(meta.label, stateText(meta.state), meta.count ?? null);

const nodeClass = (meta: OrbitNode, id: string) => [
  'orbit-node',
  `state-${meta.state}`,
  {
    'is-dragging': dragId.value === id,
    'is-active': props.activeId === id,
    'intent-join': dragId.value === id && dragIntent.value === 'join',
    'intent-leave': dragId.value === id && dragIntent.value === 'leave',
    'is-readonly': props.readonly,
  },
];

/* ── Pointer ──────────────────────────────────────────────────────── */

const drag = {
  id: null as string | null,
  pointerId: -1,
  grabDX: 0,
  grabDY: 0,
  downX: 0,
  downY: 0,
  moved: false,
  /**
   * pointerdown 时量一次的 host rect：拖拽期间它不会变（节点抓着指针，
   * 页面不会滚动重排），在每次 move 里重新 getBoundingClientRect 等于
   * 每帧强制一次布局测量。
   */
  rect: null as { left: number; top: number; width: number; height: number } | null,
};

const simNode = (id: string | null): OrbitSimNode | undefined =>
  id === null ? undefined : sim.value.nodes.find((n) => n.id === id);

/**
 * Pointer → world via getBoundingClientRect() ONLY (CSS-zoom safe).
 * `rectOverride`：拖拽期间复用 pointerdown 量好的那份；pan/zoom 仍取当前值，
 * 所以缓存的只是「元素在屏幕上的框」，不是变换本身。
 */
const worldFromEvent = (
  e: { clientX: number; clientY: number },
  rectOverride?: { left: number; top: number; width: number; height: number },
): Vec | null => {
  const rect = rectOverride ?? hostEl.value?.getBoundingClientRect();
  if (!rect || rect.width < 1 || rect.height < 1) return null;
  return pointerToWorld(
    e.clientX,
    e.clientY,
    rect,
    viewSize.value.w,
    viewSize.value.h,
    pan.value,
    props.zoom,
  );
};

const onNodePointerDown = (e: PointerEvent, id: string) => {
  if (props.readonly || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const sn = simNode(id);
  const el = hostEl.value;
  if (!sn || !el) return;
  // 按下这次量一次，整段拖拽复用（见 drag.rect 注释）。
  const rect = el.getBoundingClientRect();
  const world = worldFromEvent(e, rect);
  if (!world) return;
  const nodeEl = e.currentTarget as Element;
  nodeEl.setPointerCapture?.(e.pointerId);
  e.preventDefault();
  (nodeEl as HTMLElement).focus?.();
  drag.id = id;
  drag.pointerId = e.pointerId;
  drag.grabDX = sn.x - world.x;
  drag.grabDY = sn.y - world.y;
  drag.downX = world.x;
  drag.downY = world.y;
  drag.moved = false;
  drag.rect = rect;
  sn.dragging = true;
  sn.vx = 0;
  sn.vy = 0;
  dragId.value = id;
  dragIntent.value = null;
  wake();
};

const onPointerMove = (e: PointerEvent) => {
  if (drag.id === null || e.pointerId !== drag.pointerId) return;
  const sn = simNode(drag.id);
  const world = worldFromEvent(e, drag.rect ?? undefined);
  if (!sn || !world) return;
  if (!drag.moved && Math.hypot(world.x - drag.downX, world.y - drag.downY) > 3) drag.moved = true;
  sn.x = world.x + drag.grabDX;
  sn.y = world.y + drag.grabDY;
  const meta = metaById.value.get(drag.id);
  dragIntent.value =
    meta && meta.state !== 'disabled' && drag.moved
      ? dragIntentFor(Math.hypot(sn.x, sn.y), thresholds.value)
      : null;
  if (reduced.value) frameVersion.value += 1; // no rAF in reduced-motion
};

const endDrag = (sn: OrbitSimNode) => {
  sn.dragging = false;
  sn.vx = 0;
  sn.vy = 0;
  drag.id = null;
  drag.pointerId = -1;
  drag.rect = null;
  dragId.value = null;
  dragIntent.value = null;
  if (reduced.value) {
    // No rAF: the node snaps straight back to its (current) anchor; if the
    // drop emits an intent, the parent's state flip re-anchors it anyway.
    sn.x = sn.anchorX;
    sn.y = sn.anchorY;
    frameVersion.value += 1;
  } else {
    wake();
  }
};

const onPointerUp = (e: PointerEvent) => {
  if (drag.id === null || e.pointerId !== drag.pointerId) return;
  const id = drag.id;
  const sn = simNode(id);
  const meta = metaById.value.get(id);
  if (!sn || !meta) {
    drag.id = null;
    drag.rect = null;
    dragId.value = null;
    return;
  }
  const moved = drag.moved;
  if (!moved) {
    endDrag(sn);
    emit('node-open', id);
    return;
  }
  const cls = meta.state === 'disabled' ? 'keep' : classifyDrop(Math.hypot(sn.x, sn.y), thresholds.value);
  endDrag(sn);
  if (cls === 'join' && meta.state === 'candidate') emit('node-join', id);
  else if (cls === 'leave' && meta.state === 'member') emit('node-leave', id);
};

const onPointerCancel = (e: PointerEvent) => {
  if (drag.id === null || e.pointerId !== drag.pointerId) return;
  const sn = simNode(drag.id);
  if (sn) endDrag(sn);
  else {
    drag.id = null;
    drag.rect = null;
    dragId.value = null;
  }
};

/* ── Keyboard ─────────────────────────────────────────────────────── */

const focusByAngle = (fromId: string, dir: 1 | -1) => {
  const ordered = sim.value.nodes
    .map((n) => ({ id: n.id, angle: Math.atan2(n.y, n.x) }))
    .sort((a, b) => a.angle - b.angle || a.id.localeCompare(b.id));
  const index = ordered.findIndex((n) => n.id === fromId);
  if (index < 0 || ordered.length < 2) return;
  const next = ordered[(index + dir + ordered.length) % ordered.length];
  (nodeEls.get(next.id) as HTMLElement | undefined)?.focus();
};

const onNodeKeydown = (e: KeyboardEvent, id: string) => {
  const meta = metaById.value.get(id);
  if (!meta) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    emit('node-open', id);
  } else if (e.key === ' ' || e.key === 'j' || e.key === 'J') {
    e.preventDefault();
    if (props.readonly || meta.state === 'disabled') return;
    if (meta.state === 'member') emit('node-leave', id);
    else emit('node-join', id);
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && meta.state === 'member') {
    e.preventDefault();
    if (!props.readonly) emit('node-leave', id);
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    focusByAngle(id, -1);
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    focusByAngle(id, 1);
  }
};

const applyZoom = (next: number, anchor?: Vec) => {
  const clamped = clampZoom(next);
  if (anchor) {
    pan.value = panForZoom(pan.value, anchor, centerPx.value, props.zoom, clamped);
  }
  if (clamped !== props.zoom) emit('update:zoom', clamped);
};

/** Reset is internal view state: recenter and report zoom 1 (P5). */
const resetView = () => {
  pan.value = { x: 0, y: 0 };
  if (props.zoom !== 1) emit('update:zoom', 1);
};

const onCanvasKeydown = (e: KeyboardEvent) => {
  // Undo intent — the stack itself lives in the parent.
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    if (!props.readonly) emit('undo');
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl+/-/0 belong to UI scale.
  if (e.key === '+' || e.key === '=') {
    e.preventDefault();
    applyZoom(props.zoom * 1.15, centerPx.value);
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault();
    applyZoom(props.zoom / 1.15, centerPx.value);
  } else if (e.key === '0') {
    e.preventDefault();
    resetView();
  }
};

const onWheel = (e: WheelEvent) => {
  e.preventDefault();
  const el = hostEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const viewPt = clientToView(e.clientX, e.clientY, rect, viewSize.value.w, viewSize.value.h);
  applyZoom(zoomFromWheel(props.zoom, e.deltaY), viewPt);
};
</script>

<template>
  <div
    ref="hostEl"
    class="orbit-canvas"
    :class="{ 'is-readonly': props.readonly }"
    role="group"
    tabindex="0"
    :aria-label="t.canvasLabel(props.center.label)"
    :aria-describedby="`orbit-hint-${hintId}`"
    @keydown="onCanvasKeydown"
    @wheel="onWheel"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @lostpointercapture="onPointerCancel"
  >
    <p :id="`orbit-hint-${hintId}`" class="sr-only">{{ t.canvasHint }}</p>
    <svg
      class="orbit-svg"
      :viewBox="`0 0 ${viewSize.w} ${viewSize.h}`"
      focusable="false"
    >
      <g :transform="rootTransform">
        <circle class="orbit-ring ring-member" :r="memberR" />
        <circle class="orbit-ring ring-candidate" :r="candidateR" />
        <line
          v-for="link in links"
          :key="`link-${link.id}`"
          :class="link.cls"
          x1="0"
          y1="0"
          :x2="link.x"
          :y2="link.y"
        />
        <g
          v-for="{ sn, meta } in renderNodes"
          :key="sn.id"
          :ref="(el) => setNodeEl(sn.id, el as Element | null)"
          :class="nodeClass(meta, sn.id)"
          :transform="`translate(${sn.x} ${sn.y})`"
          :data-node-id="sn.id"
          tabindex="0"
          role="button"
          :aria-label="nodeAria(meta)"
          :aria-disabled="meta.state === 'disabled'"
          @pointerdown="onNodePointerDown($event, sn.id)"
          @keydown="onNodeKeydown($event, sn.id)"
          @focus="onNodeFocus(sn.id)"
          @blur="onNodeBlur(sn.id)"
          @pointerenter="dragId === null && emit('node-focus', sn.id)"
          @pointerleave="emit('node-focus', null)"
        >
          <circle class="focus-ring" :r="NODE_RADIUS + 5" />
          <circle class="node-disc" :r="NODE_RADIUS" />
          <g class="node-icon" :transform="`translate(${-8.5} ${-8.5})`">
            <Icon :name="orbitIconFor(meta)" :size="17" />
          </g>
          <g v-if="meta.count !== undefined" class="node-count" transform="translate(19 -19)">
            <circle r="8.5" />
            <text text-anchor="middle" dominant-baseline="central">{{ meta.count }}</text>
          </g>
          <text class="node-label" :y="NODE_RADIUS + LABEL_GAP + 12" text-anchor="middle">
            {{ meta.label }}
          </text>
          <text
            v-if="meta.sublabel"
            class="node-sublabel"
            :y="NODE_RADIUS + LABEL_GAP + 25"
            text-anchor="middle"
          >
            {{ meta.sublabel }}
          </text>
        </g>
        <g class="orbit-center">
          <circle class="center-disc" :r="CENTER_RADIUS" />
          <text class="center-label" y="-3" text-anchor="middle">{{ props.center.label }}</text>
          <text v-if="props.center.sublabel" class="center-sublabel" y="15" text-anchor="middle">
            {{ props.center.sublabel }}
          </text>
        </g>
      </g>
    </svg>
    <div class="orbit-tools" @pointerdown.stop>
      <button type="button" class="orbit-tool" :aria-label="t.zoomOut" @click="applyZoom(props.zoom / 1.15, centerPx)">−</button>
      <button type="button" class="orbit-tool zoom-value" :aria-label="t.resetView" @click="resetView">
        {{ Math.round(props.zoom * 100) }}%
      </button>
      <button type="button" class="orbit-tool" :aria-label="t.zoomIn" @click="applyZoom(props.zoom * 1.15, centerPx)">+</button>
    </div>
  </div>
</template>

<style scoped>
.orbit-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  border-radius: var(--radius-md);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.orbit-svg { display: block; width: 100%; height: 100%; }

.orbit-ring { fill: none; }
.ring-member { stroke: var(--line-strong); stroke-width: 1; }
.ring-candidate { stroke: var(--line); stroke-width: 1; stroke-dasharray: 3 7; }

.link { stroke: var(--accent); stroke-width: 1.5; opacity: 0.55; }
.link.preview { stroke: var(--accent-hover); stroke-dasharray: 5 4; opacity: 0.8; }
.link.leaving { stroke: var(--danger); stroke-dasharray: 5 4; opacity: 0.7; }

.orbit-node { cursor: pointer; outline: none; touch-action: none; }
.orbit-node.is-readonly { cursor: default; }
.orbit-node .node-disc {
  fill: var(--surface-raised);
  stroke: var(--line-control);
  stroke-width: 1.2;
  transition: stroke 120ms ease, fill 120ms ease, opacity 120ms ease;
}
.orbit-node.state-member .node-disc { fill: var(--accent-soft); stroke: var(--accent); }
.orbit-node.state-candidate .node-disc { stroke-dasharray: 4 3; }
.orbit-node.state-disabled { opacity: 0.45; }
.orbit-node.is-dragging .node-disc { stroke: var(--accent-hover); stroke-width: 2; }
.orbit-node.intent-join .node-disc { fill: var(--accent-soft); stroke: var(--accent-hover); stroke-dasharray: none; }
.orbit-node.intent-leave .node-disc { stroke: var(--danger); }
.orbit-node .focus-ring {
  fill: none;
  stroke: var(--focus);
  stroke-width: 2;
  opacity: 0;
}
.orbit-node:focus-visible .focus-ring,
.orbit-node.is-active .focus-ring { opacity: 1; }
.orbit-node.is-active .node-disc { stroke: var(--accent-hover); stroke-width: 2; }
.node-icon { color: var(--muted); pointer-events: none; }
.orbit-node.state-member .node-icon { color: var(--accent); }

.node-count circle { fill: var(--surface-hover); stroke: var(--line-control); stroke-width: 1; }
.node-count text { fill: var(--ink); font-size: 9.5px; }
.orbit-node.state-member .node-count circle { fill: var(--accent); stroke: none; }
.orbit-node.state-member .node-count text { fill: var(--accent-ink); }

.node-label, .node-sublabel, .center-label, .center-sublabel {
  paint-order: stroke;
  stroke: var(--canvas);
  stroke-width: 3px;
  stroke-linejoin: round;
  pointer-events: none;
}
.node-label { fill: var(--ink); font-size: 13px; }
.node-sublabel { fill: var(--subtle); font-size: 11.5px; }
.orbit-node.state-disabled .node-label { fill: var(--subtle); }

.center-disc { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.center-label { fill: var(--ink); font-size: 15px; font-weight: 600; }
.center-sublabel { fill: var(--subtle); font-size: 11.5px; }

.orbit-tools {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  gap: 4px;
}
.orbit-tool {
  min-width: 30px;
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line-control);
  border-radius: 8px;
  background: var(--surface-raised);
  color: var(--muted);
  font-size: var(--fs-sm);
  cursor: pointer;
}
.orbit-tool:hover { color: var(--accent); border-color: var(--accent); }
.orbit-tool.zoom-value { min-width: 46px; font-variant-numeric: tabular-nums; }
</style>

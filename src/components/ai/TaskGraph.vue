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
import GraphUndoPill from './GraphUndoPill.vue';
import GraphZoomDock from './GraphZoomDock.vue';
import type { AiTaskCategory } from '../../lib/bridge/types';
import type { GraphModel, GraphNode } from '../../lib/aiTask/graph/model';
import { categoryNodeId, neighborIds } from '../../lib/aiTask/graph/model';
import {
  NODE_RADIUS, createLayout, fitZoom, focusFrame, graphRadii, snapLayout, stepLayout, syncLayout, wakeLayout,
  type LayoutNode,
  type LayoutState,
} from '../../lib/aiTask/graph/layout';
import { dialMarks, dialPaths, dialSegment, type DialOptions } from '../../lib/aiTask/graph/dial';
import { createWake, stepWake, wakePosition, type DialWake } from '../../lib/aiTask/graph/wake';
import { AI_TASK_CATEGORY_META, AI_TASK_CATEGORY_ORDER } from '../../lib/aiTask/categories';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { localDateString } from '../../lib/format';
import { useGraphCamera } from '../../composables/useGraphCamera';
import { useGraphDrag } from '../../composables/useGraphDrag';
import { useMessages } from '../../i18n';
import { taskGraphMessages } from './TaskGraph.i18n';

const props = defineProps<{
  model: GraphModel;
  canUndo: boolean;
  /** 刚才那一步改了什么（「已移出『睡眠』」）；撤销胶囊把它亮出来几秒。 */
  undoHint?: string | null;
  /** 每改一步加一，撤销胶囊靠它重新计时。 */
  undoSeq?: number;
}>();
const emit = defineEmits<{
  (event: 'set-category', category: AiTaskCategory, included: boolean): void;
  (event: 'set-metric', category: AiTaskCategory, metric: string, included: boolean): void;
  (event: 'set-days', category: AiTaskCategory, days: number): void;
  (event: 'set-include-day', category: AiTaskCategory, include: boolean): void;
  (event: 'toggle-expand', category: AiTaskCategory): void;
  (event: 'undo'): void;
}>();

const t = useMessages(taskGraphMessages);

const HOVER_IN_MS = 160;
const HOVER_OUT_MS = 120;

const viewport = ref<HTMLElement | null>(null);
const size = ref({ width: 720, height: 540 });
/* 画布四边被浮在上面的玻璃挡住多少（任务名胶囊、交付坞……），由页面用样式变量
   --graph-safe-* 告诉这里；节点弹层只摆在剩下看得见的那一块里。 */
const safe = ref({ top: 14, right: 14, bottom: 14, left: 14 });
const readSafe = () => {
  if (!viewport.value) return;
  const style = getComputedStyle(viewport.value);
  const read = (side: string) => Number.parseFloat(style.getPropertyValue(`--graph-safe-${side}`)) || 14;
  safe.value = { top: read('top'), right: read('right'), bottom: read('bottom'), left: read('left') };
};
const radii = computed(() => graphRadii(size.value.width, size.value.height));
const layout: LayoutState = createLayout();
const reducedMotion = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const { camera, flying, flyTo, zoomAt, cancel: cancelFlight, panStart, panMove, panEnd } = useGraphCamera();

const frame = ref(0);
const hoverId = ref<string | null>(null);
const openId = ref<string | null>(null);

/* —— 模拟循环：未收敛或被拖动时逐帧推进，收敛后停下省电 —— */
let raf = 0;
let lastTs = 0;
const tick = (ts: number) => {
  const dt = lastTs ? ts - lastTs : 16.7;
  lastTs = ts;
  stepLayout(layout, props.model, radii.value, dt);
  const wakeLive = advanceWake(dt);
  frame.value += 1;
  if (!layout.settled || drag.value || wakeLive) {
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
/* 面板里点「展开指标 / 收起指标」：图变了，面板就该让开。展开时 flyToFocus 本来就会收掉它；
   收起时以前面板一直挂着，非得再点一下空白处才走。 */
const onPopoverToggleExpand = () => {
  const category = openNode.value?.category;
  openId.value = null;
  if (category) emit('toggle-expand', category);
};
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

const pos = (id: string): LayoutNode => layout.nodes.get(id) ?? { id, x: 0, y: 0, vx: 0, vy: 0, dragging: false };
const positioned = computed(() => {
  void frame.value;
  return props.model.nodes.map((node) => ({ node, ...pos(node.id) }));
});
const nodeById = computed(() => new Map(props.model.nodes.map((node) => [node.id, node])));
/* 连线从两头圆盘的边上出发，不穿过圆盘；颜色取下游那一类的类别色。 */
const LINK_INSET = { center: NODE_RADIUS.center + 4, category: NODE_RADIUS.category + 4, metric: NODE_RADIUS.metric + 2 } as const;
const linkLines = computed(() => {
  void frame.value;
  return props.model.links.map((link) => {
    const a = pos(link.source);
    const b = pos(link.target);
    const from = nodeById.value.get(link.source);
    const to = nodeById.value.get(link.target);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const startInset = from ? LINK_INSET[from.kind] : 0;
    const endInset = to ? LINK_INSET[to.kind] : 0;
    const visible = length > startInset + endInset + 4;
    const ux = dx / length;
    const uy = dy / length;
    return {
      ...link,
      visible,
      tint: to?.category ? AI_TASK_CATEGORY_META[to.category].tint : 'var(--accent)',
      x1: a.x + ux * startInset, y1: a.y + uy * startInset,
      x2: b.x - ux * endInset, y2: b.y - uy * endInset,
    };
  });
});

/* —— 表圈：交给 AI 的大圈本身就是一圈表盘刻度，一天一根，今天在 12 点 ——
   刻度从圈线往里长（圈外留给不交的类别），周刻度长一截；整圈补分刻度到六十根上下，
   7 天不显得空、90 天不密成毛边（见 lib/aiTask/graph/dial.ts）。 */
const BEZEL = { inset: 14, length: 8, week: 12, minor: 4, minorTarget: 64 } as const;
const bezelOptions = computed<DialOptions>(() => ({
  radius: radii.value.boundary - BEZEL.inset,
  length: BEZEL.length,
  weekLength: BEZEL.week,
  perCell: props.model.dial?.perCell ?? 1,
  minorTarget: BEZEL.minorTarget,
  minorLength: BEZEL.minor,
}));
/** 还没有预览时（第一次载入）只画一圈标尺。 */
const bezelCount = computed(() => props.model.dial?.count ?? props.model.centerDays ?? 14);
const bezel = computed(() => dialPaths(props.model.dial?.cells ?? null, bezelCount.value, bezelOptions.value));
const bezelMarks = computed(() => dialMarks(bezelCount.value, bezelOptions.value));
const shortDate = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
/** 12 点那一根的标签：最后一天是今天就写「今天」，否则写日期（分析某次运动时窗口停在运动那天）。 */
const bezelEndLabel = computed(() => {
  const end = props.model.dial?.endDate;
  if (!end || end === localDateString(new Date())) return t.value.today;
  return shortDate(end);
});
const addDays = (date: string, days: number) => {
  const moved = parseDisplayDate(date);
  moved.setDate(moved.getDate() + days);
  return localDateString(moved);
};

/* —— 尾迹：拖着节点绕圈走，节点的方位是指针，扫过的刻度竖起来再落回去（照 iOS 相机的刻度尺）——
   见 lib/aiTask/graph/wake.ts。离圆心太近时方位不可靠，指针和尾迹都淡掉。 */
const WAKE_BOOST = 16;
let wakeState: DialWake = createWake(1);
const wakeFrame = ref(0);
const pointer = ref<{ angle: number; strength: number } | null>(null);
const advanceWake = (dtMs: number): boolean => {
  const total = bezelMarks.value.length;
  if (wakeState.energy.length !== total) wakeState = createWake(total);
  const active = drag.value?.moved ? drag.value.id : null;
  let next: { angle: number; strength: number } | null = null;
  if (active) {
    const p = pos(active);
    const boundary = radii.value.boundary;
    const distance = Math.hypot(p.x, p.y);
    const strength = Math.min(1, Math.max(0, (distance - boundary * 0.22) / (boundary * 0.28)));
    if (strength > 0.04) next = { angle: Math.atan2(p.y, p.x), strength };
  }
  pointer.value = next;
  const live = stepWake(wakeState, next ? wakePosition(next.angle, total) : null, dtMs, next?.strength ?? 0);
  wakeFrame.value += 1;
  return live || next !== null;
};
/** 竖起来的那几根：只画有能量的，一般十来根。 */
const wakeTicks = computed(() => {
  void wakeFrame.value;
  const radius = bezelOptions.value.radius;
  const out: { key: number; d: string; opacity: number; width: number }[] = [];
  bezelMarks.value.forEach((mark, index) => {
    const energy = wakeState.energy[index] ?? 0;
    if (energy <= 0) return;
    out.push({
      key: index,
      d: dialSegment(mark.angle, radius, radius + mark.length + energy * WAKE_BOOST),
      opacity: Math.min(1, 0.35 + energy * 0.65),
      width: 1.5 + energy * 1.1,
    });
  });
  return out;
});
/** 指针：一根更长的品牌色刻度，外面写它指着的那一天。 */
const pointerView = computed(() => {
  const current = pointer.value;
  if (!current) return null;
  const radius = bezelOptions.value.radius;
  const tip = radius + BEZEL.week + 9;
  const dial = props.model.dial;
  let label: string | null = null;
  if (dial) {
    const count = dial.count;
    const turn = (((current.angle + Math.PI / 2) / (2 * Math.PI)) % 1 + 1) % 1;
    const cell = (Math.round(turn * count) - 1 + count) % count;
    const end = dial.endDate;
    label = cell === count - 1 ? bezelEndLabel.value : shortDate(addDays(end, -(count - 1 - cell) * dial.perCell));
  }
  return {
    d: dialSegment(current.angle, radius - 4, tip),
    opacity: current.strength,
    label,
    lx: Math.cos(current.angle) * (tip + 16),
    ly: Math.sin(current.angle) * (tip + 16) + 4,
  };
});
/** 拖类别时表圈跟着「松手会怎样」变：会加入就亮起来，会移出就暗下去。 */
const bezelMood = computed(() => {
  const id = drag.value?.moved ? drag.value.id : null;
  if (!id || nodeById.value.get(id)?.kind !== 'category') return drag.value?.moved ? 'live' : null;
  return dropHint.value === 'include' ? 'include' : dropHint.value === 'exclude' ? 'exclude' : 'live';
});
/** 写「交给 AI」的那段弧：圆心在原点、比刻度再往里一点，中点在 -126°（左上的空当）。 */
const zoneArc = computed(() => {
  const r = radii.value.boundary - BEZEL.inset - 12;
  const from = (-126 - 30) * (Math.PI / 180);
  const to = (-126 + 30) * (Math.PI / 180);
  const p = (a: number) => `${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}`;
  return `M${p(from)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${p(to)}`;
});
const washCategories = AI_TASK_CATEGORY_ORDER.map((category) => ({ category, tint: AI_TASK_CATEGORY_META[category].tint }));

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

/* —— 节点拖动（见 useGraphDrag） —— */
const nodeDrag = useGraphDrag({
  nodeById, radii, pos, toLocal, localToWorld,
  beforeDrag: () => { cancelFlight(); openId.value = null; },
  wake,
  redraw: () => { frame.value += 1; },
  onClick: (id) => { openId.value = id === openId.value ? null : id; },
  onDrop: (node, include) => {
    if (node.kind === 'category' && node.category) emit('set-category', node.category, include);
    else if (node.kind === 'metric' && node.category && node.metric) emit('set-metric', node.category, node.metric, include);
  },
});
const { drag, dropHint } = nodeDrag;
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
  nodeDrag.start(event, node);
};

/* —— 空白拖动 = 平移 —— */
const onBackgroundDown = (event: PointerEvent) => {
  if (event.button !== 0) return;
  openId.value = null;
  panStart(toLocal(event));
  window.addEventListener('pointermove', onPanMove);
  window.addEventListener('pointerup', onPanEnd, { once: true });
  window.addEventListener('pointercancel', onPanEnd, { once: true });
};
const onPanMove = (event: PointerEvent) => panMove(toLocal(event));
const onPanEnd = () => {
  window.removeEventListener('pointerup', onPanEnd);
  window.removeEventListener('pointercancel', onPanEnd);
  window.removeEventListener('pointermove', onPanMove);
  panEnd();
};

/* —— 缩放：Ctrl+滚轮以光标为锚；不按 Ctrl 的滚轮留给页面滚动 —— */
const onWheel = (event: WheelEvent) => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  zoomAt(camera.value.zoom * Math.exp(-event.deltaY * 0.0015), size.value, toLocal(event));
};
const stepZoom = (factor: number) => zoomAt(camera.value.zoom * factor, size.value);
/* 「适应画布」：飞回正好装下整张图（聚焦时是这一类）的位置；已经在那儿了就让
   按钮弹一下（见 GraphZoomDock）。 */
const zoomPercent = computed(() => Math.round(camera.value.zoom * 100));
const zoomLabels = computed(() => ({ zoomIn: t.value.zoomIn, zoomOut: t.value.zoomOut, fit: t.value.fit, level: t.value.zoomLevel(zoomPercent.value) }));
const fitPulse = ref(0);
const fit = () => {
  const target = focusId.value
    ? focusFrame(props.model, focusId.value, radii.value, size.value)
    : { x: 0, y: 0, zoom: fitZoom(layout, size.value.width, size.value.height) };
  if (!target) return;
  const { x, y, zoom } = camera.value;
  const already = Math.abs(zoom - target.zoom) < 0.01 && Math.hypot(x - target.x, y - target.y) < 2;
  if (already) { fitPulse.value += 1; return; }
  openId.value = null;
  void flyTo(target);
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

const onBlur = (event: Event) => { nodeDrag.cancel(event); onPanEnd(); };
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
    readSafe();
  });
  observer.observe(viewport.value);
  size.value = { width: viewport.value.clientWidth || 720, height: viewport.value.clientHeight || 540 };
  readSafe();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  viewport.value?.removeEventListener('wheel', onWheel);
  onBlur(new Event('blur'));
  window.clearTimeout(hoverTimer);
  window.removeEventListener('blur', onBlur);
  document.removeEventListener('visibilitychange', onVisibility);
  cancelAnimationFrame(raf);
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
          <!-- 节点圆盘的微光：类别色从左上角透进来。每一类一份（渐变里的颜色不能跟着引用它的元素走）。 -->
          <radialGradient v-for="wash in washCategories" :id="`gwash-${wash.category}`" :key="wash.category" cx="32%" cy="26%" r="85%">
            <stop offset="0%" :style="{ stopColor: wash.tint }" stop-opacity=".42" />
            <stop offset="55%" :style="{ stopColor: wash.tint }" stop-opacity=".12" />
            <stop offset="100%" :style="{ stopColor: wash.tint }" stop-opacity=".04" />
          </radialGradient>
          <radialGradient id="gwash-center" cx="34%" cy="26%" r="90%">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity=".5" />
            <stop offset="60%" stop-color="var(--accent)" stop-opacity=".16" />
            <stop offset="100%" stop-color="var(--accent)" stop-opacity=".06" />
          </radialGradient>
          <!-- 圆盘顶边的一道高光（玻璃的边），往下渐隐。 -->
          <linearGradient id="grim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fff" stop-opacity=".5" />
            <stop offset="45%" stop-color="#fff" stop-opacity=".06" />
            <stop offset="100%" stop-color="#fff" stop-opacity="0" />
          </linearGradient>
          <radialGradient id="gshadow">
            <stop offset="0%" stop-color="#000" stop-opacity=".32" />
            <stop offset="100%" stop-color="#000" stop-opacity="0" />
          </radialGradient>
        </defs>
        <g :transform="cameraTransform">
          <g :class="['scenery', bezelMood && `is-${bezelMood}`]">
            <circle class="zone-glow" :r="radii.boundary * 1.08" fill="url(#zone-fill)" />
            <circle class="zone" :r="radii.boundary" />
            <!-- 表圈：一天一根，今天在 12 点；有数据的那天亮。 -->
            <g class="bezel" aria-hidden="true">
              <path class="bz minor" :d="bezel.minor" />
              <path class="bz off" :d="bezel.ticks.off" />
              <path class="bz plain" :d="bezel.ticks.plain" />
              <path class="bz part" :d="bezel.ticks.part" :opacity="bezel.partOpacity" />
              <path class="bz on" :d="bezel.ticks.on" />
              <path :class="['bz', 'today', bezel.todayState]" :d="bezel.today" />
              <circle class="today-dot" :cy="-radii.boundary - 5" r="2.4" />
              <text class="today-label" :y="-radii.boundary + BEZEL.inset + 14">{{ bezelEndLabel }}</text>
              <!-- 尾迹与指针（拖动时才有） -->
              <path v-for="tick in wakeTicks" :key="tick.key" class="bz wake" :d="tick.d" :opacity="tick.opacity" :stroke-width="tick.width" />
              <g v-if="pointerView" class="pointer" :opacity="pointerView.opacity">
                <path class="pointer-tick" :d="pointerView.d" />
                <text v-if="pointerView.label" class="pointer-label" :x="pointerView.lx" :y="pointerView.ly">{{ pointerView.label }}</text>
              </g>
            </g>
            <circle class="ring-inner" :r="radii.inner" />
            <!-- 「交给 AI」沿着表圈内侧弯着写，落在 10 点半那一块空当里。 -->
            <path id="zone-arc" class="zone-arc" :d="zoneArc" />
            <text class="zone-label"><textPath href="#zone-arc" startOffset="50%">{{ t.zone }}</textPath></text>
          </g>
          <template v-for="link in linkLines" :key="link.id">
            <line v-if="link.visible"
              :class="['link', { 'is-active': link.active, 'is-backdrop': linkBackdrop(link.source, link.target) }]"
              :style="{ '--tint': link.tint }" :x1="link.x1" :y1="link.y1" :x2="link.x2" :y2="link.y2" />
          </template>
          <GraphNodeView v-for="entry in positioned" :key="entry.node.id" :node="entry.node" :x="entry.x" :y="entry.y"
            :hovered="hoverId === entry.node.id || dragParentId === entry.node.id"
            :dimmed="isDim(entry.node.id)" :backdrop="isBackdrop(entry.node.id)"
            :ghosted="drag?.id === entry.node.id && drag.moved"
:emphasis="focusId !== null && !isBackdrop(entry.node.id)"
            :center-days="model.centerDays" :days-unit="t.daysUnit"
            tabindex="0" role="button" :aria-pressed="entry.node.included"
            @pointerdown="onNodeDown($event, entry.node)" @keydown="onNodeKey($event, entry.node)"
            @pointerenter="onNodeEnter(entry.node.id)" @pointerleave="onNodeLeave" />
          <GraphNodeView v-if="ghostNode" :node="ghostNode.node" :x="ghostNode.x" :y="ghostNode.y"
            :drop-hint="dropHint" :center-days="model.centerDays" :days-unit="t.daysUnit" lifted class="ghost" />
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

      <div v-show="canUndo" class="dock dock-left">
        <GraphUndoPill :can-undo="canUndo" :label="t.undo" :hint="undoHint" :seq="undoSeq" @undo="emit('undo')" />
      </div>
 <GraphZoomDock class="dock-right" vertical :percent="zoomPercent" :pulse="fitPulse" :labels="zoomLabels"
        @zoom="stepZoom" @fit="fit" />

      <GraphNodePopover v-if="openNode" :node="openNode" :anchor="openAnchor" :viewport="size" :safe="safe"
        @close="openId = null" @set-category="emit('set-category', openNode!.category!, $event)"
        @set-metric="emit('set-metric', openNode!.category!, openNode!.metric!, $event)"
        @set-days="emit('set-days', openNode!.category!, $event)"
        @set-include-day="emit('set-include-day', openNode!.category!, $event)"
        @toggle-expand="onPopoverToggleExpand" />
    </div>
  </div>
</template>

<style scoped src="./TaskGraph.css"></style>

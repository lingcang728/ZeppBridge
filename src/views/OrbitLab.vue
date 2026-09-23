<script setup lang="ts">
defineOptions({ name: 'OrbitLab' });
import { computed, onBeforeUnmount, ref } from 'vue';
import Icon from '../components/Icon.vue';
import PageHeader from '../components/PageHeader.vue';
import OrbitCanvas from '../components/orbit/OrbitCanvas.vue';
import { defineMessages, useMessages } from '../i18n';
import { popUndo, pushUndo, type OrbitUndoEntry } from '../lib/orbit/undo';
import {
  orbitIconFor,
  type AiTaskCategory,
  type OrbitNode,
  type OrbitNodeState,
} from '../lib/orbit/types';

/*
 * /orbit-lab — synthetic-data acceptance page for OrbitCanvas (BETA1 W2-S3).
 *
 * Registered as a normal lazy route (not DEV-gated) so it stays reachable in
 * beta builds for acceptance. The page owns the undo stack and node state —
 * the canvas only emits intents, exactly per contract P5. The card list is
 * the required fallback entry (备用入口): every node action works without
 * the graph.
 */

const messages = defineMessages(
  {
    title: '图谱实验室',
    intro: '圆球图谱的合成数据验收页：拖入加入、拖出外环移除、滚轮缩放、键盘操作与减少动态效果。',
    centerLabel: '分析任务',
    centerSub: '合成数据',
    modeGraph: '图谱',
    modeList: '列表',
    addNode: '添加候选节点',
    removeSelected: '移除选中',
    undoN: (n: number) => `撤销（${n}）`,
    motionLabel: '动效',
    motionSystem: '跟随系统',
    motionReduced: '减少',
    motionFull: '完整',
    frameMs: (last: string, avg: string, max: string) => `模拟帧耗时：本次 ${last} ms · 60 帧均值 ${avg} ms · 峰值 ${max} ms`,
    simSettled: '布局已稳定',
    simRunning: '布局计算中…',
    focusedNone: '焦点：无',
    focusedNode: (label: string) => `焦点：${label}`,
    lastEvent: (text: string) => `最近事件：${text}`,
    noEvent: '尚无事件',
    inspectorTitle: '选中节点',
    inspectorEmpty: '点击或回车一个节点查看详情。',
    stateLabel: '成员状态',
    stateMember: '已加入',
    stateCandidate: '候选',
    stateDisabled: '不可用',
    slotLabel: 'orbitSlot 覆盖（留空＝自动分配）',
    open: '打开',
    join: '加入',
    leave: '移出',
    remove: '移除',
    listTitle: '卡片列表（备用入口）',
    listIntro: '不用图谱也能完成全部操作：加入、移出、打开与移除都在这里。',
    listEmpty: '没有节点。',
    categories: {
      workout: '运动',
      sleep: '睡眠',
      recovery: '恢复',
      heart_rate: '心率',
      training: '训练负荷',
      body: '身体成分',
      personal_note: '个人说明',
      attachment: '附件',
    },
    subDays: (n: number) => `近 ${n} 天`,
    subItems: (n: number) => `${n} 项`,
    subNone: '暂无数据',
  },
  {
    title: 'Orbit lab',
    intro: 'Synthetic-data acceptance page for the orbit graph: drag in to add, drag out past the outer ring to remove, wheel zoom, keyboard, reduced motion.',
    centerLabel: 'Analysis task',
    centerSub: 'synthetic data',
    modeGraph: 'Graph',
    modeList: 'List',
    addNode: 'Add candidate node',
    removeSelected: 'Remove selected',
    undoN: (n: number) => `Undo (${n})`,
    motionLabel: 'Motion',
    motionSystem: 'System',
    motionReduced: 'Reduced',
    motionFull: 'Full',
    frameMs: (last: string, avg: string, max: string) => `Sim frame: last ${last} ms · 60-frame avg ${avg} ms · max ${max} ms`,
    simSettled: 'Layout settled',
    simRunning: 'Settling…',
    focusedNone: 'Focus: none',
    focusedNode: (label: string) => `Focus: ${label}`,
    lastEvent: (text: string) => `Last event: ${text}`,
    noEvent: 'No events yet',
    inspectorTitle: 'Selected node',
    inspectorEmpty: 'Click or press Enter on a node to inspect it.',
    stateLabel: 'Membership',
    stateMember: 'Member',
    stateCandidate: 'Candidate',
    stateDisabled: 'Disabled',
    slotLabel: 'orbitSlot override (empty = auto)',
    open: 'Open',
    join: 'Join',
    leave: 'Leave',
    remove: 'Remove',
    listTitle: 'Card list (fallback entry)',
    listIntro: 'Every action works without the graph: join, leave, open and remove.',
    listEmpty: 'No nodes.',
    categories: {
      workout: 'Workout',
      sleep: 'Sleep',
      recovery: 'Recovery',
      heart_rate: 'Heart rate',
      training: 'Training load',
      body: 'Body',
      personal_note: 'Notes',
      attachment: 'Attachment',
    },
    subDays: (n: number) => `last ${n} days`,
    subItems: (n: number) => `${n} items`,
    subNone: 'no data',
  },
  {
    title: 'Laboratorio de órbita',
    intro: 'Página de aceptación del grafo con datos sintéticos: arrastrar para añadir, sacar para quitar, zoom, teclado y movimiento reducido.',
    centerLabel: 'Tarea de análisis',
    centerSub: 'datos sintéticos',
    modeGraph: 'Grafo',
    modeList: 'Lista',
    addNode: 'Añadir nodo candidato',
    removeSelected: 'Quitar seleccionado',
    undoN: (n: number) => `Deshacer (${n})`,
    motionLabel: 'Movimiento',
    motionSystem: 'Sistema',
    motionReduced: 'Reducido',
    motionFull: 'Completo',
    frameMs: (last: string, avg: string, max: string) => `Frame sim.: ${last} ms · media 60f ${avg} ms · máx ${max} ms`,
    simSettled: 'Diseño estable',
    simRunning: 'Estabilizando…',
    focusedNone: 'Foco: ninguno',
    focusedNode: (label: string) => `Foco: ${label}`,
    lastEvent: (text: string) => `Último evento: ${text}`,
    noEvent: 'Sin eventos',
    inspectorTitle: 'Nodo seleccionado',
    inspectorEmpty: 'Haz clic o pulsa Enter en un nodo para inspeccionarlo.',
    stateLabel: 'Membresía',
    stateMember: 'Añadido',
    stateCandidate: 'Candidato',
    stateDisabled: 'No disponible',
    slotLabel: 'orbitSlot (vacío = automático)',
    open: 'Abrir',
    join: 'Añadir',
    leave: 'Quitar',
    remove: 'Eliminar',
    listTitle: 'Lista de tarjetas (entrada alternativa)',
    listIntro: 'Todas las acciones funcionan sin el grafo: añadir, quitar, abrir y eliminar.',
    listEmpty: 'Sin nodos.',
    categories: {
      workout: 'Ejercicio',
      sleep: 'Sueño',
      recovery: 'Recuperación',
      heart_rate: 'Frecuencia cardíaca',
      training: 'Carga de entrenamiento',
      body: 'Cuerpo',
      personal_note: 'Notas',
      attachment: 'Adjunto',
    },
    subDays: (n: number) => `últimos ${n} días`,
    subItems: (n: number) => `${n} elementos`,
    subNone: 'sin datos',
  },
  'views/OrbitLab',
);
const t = useMessages(messages);

/* ── Synthetic data ───────────────────────────────────────────────── */

interface LabItem {
  id: string;
  category: AiTaskCategory;
  state: OrbitNodeState;
  count?: number;
  orbitSlot?: number;
}

const items = ref<LabItem[]>([
  { id: 'workout', category: 'workout', state: 'member', count: 4 },
  { id: 'sleep', category: 'sleep', state: 'member', count: 14 },
  { id: 'recovery', category: 'recovery', state: 'member', count: 14 },
  { id: 'heart', category: 'heart_rate', state: 'candidate', count: 14 },
  { id: 'training', category: 'training', state: 'candidate', count: 6 },
  { id: 'body', category: 'body', state: 'candidate' },
  { id: 'note', category: 'personal_note', state: 'candidate' },
  { id: 'attach', category: 'attachment', state: 'disabled' },
]);

const sublabelFor = (item: LabItem): string | undefined => {
  if (item.state === 'disabled') return t.value.subNone;
  if (item.category === 'attachment' || item.category === 'personal_note') {
    return item.count !== undefined ? t.value.subItems(item.count) : undefined;
  }
  return item.count !== undefined ? t.value.subDays(item.count) : undefined;
};

const nodes = computed<OrbitNode[]>(() =>
  items.value.map((item) => ({
    id: item.id,
    category: item.category,
    label: t.value.categories[item.category],
    sublabel: sublabelFor(item),
    state: item.state,
    count: item.count,
    orbitSlot: item.orbitSlot,
  })),
);

const center = computed(() => ({ label: t.value.centerLabel, sublabel: t.value.centerSub }));

/* ── Contract-driven state (the parent owns it, per P5) ───────────── */

const zoom = ref(1);
const activeId = ref<string | null>(null);
const focusedId = ref<string | null>(null);
const undoStack = ref<OrbitUndoEntry[]>([]);
const lastEvent = ref<string | null>(null);
const settleCount = ref(0);
const mode = ref<'graph' | 'list'>('graph');
type MotionMode = 'system' | 'reduced' | 'full';
const motionMode = ref<MotionMode>('system');
const reducedOverride = computed<boolean | undefined>(() =>
  motionMode.value === 'system' ? undefined : motionMode.value === 'reduced',
);

const itemOf = (id: string) => items.value.find((i) => i.id === id);
const stateText = (s: OrbitNodeState) =>
  s === 'member' ? t.value.stateMember : s === 'candidate' ? t.value.stateCandidate : t.value.stateDisabled;

const joinNode = (id: string) => {
  const item = itemOf(id);
  if (!item || item.state === 'member' || item.state === 'disabled') return;
  undoStack.value = pushUndo(undoStack.value, { type: 'join', nodeId: id, prevState: item.state });
  item.state = 'member';
  lastEvent.value = `node-join ${id}`;
};
const leaveNode = (id: string) => {
  const item = itemOf(id);
  if (!item || item.state !== 'member') return;
  undoStack.value = pushUndo(undoStack.value, { type: 'leave', nodeId: id, prevState: item.state });
  item.state = 'candidate';
  lastEvent.value = `node-leave ${id}`;
};
const runUndo = () => {
  const [entry, rest] = popUndo(undoStack.value);
  undoStack.value = rest;
  if (!entry) return;
  const item = itemOf(entry.nodeId);
  if (item) item.state = entry.prevState;
  lastEvent.value = `undo ${entry.type} ${entry.nodeId}`;
};

let addCounter = 0;
const ADD_CYCLE: AiTaskCategory[] = ['workout', 'heart_rate', 'training', 'body', 'personal_note', 'sleep'];
const addNode = () => {
  addCounter += 1;
  items.value = [
    ...items.value,
    {
      id: `extra-${addCounter}`,
      category: ADD_CYCLE[addCounter % ADD_CYCLE.length],
      state: 'candidate',
      count: (addCounter * 3) % 17,
    },
  ];
  lastEvent.value = `add extra-${addCounter}`;
};
const removeNode = (id: string) => {
  items.value = items.value.filter((i) => i.id !== id);
  if (activeId.value === id) activeId.value = null;
  lastEvent.value = `remove ${id}`;
};

const onOpen = (id: string) => {
  activeId.value = id;
  lastEvent.value = `node-open ${id}`;
};
const onFocus = (id: string | null) => {
  focusedId.value = id;
};
const onSettled = () => {
  settleCount.value += 1;
  lastEvent.value = `layout-settled #${settleCount.value}`;
};

const focusedLabel = computed(() => {
  const item = focusedId.value ? itemOf(focusedId.value) : undefined;
  return item ? t.value.categories[item.category] : null;
});
const activeItem = computed(() => (activeId.value ? itemOf(activeId.value) : undefined));

const setSlot = (item: LabItem, raw: string) => {
  const n = Number(raw);
  item.orbitSlot = raw.trim() !== '' && Number.isInteger(n) && n >= 0 ? n : undefined;
};

/* ── Frame-time dev aid (reads the canvas' exposed probe, no console) ── */

const canvasRef = ref<InstanceType<typeof OrbitCanvas> | null>(null);
const frameReadout = ref({ lastMs: 0, avgMs: 0, maxMs: 0, tick: 0, running: false, settled: true });
let statsTimer: number | undefined;
if (typeof window !== 'undefined') {
  statsTimer = window.setInterval(() => {
    const s = canvasRef.value?.frameStats;
    if (s) {
      frameReadout.value = {
        lastMs: s.lastMs,
        avgMs: s.avgMs,
        maxMs: s.maxMs,
        tick: s.tick,
        running: s.running,
        settled: s.settled,
      };
    }
  }, 500);
}
onBeforeUnmount(() => {
  if (statsTimer !== undefined) window.clearInterval(statsTimer);
});
</script>

<template>
  <section class="page orbit-lab" aria-labelledby="orbit-lab-title">
    <PageHeader back="/" :title="t.title" :intro="t.intro" title-id="orbit-lab-title" />

    <div class="lab-toolbar surface-card">
      <div class="seg" role="group" :aria-label="t.modeGraph + ' / ' + t.modeList">
        <button type="button" class="seg-btn" :class="{ 'is-on': mode === 'graph' }" @click="mode = 'graph'">
          <Icon name="ring" :size="15" />{{ t.modeGraph }}
        </button>
        <button type="button" class="seg-btn" :class="{ 'is-on': mode === 'list' }" @click="mode = 'list'">
          <Icon name="table" :size="15" />{{ t.modeList }}
        </button>
      </div>
      <button type="button" class="button secondary" @click="addNode">
        <Icon name="plus" :size="15" />{{ t.addNode }}
      </button>
      <button type="button" class="button secondary" :disabled="!activeItem" @click="activeId && removeNode(activeId)">
        <Icon name="trash" :size="15" />{{ t.removeSelected }}
      </button>
      <button type="button" class="button secondary" :disabled="undoStack.length === 0" @click="runUndo">
        <Icon name="refresh" :size="15" />{{ t.undoN(undoStack.length) }}
      </button>
      <div class="seg" role="group" :aria-label="t.motionLabel">
        <button type="button" class="seg-btn" :class="{ 'is-on': motionMode === 'system' }" @click="motionMode = 'system'">{{ t.motionSystem }}</button>
        <button type="button" class="seg-btn" :class="{ 'is-on': motionMode === 'reduced' }" @click="motionMode = 'reduced'">{{ t.motionReduced }}</button>
        <button type="button" class="seg-btn" :class="{ 'is-on': motionMode === 'full' }" @click="motionMode = 'full'">{{ t.motionFull }}</button>
      </div>
      <span class="frame-readout">
        {{ t.frameMs(frameReadout.lastMs.toFixed(2), frameReadout.avgMs.toFixed(2), frameReadout.maxMs.toFixed(2)) }}
        <span :class="['settle-dot', { on: frameReadout.settled }]" />
        {{ frameReadout.settled ? t.simSettled : t.simRunning }}
      </span>
    </div>

    <div v-if="mode === 'graph'" class="lab-stage surface-card">
      <OrbitCanvas
        ref="canvasRef"
        :center="center"
        :nodes="nodes"
        v-model:zoom="zoom"
        :active-id="activeId"
        :reduced-motion="reducedOverride"
        @node-join="joinNode"
        @node-leave="leaveNode"
        @node-open="onOpen"
        @node-focus="onFocus"
        @undo="runUndo"
        @layout-settled="onSettled"
      />
    </div>

    <div class="lab-status surface-card">
      <span>{{ focusedLabel ? t.focusedNode(focusedLabel) : t.focusedNone }}</span>
      <span class="status-sep" />
      <span>{{ lastEvent ? t.lastEvent(lastEvent) : t.noEvent }}</span>
      <span class="status-sep" />
      <span>zoom {{ Math.round(zoom * 100) }}%</span>
      <span class="status-sep" />
      <span>settled ×{{ settleCount }}</span>
    </div>

    <div class="lab-lower">
      <div class="inspector surface-card">
        <h2 class="section-label">{{ t.inspectorTitle }}</h2>
        <template v-if="activeItem">
          <p class="inspector-name">{{ t.categories[activeItem.category] }} <span class="inspector-id">{{ activeItem.id }}</span></p>
          <p class="inspector-row">{{ t.stateLabel }}: {{ stateText(activeItem.state) }}</p>
          <div class="inspector-actions">
            <button type="button" class="button secondary" :disabled="activeItem.state !== 'candidate'" @click="joinNode(activeItem.id)">{{ t.join }}</button>
            <button type="button" class="button secondary" :disabled="activeItem.state !== 'member'" @click="leaveNode(activeItem.id)">{{ t.leave }}</button>
            <button type="button" class="button danger-button" @click="removeNode(activeItem.id)">{{ t.remove }}</button>
          </div>
          <label class="slot-field">
            <span>{{ t.slotLabel }}</span>
            <input
              type="number"
              min="0"
              step="1"
              :value="activeItem.orbitSlot ?? ''"
              @input="setSlot(activeItem, ($event.target as HTMLInputElement).value)"
            >
          </label>
        </template>
        <p v-else class="inspector-empty">{{ t.inspectorEmpty }}</p>
      </div>

      <div class="list-panel surface-card" :class="{ 'is-mode': mode === 'list' }">
        <h2 class="section-label">{{ t.listTitle }}</h2>
        <p class="list-intro">{{ t.listIntro }}</p>
        <ul v-if="items.length" class="node-list">
          <li v-for="item in items" :key="item.id" class="node-card" :class="{ 'is-active': activeId === item.id }">
            <span class="node-card-icon"><Icon :name="orbitIconFor(item)" :size="16" /></span>
            <span class="node-card-text">
              <strong>{{ t.categories[item.category] }}</strong>
              <span class="node-card-sub">{{ stateText(item.state) }}<template v-if="item.count !== undefined"> · {{ item.count }}</template></span>
            </span>
            <span class="node-card-actions">
              <button type="button" class="button quiet" @click="onOpen(item.id)">{{ t.open }}</button>
              <button v-if="item.state === 'candidate'" type="button" class="button quiet" @click="joinNode(item.id)">{{ t.join }}</button>
              <button v-if="item.state === 'member'" type="button" class="button quiet" @click="leaveNode(item.id)">{{ t.leave }}</button>
              <button type="button" class="button quiet danger-text" @click="removeNode(item.id)">{{ t.remove }}</button>
            </span>
          </li>
        </ul>
        <p v-else class="inspector-empty">{{ t.listEmpty }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.orbit-lab { display: flex; flex-direction: column; gap: 14px; min-height: 100%; }

.lab-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
}
.seg { display: inline-flex; border: 1px solid var(--line-control); border-radius: var(--radius-sm); overflow: hidden; }
.seg-btn {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: var(--fs-sm);
  cursor: pointer;
}
.seg-btn.is-on { background: var(--accent-soft); color: var(--accent); }
.frame-readout {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  color: var(--subtle);
  font-family: var(--font-mono);
  font-size: var(--fs-2xs);
  white-space: nowrap;
}
.settle-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--warning); }
.settle-dot.on { background: var(--accent); }

.lab-stage {
  height: clamp(360px, 58vh, 620px);
  min-height: 0;
  overflow: hidden;
}

.lab-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  color: var(--muted);
  font-size: var(--fs-xs);
}
.status-sep { width: 1px; height: 14px; background: var(--line); }

.lab-lower { display: grid; grid-template-columns: minmax(240px, 320px) 1fr; gap: 14px; align-items: start; }
.inspector { padding: 14px; }
.inspector-name { margin: 0 0 4px; font-size: var(--fs-lg); font-weight: 600; }
.inspector-id { color: var(--subtle); font-size: var(--fs-xs); font-weight: 400; }
.inspector-row { margin: 0 0 10px; color: var(--muted); font-size: var(--fs-sm); }
.inspector-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.inspector-empty { margin: 0; color: var(--subtle); font-size: var(--fs-sm); }
.slot-field { display: grid; gap: 4px; color: var(--muted); font-size: var(--fs-xs); }
.slot-field input {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--line-control);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
}

.list-panel { padding: 14px; }
.list-intro { margin: 0 0 10px; color: var(--subtle); font-size: var(--fs-xs); }
.node-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.node-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.node-card.is-active { border-color: var(--accent); }
.node-card-icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; background: var(--accent-soft); color: var(--accent); flex: 0 0 auto; }
.node-card-text { display: grid; min-width: 0; flex: 1; }
.node-card-sub { color: var(--subtle); font-size: var(--fs-xs); }
.node-card-actions { display: flex; gap: 4px; }
.node-card-actions .button { min-height: 30px; padding: 3px 10px; }
.danger-text { color: var(--danger); }

@media (max-width: 760px) {
  .lab-lower { grid-template-columns: 1fr; }
  .frame-readout { width: 100%; margin-left: 0; }
}
</style>

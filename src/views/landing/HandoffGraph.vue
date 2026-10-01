<script setup lang="ts">
/**
 * 「交给 AI」那张图的落地页版本：拖一个指标节点，靠近它的节点被推开、松手后弹簧回位；
 * 拖到中间松手，它就进了这次要交给 AI 的包，绕着中心排好。
 *
 * 每帧只改节点的 transform 和连线端点，不走 Vue 的响应式；没有东西在动时循环自己停下。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { LandingCopy } from './types';

const props = defineProps<{ copy: LandingCopy['handoff'] }>();

interface Body { x: number; y: number; vx: number; vy: number; hx: number; hy: number; picked: boolean }

const root = ref<HTMLElement | null>(null);
const nodeEls: HTMLElement[] = [];
const lineEls: SVGLineElement[] = [];
const hub = ref<HTMLElement | null>(null);
const pickedCount = ref(0);
const bodies: Body[] = [];
let size = { w: 560, h: 420 };
let dragging: { index: number; dx: number; dy: number; id: number } | null = null;
let frame = 0;
let observer: ResizeObserver | null = null;

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const center = () => ({ x: size.w / 2, y: size.h / 2 });
const hubRadius = () => Math.min(size.w, size.h) * 0.14;

const layoutHomes = () => {
  const { x, y } = center();
  const count = props.copy.nodes.length;
  const rx = size.w * 0.38;
  const ry = size.h * 0.36;
  props.copy.nodes.forEach((_, index) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    const hx = x + Math.cos(angle) * rx;
    const hy = y + Math.sin(angle) * ry;
    const body = bodies[index] ?? { x: hx, y: hy, vx: 0, vy: 0, hx, hy, picked: false };
    body.hx = hx;
    body.hy = hy;
    bodies[index] = body;
  });
};

/** 选中的节点在中心周围排一圈。 */
const targetOf = (index: number) => {
  const body = bodies[index];
  if (!body.picked) return { x: body.hx, y: body.hy };
  const picked = bodies.map((entry, i) => (entry.picked ? i : -1)).filter((i) => i >= 0);
  const slot = picked.indexOf(index);
  const angle = -Math.PI / 2 + (slot / Math.max(1, picked.length)) * Math.PI * 2;
  const r = hubRadius() + 34;
  const { x, y } = center();
  return { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r };
};

const paint = () => {
  const { x: cx, y: cy } = center();
  bodies.forEach((body, index) => {
    const el = nodeEls[index];
    if (el) el.style.transform = `translate3d(${(body.x).toFixed(1)}px, ${(body.y).toFixed(1)}px, 0) translate(-50%, -50%)`;
    const line = lineEls[index];
    if (line) {
      line.setAttribute('x1', cx.toFixed(1));
      line.setAttribute('y1', cy.toFixed(1));
      line.setAttribute('x2', body.x.toFixed(1));
      line.setAttribute('y2', body.y.toFixed(1));
    }
  });
};

const step = () => {
  frame = 0;
  let moving = false;
  bodies.forEach((body, index) => {
    if (dragging?.index === index) return;
    const target = targetOf(index);
    let fx = (target.x - body.x) * 0.075;
    let fy = (target.y - body.y) * 0.075;
    // 离被拖的那个节点（以及彼此）太近就被推开：拖动时周围「让一让」。
    bodies.forEach((other, j) => {
      if (j === index) return;
      const dx = body.x - other.x;
      const dy = body.y - other.y;
      const distance = Math.hypot(dx, dy) || 1;
      const reach = dragging?.index === j ? 130 : 70;
      if (distance < reach) {
        const push = ((reach - distance) / reach) * (dragging?.index === j ? 2.6 : 0.9);
        fx += (dx / distance) * push;
        fy += (dy / distance) * push;
      }
    });
    body.vx = (body.vx + fx) * 0.8;
    body.vy = (body.vy + fy) * 0.8;
    body.x += body.vx;
    body.y += body.vy;
    if (Math.abs(body.vx) + Math.abs(body.vy) > 0.05 || Math.hypot(target.x - body.x, target.y - body.y) > 0.5) moving = true;
  });
  paint();
  if (moving || dragging) frame = requestAnimationFrame(step);
};

const kick = () => {
  if (reduced()) {
    bodies.forEach((body, index) => { const t = targetOf(index); body.x = t.x; body.y = t.y; });
    paint();
    return;
  }
  if (!frame) frame = requestAnimationFrame(step);
};

const localPoint = (event: PointerEvent) => {
  const box = root.value!.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
};

const onDown = (event: PointerEvent, index: number) => {
  if (event.button !== 0) return;
  const point = localPoint(event);
  const body = bodies[index];
  dragging = { index, dx: body.x - point.x, dy: body.y - point.y, id: event.pointerId };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  nodeEls[index]?.classList.add('dragging');
  kick();
};
const onMove = (event: PointerEvent) => {
  if (!dragging || event.pointerId !== dragging.id) return;
  const point = localPoint(event);
  const body = bodies[dragging.index];
  body.x = Math.max(24, Math.min(size.w - 24, point.x + dragging.dx));
  body.y = Math.max(20, Math.min(size.h - 20, point.y + dragging.dy));
  body.vx = 0;
  body.vy = 0;
  const { x, y } = center();
  hub.value?.classList.toggle('armed', Math.hypot(body.x - x, body.y - y) < hubRadius() + 20);
  if (reduced()) paint();
  kick();
};
const settleDrop = (index: number) => {
  const body = bodies[index];
  const { x, y } = center();
  const inside = Math.hypot(body.x - x, body.y - y) < hubRadius() + 20;
  if (inside !== body.picked) togglePick(index);
};
const onUp = (event: PointerEvent) => {
  if (!dragging || event.pointerId !== dragging.id) return;
  const { index } = dragging;
  dragging = null;
  nodeEls[index]?.classList.remove('dragging');
  hub.value?.classList.remove('armed');
  settleDrop(index);
  kick();
};

const togglePick = (index: number) => {
  bodies[index].picked = !bodies[index].picked;
  nodeEls[index]?.classList.toggle('picked', bodies[index].picked);
  pickedCount.value = bodies.filter((body) => body.picked).length;
  if (!reduced()) hub.value?.animate([{ transform: 'translate(-50%, -50%) scale(1)' }, { transform: 'translate(-50%, -50%) scale(1.08)' }, { transform: 'translate(-50%, -50%) scale(1)' }], { duration: 360, easing: 'cubic-bezier(.2, 1.4, .4, 1)' });
  kick();
};
const onKey = (event: KeyboardEvent, index: number) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  togglePick(index);
};
const reset = () => {
  bodies.forEach((body, index) => { body.picked = false; nodeEls[index]?.classList.remove('picked'); });
  pickedCount.value = 0;
  kick();
};

const measure = () => {
  if (!root.value) return;
  size = { w: root.value.clientWidth, h: root.value.clientHeight };
  layoutHomes();
  if (reduced() || !frame) {
    bodies.forEach((body, index) => { const t = targetOf(index); body.x = t.x; body.y = t.y; });
  }
  paint();
};

onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  if (frame) cancelAnimationFrame(frame);
});

const pickedLabel = computed(() => props.copy.picked.replace('{n}', String(pickedCount.value)));
</script>

<template>
  <div class="graph-wrap">
    <div ref="root" class="graph" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp">
      <svg class="graph-lines" aria-hidden="true">
        <line v-for="(node, index) in copy.nodes" :key="node" :ref="(el) => { if (el) lineEls[index] = el as SVGLineElement }" />
      </svg>
      <div ref="hub" class="graph-hub" aria-live="polite">
        <strong>{{ copy.center }}</strong>
        <small>{{ pickedLabel }}</small>
      </div>
      <button
        v-for="(node, index) in copy.nodes"
        :key="node"
        :ref="(el) => { if (el) nodeEls[index] = el as HTMLElement }"
        type="button"
        class="graph-node"
        @pointerdown="onDown($event, index)"
        @keydown="onKey($event, index)"
      >{{ node }}</button>
    </div>
    <div class="graph-foot">
      <span>{{ copy.hint }}</span>
      <button type="button" class="graph-reset" :disabled="pickedCount === 0" @click="reset">{{ copy.reset }}</button>
    </div>
  </div>
</template>

<style scoped>
.graph-wrap { display: grid; gap: 12px; }
.graph { position: relative; height: 440px; overflow: hidden; border-radius: 24px; background: radial-gradient(circle at 50% 50%, var(--accent-soft), transparent 62%), var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); touch-action: none; user-select: none; }
.graph-lines { position: absolute; inset: 0; width: 100%; height: 100%; }
.graph-lines line { stroke: var(--mat-line-hover); stroke-width: 1.5; stroke-dasharray: 3 5; }
.graph-hub { position: absolute; top: 50%; left: 50%; display: grid; place-items: center; align-content: center; gap: 2px; width: 28%; max-width: 150px; aspect-ratio: 1; border-radius: 50%; transform: translate(-50%, -50%); background: var(--accent); color: var(--accent-ink); box-shadow: 0 0 0 10px var(--accent-soft), 0 18px 40px -18px rgba(0, 0, 0, .5); text-align: center; transition: box-shadow 200ms ease; }
.graph-hub.armed { box-shadow: 0 0 0 18px var(--accent-soft), 0 18px 40px -18px rgba(0, 0, 0, .5); }
.graph-hub strong { font-size: 15px; }
.graph-hub small { font-size: 12px; opacity: .8; }
.graph-node { position: absolute; top: 0; left: 0; padding: 8px 14px; border: 0; border-radius: 999px; background: var(--cap-track); box-shadow: var(--cap-track-shadow), var(--mat-shadow); color: var(--ink); font: inherit; font-size: 13.5px; font-weight: 600; white-space: nowrap; cursor: grab; will-change: transform; transition: background 160ms ease, color 160ms ease; }
.graph-node:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.graph-node.dragging { cursor: grabbing; z-index: 2; }
.graph-node.picked { background: var(--accent); color: var(--accent-ink); }
.graph-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--subtle); font-size: 13px; }
.graph-reset { padding: 5px 14px; border: 0; border-radius: 999px; background: var(--cap-track); color: var(--ink); font: inherit; font-size: 12.5px; cursor: pointer; }
.graph-reset:disabled { opacity: .45; cursor: default; }
@media (max-width: 640px) { .graph { height: 380px; } .graph-node { font-size: 12.5px; padding: 7px 11px; } }
</style>

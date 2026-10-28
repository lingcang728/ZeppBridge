<script setup lang="ts">
/* 点开一次运动（年轮上的一条刻线）：一张「运动名片」从刻线外端长出来，关上时原路缩回那条刻线。
   - 内容（用户 2026-10-28「数据太少」）：运动、星期日期和开始时刻；距离 / 时长 / 配速或速度 / 平均心率（缺哪格就不出那格）；
     心率区间五色条；有 GPS 就画一笔路线剪影；只有真是今年之最才挂一枚徽章（以前的「这一年第 N 长」去掉了）。
     先用年轮里现成的距离、时长出卡，详情到了再补（composables/useStarDetail.ts），数字是会滚的（RollingNumber）。
   - 换前一次 / 后一次不用箭头：在卡上滚轮、横扫或左右拖，键盘 ← →（TreeRings 管）；琥珀指针沿年轮转过去，卡沿着圆周跟过去。
   - 位置写在 `translate` 里（逐帧追着指针外端），长出 / 缩回只动 `scale` 和透明度，两样互不打架；缩回时缩放原点每帧对准刻线
     此刻在屏幕上的位置——放大、平移同时发生也落回那条刻线上。
   - 「看这次运动」从这张卡长成详情页（data-morph-card），返回时卡还开着，详情页正好缩回这张卡。
   材质是木头色的浮层玻璃（tokens.css 的 --wood-card-*），强调色是边材的琥珀色，不用应用的绿（用户 2026-10-28）。 */
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../Icon.vue';
import RollingNumber from '../RollingNumber.vue';
import { OPEN_EASE } from '../../lib/motion/timing';
import { lessMotion } from '../../lib/motion/lessMotion';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { kmText } from '../../lib/logbook/display';
import { clockText } from '../../lib/logbook/clock';
import { formatPaceSeconds } from '../../lib/metricSeries';
import { distanceUnitLabel, paceUnitLabel, toBigDistance } from '../../lib/units';
import { workoutLabel } from '../../lib/labels';
import { routePath, starBadge, starCells, zoneShares, type StarCell } from '../../lib/rings/starCard';
import { useStarDetail } from '../../composables/useStarDetail';
import { useRingsText } from './rings.i18n';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';
import type { RingStar, RingYear } from '../../types/rings';

const props = defineProps<{
  star: RingStar; year: RingYear | null; neighbors: string[]; closing: boolean;
  point: () => { x: number; y: number } | null;
  stage: HTMLElement | null;
}>();
const emit = defineEmits<{ close: []; closed: []; step: [delta: 1 | -1] }>();
const t = useRingsText();
const workoutText = useMessages(workoutDetailMessages);
const card = ref<HTMLElement | null>(null);
const face = ref<HTMLElement | null>(null);
const WIDTH = 312;

/* ---------- 内容 ---------- */

const id = computed(() => props.star.workout_id);
const detail = useStarDetail(id, computed(() => props.neighbors), (points) => routePath(points));
const workout = computed(() => (detail.value?.workout?.workout_id === id.value ? detail.value.workout : null));
const dayFormat = computed(() => displayDateTimeFormatter({ weekday: 'short', month: 'short', day: 'numeric' }));
const timeFormat = computed(() => displayDateTimeFormatter({ hour: '2-digit', minute: '2-digit' }));
const when = computed(() => {
  const day = dayFormat.value.format(parseDisplayDate(props.star.date));
  const start = workout.value?.start_time ? new Date(workout.value.start_time) : null;
  return start && Number.isFinite(start.getTime()) ? `${day} · ${timeFormat.value.format(start)}` : day;
});
const cells = computed(() => starCells({
  kind: props.star.kind,
  isRun: props.star.is_run,
  distanceM: workout.value?.distance_meters ?? props.star.distance_m,
  seconds: workout.value?.moving_seconds ?? props.star.duration_s,
  avgHr: workout.value?.avg_hr,
}));
const cellLabel = (cell: StarCell) => ({
  distance: workoutText.value.metricDistance,
  duration: workoutText.value.metricDuration,
  pace: workoutText.value.metricAvgPace,
  speed: t.value.avgSpeed,
  hr: workoutText.value.metricAvgHr,
}[cell.key]);
const cellValue = (cell: StarCell): { value: string; unit: string } => {
  switch (cell.key) {
    case 'distance': return { value: kmText(toBigDistance(cell.meters!)), unit: distanceUnitLabel() };
    case 'duration': return { value: clockText(cell.seconds!), unit: '' };
    case 'pace': return { value: formatPaceSeconds(cell.secondsPerKm), unit: paceUnitLabel() };
    case 'speed': return { value: (toBigDistance(cell.kmh! * 1000)).toFixed(1), unit: `${distanceUnitLabel()}/h` };
    default: return { value: String(cell.bpm), unit: 'bpm' };
  }
};
const zones = computed(() => zoneShares(workout.value?.hr_zones));
const route = computed(() => (workout.value ? detail.value?.route ?? null : null));
const badge = computed(() => {
  const kind = starBadge(props.star, props.year);
  return kind === 'farthestRun' ? t.value.longestRun : kind === 'longestSession' ? t.value.longestWorkout : null;
});

/* ---------- 位置：追着指针外端走 ---------- */

const pos = ref({ x: 0, y: 0 });
let placed = false, frame = 0, flight: Animation | null = null;
/** 长出 / 缩回期间位置不动：缩放原点要对得上刻线。 */
let pinned = false;

/** 卡片该在哪：刻线外端的右边（贴边就左边），竖着居中对着它。 */
function aim() {
  const host = props.stage, p = props.point();
  if (!host || !p) return null;
  const box = host.getBoundingClientRect();
  const height = card.value?.offsetHeight ?? 220;
  const x = p.x - box.left, y = p.y - box.top;
  const right = x + 28 + WIDTH < box.width - 12;
  return {
    star: { x, y },
    left: Math.max(12, Math.min(box.width - WIDTH - 12, right ? x + 28 : x - 28 - WIDTH)),
    top: Math.max(12, Math.min(box.height - height - 12, y - height / 2)),
  };
}
/** 缩放原点：刻线外端相对卡片左上角。 */
const originAt = (next: ReturnType<typeof aim>) => (next ? `${next.star.x - pos.value.x}px ${next.star.y - pos.value.y}px` : '0 0');
function track() {
  frame = requestAnimationFrame(track);
  if (!card.value?.isConnected) return;
  const next = aim();
  if (!next || !card.value) return;
  if (pinned) {
    card.value.style.transformOrigin = originAt(next);
    return;
  }
  const k = placed && !lessMotion() ? 0.3 : 1;
  pos.value = { x: pos.value.x + (next.left - pos.value.x) * k, y: pos.value.y + (next.top - pos.value.y) * k };
  card.value.style.translate = `${pos.value.x.toFixed(1)}px ${pos.value.y.toFixed(1)}px`;
  placed = true;
}

async function grow() {
  await nextTick();
  const el = card.value;
  if (!el) return;
  track();
  el.focus({ preventScroll: true });
  if (lessMotion()) return;
  pinned = true;
  el.style.transformOrigin = originAt(aim());
  flight = el.animate([{ scale: '.04', opacity: 0 }, { opacity: 1, offset: 0.35 }, { scale: '1', opacity: 1 }], { duration: 420, easing: OPEN_EASE, fill: 'backwards' });
  const done = () => { pinned = false; };
  flight.finished.then(done, done);
}
async function shrink() {
  const el = card.value;
  if (!el || lessMotion()) { emit('closed'); return; }
  // 从此刻的样子缩回去（长到一半就关也不跳）。
  const now = Number.parseFloat(getComputedStyle(el).scale) || 1;
  const opacity = Number.parseFloat(getComputedStyle(el).opacity) || 1;
  flight?.cancel();
  pinned = true;
  el.style.transformOrigin = originAt(aim());
  flight = el.animate([{ scale: String(now), opacity }, { opacity: Math.min(opacity, 1), offset: 0.6 }, { scale: '.04', opacity: 0 }], { duration: 320, easing: 'cubic-bezier(.4, 0, .7, .2)', fill: 'forwards' });
  try { await flight.finished; } catch { return; }
  emit('closed');
}
watch(() => props.closing, (now) => { if (now) void shrink(); });
onMounted(() => { void grow(); });
onBeforeUnmount(() => { cancelAnimationFrame(frame); flight?.cancel(); });
/* 年轮页被缓存着（去了运动详情）时不追：脱离文档的舞台量出来全是错的，回来那一刻卡会从别处滑回来，形变的窗口也跟着它跑。
   回来时直接摆到位，详情页缩回的就是它此刻的位置。 */
onDeactivated(() => { cancelAnimationFrame(frame); });
onActivated(() => { cancelAnimationFrame(frame); placed = false; track(); });

/* ---------- 换一次：滚轮 / 横扫 / 左右拖 ---------- */

/** 滚轮一格在高分屏上只报 40–50px（DPR 2 时减半）：一格就该走一步，触控板要稍微扫一下。 */
const WHEEL_STEP = 40;
const DRAG_STEP = 36;
const COOLDOWN_MS = 220;
let wheelSum = 0, coolUntil = 0;
function step(delta: 1 | -1) {
  coolUntil = performance.now() + COOLDOWN_MS;
  wheelSum = 0;
  emit('step', delta);
}
function onWheel(event: WheelEvent) {
  const raw = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  const delta = event.deltaMode === 1 ? raw * 16 : raw;
  // 触控板的惯性尾巴：刚换过就吃掉，不连着换好几次。
  if (performance.now() < coolUntil) { wheelSum = 0; return; }
  wheelSum += delta;
  if (Math.abs(wheelSum) >= WHEEL_STEP) step(wheelSum > 0 ? 1 : -1);
}
let drag: { x: number; id: number; moved: boolean } | null = null;
const rubber = (dx: number) => dx / (1 + Math.abs(dx) / 120);
function onDown(event: PointerEvent) {
  if (event.button !== 0 || (event.target as Element).closest('a, button')) return;
  drag = { x: event.clientX, id: event.pointerId, moved: false };
}
function onDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id || !face.value) return;
  const dx = event.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) < 4) return;
  if (!drag.moved) { drag.moved = true; card.value?.setPointerCapture(event.pointerId); }
  if (Math.abs(dx) >= DRAG_STEP) {
    // 往左拖是往后翻（像翻一叠卡）；换完从这里重新算，拖着不放可以连着翻。
    step(dx < 0 ? 1 : -1);
    drag.x = event.clientX;
    face.value.style.translate = '';
    return;
  }
  face.value.style.translate = `${rubber(dx).toFixed(1)}px 0`;
}
function onUp(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return;
  drag = null;
  const el = face.value;
  if (!el || !el.style.translate) return;
  const from = el.style.translate;
  el.style.translate = '';
  if (!lessMotion()) el.animate([{ translate: from }, { translate: '0 0' }], { duration: 260, easing: 'cubic-bezier(.2, .9, .3, 1.2)' });
}

/* 换了一次：类型和日期顺着方向滑进来（数字自己会滚）。 */
const head = ref<HTMLElement | null>(null);
watch(() => props.star, (now, before) => {
  if (!before || now.workout_id === before.workout_id || lessMotion()) return;
  const forward = now.date >= before.date;
  void nextTick(() => {
    head.value?.animate([{ opacity: 0.15, translate: `${forward ? 10 : -10}px 0` }, { opacity: 1, translate: '0 0' }], { duration: 300, easing: 'cubic-bezier(.2, .7, .2, 1)' });
  });
});

function key(event: KeyboardEvent) {
  if (event.key !== 'Tab') return;
  const items = [...card.value!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')];
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next = index < 0 ? (event.shiftKey ? items.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
  event.preventDefault(); items[next]?.focus();
}
</script>

<template>
  <section ref="card" class="star-card" role="dialog" aria-labelledby="ring-star-title" aria-describedby="ring-star-hint" tabindex="-1" data-morph-card
    :style="{ width: `${WIDTH}px` }"
    @keydown="key" @wheel.stop.prevent="onWheel" @pointerdown.stop="onDown" @pointermove.stop="onDrag" @pointerup.stop="onUp" @pointercancel.stop="onUp" @dblclick.stop>
    <div ref="face" class="face">
      <header>
        <span class="dot" aria-hidden="true" />
        <div ref="head" class="head">
          <h2 id="ring-star-title">{{ workoutLabel(star.kind) }}</h2>
          <p class="date">{{ when }}</p>
        </div>
        <button type="button" class="icon-button" :aria-label="t.close" @click="emit('close')"><Icon name="x" :size="14" /></button>
      </header>
      <TransitionGroup tag="dl" name="cell" :class="['cells', { single: cells.length === 1 }]">
        <div v-for="cell in cells" :key="cell.key" class="cell">
          <dt>{{ cellLabel(cell) }}</dt>
          <dd><RollingNumber :value="cellValue(cell).value" /><small v-if="cellValue(cell).unit">{{ cellValue(cell).unit }}</small></dd>
        </div>
      </TransitionGroup>
      <Transition name="cell">
        <div v-if="zones" class="zones" role="img" :aria-label="workoutText.metricAvgHr">
          <i v-for="zone in zones" :key="zone.index" :class="`zone-${zone.index}`" :style="{ flexGrow: zone.share }" />
        </div>
      </Transition>
      <footer>
        <div class="marks">
          <Transition name="cell">
            <svg v-if="route" class="route" viewBox="0 0 64 40" aria-hidden="true"><path :d="route" /></svg>
          </Transition>
          <span v-if="badge" class="badge"><Icon name="star" :size="13" />{{ badge }}</span>
        </div>
        <RouterLink class="open" :to="{ name: 'WorkoutDetail', params: { workoutId: star.workout_id } }">{{ t.starOpen }}</RouterLink>
      </footer>
      <p id="ring-star-hint" class="sr-only">{{ t.starHint }}</p>
    </div>
  </section>
</template>

<style scoped>
.star-card { position: absolute; left: 0; top: 0; z-index: 4; box-sizing: border-box; padding: 14px 16px; border-radius: 18px; outline: none; touch-action: none; cursor: grab;
  color: var(--wood-card-ink); background: var(--wood-card); border: 1px solid var(--wood-card-line); box-shadow: 0 18px 40px -12px var(--wood-shadow), inset 0 1px 0 rgba(255, 240, 214, .08);
  -webkit-backdrop-filter: var(--mat-glass-blur); backdrop-filter: var(--mat-glass-blur); }
.star-card:active { cursor: grabbing; }
.face { display: grid; gap: 12px; }
header { display: flex; align-items: flex-start; gap: 10px; }
.dot { flex: none; width: 9px; height: 9px; margin-top: 7px; border-radius: 50%; background: var(--wood-card-amber); box-shadow: 0 0 0 3px color-mix(in srgb, var(--wood-card-amber) 22%, transparent); }
.head { flex: 1; min-width: 0; }
h2 { margin: 0; font-size: 17px; font-weight: 650; line-height: 1.3; }
.date { margin: 2px 0 0; color: var(--wood-card-muted); font-size: 14px; font-variant-numeric: tabular-nums; }
.cells { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 14px; margin: 0; }
.cell { min-width: 0; }
dt { color: var(--wood-card-muted); font-size: 12px; }
dd { display: flex; align-items: baseline; gap: 4px; margin: 2px 0 0; font: 22px/1.2 var(--font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
dd small { color: var(--wood-card-muted); font: 13px/1 var(--font-sans); }
.zones { display: flex; gap: 2px; height: 6px; overflow: hidden; border-radius: 999px; background: var(--wood-card-press); }
.zones i { min-width: 3px; opacity: .92; }
.zone-0 { background: var(--pace); } .zone-1 { background: var(--route-mint); } .zone-2 { background: var(--training); }
.zone-3 { background: var(--altitude); } .zone-4 { background: var(--calories); } .zone-5 { background: var(--heart); }
footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.marks { display: flex; align-items: center; gap: 10px; min-width: 0; }
.route { flex: none; width: 64px; height: 40px; }
.route path { fill: none; stroke: var(--wood-card-amber); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.badge { display: inline-flex; align-items: center; gap: 5px; min-width: 0; color: var(--wood-card-amber); font-size: 13px; font-weight: 600; }
.icon-button { flex: none; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 999px; background: var(--wood-card-press); color: inherit; cursor: pointer; transition: background 160ms ease, scale 120ms ease; }
.icon-button:hover { background: var(--wood-card-press-hover); }
.icon-button:active { scale: .9; }
.open { flex: none; padding: 7px 14px; border-radius: 999px; background: var(--wood-card-amber); color: var(--wood-card-amber-ink); font-size: 14px; font-weight: 600; text-decoration: none; transition: background 160ms ease; }
.open:hover { background: var(--wood-card-amber-hover); }
.cell-enter-active { transition: opacity 260ms ease 60ms; } .cell-leave-active { transition: opacity 140ms ease; position: absolute; }
.cell-enter-from, .cell-leave-to { opacity: 0; }
</style>

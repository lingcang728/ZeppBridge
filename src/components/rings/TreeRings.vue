<script setup lang="ts">
/* 年轮（2026-10-27 第六版）：一块真树的横截面——实心木片、心材红褐到边材浅黄、一道道细木纹、外面一圈粗糙的树皮（lib/rings/wood.ts）。
   一年长一圈，最早那年在最里面；圈的宽窄顺着一年走（1 月 1 日在正上方、顺时针），那周练得多就鼓出来；没数据的周外沿的线是断开的。
   选中那圈提亮、外沿描深，圈里一次运动一道深色细纹（长短看时长）。页面上只有这块木头（用户要「只留大大的年轮」），让人自己探索：
   - 鼠标在木头上：一根径向的指针跟着走，指着一年里的哪一天（外面那个月份亮起来）；所在那圈微微亮起，浮出那一周（日期、几次、多久）；
   - 点一圈选那年（那圈闪一下），键盘 ← → 也能换（左上角的年份胶囊用户 2026-10-27 说不需要，去掉了）；
   - 悬停 / 点细纹是那次运动，点开卡片从细纹里长出来（StarCard）；开着时一根琥珀指针从髓心指着它，在卡上滚轮 / 触控板两指扫
     或按 ← → 顺着时间走，指针沿年轮转过去、卡沿着圆周跟过去（用户 2026-10-28：不要箭头，也不要左右拖）；
   - 滚轮放大（以鼠标为中心），放大后拖动平移，双击或右下角「还原」回来；键盘 + − 0 一样。
   进来时一圈圈从髓心往外长出来、最后树皮合上，之后一道很淡的光泽隔一阵扫过木面（只动 transform）。 */
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import StarCard from './StarCard.vue';
import { bandPath, edgeSegments, hitRing, loopPath, monthStarts, neighborStar, pointAt, radiusAt, ringTicks, treeLayout, wedgePath, weekAtFraction } from '../../lib/rings/tree';
import { bandWood, barkOf, grainPaths, raysOf, slicePath, WOOD } from '../../lib/rings/wood';
import { lessMotion } from '../../lib/motion/lessMotion';
import { shortestArc } from '../../lib/rings/starCard';
import { onMotionEscape } from '../../lib/motion/interrupt';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { kmText } from '../../lib/logbook/display';
import { workoutLabel } from '../../lib/labels';
import { useRingsText } from './rings.i18n';
import type { RingYear } from '../../types/rings';

const props = defineProps<{ years: RingYear[]; selected: number }>();
const emit = defineEmits<{ pick: [year: number] }>();
const t = useRingsText();

/* 画布坐标：圆心在原点，木头半径 R，外面一圈树皮，再外面留给月份。 */
const R = 290;
const BARK = 16;
const RIM = R + BARK * 1.3;
const VIEW = RIM + 52;
const layout = computed(() => treeLayout(props.years, R));
const bark = computed(() => barkOf(layout.value, BARK));
const rays = computed(() => raysOf(layout.value));
/* 光泽和投影是圆的，木头边缘却是起伏的：两者都只铺到木头最窄的地方以内（投影圆本身是空心的，露出来就成了一块亮圆），
   投影靠扩散和偏移伸到木头外面。 */
const sheenFrac = computed(() => Math.min(...(layout.value.bands[layout.value.bands.length - 1]?.outer ?? [R])) / VIEW);
const shadowFrac = computed(() => (2 * 0.9 * Math.min(...(layout.value.bands[layout.value.bands.length - 1]?.outer ?? [R]))) / (2 * VIEW));
const shapes = computed(() => layout.value.bands.map(band => ({
  band,
  fill: bandPath(band),
  wood: bandWood(band, R),
  late: slicePath(band, 0.66, 1),
  grain: grainPaths(band),
  edges: edgeSegments(band),
  width: radiusAt(band.outer, 0) - radiusAt(band.inner, 0),
  labelY: -(radiusAt(band.outer, 0) + radiusAt(band.inner, 0)) / 2,
})));
const current = computed(() => shapes.value.find(s => s.band.year === props.selected) ?? null);
const year = computed(() => props.years.find(y => y.year === props.selected) ?? null);
const stars = computed(() => year.value?.stars ?? []);
const ticks = computed(() => (current.value ? ringTicks(current.value.band, stars.value) : []));
const innerEdge = computed(() => (current.value && current.value.band.index > 0 ? loopPath(current.value.band.inner) : null));
const order = computed(() => props.years.map(y => y.year));

const monthFormat = computed(() => displayDateTimeFormatter({ month: 'short' }));
const months = computed(() => monthStarts(props.selected).map((f, month) => {
  const long = month % 3 === 0;
  const a = pointAt(RIM + 8, f), b = pointAt(RIM + (long ? 18 : 13), f), label = pointAt(RIM + 32, f + 1 / 24);
  return { a, b, label, f, text: monthFormat.value.format(new Date(2024, month, 1)) };
}));

/* 指针：哪一圈的哪一周，或者选中那圈里的哪一道细纹；在木头上时还有一根径向指针。 */
const svg = ref<SVGSVGElement | null>(null);
const host = ref<HTMLElement | null>(null);
const hover = ref<{ year: number; f: number } | null>(null);
const hoverTick = ref<number | null>(null);
const needle = ref<number | null>(null);
const pointer = ref({ x: 0, y: 0 });
const toLocal = (clientX: number, clientY: number) => {
  const m = svg.value?.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
};
const toClient = (x: number, y: number) => {
  const m = svg.value?.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(x, y).matrixTransform(m);
  return { x: p.x, y: p.y };
};
const fractionAt = (x: number, y: number) => (((Math.atan2(y, x) + Math.PI / 2) / (Math.PI * 2)) % 1 + 1) % 1;
function locate(event: MouseEvent) {
  const p = toLocal(event.clientX, event.clientY);
  const hit = p ? hitRing(layout.value, p.x, p.y) : null;
  if (!hit) return { p, hit: null, tick: null };
  let tick: number | null = null;
  if (hit.band.year === props.selected) {
    // 放大后细纹之间离得远了，能点中的范围跟着收窄。
    let best = 0.0035 / Math.sqrt(zoom.value.s);
    for (const k of ticks.value) {
      const d = Math.abs(k.f - hit.f);
      if (d < best) { best = d; tick = k.index; }
    }
  }
  return { p, hit, tick };
}
function onMove(event: PointerEvent) {
  const box = host.value?.getBoundingClientRect();
  if (box) pointer.value = { x: event.clientX - box.left, y: event.clientY - box.top };
  if (drag && drag.moved) return;
  if (open.value !== null) { needle.value = null; return; }
  const { p, hit, tick } = locate(event);
  needle.value = p && Math.hypot(p.x, p.y) <= RIM ? fractionAt(p.x, p.y) : null;
  hover.value = hit ? { year: hit.band.year, f: hit.f } : null;
  hoverTick.value = tick;
}
function onLeave() { hover.value = null; hoverTick.value = null; needle.value = null; }
const needleLine = computed(() => {
  if (needle.value === null) return null;
  const a = pointAt(layout.value.pith * 1.6, needle.value), b = pointAt(RIM + 4, needle.value);
  return { a, b };
});
const nearMonth = computed(() => {
  if (needle.value === null) return -1;
  const f = needle.value, list = months.value;
  return list.findIndex((m, i) => f >= m.f && f < (list[i + 1]?.f ?? 1));
});
function onClick(event: MouseEvent) {
  if (suppressClick) { suppressClick = false; return; }
  const { hit, tick } = locate(event);
  if (tick !== null) { show(tick); return; }
  if (open.value !== null) { close(); return; }
  if (hit && hit.band.year !== props.selected) emit('pick', hit.band.year);
}

const hoverWedge = computed(() => {
  const h = hover.value;
  if (!h || hoverTick.value !== null) return null;
  const shape = shapes.value.find(s => s.band.year === h.year);
  if (!shape) return null;
  const week = weekAtFraction(h.year, h.f);
  return { d: wedgePath(shape.band, week.start, week.end), week };
});
const dayFormat = computed(() => displayDateTimeFormatter({ month: 'short', day: 'numeric' }));
const shortDay = (date: string) => dayFormat.value.format(parseDisplayDate(date));
const tooltip = computed(() => {
  if (hoverTick.value !== null) {
    const s = stars.value[hoverTick.value];
    return s ? [shortDay(s.date), workoutLabel(s.kind), s.distance_m ? `${kmText(s.distance_m / 1000)} km` : null].filter(Boolean).join(' · ') : null;
  }
  const w = hoverWedge.value, h = hover.value;
  if (!w || !h) return null;
  const y = props.years.find(v => v.year === h.year);
  const minutes = y?.weeks[w.week.week] ?? null;
  const count = (y?.stars ?? []).filter(s => s.date >= w.week.from && s.date <= w.week.to).length;
  const amount = minutes === null ? t.value.weekNoData : count ? `${t.value.times(count)} · ${t.value.hoursValue((minutes / 60).toFixed(1))}` : t.value.weekRest;
  return `${h.year} · ${shortDay(w.week.from)}–${shortDay(w.week.to)} · ${amount}`;
});

/* 点开的那次运动：卡片从细纹外端长出来，← → 顺着时间去前一次 / 后一次。 */
const open = ref<number | null>(null);
const closing = ref(false);
const openStar = computed(() => (open.value === null ? null : stars.value[open.value] ?? null));
/** 前后各一次：卡片预读它们的详情，拨过去就是满的。 */
const neighborIds = computed(() => {
  if (open.value === null) return [];
  return [-1, 1].map(d => stars.value[open.value! + d]?.workout_id).filter((v): v is string => !!v);
});
function show(index: number) { open.value = index; closing.value = false; hover.value = null; hoverTick.value = null; needle.value = null; aimNeedle(); }
function close() {
  if (open.value === null || closing.value) return;
  closing.value = true;
  host.value?.focus({ preventScroll: true });
}
function closed() { open.value = null; closing.value = false; aim.value = null; cancelAnimationFrame(aimFrame); }
function stepStar(delta: 1 | -1) {
  if (open.value === null) return;
  const next = neighborStar(stars.value, open.value, delta);
  if (next !== null) show(next);
}
/* 琥珀指针：转向点开的那道细纹的外端，换一次就沿最短的那段弧转过去；卡片追的就是指针的外端，所以卡沿着圆周走。 */
const aim = ref<{ f: number; r: number } | null>(null);
let aimFrame = 0;
function aimNeedle() {
  cancelAnimationFrame(aimFrame);
  const stepFrame = () => {
    const tick = open.value === null ? null : ticks.value[open.value];
    if (!tick) { aim.value = null; return; }
    const r = Math.hypot(tick.x2, tick.y2);
    const now = aim.value;
    if (!now || lessMotion()) { aim.value = { f: tick.f, r }; return; }
    const df = shortestArc(now.f, tick.f), dr = r - now.r;
    if (Math.abs(df) < 0.0002 && Math.abs(dr) < 0.2) { aim.value = { f: tick.f, r }; return; }
    aim.value = { f: (((now.f + df * 0.2) % 1) + 1) % 1, r: now.r + dr * 0.2 };
    aimFrame = requestAnimationFrame(stepFrame);
  };
  stepFrame();
}
const aimLine = computed(() => {
  if (!aim.value || open.value === null) return null;
  return { a: pointAt(layout.value.pith * 1.6, aim.value.f), b: pointAt(aim.value.r, aim.value.f) };
});
const point = () => {
  const p = aimLine.value?.b;
  return p ? toClient(p.x, p.y) : null;
};
const stepYear = (delta: number) => {
  const next = order.value[order.value.indexOf(props.selected) + delta];
  if (next !== undefined) emit('pick', next);
};

/* 放大 / 平移：整块木头（连同投影、光泽）一起 transform，只动合成属性。 */
const MAX_ZOOM = 4;
const zoom = ref({ s: 1, x: 0, y: 0 });
const panning = ref(false);
let drag: { x: number; y: number; zx: number; zy: number; moved: boolean; id: number } | null = null;
let suppressClick = false;
function setZoom(s: number, x: number, y: number) {
  const box = host.value?.getBoundingClientRect();
  if (!box) return;
  const scale = Math.min(MAX_ZOOM, Math.max(1, s));
  zoom.value = { s: scale, x: Math.min(0, Math.max(box.width * (1 - scale), x)), y: Math.min(0, Math.max(box.height * (1 - scale), y)) };
}
function zoomAt(clientX: number, clientY: number, next: number) {
  const box = host.value?.getBoundingClientRect();
  if (!box) return;
  if (open.value !== null) close();
  const { s, x, y } = zoom.value;
  const cx = clientX - box.left, cy = clientY - box.top;
  const k = Math.min(MAX_ZOOM, Math.max(1, next)) / s;
  setZoom(s * k, cx - (cx - x) * k, cy - (cy - y) * k);
}
const zoomCenter = (factor: number) => {
  const box = host.value?.getBoundingClientRect();
  if (box) zoomAt(box.left + box.width / 2, box.top + box.height / 2, zoom.value.s * factor);
};
const resetZoom = () => { zoom.value = { s: 1, x: 0, y: 0 }; };
function onWheel(event: WheelEvent) {
  const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
  zoomAt(event.clientX, event.clientY, zoom.value.s * Math.exp(-delta * 0.0018));
}
function onDown(event: PointerEvent) {
  if (event.button !== 0 || zoom.value.s <= 1) return;
  drag = { x: event.clientX, y: event.clientY, zx: zoom.value.x, zy: zoom.value.y, moved: false, id: event.pointerId };
}
function onDragMove(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  if (!drag.moved) {
    drag.moved = true;
    panning.value = true;
    onLeave();
    if (open.value !== null) close();
    host.value?.setPointerCapture(event.pointerId);
  }
  setZoom(zoom.value.s, drag.zx + dx, drag.zy + dy);
}
function onUp(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return;
  if (drag.moved) suppressClick = true;
  drag = null;
  panning.value = false;
}
const zoomed = computed(() => zoom.value.s > 1.01);
const plateStyle = computed(() => ({ transform: `translate(${zoom.value.x}px, ${zoom.value.y}px) scale(${zoom.value.s})` }));

/* 选中那圈换了：那圈闪一下。 */
const flash = ref(0);

/* ← →：卡片开着时顺着时间走，否则换年份；+ − 0 放大缩小还原。输入框、别的弹窗里的不管。 */
let active = true;
const onKey = (event: KeyboardEvent) => {
  if (!active || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target as HTMLElement | null;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.closest('[data-modal-dialog], [role="tablist"], [role="radiogroup"]'))) return;
  if (target && target !== document.body && !target.closest('.rings-page')) return;
  if (event.key === 'Escape' && open.value !== null) { event.preventDefault(); close(); return; }
  if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomCenter(1.4); return; }
  if (event.key === '-') { event.preventDefault(); zoomCenter(1 / 1.4); return; }
  if (event.key === '0') { event.preventDefault(); resetZoom(); return; }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const delta = event.key === 'ArrowRight' ? 1 : -1;
  if (open.value !== null) stepStar(delta);
  else stepYear(delta);
};

/* 进来时一圈圈长出来：每次进页面（含 KeepAlive 缓存着又回来）都从髓心往外长一遍。 */
const growing = ref(false);
/* 长完就把 growing 拿掉：不然换年时新插进来的细纹会再等一遍入场的延迟才出来，旧的也要等到超时才走。 */
let grown = 0;
async function grow() {
  growing.value = false;
  window.clearTimeout(grown);
  if (lessMotion()) return;
  await nextTick();
  requestAnimationFrame(() => {
    growing.value = true;
    grown = window.setTimeout(() => { growing.value = false; }, 1000 + 110 * shapes.value.length);
  });
}
/* 卡片开着时点年轮和卡片以外的地方：收起卡片（年轮上的点击由 onClick 自己处理）。 */
const onOutside = (event: PointerEvent) => {
  // 页面被缓存着（在运动详情里）时不管：点详情页的返回键不该把回来要落的那张卡关掉。
  if (!active || open.value === null || !(event.target instanceof Element)) return;
  if (event.target.closest('.star-card') || svg.value?.contains(event.target)) return;
  close();
};
let forgetEscape: (() => void) | undefined;
onMounted(() => {
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onOutside);
  forgetEscape = onMotionEscape(() => { if (!active || open.value === null) return false; close(); return true; });
  void grow();
});
/* 从「看这次运动」回来：卡还开着、木头不重新长一遍、放大的样子也留着——详情页正好缩回这张卡（用户 2026-10-28 定）。 */
onActivated(() => { active = true; if (open.value === null) void grow(); });
onDeactivated(() => {
  active = false;
  onLeave();
  if (closing.value) closed();
  if (open.value === null) resetZoom();
});
onBeforeUnmount(() => { window.clearTimeout(grown); cancelAnimationFrame(aimFrame); window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onOutside); forgetEscape?.(); });

/* 换年时卡片和悬停都清掉，那圈闪一下。 */
watch(() => props.selected, () => { open.value = null; closing.value = false; aim.value = null; onLeave(); flash.value += 1; });
</script>

<template>
  <div ref="host" :class="['tree-rings', { growing, zoomed, panning }]" tabindex="0" :aria-label="t.yearAria(selected)"
    @wheel.prevent="onWheel" @pointerdown="onDown" @pointermove="onDragMove" @pointerup="onUp" @pointercancel="onUp" @dblclick="resetZoom">
    <div class="viewport">
      <div class="plate" :style="plateStyle">
        <div class="disc-shadow" aria-hidden="true" />
        <svg ref="svg" :viewBox="`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`" role="img" :aria-label="t.intro"
          :class="{ 'on-tick': hoverTick !== null, 'on-ring': hover !== null && hover.year !== selected }"
          @pointermove="onMove" @pointerleave="onLeave" @click="onClick">
          <circle class="guide" :r="RIM + 8" />
          <g class="months" aria-hidden="true">
            <g v-for="(m, i) in months" :key="m.text" :class="{ near: i === nearMonth }">
              <line :x1="m.a.x" :y1="m.a.y" :x2="m.b.x" :y2="m.b.y" />
              <text :x="m.label.x" :y="m.label.y">{{ m.text }}</text>
            </g>
          </g>
          <g class="bark" aria-hidden="true">
            <path class="bark-side" :d="bark.outer" transform="translate(0 6)" />
            <path class="bark-body" :d="bark.ring" fill-rule="evenodd" />
            <path class="bark-cracks" :d="bark.cracks" />
            <path class="bark-flecks" :d="bark.flecks" />
            <path class="cambium" :d="bark.cambium" />
          </g>
          <g v-for="shape in shapes" :key="shape.band.year" :class="['band', { selected: shape.band.year === selected, hovered: hover?.year === shape.band.year, blank: shape.band.blank }]"
            :style="{ '--i': shape.band.index }">
            <path class="fill" :d="shape.fill" :fill="shape.wood" fill-rule="evenodd" />
            <path class="late" :d="shape.late" fill-rule="evenodd" />
            <path class="grain" :d="shape.grain.light" />
            <path class="grain dark" :d="shape.grain.dark" />
            <path class="lit" :d="shape.fill" fill-rule="evenodd" />
            <path v-if="shape.band.year === selected && flash > 0" :key="flash" class="flash" :d="shape.fill" fill-rule="evenodd" />
            <template v-if="shape.band.year === selected">
              <path v-for="(seg, k) in shape.edges" :key="`h${k}`" :class="['halo', { gap: !seg.present }]" :d="seg.d" />
            </template>
            <path v-for="(seg, k) in shape.edges" :key="`e${k}`" :class="['edge', { gap: !seg.present }]" :d="seg.d" />
          </g>
          <path class="rays" :d="rays" aria-hidden="true" />
          <path v-if="innerEdge" class="inner-edge" :d="innerEdge" />
          <path v-if="hoverWedge" class="wedge" :d="hoverWedge.d" />
          <Transition name="ticks">
            <g :key="selected" class="ticks">
              <line v-for="tick in ticks" :key="tick.index" :class="{ hot: tick.index === hoverTick || tick.index === open }"
                :x1="tick.x1" :y1="tick.y1" :x2="tick.x2" :y2="tick.y2" />
            </g>
          </Transition>
          <circle class="pith-halo" r="9" />
          <circle class="pith" r="4" />
          <g class="labels" aria-hidden="true">
            <text v-for="shape in shapes.filter(s => s.width >= 15 || s.band.year === selected)" :key="shape.band.year"
              :class="{ selected: shape.band.year === selected, hovered: hover?.year === shape.band.year }" x="0" :y="shape.labelY">{{ shape.band.year }}</text>
          </g>
          <g v-if="aimLine" :class="['aim', { closing }]" aria-hidden="true">
            <line :x1="aimLine.a.x" :y1="aimLine.a.y" :x2="aimLine.b.x" :y2="aimLine.b.y" />
            <circle :cx="aimLine.b.x" :cy="aimLine.b.y" r="4.5" />
          </g>
          <g v-if="needleLine" class="needle" aria-hidden="true">
            <line :x1="needleLine.a.x" :y1="needleLine.a.y" :x2="needleLine.b.x" :y2="needleLine.b.y" />
            <circle :cx="needleLine.b.x" :cy="needleLine.b.y" r="3.5" />
          </g>
        </svg>
        <div class="sheen" aria-hidden="true"><i /></div>
      </div>
    </div>
    <Transition name="zoom-chip">
      <div v-if="zoomed" class="zoom-chip" @pointerdown.stop @dblclick.stop>
        <span>{{ Math.round(zoom.s * 100) }}%</span>
        <button type="button" @click="resetZoom">{{ t.zoomReset }}</button>
      </div>
    </Transition>
    <div v-if="tooltip && open === null && !panning" class="ring-tip" role="tooltip" :style="{ transform: `translate(${pointer.x}px, ${pointer.y}px)` }">{{ tooltip }}</div>
    <StarCard v-if="openStar && open !== null" :star="openStar" :year="year" :neighbors="neighborIds" :point="point" :stage="host" :closing="closing"
      @close="close" @closed="closed" @step="stepStar" />
  </div>
</template>

<style scoped>
/* 舞台占满页面宽度，木头在中间按高度放到最大（viewBox 自己保持正方形）；右下角的缩放浮在旁边空白里。 */
.tree-rings { position: relative; width: 100%; height: clamp(320px, calc(100vh - 190px), 920px); container-type: size; outline: none; user-select: none; -webkit-user-select: none; }
.tree-rings:focus-visible { outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent); outline-offset: 4px; border-radius: var(--radius-lg); }
.viewport { position: absolute; inset: 0; overflow: clip; border-radius: var(--radius-lg); }
.plate { position: absolute; inset: 0; transform-origin: 0 0; transition: transform 320ms cubic-bezier(.2, .8, .25, 1); will-change: transform; }
.panning .plate { transition: none; }
svg { position: relative; z-index: 1; display: block; width: 100%; height: 100%; overflow: visible; cursor: crosshair; touch-action: none; }
.zoomed svg { cursor: grab; }
.panning svg { cursor: grabbing; }
svg.on-ring, svg.on-tick { cursor: pointer; }
/* 木片下面的投影：静态的一层，不跟动画重画。 */
.disc-shadow { position: absolute; left: 50%; top: 50%; width: calc(100cqmin * v-bind(shadowFrac)); aspect-ratio: 1; translate: -50% -50%; border-radius: 50%;
  box-shadow: 0 34px 80px calc(100cqmin * .06) var(--wood-shadow), 0 14px 30px calc(100cqmin * .04) var(--wood-shadow); }
.guide { fill: none; stroke: var(--wood-guide); stroke-width: 1; stroke-dasharray: 1 6; stroke-linecap: round; }
.months line { stroke: var(--wood-guide); stroke-width: 1.2; transition: stroke 200ms ease; }
.months text { fill: var(--muted); font-size: 12px; text-anchor: middle; dominant-baseline: middle; transition: fill 200ms ease; }
.months .near line { stroke: var(--ink); }
.months .near text { fill: var(--ink); font-weight: 600; }
/* 树皮。 */
.bark-side { fill: v-bind('WOOD.barkSide'); }
.bark-body { fill: v-bind('WOOD.bark'); }
.bark-cracks { fill: none; stroke: v-bind('WOOD.barkCrack'); stroke-width: 1.4; stroke-linecap: round; }
.bark-flecks { fill: none; stroke: v-bind('WOOD.fleck'); stroke-width: 2; stroke-linecap: round; }
.cambium { fill: none; stroke: v-bind('WOOD.cambium'); stroke-width: 2.4; }
/* 木头：底色按圈在整块木头里的位置（心材 → 边材），靠外沿深一层是晚材，一道道细木纹。 */
.late { fill: v-bind('WOOD.late'); pointer-events: none; }
.grain { fill: none; stroke: v-bind('WOOD.grain'); stroke-width: .8; pointer-events: none; }
.grain.dark { stroke: v-bind('WOOD.grainDark'); }
.rays { fill: none; stroke: v-bind('WOOD.ray'); stroke-width: 1.2; pointer-events: none; }
.edge { fill: none; stroke: v-bind('WOOD.line'); stroke-width: 1.3; stroke-linejoin: round; pointer-events: none; transition: stroke-width 220ms ease; }
.edge.gap { stroke-dasharray: 2 5; stroke-opacity: .65; }
/* 悬停那圈微微亮起；选中那圈提亮、外沿描深，外面一圈很淡的亮边。 */
.lit { fill: v-bind('WOOD.lit'); opacity: 0; transition: opacity 240ms ease; pointer-events: none; }
.band.hovered:not(.selected) .lit { opacity: 1; }
.band.hovered:not(.selected) .edge { stroke-width: 2; }
.band.selected .lit { fill: v-bind('WOOD.selected'); opacity: 1; }
.band.selected .edge { stroke: v-bind('WOOD.mark'); stroke-width: 2.2; }
.flash { fill: #FFF6DE; opacity: 0; pointer-events: none; animation: ring-flash 720ms ease-out; }
.halo { fill: none; stroke: v-bind('WOOD.halo'); stroke-width: 6; stroke-linejoin: round; pointer-events: none; }
.halo.gap { stroke-dasharray: 2 5; }
.inner-edge { fill: none; stroke: v-bind('WOOD.mark'); stroke-width: 2.2; pointer-events: none; }
.wedge { fill: v-bind('WOOD.lit'); pointer-events: none; }
.ticks { pointer-events: none; }
.ticks line { stroke: v-bind('WOOD.tick'); stroke-width: 1.2; stroke-linecap: round; transition: stroke-width 120ms ease; }
.ticks line.hot { stroke: v-bind('WOOD.tickHot'); stroke-width: 3; }
.ticks-enter-active { transition: opacity 360ms ease 120ms; } .ticks-leave-active { transition: opacity 160ms ease; }
.ticks-enter-from, .ticks-leave-to { opacity: 0; }
.pith { fill: v-bind('WOOD.pith'); pointer-events: none; }
.pith-halo { fill: rgba(120, 62, 24, .35); pointer-events: none; }
.labels text { fill: v-bind('WOOD.label'); font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; text-anchor: middle; dominant-baseline: middle; pointer-events: none;
  paint-order: stroke; stroke: v-bind('WOOD.labelHalo'); stroke-width: 3px; transition: fill 240ms ease; }
.labels text.hovered { fill: v-bind('WOOD.mark'); }
.labels text.selected { fill: v-bind('WOOD.mark'); font-size: 14px; font-weight: 700; }
.needle { pointer-events: none; }
/* 点开那次运动的指针：琥珀色、比悬停的那根实，关卡时跟着淡掉。 */
.aim { pointer-events: none; transition: opacity 260ms ease; }
.aim.closing { opacity: 0; }
.aim line { stroke: var(--wood-card-amber); stroke-width: 1.6; stroke-linecap: round; }
.aim circle { fill: var(--wood-card-amber); stroke: v-bind('WOOD.labelHalo'); stroke-width: 2; }
.needle line { stroke: rgba(255, 248, 230, .7); stroke-width: 1; stroke-dasharray: 3 3; }
.needle circle { fill: var(--ink); stroke: var(--bg, transparent); stroke-width: 1.5; }
/* 光泽：一道很淡的斜光隔一阵扫过木面，像打过蜡的木头反光。圆形裁切、只动 transform。 */
.sheen { position: absolute; left: 50%; top: 50%; z-index: 2; width: calc(100cqmin * v-bind(sheenFrac) * .98); aspect-ratio: 1; translate: -50% -50%; border-radius: 50%; overflow: hidden; pointer-events: none; }
.sheen i { position: absolute; inset: -20% auto -20% 0; width: 36%; background: linear-gradient(90deg, transparent, v-bind('WOOD.sheen') 45%, v-bind('WOOD.sheen') 55%, transparent);
  transform: translateX(-130%) skewX(-18deg); animation: wood-sheen 12s cubic-bezier(.45, 0, .3, 1) 3s infinite; will-change: transform; }
@keyframes wood-sheen { 0% { transform: translateX(-130%) skewX(-18deg); } 40%, 100% { transform: translateX(380%) skewX(-18deg); } }
.zoom-chip button { display: grid; place-items: center; border: 0; border-radius: 999px; background: none; color: var(--ink); font: inherit; cursor: pointer;
  transition: background var(--dur-base) ease, scale var(--dur-fast) var(--ease-out); }
.zoom-chip button:hover { background: var(--glass-press); }
.zoom-chip button:active { scale: .9; }
.zoom-chip { position: absolute; right: 0; bottom: 0; z-index: 3; display: flex; align-items: center; gap: 4px; padding: 4px 4px 4px 14px; border-radius: 999px;
  background: var(--mat-glass-strong); border: 1px solid var(--mat-glass-line); box-shadow: var(--mat-glass-shadow); backdrop-filter: var(--mat-glass-blur);
  color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.zoom-chip button { padding: 6px 12px; color: var(--ink); font-size: 13px; }
.zoom-chip-enter-active, .zoom-chip-leave-active { transition: opacity 200ms ease, translate 260ms cubic-bezier(.2, .8, .25, 1); }
.zoom-chip-enter-from, .zoom-chip-leave-to { opacity: 0; translate: 0 8px; }
.ring-tip { position: absolute; left: 0; top: 0; margin: 16px 0 0 16px; padding: 5px 10px; border-radius: 999px; white-space: nowrap; pointer-events: none; z-index: 4;
  background: var(--mat-glass-strong); border: 1px solid var(--mat-glass-line); box-shadow: var(--mat-glass-shadow); color: var(--ink); font-size: 13px; font-variant-numeric: tabular-nums; }
/* 长出来：一圈圈从里往外，各自从略小、透明长到原样；最后树皮合上、投影落下。 */
.band, .ticks, .labels, .months, .guide, .bark, .rays { transform-box: view-box; transform-origin: 50% 50%; }
.growing .band { animation: ring-grow 640ms cubic-bezier(.2, .8, .25, 1) both; animation-delay: calc(160ms + var(--i) * 110ms); }
.growing .bark { animation: ring-grow 560ms cubic-bezier(.2, .8, .25, 1) both; animation-delay: calc(220ms + 110ms * v-bind('shapes.length')); }
.growing .disc-shadow { animation: ring-fade 600ms ease both; animation-delay: calc(260ms + 110ms * v-bind('shapes.length')); }
.growing .ticks, .growing .labels, .growing .months, .growing .inner-edge, .growing .guide, .growing .rays {
  animation: ring-fade 480ms ease both; animation-delay: calc(420ms + 110ms * v-bind('shapes.length')); }
@keyframes ring-grow { from { opacity: 0; transform: scale(.8); } to { opacity: 1; transform: none; } }
@keyframes ring-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ring-flash { 0% { opacity: 0; } 25% { opacity: .55; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .growing .band, .growing .bark, .growing .disc-shadow, .growing .ticks, .growing .labels, .growing .months, .growing .inner-edge, .growing .guide, .growing .rays,
  .flash { animation: none; }
  .sheen { display: none; }
  .plate { transition: none; }
}
</style>

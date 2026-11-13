<script setup lang="ts">
/**
 * 人体分块图（一面）：整个人由一块块肌肉拼成，没涉及的是底色，涉及的按状态上色。
 * 路径改编自 react-native-body-highlighter（MIT，见 NOTICE 与 lib/anatomy/paths.ts）。
 *
 * 组件只负责画和报告指针：哪些块组成一个可交互区域、每个区域什么状态，都由调用方给。
 * 力量卡用它画负荷（档位 + 辅助斜线），伤病 / 酸痛图用它点选部位（选中 / 以前伤过）。
 */
import { computed, shallowRef } from 'vue';
import { BACK_OUTLINE, BACK_SHAPES, FRONT_OUTLINE, FRONT_SHAPES } from '../../lib/anatomy/paths';
import type { AnatomyRegion, AnatomyRegionState, AnatomyView } from '../../lib/anatomy/types';

const props = withDefaults(defineProps<{
  view: AnatomyView;
  regions?: AnatomyRegion[];
  states?: Record<string, AnatomyRegionState>;
  /** none：只看；hover：能悬停 / 聚焦（力量卡）；toggle：还能点选（伤病图，role=checkbox）。 */
  mode?: 'none' | 'hover' | 'toggle';
  /** 悬停时在区域上方浮出名字。 */
  floatLabel?: boolean;
  ariaLabel?: string;
}>(), { regions: () => [], states: () => ({}), mode: 'none', floatLabel: false, ariaLabel: undefined });

const emit = defineEmits<{
  (event: 'hover', key: string | null): void;
  (event: 'activate', key: string): void;
}>();

const uid = `an-${Math.random().toString(36).slice(2, 8)}`;
/* 画布只框住人形（上游 viewBox 是整张 724 × 1448 的纸）。 */
const VIEWBOX: Record<AnatomyView, string> = { front: '40 88 648 1264', back: '764 88 648 1264' };
const shapes = computed(() => (props.view === 'front' ? FRONT_SHAPES : BACK_SHAPES));
const outline = computed(() => (props.view === 'front' ? FRONT_OUTLINE : BACK_OUTLINE));

/** 这一面上每个区域拿到的路径；不属于任何区域的块画成底色。 */
const layout = computed(() => {
  const owner = new Map<string, AnatomyRegion>();
  for (const region of props.regions) for (const s of region.shapes) owner.set(`${s.slug}:${s.side}`, region);
  const base: string[] = [];
  const hair: string[] = [];
  const byRegion = new Map<string, string[]>();
  for (const shape of shapes.value) {
    const region = owner.get(`${shape.slug}:${shape.side}`);
    if (region) {
      const list = byRegion.get(region.key) ?? [];
      list.push(shape.d);
      byRegion.set(region.key, list);
    } else if (shape.slug === 'hair') hair.push(shape.d);
    else base.push(shape.d);
  }
  const groups = props.regions
    .map((region) => ({
      region,
      paths: byRegion.get(region.key) ?? [],
      markers: (region.markers ?? []).filter((m) => m.view === props.view),
    }))
    .filter((g) => g.paths.length > 0 || g.markers.length > 0);
  return { base: base.join(''), hair: hair.join(''), groups };
});

const stateOf = (key: string): AnatomyRegionState => props.states[key] ?? {};
const classOf = (key: string) => {
  const s = stateOf(key);
  return {
    [`lv${s.level ?? 0}`]: true,
    hatched: !!s.hatched,
    selected: !!s.selected,
    marked: !!s.marked,
    dim: !!s.dim,
    hot: !!s.hot || hoverKey.value === key,
  };
};
const fillOf = (key: string) => (stateOf(key).hatched ? `url(#${uid}-hatch-${stateOf(key).level ?? 1})` : undefined);

const hoverKey = shallowRef<string | null>(null);
const label = shallowRef<{ text: string; x: number; y: number } | null>(null);

function enter(event: Event, region: AnatomyRegion) {
  if (props.mode === 'none') return;
  hoverKey.value = region.key;
  emit('hover', region.key);
  if (props.floatLabel) {
    const box = (event.currentTarget as SVGGraphicsElement).getBBox();
    label.value = { text: region.label, x: box.x + box.width / 2, y: box.y - 18 };
  }
}
function leave(region: AnatomyRegion) {
  if (hoverKey.value !== region.key) return;
  hoverKey.value = null;
  label.value = null;
  emit('hover', null);
}
function activate(region: AnatomyRegion) {
  if (props.mode !== 'none') emit('activate', region.key);
}
function onKey(event: KeyboardEvent, region: AnatomyRegion) {
  if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); activate(region); }
}
</script>

<template>
  <svg class="anatomy" :class="[`mode-${mode}`]" :viewBox="VIEWBOX[view]" role="group" :aria-label="ariaLabel">
    <defs>
      <pattern v-for="lv in [1, 2, 3]" :id="`${uid}-hatch-${lv}`" :key="lv" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)">
        <rect width="14" height="14" class="hatch-base" />
        <rect width="6" height="14" :class="`hatch-line lv${lv}`" />
      </pattern>
    </defs>
    <path class="outline" :d="outline" />
    <path class="base" :d="layout.base" />
    <path class="hair" :d="layout.hair" />
    <g
      v-for="g in layout.groups"
      :key="g.region.key"
      class="region"
      :class="classOf(g.region.key)"
      :style="fillOf(g.region.key) ? { fill: fillOf(g.region.key) } : undefined"
      :role="mode === 'toggle' ? 'checkbox' : mode === 'hover' ? 'img' : undefined"
      :aria-checked="mode === 'toggle' ? !!stateOf(g.region.key).selected : undefined"
      :aria-label="mode === 'none' ? undefined : g.region.label"
      :tabindex="mode === 'none' ? undefined : 0"
      @pointerenter="enter($event, g.region)"
      @pointerleave="leave(g.region)"
      @focus="enter($event, g.region)"
      @blur="leave(g.region)"
      @click="activate(g.region)"
      @keydown="onKey($event, g.region)"
    >
      <title>{{ g.region.label }}</title>
      <path v-for="(d, i) in g.paths" :key="i" :d="d" />
      <ellipse v-for="m in g.markers" :key="m.id" class="marker" :cx="m.cx" :cy="m.cy" :rx="m.rx" :ry="m.ry" />
    </g>
    <text v-if="label" class="float-label" :x="label.x" :y="label.y" aria-hidden="true">{{ label.text }}</text>
  </svg>
</template>

<style scoped>
.anatomy {
  --an-base: color-mix(in srgb, var(--ink) 15%, var(--mat-inset));
  --an-hair: color-mix(in srgb, var(--ink) 24%, var(--mat-inset));
  --an-load: var(--anatomy-load, var(--training));
  --an-pick: var(--anatomy-pick, var(--heart));
  display: block; width: 100%; height: auto; overflow: visible;
}
.outline { fill: none; stroke: color-mix(in srgb, var(--ink) 22%, transparent); stroke-width: 2.5; }
.base { fill: var(--an-base); }
.hair { fill: var(--an-hair); }
.region { fill: var(--an-base); outline: none; transition: fill .18s ease, opacity .18s ease; }
.region .marker { fill: color-mix(in srgb, var(--ink) 32%, var(--mat-inset)); stroke: transparent; stroke-width: 24; }
.mode-hover .region, .mode-toggle .region { cursor: pointer; }
.region.lv1 { fill: color-mix(in srgb, var(--an-load) 38%, var(--an-base)); }
.region.lv2 { fill: color-mix(in srgb, var(--an-load) 68%, var(--an-base)); }
.region.lv3 { fill: var(--an-load); }
.hatch-base { fill: var(--an-base); }
.hatch-line.lv1 { fill: color-mix(in srgb, var(--an-load) 38%, var(--an-base)); }
.hatch-line.lv2 { fill: color-mix(in srgb, var(--an-load) 68%, var(--an-base)); }
.hatch-line.lv3 { fill: var(--an-load); }
.region.marked, .region.marked .marker { fill: color-mix(in srgb, var(--warning) 42%, var(--an-base)); }
.region.selected, .region.selected .marker { fill: var(--an-pick); }
.region.hot { stroke: var(--ink); stroke-width: 5; paint-order: stroke; }
.region.hot.lv0:not(.selected):not(.marked),
.region.hot.lv0:not(.selected):not(.marked) .marker { fill: color-mix(in srgb, var(--an-pick) 22%, var(--an-base)); }
.region.dim { opacity: .3; }
.float-label {
  fill: var(--ink); font-size: 46px; font-weight: 600; text-anchor: middle; pointer-events: none;
  paint-order: stroke; stroke: var(--surface, var(--mat-inset)); stroke-width: 12px; stroke-linejoin: round;
}
@media (prefers-reduced-motion: reduce) { .region { transition: none; } }
</style>

<script setup lang="ts">
/* 运动轨迹示意图（按配速上色）；没有轨迹就说没有，不画假的。几何计算在 lib/workoutRoute.ts。 */
import GlyphTile from '../GlyphTile.vue';
import type { RouteCanvas } from '../../lib/workoutRoute';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';

defineProps<{ canvas: RouteCanvas | null }>();
const t = useMessages(workoutDetailMessages);
</script>

<template>
  <!-- 没有 GPS 时不再占一整块空画布（U09）：收成一行状态。 -->
  <p v-if="!canvas" class="surface-card route-missing" role="status"><GlyphTile name="outdoor-run" tone="activity" :size="28" />{{ t.routeMissing }}</p>
  <section v-else class="surface-card series-card" :aria-label="t.routeAria">
    <div class="section-head">
      <GlyphTile name="outdoor-run" tone="activity" :size="42" />
      <div><p class="section-eyebrow">{{ t.eyebrowRoute }}</p><h2>{{ t.routeTitle }}</h2></div>
      <span class="route-note">{{ t.routeNote }}</span>
    </div>
    <div class="route-wrap">
      <div class="route-canvas-texture" aria-hidden="true"></div>
      <svg class="route-svg" :viewBox="canvas.viewBox" preserveAspectRatio="xMidYMid meet" role="img" :aria-label="t.routeSvgAria">
        <path v-for="(road, index) in canvas.ghosts" :key="`ghost-${index}`" class="ghost-road" :d="road.d" fill="none" :stroke-opacity="road.opacity" />
        <path class="route-glow" :d="canvas.glow" fill="none" />
        <path v-for="(segment, index) in canvas.segments" :key="`${segment.d}-${index}`" :d="segment.d" fill="none" :stroke="segment.color" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round" />
        <circle class="route-dot start" :cx="canvas.start.x" :cy="canvas.start.y" r="8" />
        <circle class="route-dot end" :cx="canvas.end.x" :cy="canvas.end.y" r="8" />
        <path class="route-end-mark" :transform="`translate(${canvas.end.x} ${canvas.end.y})`" d="M-3.6-3.6 3.6 3.6 M3.6-3.6-3.6 3.6" />
        <g v-for="(marker, index) in canvas.pauseMarkers" :key="`pause-${index}`" class="pause-mark" :transform="`translate(${marker.x} ${marker.y})`">
          <circle r="7" />
          <path d="M-2-2.6 V2.6 M2-2.6 V2.6" />
        </g>
      </svg>
      <div class="route-legend">
        <span><i class="neutral-dot"></i>{{ canvas.enoughPace ? t.routeLegendPace(canvas.validPaceCount) : t.routeLegendNoPace }}</span>
        <template v-if="canvas.enoughPace">
          <span><i class="fast-dot"></i>{{ t.legendFast }}</span>
          <span><i class="steady-dot"></i>{{ t.legendSteady }}</span>
          <span><i class="warm-dot"></i>{{ t.legendWarm }}</span>
          <span><i class="slow-dot"></i>{{ t.legendSlow }}</span>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.series-card { padding: 16px 18px 18px; border-radius: var(--radius-lg); }
.section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 13px; }
.section-head h2 { margin: 1px 0 0; font-size: var(--fs-2xl); letter-spacing: -.02em; }
.section-eyebrow { margin: 0; color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); font-weight: 700; letter-spacing: .16em; }
.route-note { margin-left: auto; color: var(--subtle); font-size: var(--fs-xs); }
/* 画布是凹下去的一块：底色、纹理、描边都走 token，浅色主题自动换。 */
.route-wrap { position: relative; overflow: hidden; min-height: 320px; border-radius: var(--radius-md); background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.route-canvas-texture { position: absolute; inset: 0; pointer-events: none; background:
  radial-gradient(circle at 72% 22%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 42%),
  radial-gradient(circle at 18% 78%, color-mix(in srgb, var(--route-mint) 8%, transparent), transparent 46%),
  repeating-radial-gradient(circle at 40% 45%, color-mix(in srgb, var(--ink) 3%, transparent) 0 1px, transparent 1px 7px); }
.route-svg { position: absolute; inset: 10px 10px 42px; display: block; width: calc(100% - 20px); height: calc(100% - 52px); }
.ghost-road { stroke: color-mix(in srgb, var(--accent) 70%, var(--ink)); stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.route-glow { stroke: color-mix(in srgb, var(--accent) 24%, transparent); stroke-width: 14; stroke-linecap: round; stroke-linejoin: round; }
.route-dot { stroke: var(--mat-inset); stroke-width: 2; }
.route-dot.start { fill: var(--route-mint); }
.route-dot.end { fill: var(--route-coral); }
.route-end-mark { fill: none; stroke: var(--mat-inset); stroke-width: 1.6; stroke-linecap: round; }
.pause-mark circle { fill: var(--mat-card-solid); stroke: var(--route-amber); stroke-width: 1.2; }
.pause-mark path { fill: none; stroke: var(--route-amber); stroke-width: 1.4; stroke-linecap: round; }
.route-legend { position: absolute; right: 10px; bottom: 10px; left: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 5px 9px; border: 1px solid var(--mat-glass-line); border-radius: 10px; background: var(--mat-glass-strong); color: var(--muted); font-size: var(--fs-2xs); }
.route-legend span { display: inline-flex; align-items: center; gap: 4px; }
.route-legend i { width: 9px; height: 4px; border-radius: 999px; background: var(--route-neutral); }
.route-legend .fast-dot { background: var(--route-mint); }
.route-legend .steady-dot { background: var(--route-cyan); }
.route-legend .warm-dot { background: var(--route-amber); }
.route-legend .slow-dot { background: var(--route-coral); }
.route-missing { display: flex; align-items: center; gap: 10px; margin: 0; padding: 10px 14px; border-radius: var(--radius-lg); color: var(--muted); font-size: var(--fs-sm); }
@media (max-width: 760px) { .route-wrap { min-height: 240px; } .route-note { display: none; } }
</style>

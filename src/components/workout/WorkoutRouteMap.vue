<script setup lang="ts">
/*
 * 运动轨迹叠在在线地图上（可选图层，WorkoutRouteCard 按需异步加载这个组件）。
 *
 * Leaflet 只在这里静态 import，整个组件是一块单独的 chunk（vite.config 的 manualChunks
 * 把它分到 'map'），没打开地图就不下载、不发任何外部请求。轨迹点用画布那份（已抽稀），
 * 同色相邻段并成一条折线，canvas 渲染（preferCanvas）。瓦片加载不出来就告诉外层退回本地画布。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { openUrl } from '@tauri-apps/plugin-opener';
import { buildRouteRuns, type RouteCanvas } from '../../lib/workoutRoute';
import { MAP_TILES } from '../../lib/mapTiles';
import { resolvedTheme } from '../../composables/useTheme';

const props = defineProps<{ canvas: RouteCanvas; label: string }>();
const emit = defineEmits<{ (event: 'failed'): void }>();

const host = ref<HTMLElement | null>(null);
let map: L.Map | null = null;
let routeLayer: L.LayerGroup | null = null;
let resizeObserver: ResizeObserver | null = null;
let tileLoads = 0;
let tileErrors = 0;

/** 画布用的是 `var(--route-mint)` 这类 token，canvas 渲染要真颜色。 */
const resolveColor = (value: string): string => {
  const match = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!match || !host.value) return value;
  return getComputedStyle(host.value).getPropertyValue(match[1]).trim() || value;
};

const drawRoute = () => {
  if (!map) return;
  routeLayer?.remove();
  const layer = L.layerGroup();
  const runs = buildRouteRuns(props.canvas.segments);
  const casing = resolveColor('var(--mat-card-solid)');
  if (runs.length) {
    // 一圈底色描边，让彩色轨迹在任何底图上都看得清。
    L.polyline(runs.map((run) => run.points), { color: casing, weight: 8, opacity: .85, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(layer);
  }
  for (const run of runs) {
    L.polyline(run.points, { color: resolveColor(run.color), weight: 4.5, opacity: 1, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(layer);
  }
  for (const marker of props.canvas.pauseMarkers) {
    L.circleMarker([marker.latitude, marker.longitude], { radius: 5, color: resolveColor('var(--route-amber)'), weight: 2, fillColor: casing, fillOpacity: 1, interactive: false }).addTo(layer);
  }
  const { start, end } = props.canvas;
  L.circleMarker([start.latitude, start.longitude], { radius: 7, color: casing, weight: 2, fillColor: resolveColor('var(--route-mint)'), fillOpacity: 1, interactive: false }).addTo(layer);
  L.circleMarker([end.latitude, end.longitude], { radius: 7, color: casing, weight: 2, fillColor: resolveColor('var(--route-coral)'), fillOpacity: 1, interactive: false }).addTo(layer);
  layer.addTo(map);
  routeLayer = layer;
};

const routeBounds = (): L.LatLngBounds => {
  const points: L.LatLngTuple[] = [[props.canvas.start.latitude, props.canvas.start.longitude], [props.canvas.end.latitude, props.canvas.end.longitude]];
  for (const segment of props.canvas.segments) points.push([segment.to.latitude, segment.to.longitude]);
  return L.latLngBounds(points);
};

const giveUpIfNothingLoads = () => {
  // 一张都没加载出来、错误又攒到好几张：多半离线或被瓦片服务拦了，退回本地画布。
  if (tileLoads === 0 && tileErrors >= 4) emit('failed');
};

// 滚轮默认不缩放：页面滚动经过地图时不能被吃掉。点进地图（或键盘聚焦）才接管滚轮，移出就还回去。
const enableWheel = () => map?.scrollWheelZoom.enable();
const disableWheel = () => map?.scrollWheelZoom.disable();

const openAttribution = () => {
  openUrl(MAP_TILES.attributionUrl).catch(() => {
    // 网页预览没有 opener，署名文字本身仍然常显。
  });
};

onMounted(() => {
  if (!host.value) return;
  map = L.map(host.value, {
    preferCanvas: true,
    attributionControl: false,
    scrollWheelZoom: false,
    zoomSnap: .5,
    maxZoom: MAP_TILES.maxZoom,
  });
  const tiles = L.tileLayer(MAP_TILES.url, {
    maxZoom: MAP_TILES.maxZoom,
    // 只取看得见的那几张：不预取、缩放动画中不中途加载、离开视野的不多留。
    keepBuffer: 1,
    updateWhenZooming: false,
  });
  tiles.on('tileload', () => { tileLoads += 1; });
  tiles.on('tileerror', () => { tileErrors += 1; giveUpIfNothingLoads(); });
  tiles.addTo(map);
  map.fitBounds(routeBounds(), { padding: [28, 28], maxZoom: 17 });
  map.on('click', enableWheel);
  host.value.addEventListener('focusin', enableWheel);
  host.value.addEventListener('mouseleave', disableWheel);
  drawRoute();
  resizeObserver = new ResizeObserver(() => map?.invalidateSize({ animate: false }));
  resizeObserver.observe(host.value);
});

watch(resolvedTheme, () => requestAnimationFrame(drawRoute));
watch(() => props.canvas, () => {
  drawRoute();
  map?.fitBounds(routeBounds(), { padding: [28, 28], maxZoom: 17 });
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  host.value?.removeEventListener('focusin', enableWheel);
  host.value?.removeEventListener('mouseleave', disableWheel);
  map?.remove();
  map = null;
  routeLayer = null;
});
</script>

<template>
  <div class="zb-route-map">
    <div ref="host" class="zb-route-map-host" role="region" :aria-label="label"></div>
    <button type="button" class="zb-route-map-credit" @click="openAttribution">{{ MAP_TILES.attribution }}</button>
  </div>
</template>

<style>
/* 不用 scoped：要改 Leaflet 自己生成的元素，scoped 里写 :global 组合会被编译掉前半截（见记忆 vue-scoped-global-selector-trap）。 */
.zb-route-map { position: absolute; inset: 0; isolation: isolate; }
.zb-route-map-host { position: absolute; inset: 0; background: var(--mat-inset); font: inherit; }
.zb-route-map-host:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
/* 深色主题：只给瓦片层一个静态滤镜，轨迹和标记不受影响。 */
:root[data-theme='dark'] .zb-route-map .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(.92) contrast(.88) saturate(.35); }
.zb-route-map .leaflet-control-zoom { border: 1px solid var(--mat-glass-line); border-radius: 10px; overflow: hidden; box-shadow: none; }
.zb-route-map .leaflet-control-zoom a { background: var(--mat-glass-strong); color: var(--ink); border-bottom-color: var(--mat-glass-line); }
.zb-route-map .leaflet-control-zoom a:hover { background: var(--mat-card-solid); }
.zb-route-map-credit { position: absolute; top: 10px; right: 10px; z-index: 1000; padding: 3px 8px; border: 1px solid var(--mat-glass-line); border-radius: 8px; background: var(--mat-glass-strong); color: var(--muted); font: inherit; font-size: var(--fs-2xs); cursor: pointer; }
.zb-route-map-credit:hover { color: var(--ink); }
</style>

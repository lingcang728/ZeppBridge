<script setup lang="ts">
/* 年轮区块左上角：一团金黄的星云，旁边是这一年各类运动的次数。整张卡是去 /rings 的链接——
   星云和年轮页开场镜头前的星海是同一批星（lib/rings/nebula.ts），点进去时它从卡上飞起来、长成整屏、
   再交给舞台往里飞（lib/rings/cosmosDive.ts），所以不走普通的卡片形变（data-no-morph）。 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { drawNebula, drawSpace, fitCanvas, nebulaAngle, SPACE_RATIO } from '../../../lib/rings/nebula';
import { diveIn } from '../../../lib/rings/cosmosDive';
import { lessMotion } from '../../../lib/motion/lessMotion';
import { useRingsText } from '../../rings/rings.i18n';

defineProps<{ year: number | null; legend: { key: string; label: string; count: number; text: string }[] }>();
const t = useRingsText();

/* 画布里星云半径占画布宽的 FILL，外面一圈深空（SPACE_RATIO 倍）刚好不出画布。 */
const FILL = 0.42;
const canvas = ref<HTMLCanvasElement | null>(null);
const lifted = ref(false);
let frame = 0, last = 0, visible = true, observer: IntersectionObserver | null = null;
function paint() {
  const el = canvas.value, ctx = el?.getContext('2d');
  if (!el || !ctx) return;
  const { width, height } = fitCanvas(el, ctx);
  ctx.clearRect(0, 0, width, height);
  const radius = width * FILL;
  drawSpace(ctx, width / 2, height / 2, radius * SPACE_RATIO);
  drawNebula(ctx, { cx: width / 2, cy: height / 2, radius, angle: nebulaAngle() });
}
/* 转得很慢，30 帧就够；看不见（滚出去、窗口在后台）就停。 */
function loop(now: number) {
  frame = requestAnimationFrame(loop);
  if (now - last < 32) return;
  last = now; paint();
}
const sync = () => {
  cancelAnimationFrame(frame);
  if (visible && document.visibilityState === 'visible' && !lessMotion()) frame = requestAnimationFrame(loop);
  else paint();
};
onMounted(() => {
  observer = new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); sync(); });
  if (canvas.value) observer.observe(canvas.value);
  document.addEventListener('visibilitychange', sync);
  sync();
});
onBeforeUnmount(() => { cancelAnimationFrame(frame); observer?.disconnect(); document.removeEventListener('visibilitychange', sync); });

function launch(event: MouseEvent) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const box = canvas.value?.getBoundingClientRect();
  if (!box) return;
  diveIn({ cx: box.left + box.width / 2, cy: box.top + box.height / 2, radius: box.width * FILL }, () => {
    lifted.value = true;
    window.setTimeout(() => { lifted.value = false; }, 3000);
  });
}
const share = (count: number, legend: { count: number }[]) => count / Math.max(1, ...legend.map(item => item.count));
</script>

<template>
  <RouterLink class="nebula-card" :to="{ name: 'Rings', query: year ? { year: String(year) } : {} }" data-no-morph @click="launch">
    <h2>{{ t.title }}</h2>
    <canvas ref="canvas" :class="['nebula', { lifted }]" :data-rings-nebula="FILL" aria-hidden="true" />
    <ul v-if="legend.length" class="legend">
      <li v-for="(item, i) in legend" :key="item.key" :style="{ '--share': share(item.count, legend), '--rank': i }">
        <span class="dot" /><span class="name">{{ item.label }}</span><b>{{ item.text }}</b>
      </li>
    </ul>
    <span class="arrow" aria-hidden="true">→</span>
  </RouterLink>
</template>

<style scoped>
.nebula-card { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto 1fr; align-items: center; gap: 4px 28px; padding: 20px 24px 24px;
  border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); color: var(--ink); text-decoration: none; }
h2 { grid-column: 1 / -1; margin: 0; font-size: var(--fs-lg); font-weight: 600; }
.nebula { width: clamp(150px, 15vw, 210px); aspect-ratio: 1; display: block; }
.nebula.lifted { visibility: hidden; }
.legend { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.legend li { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--mat-line); }
.legend li:last-child { border-bottom: 0; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: color-mix(in srgb, var(--kintsugi) calc(30% + 70% * var(--share)), color-mix(in srgb, var(--ink) 30%, transparent)); }
.name { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.legend b { font-weight: 500; font-variant-numeric: tabular-nums; }
.arrow { position: absolute; top: 18px; right: 22px; font-size: 20px; color: var(--muted); transition: color var(--dur-base) ease, transform var(--dur-base) ease; }
a.nebula-card:hover .arrow { color: var(--ink); transform: translateX(3px); }
@media (max-width: 600px) { .nebula-card { gap: 4px 16px; padding: 16px; } .nebula { width: 112px; } }
</style>

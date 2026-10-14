<script setup lang="ts">
/**
 * 顶栏控件的玻璃底（第四轮 1C，「修 liquid glass」并入）：毛玻璃 + 外圈一窄条折射，中间只模糊。
 *
 * 每个控件（返回、同步胶囊、主题 / 语言组）仍是各自一块玻璃（用户否决过合并）；这里只是把玻璃画到垫底的
 * 一层上，再挂第四 / 五版的 `rim` 透镜（lib/glassLens.ts 的位移图，和导航胶囊的 .segment-glass 同一套）。
 * 宿主要带 `.glass-control.is-lens-host.has-rim`：宿主自己不带 backdrop-filter（不然透镜看不见背后的页面），
 * 也不再画 ::before 那层（由这里代替）。画不出折射的机器上就是普通毛玻璃。
 */
import { ref } from 'vue';
import { useGlassLens } from '../../composables/useGlassLens';

const el = ref<HTMLElement | null>(null);
const rim = useGlassLens(el, 'rim');
</script>

<template>
  <span ref="el" class="glass-rim" aria-hidden="true" :style="rim.style('var(--glass-blur)')"></span>
</template>

<style scoped>
.glass-rim {
  position: absolute;
  z-index: -1;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, var(--glass-sheen), transparent 60%), var(--glass);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  box-shadow: var(--glass-rim);
  pointer-events: none;
}
@media (prefers-reduced-transparency: reduce) {
  .glass-rim { background: var(--mat-glass-strong); -webkit-backdrop-filter: none; backdrop-filter: none; }
}
</style>

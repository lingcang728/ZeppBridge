<script setup lang="ts">
/**
 * 关系网右下角的镜头胶囊：缩小 · 当前比例 · 放大。
 *
 * 中间那一格以前是一枚指南针，看上去像搜索，点下去画面又往往已经是适应好的——
 * 于是「点了没反应」。现在它写着当前比例，点一下让整张图正好装进画布；已经在那儿
 * 了就轻轻弹一下（`pulse` 每加一弹一次），告诉你「这就是全景」。
 */
import Icon from '../Icon.vue';

defineProps<{
  /** 竖排贴在画布右缘：只留放大 / 适应 / 缩小三枚圆钮，比例写在悬停提示里。 */
  vertical?: boolean;
  percent: number;
  pulse: number;
  labels: { zoomIn: string; zoomOut: string; fit: string; level: string };
}>();
const emit = defineEmits<{ (event: 'zoom', factor: number): void; (event: 'fit'): void }>();
</script>

<template>
  <div :class="['zoom-dock', 'glass-control', { vertical }]">
    <button type="button" class="dock-btn" :aria-label="vertical ? labels.zoomIn : labels.zoomOut" :title="vertical ? labels.zoomIn : labels.zoomOut"
      @click="emit('zoom', vertical ? 1.2 : 1 / 1.2)">{{ vertical ? '+' : '−' }}</button>
    <button :key="pulse" type="button" :class="['dock-btn', 'dock-zoom', { pulse: pulse > 0 }]" :aria-label="labels.fit"
      :title="labels.level" @click="emit('fit')"><Icon name="fit" :size="15" /><span v-if="!vertical">{{ percent }}%</span></button>
    <button type="button" class="dock-btn" :aria-label="vertical ? labels.zoomOut : labels.zoomIn" :title="vertical ? labels.zoomOut : labels.zoomIn"
      @click="emit('zoom', vertical ? 1 / 1.2 : 1.2)">{{ vertical ? '−' : '+' }}</button>
  </div>
</template>

<style scoped>
.zoom-dock { display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 999px; }
.dock-btn { display: grid; width: 34px; height: 34px; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--ink); font-size: 18px; line-height: 1; cursor: pointer; }
.dock-btn:hover { background: var(--glass-press); }
.dock-zoom { display: inline-flex; width: auto; align-items: center; gap: 5px; padding: 0 11px; border-radius: 999px; font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.zoom-dock.vertical { flex-direction: column; }
.zoom-dock.vertical .dock-zoom { width: 34px; padding: 0; border-radius: 50%; }
.dock-zoom.pulse { animation: fit-pulse .42s var(--ease-spring); }
@keyframes fit-pulse { 40% { scale: 1.12; background: var(--glass-press); } }
@media (prefers-reduced-motion: reduce) { .dock-zoom.pulse { animation: none; } }
</style>

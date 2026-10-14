<script setup lang="ts">
/**
 * 交给 AI 舞台上的二级页（已保存的任务 / 寄出前检查 / 往返记录）开成一张浮起来的玻璃大卡（10-08 H18）。
 *
 * 用户 10-08：「已保存任务的过渡太生硬，直接用一个遮罩打开非常丑。应该做成卡片平滑展开、背景带高斯模糊」。
 * 以前这几页是整页路由，用页面形变（usePageMorph）从胶囊长成整屏——垫底是一块不透明的底色，看上去就是一层黑幕盖过来。
 * 现在它们是 /ai 的子路由：舞台留在原处，身后一层**静态**毛玻璃 + 暗色只淡入淡出它自己；大卡从被点的那枚胶囊
 * 形变出来（等比缩放 + 裁成胶囊的形状，见 lib/motion/sheet.ts；内容晚一点淡入，不在小卡里挤着字），关的时候原路形变回那枚胶囊。点卡外、Esc、顶栏返回都是关。
 * 在大卡里从列表点进详情（往返记录 → 某一次）：卡不动，里面交叉淡化换内容。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../Icon.vue';
import { onMotionEscape } from '../../lib/motion/interrupt';
import { OPEN_EASE, paced } from '../../lib/motion/timing';
import { openSheet, sheetOrigin } from '../../lib/motion/sheet';
import { whenFramesSteady } from '../../lib/motion/steady';
import { useBridgeText } from './bridge/bridge.i18n';

const props = defineProps<{ name: string }>();
const router = useRouter();
const t = useBridgeText();
const panel = ref<HTMLElement | null>(null);
const veil = ref<HTMLElement | null>(null);
const body = ref<HTMLElement | null>(null);
const OPEN_MS = paced(480);
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const close = () => { void router.push('/ai'); };

let releaseEscape: (() => void) | null = null;
onMounted(() => {
  releaseEscape = onMotionEscape(() => { close(); return true; });
  if (reduced() || !panel.value) return;
  // 背景和大卡一起起步：模糊层淡入的时长和形变一样长、同一条缓动（10-13：以前 320ms 先糊上，卡还在半路，「背景没有过渡」）。
  const animations = [
    veil.value?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: OPEN_EASE, fill: 'backwards' }),
    openSheet(panel.value, sheetOrigin(props.name), OPEN_MS, OPEN_EASE),
    // 内容等大卡长到一半多才淡入：不在还是小胶囊的时候就挤着一屏字（那就是重影）。
    body.value?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: OPEN_MS, easing: 'ease-out', fill: 'backwards' }),
  ].filter((a): a is Animation => !!a);
  // 先停在起点（就是那枚胶囊，背景还清楚），等这一大块第一次光栅化完、帧节奏恢复再放：不然动画按时间走，
  // GPU 卡住的那一两百毫秒把开头吞掉，看上去是大卡一跳就出来了（lib/motion/steady.ts）。
  for (const a of animations) a.pause();
  void whenFramesSteady(220).then(() => { for (const a of animations) if (a.playState === 'paused') a.play(); });
});
onBeforeUnmount(() => releaseEscape?.());

const label = computed(() => t.value.close);
</script>

<template>
  <div class="ai-sheet" role="dialog" aria-modal="true" :data-sheet-name="name">
    <div ref="veil" class="sheet-veil" aria-hidden="true" @click="close"></div>
    <section ref="panel" class="sheet-panel">
      <button type="button" class="sheet-close" :aria-label="label" @click="close"><Icon name="x" :size="16" /></button>
      <div ref="body" class="sheet-body"><slot /></div>
    </section>
  </div>
</template>

<style scoped>
/* 盖住内容区、压在顶栏下面（顶栏 z-index 30，仍然能点：返回、换页都是关）。 */
.ai-sheet { position: fixed; inset: 0; z-index: 25; display: grid; justify-items: center; align-items: start; padding: 84px 24px 24px; pointer-events: none; }
/* 静态模糊 + 暗色：只淡入淡出它自己（祖先不做 opacity，免得变成模糊的取样边界）。 */
.sheet-veil { position: absolute; inset: 0; pointer-events: auto; background: color-mix(in srgb, var(--canvas) 46%, transparent);
  -webkit-backdrop-filter: blur(18px) saturate(1.1); backdrop-filter: blur(18px) saturate(1.1); }
.sheet-panel { position: relative; display: flex; width: min(960px, 100%); max-height: 100%; min-height: 0; pointer-events: auto; border: 1px solid var(--mat-glass-line); border-radius: 28px;
  background: var(--mat-glass-strong); box-shadow: var(--mat-glass-shadow), 0 40px 90px -40px rgba(0, 0, 0, .7); transform-origin: 50% 50%; }
/* 滚动条收在卡里面：上下各让出圆角那么高，不从右上角的圆弧外面探出去（10-13「边缘导航条出界」）；细一点、跟主题走。 */
.sheet-body { flex: 1 1 auto; min-width: 0; margin: 18px 6px 18px 0; overflow-y: auto; overscroll-behavior: contain; border-radius: 0;
  scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--ink) 22%, transparent) transparent; }
.sheet-body::-webkit-scrollbar { width: 8px; }
.sheet-body::-webkit-scrollbar-track { background: transparent; }
.sheet-body::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: color-mix(in srgb, var(--ink) 22%, transparent) padding-box; }
/* 里面的页照旧是「页」的版式，去掉整页才需要的上下留白。 */
.sheet-body :deep(.page) { padding-top: 4px; padding-bottom: 10px; }
.sheet-close { position: absolute; top: 14px; right: 14px; z-index: 2; display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 1px solid var(--mat-glass-line);
  border-radius: 50%; background: var(--mat-glass-strong); color: var(--muted); cursor: pointer; transition: color 140ms ease, scale 160ms ease; }
.sheet-close:hover { color: var(--ink); scale: 1.06; }
.sheet-close:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (max-width: 700px) { .ai-sheet { padding: 76px 10px 10px; } .sheet-panel { border-radius: 22px; } }
</style>

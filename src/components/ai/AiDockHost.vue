<script setup lang="ts">
/**
 * 交给 AI 的底栏挂在外壳上，而不是总页里（2026-10 精修批次 3）。
 *
 * 总页的下钻都成了路由：底栏要是跟着总页一起卸载，点开任何一张卡它都会一下子消失、回来又一下子出现——
 * 那是硬切。挂在外壳上以后它只在 /ai 显示，进出从视口底边滑进滑出；第一次进过「交给 AI」以后就一直挂着（很轻），
 * 去别的入口时淡掉。数据都来自全局单例，所以它不需要总页在场。
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import HandoffDock from './HandoffDock.vue';
import { useAiDerived } from '../../composables/ai/useAiHub';
import { useAiTaskPreview } from '../../composables/useAiTaskPreview';
import { useExchanges } from '../../composables/useExchanges';
import '../../styles/ai-task.css';

const route = useRoute();
const derived = useAiDerived();
const coverage = useAiTaskPreview();
const history = useExchanges();
const shown = computed(() => route.path === '/ai');
const prepared = () => {
  void history.load();
  derived.handedOff.value += 1;
};
</script>

<template>
  <Teleport to="body">
    <Transition name="dock-fade">
      <HandoffDock v-if="shown" :preview="coverage.preview.value" :preview-error="coverage.previewError.value"
        :direction="derived.direction.value" :fallback-title="derived.title.value" @prepared="prepared" />
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 只滑、不淡：底栏是毛玻璃，给它（毛玻璃层的祖先）动透明度，Chromium 会在整段淡入里把模糊关掉、
   结束才「啪」地糊上（lib/motion/dialogFlight.ts 头注释）。从视口底边滑进滑出，transform 不影响模糊。 */
.dock-fade-enter-active { transition: translate 500ms cubic-bezier(.4, .6, .2, 1); }
.dock-fade-leave-active { transition: translate 320ms cubic-bezier(.4, 0, .7, .2); }
.dock-fade-enter-from, .dock-fade-leave-to { translate: 0 calc(100% + 40px); }
</style>

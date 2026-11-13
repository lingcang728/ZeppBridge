<script setup lang="ts">
/**
 * 台前调度的一扇窗（2026-11-13）：一张卡的唯一元素。在舞台上、侧栏里、平铺里都是它，只是 transform 不同。
 * - 外框归窗口画（::before 材质 + 内描边、::after 投影，StageWindow.css），卡组件自己的底色、描边、阴影在窗口里清掉：
 *   裁切永远是窗口的圆角，不再出现卡比窗口宽、右缘被一刀切成直角（2026-11-13 用户录屏）。
 * - 舞台上：内容自己滚（data-stage-scroll，滚动条藏起来）；顶上正中是「•••」（点开菜单、按住拖动）；
 *   左、右、下三条边和两个下角能拖（2026-11-13 用户：顶边挂在舞台顶线上），悬停在角上画 iPad 那条弧。
 * - 侧栏：内容 inert（缩略图不抢焦点、不响应），整块盖一个按钮：点一下上舞台，按住能拖；只露上半截的底部淡出。
 * - 老版两栏（classic）：就是一张普通的卡，没有「•••」和拖边。
 * 量内容的自然高度报给舞台（窗口高 = 内容高，最多到舞台高；拉过下边就是拉的高）。
 */
import { computed, onBeforeUnmount, onMounted, ref, type CSSProperties } from 'vue';
import { transformOf, type Placement } from '../../../lib/stage/layout';
import { HANDLES, type Handle } from '../../../lib/stage/gestures';
import { useMessages } from '../../../i18n';
import { stageMessages } from './stage.i18n';

const props = defineProps<{ id: string; title: string; placement: Placement; menuOpen: boolean }>();
const emit = defineEmits<{
  grab: [event: PointerEvent, kind: 'move' | 'resize', handle?: Handle];
  activate: [];
  menu: [anchor: HTMLElement];
  measure: [height: number];
}>();
const t = useMessages(stageMessages);
const content = ref<HTMLElement | null>(null);
const live = computed(() => props.placement.mode === 'stage' || props.placement.mode === 'pip' || props.placement.mode === 'classic');
const grip = computed(() => props.placement.mode === 'stage' || props.placement.mode === 'pip');
const style = computed((): CSSProperties => ({
  width: `${props.placement.w}px`,
  // 高走变量：飞行途中 stageFlight 会临时用 --fly-h 撑高窗口（内容等比缩放 + 底部裁切，不被拉扁）。
  '--win-h': `${props.placement.h}px`,
  transform: transformOf(props.placement),
  opacity: String(props.placement.opacity),
  zIndex: String(props.placement.z),
  visibility: props.placement.opacity === 0 && props.placement.mode !== 'strip' ? 'hidden' : undefined,
}));

let observer: ResizeObserver | null = null;
onMounted(() => {
  // 量的是内容包一层的自然高度（窗口自己的高由舞台定，量它会自己咬自己）。
  observer = new ResizeObserver(() => { if (content.value) emit('measure', Math.ceil(content.value.offsetHeight)); });
  if (content.value) observer.observe(content.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div
    class="stage-window"
    :class="[`mode-${placement.mode}`, { 'menu-open': menuOpen, cropped: placement.crop, fill: placement.fill }]"
    :style="style"
    :data-stage-card="id"
    role="region"
    :aria-label="title"
    :aria-hidden="placement.mode === 'hidden' || placement.mode === 'behind' ? 'true' : undefined"
  >
    <div class="window-body" data-stage-scroll :inert="!live || undefined" :style="placement.pad ? { paddingBottom: `${placement.pad}px` } : undefined">
      <div ref="content" class="window-content"><slot /></div>
    </div>
    <template v-if="grip">
      <button
        class="window-grip"
        type="button"
        :aria-label="t.menu(title)"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        @pointerdown="emit('grab', $event, 'move')"
        @click="emit('menu', $event.currentTarget as HTMLElement)"
      ><i></i><i></i><i></i></button>
      <template v-if="placement.mode === 'stage' && placement.sides">
        <span
          v-for="handle in HANDLES"
          :key="handle"
          class="window-handle"
          :class="`handle-${handle}`"
          :title="t.resize(title)"
          aria-hidden="true"
          @pointerdown="emit('grab', $event, 'resize', handle)"
        ></span>
      </template>
    </template>
    <button
      v-else-if="placement.mode === 'strip'"
      class="window-hit"
      type="button"
      :aria-label="t.openCard(title)"
      :title="title"
      :tabindex="placement.opacity === 0 ? -1 : undefined"
      @pointerdown="emit('grab', $event, 'move')"
      @click="emit('activate')"
    ></button>
  </div>
</template>

<style scoped src="./StageWindow.css"></style>

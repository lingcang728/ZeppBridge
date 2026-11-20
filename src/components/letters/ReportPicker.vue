<script setup lang="ts">
/**
 * 信纸底行的「诊断报告」小标签 + 类别选择。
 *
 * 点标签：附上报告，同时应用里统一的液态玻璃胶囊（SegmentTrack）从标签里伸出来：位置从标签滑到标签上方，
 * 裁切从标签那么大长到整条胶囊（圆角全程不变），胶囊一开始就看得见、跟着裁切一起长开，所以是「从标签里拉出来」，
 * 不是凭空冒出来。四个类别可以点也可以拖。挑完停一拍让滑块落稳，再原路缩回标签；点别处、Esc 也是原路缩回。
 * 开到一半就关，从此刻的样子掉头，不跳。只动 transform / opacity / clip-path（圆角不变，留在合成器上）。
 *
 * 板子挂在纸上（不 Teleport）：祖先没有 backdrop-filter，胶囊的透镜才挂得上（composables/useGlassLens.ts）。
 * Esc 走 onMotionEscape（窗口捕获阶段，比弹窗自己的 Esc 早），所以只收起板子，不会把整张信纸关掉。
 */
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import Icon from '../Icon.vue';
import SegmentTrack, { type SegmentItem } from '../SegmentTrack.vue';
import { exemptFromSettle, onMotionEscape } from '../../lib/motion/interrupt';
import { lessMotion } from '../../lib/motion/lessMotion';
import { OPEN_EASE, BACK_EASE, paced } from '../../lib/motion/timing';
import { useLetterText } from './letters.i18n';
import type { ReportCategory } from './AuthorCompose.vue';

const props = defineProps<{
  attach: boolean; category: ReportCategory; busy: boolean;
  items: SegmentItem<ReportCategory>[]; label: string; groupLabel: string;
}>();
const emit = defineEmits<{
  (event: 'update:attach', attach: boolean): void;
  (event: 'update:category', category: ReportCategory): void;
}>();
const t = useLetterText();

const OPEN_MS = paced(420);
const CLOSE_MS = paced(340);
/** 和标签的圆角一样（26px 高的胶囊）；胶囊自己更圆，落在这个裁切里面，不会被切到。 */
const RADIUS = 13;
const open = ref(false);
const tag = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const body = ref<HTMLElement | null>(null);
let running: Animation[] = [];
let releaseEscape: (() => void) | null = null;
let closing: Promise<void> | null = null;

/** 标签相对板子的位置：板子的左上角先摆到标签的左上角，裁切只露出标签那么大。 */
/* 用布局位置（offset*）量，不受板子此刻的 transform 影响：开到一半掉头时也量得准。 */
const startPose = () => {
  const box = panel.value!;
  const from = tag.value!;
  const dx = from.offsetLeft - box.offsetLeft;
  const dy = from.offsetTop - box.offsetTop;
  const right = Math.max(0, box.offsetWidth - from.offsetWidth);
  const bottom = Math.max(0, box.offsetHeight - from.offsetHeight);
  return {
    transform: `translate(${dx}px, ${dy}px)`,
    clipPath: `inset(0px ${right}px ${bottom}px 0px round ${RADIUS}px)`,
  };
};
const endPose = { transform: 'translate(0px, 0px)', clipPath: `inset(0px 0px 0px 0px round ${RADIUS}px)` };

const stop = () => { for (const animation of running) animation.cancel(); running = []; };

/** 从此刻的样子（可能开到一半）放到 target。 */
const play = (target: 'open' | 'closed'): Animation | null => {
  const el = panel.value;
  const inner = body.value;
  if (!el || !inner || !tag.value) return null;
  const now = running.length ? { transform: getComputedStyle(el).transform, clipPath: getComputedStyle(el).clipPath } : null;
  const innerNow = running.length ? Number(getComputedStyle(inner).opacity) : null;
  stop();
  const start = startPose();
  const opening = target === 'open';
  const from = now ?? (opening ? start : endPose);
  const to = opening ? endPose : start;
  const duration = opening ? OPEN_MS : CLOSE_MS;
  const easing = opening ? OPEN_EASE : BACK_EASE;
  const shape = el.animate([
    { transform: from.transform === 'none' ? 'translate(0px, 0px)' : from.transform, clipPath: from.clipPath },
    { transform: to.transform, clipPath: to.clipPath },
  ], { duration, easing, fill: 'forwards' });
  /* 胶囊：离开标签一点（一成多）就显出来、跟着裁切长开——再早字会和标签上的字叠在一起；关时缩到快回到标签才淡掉。 */
  const content = inner.animate(opening
    ? [{ opacity: innerNow ?? 0 }, { opacity: innerNow ?? 0, offset: 0.12 }, { opacity: 1, offset: 0.3 }, { opacity: 1 }]
    : [{ opacity: innerNow ?? 1 }, { opacity: innerNow ?? 1, offset: 0.62 }, { opacity: 0, offset: 0.86 }, { opacity: 0 }], { duration, easing: 'linear', fill: 'forwards' });
  running = [exemptFromSettle(shape), exemptFromSettle(content)];
  return shape;
};

const outside = (event: PointerEvent) => {
  const target = event.target as Node;
  if (panel.value?.contains(target) || tag.value?.contains(target)) return;
  void close(false);
};

const show = async () => {
  if (open.value) return;
  closing = null;
  open.value = true;
  await nextTick();
  document.addEventListener('pointerdown', outside, true);
  releaseEscape = onMotionEscape(() => { void close(true); return true; });
  if (!lessMotion()) play('open');
  panel.value?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
};

/** 原路缩回标签，放完才拆。refocus：用键盘关的，焦点回到标签上。 */
const close = (refocus: boolean): Promise<void> => {
  if (!open.value) return Promise.resolve();
  if (closing) return closing;
  document.removeEventListener('pointerdown', outside, true);
  releaseEscape?.();
  releaseEscape = null;
  const shape = lessMotion() ? null : play('closed');
  closing = (shape ? shape.finished.catch(() => undefined) : Promise.resolve()).then(() => {
    stop();
    open.value = false;
    closing = null;
    if (refocus) tag.value?.focus({ preventScroll: true });
  });
  return closing;
};

const press = () => {
  if (props.busy) return;
  if (!props.attach) emit('update:attach', true);
  if (open.value) void close(false);
  else void show();
};
let settle = 0;
const choose = (value: ReportCategory) => {
  emit('update:category', value);
  window.clearTimeout(settle);
  /* 停一拍：滑块落稳、字变色以后再缩回去。 */
  settle = window.setTimeout(() => { void close(true); }, paced(260));
};
const drop = () => { void close(false); emit('update:attach', false); };

const expanded = computed(() => open.value && !closing);
onBeforeUnmount(() => {
  window.clearTimeout(settle);
  document.removeEventListener('pointerdown', outside, true);
  releaseEscape?.();
  stop();
});
</script>

<template>
  <div class="report">
    <button ref="tag" type="button" :class="['report-tag', { picked: attach }]" :title="t.attachHint" :aria-label="attach ? label : t.attachReport"
      :aria-expanded="expanded" aria-haspopup="true" :disabled="busy" @click="press">
      <Icon name="file" :size="14" />
      <span class="report-label">{{ label }}</span>
    </button>
    <button v-if="attach" type="button" class="report-drop" :aria-label="t.removeReport" :title="t.removeReport" :disabled="busy" @click="drop">×</button>
    <div v-if="open" ref="panel" class="report-panel">
      <div ref="body" class="report-body">
        <SegmentTrack :items="items" :model-value="category" :aria-label="groupLabel" compact @update:model-value="choose" @reselect="choose" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.report { position: relative; display: inline-flex; align-items: center; min-width: 0; max-width: 100%; }
.report-tag {
  display: inline-flex; align-items: center; gap: 5px; min-width: 0; max-width: 100%; height: 26px; padding: 0 10px;
  border: 1px solid rgb(60 50 40 / .22); border-radius: 13px; background: none; cursor: pointer; white-space: nowrap;
  color: rgb(60 50 40 / .62); font: 500 var(--fs-xs) / 1 var(--font-sans);
  transition: color 160ms ease, border-color 160ms ease, background-color 160ms ease;
}
.report-tag:hover:not(:disabled) { color: var(--letter-ink, #24467e); border-color: color-mix(in srgb, var(--letter-ink, #24467e) 45%, transparent); }
.report-tag.picked { color: var(--letter-ink, #24467e); border-color: color-mix(in srgb, var(--letter-ink, #24467e) 55%, transparent); background: color-mix(in srgb, var(--letter-ink, #24467e) 6%, transparent); }
.report-tag:disabled { opacity: .55; cursor: default; }
.report-label { overflow: hidden; text-overflow: ellipsis; }
.report-drop {
  display: inline-grid; place-items: center; width: 22px; height: 22px; margin-inline-start: 2px; padding: 0; border: 0; border-radius: 50%;
  background: none; color: var(--paper-muted); font: 400 16px / 1 var(--font-sans); cursor: pointer; transition: color 160ms ease, background-color 160ms ease;
}
.report-drop:hover:not(:disabled) { color: var(--paper-ink); background: rgb(120 95 60 / .1); }
/* 外面这层只管裁切和位置，不画底：玻璃就是胶囊自己。不加 backdrop-filter / filter（胶囊的透镜要看得见背后）。 */
.report-panel {
  position: absolute; bottom: calc(100% + 8px); inset-inline-start: 0; z-index: 3; width: max-content; max-width: min(480px, calc(100vw - 96px));
  border-radius: 999px; box-shadow: 0 12px 26px -12px rgb(30 22 10 / .55); will-change: transform, clip-path;
}
.report-body { display: block; }
.report-tag:focus-visible, .report-drop:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .report-tag, .report-drop { transition: none; } }
</style>

<script setup lang="ts">
/**
 * 底栏右边那一枚主按钮（批次 5.1）：「交给 ChatGPT」本身就是选 AI 的玻璃胶囊——
 *   - 单击：寄出；
 *   - 横着拨（按住左右拖、触控板横滑、← / →）：换下一家 / 上一家，循环；名字跟着手滑，松手吸附；
 *   - 右上角一枚小角标说这家是「免费版」还是「已订阅」（改在寄出前检查里改，每家各自记住）。
 * 以前左边还有一只单独的 AI 滚轮和一枚订阅开关，和主按钮挤在一起，现在都收进这一枚。
 * 只动 translate / opacity（合成器上跑）；玻璃底是静态的。
 */
import { computed, ref } from 'vue';
import Icon from '../Icon.vue';
import { AI_PROVIDERS, type AiProvider } from '../../lib/aiProviders';
import { isSubscribed } from '../../lib/aiTask/budget';
import { useHandoffText } from './HandoffDock.i18n';

const props = defineProps<{ provider: AiProvider; disabled: boolean; sub: string; title: string }>();
const emit = defineEmits<{ go: []; pick: [AiProvider] }>();
const t = useHandoffText();
const index = computed(() => Math.max(0, AI_PROVIDERS.findIndex((p) => p.id === props.provider.id)));
const neighbour = (step: number) => AI_PROVIDERS[(index.value + step + AI_PROVIDERS.length) % AI_PROVIDERS.length]!;
const paid = computed(() => isSubscribed(props.provider.id));
const shift = ref(0);
const settling = ref(false);
/** 换家时名字从拨的方向滑进来：-1 往左拨（下一家从右边进来），1 往右拨。 */
const enter = ref<0 | 1 | -1>(0);
let start: { x: number; moved: boolean } | null = null;
let swallow = false;

const step = (by: 1 | -1) => {
  emit('pick', neighbour(by));
  enter.value = by === 1 ? -1 : 1;
  requestAnimationFrame(() => { enter.value = 0; });
};
const onDown = (event: PointerEvent) => {
  if (props.disabled || event.button !== 0) return;
  (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  start = { x: event.clientX, moved: false };
  settling.value = false;
};
const onMove = (event: PointerEvent) => {
  if (!start) return;
  const dx = event.clientX - start.x;
  if (!start.moved && Math.abs(dx) < 6) return;
  start.moved = true;
  shift.value = Math.max(-90, Math.min(90, dx));
};
const onUp = () => {
  const began = start;
  start = null;
  if (!began) return;
  settling.value = true;
  if (began.moved) {
    swallow = true;
    if (shift.value <= -36) step(1);
    else if (shift.value >= 36) step(-1);
  }
  shift.value = 0;
};
const onClick = () => {
  if (swallow) { swallow = false; return; }
  if (!props.disabled) emit('go');
};
let wheelAt = 0;
const onWheel = (event: WheelEvent) => {
  if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || props.disabled) return;
  event.preventDefault();
  const now = performance.now();
  if (now - wheelAt < 380 || Math.abs(event.deltaX) < 8) return;
  wheelAt = now;
  step(event.deltaX > 0 ? 1 : -1);
};
const onKey = (event: KeyboardEvent) => {
  if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
};
</script>

<template>
  <button type="button" class="go-capsule cta" :disabled="disabled" :title="title"
    :aria-label="`${t.go(provider.label)} · ${paid ? t.planPaid : t.planFree}`" aria-roledescription="carousel"
    @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" @click="onClick" @wheel="onWheel" @keydown="onKey">
    <span class="peek prev" aria-hidden="true"><img v-if="neighbour(-1).localIcon" :src="neighbour(-1).localIcon" alt="" /></span>
    <span :key="provider.id" :class="['face', { settling, [`from-${enter === 1 ? 'left' : enter === -1 ? 'right' : 'none'}`]: true }]" :style="{ translate: `${shift}px 0` }">
      <img v-if="provider.localIcon" :src="provider.localIcon" alt="" class="logo" />
      <span class="copy"><strong>{{ t.go(provider.label) }}</strong><small>{{ sub }}</small></span>
    </span>
    <span class="peek next" aria-hidden="true"><img v-if="neighbour(1).localIcon" :src="neighbour(1).localIcon" alt="" /></span>
    <span :class="['badge', { paid }]" aria-hidden="true">{{ paid ? t.planPaid : t.planFree }}</span>
    <Icon name="send" :size="15" class="send" />
  </button>
</template>

<style scoped>
.go-capsule { position: relative; display: flex; align-items: center; gap: 8px; min-width: 250px; min-height: 48px; padding: 0 18px 0 12px; overflow: hidden;
  border: 0; border-radius: 999px; background: var(--accent); color: var(--accent-ink, #10140c); font: inherit; cursor: pointer; touch-action: pan-y; user-select: none;
  box-shadow: var(--mat-raised-rim), 0 8px 22px -12px color-mix(in srgb, var(--accent) 70%, transparent); }
.go-capsule:disabled { opacity: .5; cursor: default; }
.go-capsule:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
.face { display: flex; flex: 1 1 auto; align-items: center; gap: 10px; min-width: 0; }
.face.settling { transition: translate 300ms cubic-bezier(.34, 1.36, .64, 1); }
.face.from-right { animation: face-in-right 320ms cubic-bezier(.4, .6, .2, 1); }
.face.from-left { animation: face-in-left 320ms cubic-bezier(.4, .6, .2, 1); }
.logo { width: 22px; height: 22px; flex: none; border-radius: 6px; object-fit: contain; }
.copy { display: grid; min-width: 0; line-height: 1.15; text-align: left; }
.copy strong { overflow: hidden; font-size: var(--fs-md); font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.copy small { overflow: hidden; font-size: 10px; opacity: .72; text-overflow: ellipsis; white-space: nowrap; }
.peek { display: grid; width: 14px; flex: none; place-items: center; opacity: .35; }
.peek img { width: 14px; height: 14px; object-fit: contain; filter: grayscale(1); }
.send { flex: none; opacity: .85; }
.badge { position: absolute; top: 3px; right: 12px; padding: 0 6px; border-radius: 999px; background: color-mix(in srgb, #000 22%, transparent); color: inherit; font-size: 9px; font-weight: 700; line-height: 14px; }
.badge.paid { background: color-mix(in srgb, #fff 55%, transparent); }
@keyframes face-in-right { from { opacity: 0; translate: 26px 0; } to { opacity: 1; translate: 0 0; } }
@keyframes face-in-left { from { opacity: 0; translate: -26px 0; } to { opacity: 1; translate: 0 0; } }
@media (prefers-reduced-motion: reduce) { .face.settling, .face.from-right, .face.from-left { transition: none; animation: none; } }
</style>

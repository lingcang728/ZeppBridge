<script setup lang="ts">
/**
 * 「今日一问」里的「按住交给 <AI>」：和交给 AI 页那枚门锁（ai/stage/BridgeLock.vue）同一套蓄力 → 发射，只是做成一枚胶囊。
 * - 按住约 0.95 秒蓄满：胶囊里从左往右灌满一层亮色（先慢后快，按 p^2.2 换算），越到后面抖得越厉害，配同一股引擎声；
 * - 蓄满：猛抖一下、亮一下（点火），放完这一下才 `go`；
 * - 没蓄满就松手：亮色原路退掉、声音收掉，不发。只点一下（蓄得很少就松手）：胶囊左右抖一下，`nudge` 告诉外面提示「按住才发」。
 * - 减少动效时按一下就发。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { usePressHold } from '../../composables/usePressHold';
import { chargeHum, launchBoom, type ChargeHum } from '../../lib/motion/launchSound';
import { reducedMotion } from '../../lib/motion/cards';

const props = defineProps<{ label: string; icon?: string; disabled?: boolean; title?: string }>();
const emit = defineEmits<{ go: []; nudge: [] }>();

const HOLD_MS = 950;
const LAUNCH_MS = 320;
/** 蓄到这么多以下就松手，算「只点了一下」。 */
const TAP_BELOW = 0.2;
const launching = ref(false);
const shaking = ref(false);
let fired = false;
let launchTimer = 0;
let shakeTimer = 0;
let hum: ChargeHum | null = null;
const stopHum = () => { hum?.stop(); hum = null; };

const finish = () => {
  launchTimer = 0;
  fired = false;
  hold.cancel();
  emit('go');
  window.setTimeout(() => { launching.value = false; }, 420);
};
const hold = usePressHold(() => {
  fired = true;
  stopHum();
  if (reducedMotion()) { finish(); return; }
  launching.value = true;
  launchBoom();
  launchTimer = window.setTimeout(finish, LAUNCH_MS);
}, reducedMotion() ? 1 : HOLD_MS);
const charge = computed(() => (launching.value ? 1 : hold.progress.value ** 2.2));
const charging = computed(() => hold.holding.value || hold.progress.value > 0);
/** 越蓄越抖：幅度随蓄力三次方涨（最多 1.8px）。 */
const tremble = computed(() => {
  const a = hold.holding.value ? 1.8 * charge.value ** 3 : 0;
  return a > 0.05 ? `${((Math.random() * 2 - 1) * a).toFixed(2)}px ${((Math.random() * 2 - 1) * a).toFixed(2)}px` : '0 0';
});
watch(charge, (level) => {
  if (!hold.holding.value || reducedMotion()) return;
  hum ??= chargeHum();
  hum.set(level);
});

const nudge = () => {
  emit('nudge');
  if (reducedMotion()) return;
  window.clearTimeout(shakeTimer);
  shaking.value = false;
  requestAnimationFrame(() => { shaking.value = true; shakeTimer = window.setTimeout(() => { shaking.value = false; }, 420); });
};
const release = () => {
  if (fired) return;
  const tapped = hold.progress.value < TAP_BELOW;
  hold.cancel();
  stopHum();
  if (tapped) nudge();
};
const onDown = (event: PointerEvent) => { if (!props.disabled) hold.pointerdown(event); };
const onKeyDown = (event: KeyboardEvent) => { if (!props.disabled) hold.keydown(event); };
const onKeyUp = (event: KeyboardEvent) => {
  if (fired || (event.code !== 'Space' && event.code !== 'Enter')) return;
  event.preventDefault();
  release();
};
onBeforeUnmount(() => { window.clearTimeout(launchTimer); window.clearTimeout(shakeTimer); stopHum(); });
</script>

<template>
  <button type="button" :class="['hold-send', { charging, launching, shaking }]" :style="{ '--charge': charge.toFixed(3), translate: tremble }"
    :disabled="disabled" :title="title" @pointerdown="onDown" @pointerup="release" @pointercancel="release" @keydown="onKeyDown" @keyup="onKeyUp" @click.prevent>
    <span class="fill" aria-hidden="true" />
    <img v-if="icon" class="hold-icon" :src="icon" alt="" />
    <span class="hold-label">{{ label }}</span>
  </button>
</template>

<style scoped>
.hold-send { position: relative; isolation: isolate; display: inline-flex; align-items: center; gap: 7px; min-height: 38px; padding: 0 16px; overflow: hidden;
  border: 0; border-radius: 999px; background: var(--accent); color: var(--accent-ink, #10140a); font: 650 var(--fs-sm) var(--font-sans); cursor: pointer;
  touch-action: none; user-select: none; transition: scale 200ms cubic-bezier(.3, 1.3, .5, 1), opacity 160ms ease; }
.hold-send:hover:not(:disabled) { scale: 1.03; }
.hold-send.charging { scale: calc(1 - var(--charge) * .05); }
.hold-send:disabled { cursor: default; opacity: .45; }
.hold-send:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
/* 蓄力：从左往右灌满一层亮色（只动 transform），越满越亮。 */
.fill { position: absolute; inset: 0; z-index: -1; background: linear-gradient(90deg, color-mix(in srgb, #fff 18%, transparent), color-mix(in srgb, #fff 42%, transparent));
  transform-origin: left center; transform: scaleX(var(--charge)); opacity: calc(.4 + var(--charge) * .6); }
.hold-icon { width: 16px; height: 16px; border-radius: 4px; }
.hold-label { white-space: nowrap; }
/* 点火：猛抖一下、亮一下再弹回。 */
.hold-send.launching { animation: hold-ignite 320ms cubic-bezier(.3, 0, .2, 1) both; }
@keyframes hold-ignite {
  0% { translate: 0 0; scale: .95; }
  10% { translate: -2px 0; } 20% { translate: 2px 0; } 30% { translate: -2px 0; } 40% { translate: 1px 0; }
  60% { translate: 0 0; scale: 1.08; filter: brightness(1.25); }
  100% { scale: 1; filter: none; }
}
/* 只点了一下：左右抖一下，提示要按住。 */
.hold-send.shaking { animation: hold-nudge 420ms cubic-bezier(.36, .07, .19, .97) both; }
@keyframes hold-nudge { 15%, 55% { translate: -4px 0; } 35%, 75% { translate: 4px 0; } 100% { translate: 0 0; } }
@media (prefers-reduced-motion: reduce) { .hold-send.launching, .hold-send.shaking { animation: none; } }
</style>

<script setup lang="ts">
/**
 * 舞台正中的门锁（2026-10-08）：一枚圆形的锁，里面是这次要交给的 AI。
 * 锁外一圈是准备环，跟扑克牌长按那圈一样（10-09）：平时是空的，没有亮条、也不标百分比——
 * 左边的牌已经写了有几天数据。按住锁，弧从正上方蓄到一整圈（约半秒），满了再寄出
 * （准备文件 → 复制开场白 → 打开网站，编排见 useStageSend）。没按满就松手，弧收回，不寄。
 * 准备途中再按一下 = 收回。减少动效时按一下就寄。
 *
 * 锁下面是原来那只 Liquid Glass 横拨滚轮（CapsuleWheel），拨它换锁里的 AI；滚轮镜片里单击也照旧寄出。
 * 再下面一行小字是就绪度和 `.md` 的体量，点它进「寄出前检查」（从这行长出来，返回缩回这里）。
 * 准备文件时环在转（只转 <svg> 自己，上合成器）。同步中锁是灰的、不能点。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import CapsuleWheel from '../../CapsuleWheel.vue';
import Icon from '../../Icon.vue';
import { AI_PROVIDERS, type AiProvider, type AiProviderId } from '../../../lib/aiProviders';
import { reducedMotion } from '../../../lib/motion/cards';
import { usePressHold } from '../../../composables/usePressHold';
import { chargeHum, launchBoom, type ChargeHum } from '../../../lib/motion/launchSound';
import { useHandoffText } from '../HandoffDock.i18n';
import { useStageText } from './stage.i18n';

const props = defineProps<{
  r: number; provider: AiProvider; busy: boolean; disabled: boolean; subscribed: boolean;
  readiness: { categories: number; percent: number } | null; mdLine: string | null; issues: number; waiting: string | null; title: string;
  /** 有一张牌被拖到锁跟前：锁迎上来一点。 */
  near?: boolean;
}>();
const emit = defineEmits<{ go: []; pick: [AiProviderId]; exportOnly: [] }>();
const t = useHandoffText();
const s = useStageText();
const items = computed(() => AI_PROVIDERS.map((p) => ({ value: p.id, label: p.label, image: p.localIcon })));
const RING_R = 47;
const RING = 2 * Math.PI * RING_R;
/**
 * 蓄力 → 发射（10-13 重做，用户：「长按出来的进度条很丑；要有蓄力、有加速度，到临界点抖一下，像火箭发射」）：
 * - 蓄力 ~0.95 秒，看起来**先慢后快**（进度按 p^2.2 换算）：环越画越粗、越来越亮，锁里那枚 AI 图标被往下压、
 *   周围一圈光越聚越浓，越到后面抖得越厉害（抖动幅度随蓄力三次方涨）；配一股越来越尖的引擎声（静音也不影响看）。
 * - 蓄满：图标先猛抖一下，再「点火」——压到最低后弹起、冲出一圈冲击波，一声闷响 + 喷气；这一下放完才寄出，
 *   接着左边的牌沿线飞进锁（useStageSend / converge.ts）。
 * - 没蓄满就松手：环和光原路退掉，声音收掉，不寄。减少动效时按一下就寄。
 */
const HOLD_MS = 950;
/** 蓄满以后抖一下、点火，放完这一段再寄出。 */
const LAUNCH_MS = 320;
let launchTimer = 0;
let fired = false;
const launching = ref(false);
let hum: ChargeHum | null = null;
const stopHum = () => { hum?.stop(); hum = null; };
const finishLaunch = () => {
  launchTimer = 0;
  fired = false;
  hold.cancel();
  emit('go');
  window.setTimeout(() => { launching.value = false; }, 520);
};
const hold = usePressHold(() => {
  fired = true;
  stopHum();
  if (reducedMotion()) { finishLaunch(); return; }
  launching.value = true;
  launchBoom();
  launchTimer = window.setTimeout(finishLaunch, LAUNCH_MS);
}, reducedMotion() ? 1 : HOLD_MS);
/** 蓄力的「感觉」：先慢后快。环、光、下压、抖动都按它走。 */
const charge = computed(() => (launching.value ? 1 : hold.progress.value ** 2.2));
const meter = computed(() => `${charge.value * RING} ${RING}`);
const charging = computed(() => hold.holding.value || hold.progress.value > 0);
/** 越蓄越抖：每一帧随机挪一点，幅度随蓄力三次方涨（最多 2.6px）。 */
const tremble = computed(() => {
  const a = hold.holding.value ? 2.6 * charge.value ** 3 : 0;
  return a > 0.05 ? `${((Math.random() * 2 - 1) * a).toFixed(2)}px ${((Math.random() * 2 - 1) * a).toFixed(2)}px` : '0 0';
});
watch(charge, (level) => {
  if (!hold.holding.value || reducedMotion()) return;
  hum ??= chargeHum();
  hum.set(level);
});
/** 按住开始蓄。准备途中再按 = 收回，不蓄第二圈。没转满就松手，弧收回。 */
const onPointerDown = (event: PointerEvent) => {
  if (props.busy) { emit('go'); return; }
  hold.pointerdown(event);
};
const onPointerUp = () => { if (!fired) { hold.cancel(); stopHum(); } };
const onKeyDown = (event: KeyboardEvent) => {
  if (props.busy && (event.code === 'Space' || event.code === 'Enter')) { event.preventDefault(); emit('go'); return; }
  hold.keydown(event);
};
const onKeyUp = (event: KeyboardEvent) => { if (!fired) { hold.keyup(event); stopHum(); } };
const go = () => { if (!props.disabled) emit('go'); };
onBeforeUnmount(() => { window.clearTimeout(launchTimer); stopHum(); });
</script>

<template>
  <div class="bridge-lock" :style="{ '--r': `${r}px` }">
    <button type="button" :class="['lock', { busy, disabled, near, charging, launching }]" :style="{ '--charge': charge.toFixed(3) }" :disabled="disabled"
      :title="`${title}\n${s.ringHint}`" :aria-label="busy ? s.lockBusy : s.lock(provider.label)"
      @pointerdown="onPointerDown" @pointerup="onPointerUp" @pointercancel="onPointerUp" @keydown="onKeyDown" @keyup="onKeyUp" @click.prevent>
      <span class="halo" aria-hidden="true"></span>
      <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="lock-charge-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="var(--accent)" stop-opacity=".55" />
            <stop offset="1" stop-color="var(--accent)" />
          </linearGradient>
        </defs>
        <circle class="track" cx="50" cy="50" :r="RING_R" />
        <circle v-if="(hold.progress.value > 0 || launching) && !busy" class="meter" cx="50" cy="50" :r="RING_R" :stroke-dasharray="meter" stroke="url(#lock-charge-grad)" />
      </svg>
      <svg v-if="busy" class="spin" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" :r="RING_R" :stroke-dasharray="`${RING * 0.18} ${RING}`" /></svg>
      <span class="wave" aria-hidden="true"></span>
      <span class="disc" :style="{ translate: tremble }"><img :src="provider.localIcon" alt="" /></span>
    </button>
    <div class="lock-wheel">
      <CapsuleWheel class="wheel" loop activatable :span="196" :items="items" :model-value="provider.id" :disabled="disabled"
        :aria-label="`${t.go(provider.label)} · ${subscribed ? t.planPaid : t.planFree}`" @update:model-value="emit('pick', $event)" @activate="go" />
      <span :class="['badge', { paid: subscribed }]" aria-hidden="true">{{ subscribed ? t.planPaid : t.planFree }}</span>
      <button type="button" class="export-only" :disabled="disabled || busy" :title="t.exportOnly" :aria-label="t.exportOnly" @click="emit('exportOnly')"><Icon name="export" :size="15" /></button>
    </div>
    <RouterLink to="/ai/check" class="ready-line" data-sheet="check" :title="t.checkHint">
      <span v-if="waiting">{{ waiting }}</span>
      <template v-else>
        <span>{{ readiness ? t.readiness(readiness.categories, readiness.percent) : t.readinessLoading }}</span>
        <small v-if="mdLine || issues">{{ mdLine }}<template v-if="mdLine && issues"> · </template><template v-if="issues">{{ t.issueCount(issues) }}</template></small>
      </template>
      <Icon name="chevron-right" :size="12" class="chev" />
    </RouterLink>
  </div>
</template>

<style scoped>
.bridge-lock { display: grid; justify-items: center; gap: 12px; width: 260px; }
.lock { position: relative; display: grid; place-items: center; width: calc(var(--r) * 2); height: calc(var(--r) * 2); padding: 0; border: 0; border-radius: 50%;
  background: none; cursor: pointer; transition: scale 220ms cubic-bezier(.3, 1.3, .5, 1); }
.lock:hover:not(:disabled) { scale: 1.04; }
.lock:active:not(:disabled):not(.charging) { scale: .96; }
.lock:focus-visible { outline: 2px solid var(--focus); outline-offset: 6px; }
.lock.disabled { cursor: default; filter: grayscale(.7); opacity: .65; }
.lock.near:not(:disabled) { scale: 1.08; }
.lock.near .ring .track { stroke: color-mix(in srgb, var(--accent) 45%, transparent); }
.lock.near .disc { box-shadow: var(--mat-raised-rim), inset 0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent), 0 0 34px -6px color-mix(in srgb, var(--accent) 70%, transparent), 0 0 0 7px color-mix(in srgb, var(--canvas) 70%, transparent); }
.ring .track { transition: stroke 220ms ease; }
.disc { transition: box-shadow 220ms ease; }
.ring, .spin { position: absolute; inset: -9px; width: calc(100% + 18px); height: calc(100% + 18px); rotate: -90deg; }
.ring circle, .spin circle { fill: none; stroke-width: 2; stroke-linecap: round; }
.ring .track { stroke: color-mix(in srgb, var(--ink) 14%, transparent); }
/* 蓄力环：越蓄越粗、越亮（--charge 0–1，已经按加速度换算）。 */
.ring .meter { stroke-width: calc(2.6px + var(--charge) * 3.4px); filter: drop-shadow(0 0 calc(1px + var(--charge) * 6px) color-mix(in srgb, var(--accent) 80%, transparent)); }
.lock.charging .ring .track { stroke: color-mix(in srgb, var(--accent) 38%, transparent); }
/* 锁周围那一圈光：随蓄力聚拢、变浓。 */
.halo { position: absolute; inset: -22px; border-radius: 50%; pointer-events: none; opacity: var(--charge); scale: calc(1.25 - var(--charge) * .3);
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 34%, transparent) 0 46%, transparent 70%); }
/* 图标被往下压（蓄力越满压得越低），里面亮起一圈。 */
.lock.charging .disc { scale: calc(1 - var(--charge) * .1); }
.disc { position: relative; }
.disc::after { content: ''; position: absolute; inset: 0; border-radius: 50%; pointer-events: none; opacity: var(--charge);
  box-shadow: inset 0 0 calc(var(--charge) * 26px) color-mix(in srgb, var(--accent) 60%, transparent); }
/* 点火：猛抖一下 → 压到最低 → 弹起冲出去；一圈冲击波往外散开。 */
.wave { position: absolute; inset: -9px; border: 3px solid var(--accent); border-radius: 50%; opacity: 0; pointer-events: none; }
.lock.launching .disc { animation: lock-ignite 320ms cubic-bezier(.3, 0, .2, 1) both; }
.lock.launching .wave { animation: lock-wave 640ms 150ms cubic-bezier(.1, .6, .3, 1) both; }
.lock.launching .halo { animation: lock-flash 520ms 140ms ease-out both; }
@keyframes lock-ignite {
  0% { translate: 0 0; scale: .9; }
  8% { translate: -3px 1px; } 16% { translate: 3px -2px; } 24% { translate: -3px 2px; } 32% { translate: 3px -1px; }
  45% { translate: 0 0; scale: .86; }
  72% { scale: 1.16; }
  100% { translate: 0 0; scale: 1; }
}
@keyframes lock-wave { from { opacity: .9; scale: .96; } to { opacity: 0; scale: 2.4; border-width: 1px; } }
@keyframes lock-flash { 0% { opacity: 1; scale: .95; } 100% { opacity: 0; scale: 1.6; } }
.spin circle { stroke: var(--accent); stroke-width: 3; }
.spin { animation: spin 1.1s linear infinite; }
.disc { display: grid; place-items: center; width: 100%; height: 100%; border-radius: 50%; background: var(--mat-raised);
  box-shadow: var(--mat-raised-rim), inset 0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent), 0 18px 40px -18px rgba(0, 0, 0, .7), 0 0 0 7px color-mix(in srgb, var(--canvas) 70%, transparent); }
.disc img { width: 42%; height: 42%; border-radius: 22%; object-fit: contain; }
/* 滚轮底座是一块毛玻璃（10-08 H19）。玻璃画在垫底的 ::before 上、不画在底座自己身上：祖先带 backdrop-filter 的话，
   滚轮镜片的折射就取样不到背后（lib/glassLens.ts，同 ModalDialog 的 .dialog-glass）。 */
.lock-wheel { position: relative; isolation: isolate; display: flex; align-items: center; gap: 4px; padding: 3px 3px 3px 6px; border-radius: 999px; }
.lock-wheel::before { content: ''; position: absolute; inset: 0; z-index: -1; border: 1px solid var(--mat-glass-line); border-radius: inherit; background: var(--mat-glass-strong);
  -webkit-backdrop-filter: var(--mat-glass-blur); backdrop-filter: var(--mat-glass-blur); box-shadow: var(--mat-glass-shadow); pointer-events: none; }
.wheel { --cap-ink: var(--accent); height: 38px; background: none !important; box-shadow: none !important; }
.wheel :deep(.wheel-lens) { top: 2px; bottom: 2px; background: var(--cap-glass-thumb); box-shadow: var(--cap-glass-thumb-rim); }
.wheel :deep(.wheel-refract) { top: 2px; bottom: 2px; }
.wheel :deep(.wheel-item) { padding: 0 10px; font-size: var(--fs-sm); }
.wheel :deep(.wheel-label) { font-weight: 700; }
.wheel :deep(.wheel-image) { width: 18px; height: 18px; flex-basis: 18px; border-radius: 5px; }
.badge { position: absolute; top: -8px; right: 30px; z-index: 2; padding: 1px 7px; border-radius: 999px; background: var(--mat-glass-strong); box-shadow: var(--glass-rim);
  color: var(--muted); font-size: 10px; font-weight: 700; line-height: 15px; pointer-events: none; }
.badge.paid { color: var(--accent); }
.export-only { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--subtle); cursor: pointer; }
.export-only:hover:not(:disabled) { background: var(--glass-press); color: var(--ink); }
.export-only:disabled { opacity: .5; cursor: default; }
/* 就绪度那两行也是一枚小玻璃（H19：以前硬印在版面上，看不出能点）；悬停浮起一点。 */
.ready-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; justify-items: center; column-gap: 6px; max-width: 260px; padding: 6px 10px 6px 14px; border: 1px solid var(--mat-glass-line);
  border-radius: 16px; background: var(--mat-glass-strong); -webkit-backdrop-filter: var(--mat-glass-blur); backdrop-filter: var(--mat-glass-blur); box-shadow: var(--mat-glass-shadow);
  color: var(--muted); font-size: var(--fs-xs); text-align: center; text-decoration: none; transition: translate 200ms cubic-bezier(.3, 1.3, .5, 1), color var(--dur-base) ease; }
.ready-line > span, .ready-line > small { grid-column: 1; }
.ready-line small { color: var(--subtle); font-size: var(--fs-2xs); }
.ready-line .chev { grid-column: 2; grid-row: 1 / span 2; align-self: center; color: var(--subtle); }
.ready-line:hover { translate: 0 -2px; color: var(--ink); }
.ready-line:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@keyframes spin { to { rotate: 270deg; } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } .lock { transition: none; } .lock.launching .disc, .lock.launching .wave, .lock.launching .halo { animation: none; } }
</style>

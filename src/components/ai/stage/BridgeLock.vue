<script setup lang="ts">
/**
 * 舞台正中的门锁（2026-10-08）：一枚圆形的锁，里面是这次要交给的 AI；锁外一圈细环是数据就绪度
 * （旧底栏那枚圆环搬过来）。点锁 = 寄出（准备文件 → 复制开场白 → 打开网站，编排见 useStageSend）。
 *
 * 锁下面是原来那只 Liquid Glass 横拨滚轮（CapsuleWheel），拨它换锁里的 AI；滚轮镜片里单击也照旧寄出。
 * 再下面一行小字是就绪度和 `.md` 的体量，点它进「寄出前检查」（从这行长出来，返回缩回这里）。
 * 准备文件时环在转（只转 <svg> 自己，上合成器）；同步中锁是灰的、不能点。
 */
import { computed } from 'vue';
import CapsuleWheel from '../../CapsuleWheel.vue';
import Icon from '../../Icon.vue';
import { AI_PROVIDERS, type AiProvider, type AiProviderId } from '../../../lib/aiProviders';
import { useHandoffText } from '../HandoffDock.i18n';
import { useStageText } from './stage.i18n';

const props = defineProps<{
  r: number; provider: AiProvider; busy: boolean; disabled: boolean; subscribed: boolean;
  readiness: { categories: number; percent: number } | null; mdLine: string | null; issues: number; waiting: string | null; title: string;
}>();
const emit = defineEmits<{ go: []; pick: [AiProviderId]; exportOnly: [] }>();
const t = useHandoffText();
const s = useStageText();
const items = computed(() => AI_PROVIDERS.map((p) => ({ value: p.id, label: p.label, image: p.localIcon })));
const RING_R = 47;
const RING = 2 * Math.PI * RING_R;
const meter = computed(() => `${((props.readiness?.percent ?? 0) / 100) * RING} ${RING}`);
const go = () => { if (!props.disabled) emit('go'); };
</script>

<template>
  <div class="bridge-lock" :style="{ '--r': `${r}px` }">
    <button type="button" :class="['lock', { busy, disabled }]" :disabled="disabled" :title="title" :aria-label="busy ? s.lockBusy : s.lock(provider.label)" @click="go">
      <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle class="track" cx="50" cy="50" :r="RING_R" />
        <circle class="meter" cx="50" cy="50" :r="RING_R" :stroke-dasharray="meter" />
      </svg>
      <svg v-if="busy" class="spin" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" :r="RING_R" :stroke-dasharray="`${RING * 0.18} ${RING}`" /></svg>
      <span class="disc"><img :src="provider.localIcon" alt="" /></span>
    </button>
    <div class="lock-wheel">
      <CapsuleWheel class="wheel" loop activatable plain :span="196" :items="items" :model-value="provider.id" :disabled="disabled"
        :aria-label="`${t.go(provider.label)} · ${subscribed ? t.planPaid : t.planFree}`" @update:model-value="emit('pick', $event)" @activate="go" />
      <span :class="['badge', { paid: subscribed }]" aria-hidden="true">{{ subscribed ? t.planPaid : t.planFree }}</span>
      <button type="button" class="export-only" :disabled="disabled || busy" :title="t.exportOnly" :aria-label="t.exportOnly" @click="emit('exportOnly')"><Icon name="export" :size="15" /></button>
    </div>
    <RouterLink to="/ai/check" class="ready-line" data-morph-card :title="t.checkHint">
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
.lock:active:not(:disabled) { scale: .96; }
.lock:focus-visible { outline: 2px solid var(--focus); outline-offset: 6px; }
.lock.disabled { cursor: default; filter: grayscale(.7); opacity: .65; }
.ring, .spin { position: absolute; inset: -9px; width: calc(100% + 18px); height: calc(100% + 18px); rotate: -90deg; }
.ring circle, .spin circle { fill: none; stroke-width: 2; stroke-linecap: round; }
.ring .track { stroke: color-mix(in srgb, var(--ink) 9%, transparent); }
.ring .meter { stroke: var(--accent); transition: stroke-dasharray 600ms cubic-bezier(.4, .6, .2, 1); }
.spin circle { stroke: var(--accent); stroke-width: 3; }
.spin { animation: spin 1.1s linear infinite; }
.disc { display: grid; place-items: center; width: 100%; height: 100%; border-radius: 50%; background: var(--mat-raised);
  box-shadow: var(--mat-raised-rim), inset 0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent), 0 18px 40px -18px rgba(0, 0, 0, .7), 0 0 0 7px color-mix(in srgb, var(--canvas) 70%, transparent); }
.disc img { width: 42%; height: 42%; border-radius: 22%; object-fit: contain; }
.lock-wheel { position: relative; display: flex; align-items: center; gap: 4px; padding: 3px 3px 3px 6px; border-radius: 999px; background: var(--cap-track); box-shadow: var(--cap-track-shadow); }
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
.ready-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; justify-items: center; column-gap: 4px; max-width: 260px; padding: 4px 10px; border-radius: 12px;
  color: var(--muted); font-size: var(--fs-xs); text-align: center; text-decoration: none; transition: background var(--dur-base) ease; }
.ready-line > span, .ready-line > small { grid-column: 1; }
.ready-line small { color: var(--subtle); font-size: var(--fs-2xs); }
.ready-line .chev { grid-column: 2; grid-row: 1 / span 2; align-self: center; color: var(--subtle); }
.ready-line:hover { background: color-mix(in srgb, var(--ink) 4%, transparent); color: var(--ink); }
.ready-line:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@keyframes spin { to { rotate: 270deg; } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } .lock { transition: none; } }
</style>

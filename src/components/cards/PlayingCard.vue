<script setup lang="ts">
/**
 * 一张牌（精修批次 7.2）：日牌或一叠（周 / 月）。只管长相，点、长按、键盘都在牌桌（CardTable）里处理。
 *
 * 日牌挑中后翻到背面「交给 AI ✓」（翻面动画由牌桌调 flipCard 放，这里只按 `picked` 换面）。
 * 一叠后面垫两张歪着的牌，看上去是一摞；长按时中间画一圈进度（450ms，CSS 动画，不逐帧改 Vue 状态）。
 */
import Icon from '../Icon.vue';
import { useCardsText } from './cards.i18n';

withDefaults(defineProps<{
  kind: 'day' | 'group';
  top: string;
  title: string;
  value?: string | null;
  sub?: string | null;
  picked?: boolean;
  badge?: string | null;
  disabled?: boolean;
  holding?: boolean;
  tint?: string;
}>(), { value: null, sub: null, picked: false, badge: null, disabled: false, holding: false, tint: 'var(--accent)' });
const t = useCardsText();
</script>

<template>
  <button type="button" :class="['pcard', kind, { picked, disabled, holding }]" :style="{ '--tint': tint }" :aria-disabled="disabled || undefined">
    <span v-if="picked && kind === 'day'" class="pcard-face back">
      <Icon name="check" :size="22" />
      <strong>{{ t.picked }}</strong>
      <small>{{ title }}</small>
    </span>
    <span v-else class="pcard-face">
      <small class="pcard-top">{{ top }}</small>
      <strong class="pcard-title">{{ title }}</strong>
      <span class="pcard-value" :class="{ none: !value }">{{ value ?? '—' }}</span>
      <small v-if="sub" class="pcard-sub">{{ sub }}</small>
      <em v-if="badge" class="pcard-badge">{{ badge }}</em>
    </span>
    <svg v-if="kind === 'group'" class="pcard-ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" /></svg>
  </button>
</template>

<style scoped>
.pcard { position: relative; isolation: isolate; width: var(--card-w, 112px); aspect-ratio: 5 / 7; flex: 0 0 auto; padding: 0; border: 0; background: none; color: var(--ink);
  font: inherit; text-align: left; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.pcard.disabled { cursor: default; }
.pcard-face { position: absolute; inset: 0; display: grid; grid-template-rows: auto auto 1fr auto; gap: 2px; padding: 10px 11px 11px; border-radius: 14px;
  background: var(--mat-raised); box-shadow: var(--mat-raised-rim), 0 18px 34px -22px rgba(0, 0, 0, .7); transition: transform var(--dur-base) ease, box-shadow var(--dur-base) ease; }
.pcard:not(.disabled):hover .pcard-face { transform: translateY(-5px); box-shadow: var(--mat-raised-rim), 0 26px 40px -24px rgba(0, 0, 0, .75); }
.pcard:focus-visible { outline: none; }
.pcard:focus-visible .pcard-face { box-shadow: var(--mat-raised-rim), 0 0 0 2px var(--focus); }
.pcard.disabled .pcard-face { opacity: .42; }
/* 一叠：后面垫两张歪着的牌。 */
.pcard.group::before, .pcard.group::after { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: 14px; background: var(--mat-raised); box-shadow: var(--mat-raised-rim); }
.pcard.group::before { transform: translate(5px, 5px) rotate(4deg); opacity: .75; }
.pcard.group::after { transform: translate(-4px, 7px) rotate(-5deg); opacity: .5; }
.pcard-top { color: var(--muted); font-size: var(--fs-2xs); white-space: nowrap; }
.pcard-title { font-size: var(--fs-md); font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; }
.pcard.group .pcard-title { font-size: var(--fs-sm); }
.pcard-value { align-self: center; color: var(--tint); font-size: var(--fs-lg); font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.pcard-value.none { color: var(--subtle); font-weight: 500; }
.pcard-sub { color: var(--muted); font-size: var(--fs-2xs); line-height: 1.35; }
.pcard-badge { position: absolute; top: -7px; right: -7px; padding: 2px 7px; border-radius: 999px; background: var(--accent); color: var(--accent-ink, #10140a);
  font-size: var(--fs-2xs); font-style: normal; font-weight: 700; box-shadow: 0 4px 10px -4px rgba(0, 0, 0, .5); }
/* 背面：挑中了，交给 AI。 */
.pcard-face.back { grid-template-rows: 1fr auto auto; place-items: center; align-content: center; gap: 6px; text-align: center;
  /* --mat-raised 是渐变，不能进 color-mix（整条声明会失效、背面透明）：叠一层强调色在它上面。 */
  background: linear-gradient(color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--accent) 22%, transparent)), var(--mat-raised); color: var(--accent); }
.pcard-face.back strong { font-size: var(--fs-sm); }
.pcard-face.back small { color: var(--muted); font-size: var(--fs-2xs); }
/* 长按进度环：只在按住时出现，一圈 450ms。 */
.pcard-ring { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; opacity: 0; pointer-events: none; transform: rotate(-90deg); }
.pcard-ring circle { fill: color-mix(in srgb, var(--bg, #000) 55%, transparent); stroke: var(--accent); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 113.1; stroke-dashoffset: 113.1; }
.pcard.holding .pcard-ring { opacity: 1; }
.pcard.holding .pcard-ring circle { animation: pcard-hold 450ms linear forwards; }
@keyframes pcard-hold { to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) {
  .pcard-face { transition: none; }
  .pcard.holding .pcard-ring circle { animation-duration: 1ms; }
}
</style>

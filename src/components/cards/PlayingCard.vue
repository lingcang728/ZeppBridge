<script setup lang="ts">
/**
 * 一张牌（精修批次 7.2，10-07 第二轮重画）：日牌或一叠（周 / 月）。只管长相，点、长按、键盘都在牌桌（CardTable）里处理。
 *
 * 像真的扑克牌：左上、右下两个角标（星期 + 花色点），正中是日期和读数，字号跟着牌宽走（--card-w）。
 * 挑中以后翻到背面「交给 AI ✓」（翻面动画由牌桌调 flipCard 放，这里只按 `picked` 换面）。
 * 一叠后面垫两张歪着的牌，看上去是一摞；长按时中间画一圈进度（450ms，CSS 动画，不逐帧改 Vue 状态）。
 * 没有记录的日子照样是一张牌，读数写「—」，整张压暗、不能挑。
 */
import Icon from '../Icon.vue';
import { useCardsText } from './cards.i18n';

withDefaults(defineProps<{
  kind: 'day' | 'group';
  top: string;
  title: string;
  value?: string | null;
  unit?: string | null;
  sub?: string | null;
  picked?: boolean;
  badge?: string | null;
  disabled?: boolean;
  holding?: boolean;
  focused?: boolean;
  tint?: string;
}>(), { value: null, unit: null, sub: null, picked: false, badge: null, disabled: false, holding: false, focused: false, tint: 'var(--accent)' });
const t = useCardsText();
</script>

<template>
  <button type="button" :class="['pcard', kind, { picked, disabled, holding, focused }]" :style="{ '--tint': tint }" :aria-disabled="disabled || undefined">
    <span v-if="picked && kind === 'day'" class="pcard-face back">
      <span class="back-mark"><Icon name="check" :size="26" /></span>
      <strong>{{ t.picked }}</strong>
      <small>{{ title }}</small>
    </span>
    <span v-else class="pcard-face">
      <span class="corner tl" aria-hidden="true"><small>{{ top }}</small><i></i></span>
      <span class="pcard-main">
        <strong class="pcard-title">{{ title }}</strong>
        <span class="pcard-value" :class="{ none: !value }">{{ value ?? '—' }}<small v-if="value && unit">{{ unit }}</small></span>
        <small v-if="sub" class="pcard-sub">{{ sub }}</small>
      </span>
      <span class="corner br" aria-hidden="true"><small>{{ top }}</small><i></i></span>
      <em v-if="badge" class="pcard-badge">{{ badge }}</em>
    </span>
    <svg v-if="kind === 'group'" class="pcard-ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" /></svg>
  </button>
</template>

<style scoped>
.pcard { --w: var(--card-w, 150px); position: relative; isolation: isolate; width: var(--w); aspect-ratio: 5 / 7; flex: 0 0 auto; padding: 0; border: 0; background: none;
  color: var(--ink); font: inherit; text-align: left; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.pcard.disabled { cursor: default; }
/* 牌面：有厚度的一块板，顶上一抹这一项的颜色，像印上去的花色底纹。 */
.pcard-face { position: absolute; inset: 0; display: grid; grid-template-rows: auto 1fr auto; padding: calc(var(--w) * .07); border-radius: calc(var(--w) * .1);
  background: radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, var(--tint) 16%, transparent), transparent 70%), var(--mat-raised);
  box-shadow: var(--mat-raised-rim), inset 0 0 0 1px color-mix(in srgb, var(--tint) 14%, transparent), 0 24px 40px -24px rgba(0, 0, 0, .8);
  transition: transform 260ms cubic-bezier(.3, 1.3, .5, 1), box-shadow var(--dur-base) ease; }
.pcard:not(.disabled):hover .pcard-face { transform: translateY(-8px); box-shadow: var(--mat-raised-rim), inset 0 0 0 1px color-mix(in srgb, var(--tint) 30%, transparent), 0 34px 50px -26px rgba(0, 0, 0, .85); }
.pcard.focused .pcard-face { box-shadow: var(--mat-raised-rim), inset 0 0 0 2px color-mix(in srgb, var(--tint) 70%, transparent), 0 30px 50px -24px color-mix(in srgb, var(--tint) 40%, rgba(0, 0, 0, .8)); }
.pcard:focus-visible { outline: none; }
.pcard:focus-visible .pcard-face { box-shadow: var(--mat-raised-rim), 0 0 0 2px var(--focus), 0 24px 40px -24px rgba(0, 0, 0, .8); }
.pcard.disabled .pcard-face { background: var(--mat-raised); opacity: .45; }
/* 一叠：后面垫两张歪着的牌。 */
.pcard.group::before, .pcard.group::after { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: calc(var(--w) * .1); background: var(--mat-raised); box-shadow: var(--mat-raised-rim), 0 18px 30px -22px rgba(0, 0, 0, .7); }
.pcard.group::before { transform: translate(6px, 6px) rotate(4deg); opacity: .8; }
.pcard.group::after { transform: translate(-5px, 9px) rotate(-5deg); opacity: .55; }
/* 角标：星期 / 月份 + 一个花色点；右下那个倒过来，像扑克牌。 */
.corner { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: max(10px, calc(var(--w) * .075)); font-weight: 650; line-height: 1; white-space: nowrap; }
.corner i { width: 7px; height: 7px; border-radius: 2px; background: var(--tint); transform: rotate(45deg); }
.corner.br { justify-self: end; transform: rotate(180deg); }
.pcard-main { display: grid; align-content: center; justify-items: center; gap: calc(var(--w) * .035); min-width: 0; text-align: center; }
.pcard-title { font-size: max(15px, calc(var(--w) * .15)); font-weight: 750; font-variant-numeric: tabular-nums; line-height: 1.1; letter-spacing: -.01em; }
.pcard.group .pcard-title { font-size: max(13px, calc(var(--w) * .11)); }
.pcard-value { color: var(--tint); font-family: var(--font-mono); font-size: max(16px, calc(var(--w) * .17)); font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.1; overflow-wrap: anywhere; }
.pcard-value small { margin-left: 3px; color: var(--muted); font-family: var(--font-sans, inherit); font-size: max(10px, calc(var(--w) * .075)); font-weight: 600; }
.pcard-value.none { color: var(--subtle); font-weight: 500; }
.pcard-sub { color: var(--muted); font-size: max(10px, calc(var(--w) * .072)); line-height: 1.35; }
.pcard-badge { position: absolute; top: -9px; right: -9px; padding: 3px 9px; border-radius: 999px; background: var(--accent); color: var(--accent-ink, #10140a);
  font-size: var(--fs-2xs); font-style: normal; font-weight: 750; box-shadow: 0 6px 14px -6px rgba(0, 0, 0, .6); }
/* 背面：挑中了，交给 AI。 */
.pcard-face.back { grid-template-rows: auto auto auto; place-items: center; align-content: center; gap: calc(var(--w) * .05); text-align: center;
  background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 34%, transparent), color-mix(in srgb, var(--accent) 12%, transparent)), var(--mat-raised);
  box-shadow: var(--mat-raised-rim), inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 55%, transparent), 0 26px 44px -24px color-mix(in srgb, var(--accent) 45%, rgba(0, 0, 0, .8));
  color: var(--accent); }
.back-mark { display: grid; place-items: center; width: calc(var(--w) * .34); height: calc(var(--w) * .34); border-radius: 50%; background: var(--accent); color: var(--accent-ink, #10140a); }
.pcard-face.back strong { font-size: max(13px, calc(var(--w) * .1)); }
.pcard-face.back small { color: var(--muted); font-size: max(10px, calc(var(--w) * .08)); font-variant-numeric: tabular-nums; }
/* 长按进度环：只在按住时出现，一圈 450ms。 */
.pcard-ring { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; opacity: 0; pointer-events: none; transform: rotate(-90deg); }
.pcard-ring circle { fill: color-mix(in srgb, var(--bg, #000) 55%, transparent); stroke: var(--accent); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 113.1; stroke-dashoffset: 113.1; }
.pcard.holding .pcard-ring { opacity: 1; }
.pcard.holding .pcard-ring circle { animation: pcard-hold 450ms linear forwards; }
@keyframes pcard-hold { to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) {
  .pcard-face { transition: none; }
  .pcard.holding .pcard-ring circle { animation-duration: 1ms; }
}
</style>

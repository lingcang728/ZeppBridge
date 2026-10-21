<script setup lang="ts">
/**
 * 信封的样子（批次 6；照用户 2026-10-21 的参考图：米白纸、带纹理，封盖是一个大三角压在三片折边上，
 * 火漆在封盖尖上，邮票贴右上角、邮戳半压在邮票上）。弹窗里拆信和信匣里摆着看都用它。
 *
 * state：sealed 封着 → opening 封盖翻开、信纸往上抽出 → leaving 信封往下沉、淡掉（信纸已经变成外面那沓信纸）。
 * 翻封盖用 rotateX，前后层次靠离散的 z-index 关键帧换；其余都只动 transform / opacity。
 * 折边用 SVG 画（拉伸到信封大小），渐变给出纸折过来的明暗。
 */
import { useId } from 'vue';
import PostageStamp from './PostageStamp.vue';
import Postmark from './Postmark.vue';

withDefaults(defineProps<{
  version: string;
  state?: 'sealed' | 'opening' | 'leaving' | 'still';
  bundled?: number;
  date?: string | null;
  to?: string;
  from?: string;
}>(), { state: 'still', bundled: 0, date: null, to: '', from: '' });
const id = `env-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
</script>

<template>
  <div :class="['envelope', `is-${state}`, { bundled: bundled > 1 }]">
    <span v-if="bundled > 2" class="env-ghost two" aria-hidden="true"></span>
    <span v-if="bundled > 1" class="env-ghost one" aria-hidden="true"></span>
    <span class="env-back" aria-hidden="true"></span>
    <span class="env-paper" aria-hidden="true"></span>
    <svg class="env-pocket" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient :id="`${id}-left`" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="var(--env)" />
          <stop offset="1" stop-color="var(--env-shade)" />
        </linearGradient>
        <linearGradient :id="`${id}-right`" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stop-color="var(--env)" />
          <stop offset="1" stop-color="var(--env-shade)" />
        </linearGradient>
        <linearGradient :id="`${id}-bottom`" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="var(--env)" />
          <stop offset="1" stop-color="var(--env-light)" />
        </linearGradient>
      </defs>
      <path d="M0 0L79 57L0 100Z" :fill="`url(#${id}-left)`" />
      <path d="M160 0L81 57L160 100Z" :fill="`url(#${id}-right)`" />
      <path d="M0 100L74 52Q80 48 86 52L160 100Z" :fill="`url(#${id}-bottom)`" />
      <path d="M0 100L74 52Q80 48 86 52L160 100" class="crease" />
    </svg>
    <span class="env-flap" aria-hidden="true">
      <svg viewBox="0 0 160 64" preserveAspectRatio="none">
        <defs>
          <linearGradient :id="`${id}-flap`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--env-light)" />
            <stop offset="1" stop-color="var(--env)" />
          </linearGradient>
        </defs>
        <path d="M0 0H160L86 60Q80 64 74 60Z" :fill="`url(#${id}-flap)`" />
        <path d="M0 0L74 60Q80 64 86 60L160 0" class="crease edge" />
      </svg>
    </span>
    <span class="env-grain" aria-hidden="true"></span>
    <span v-if="bundled > 1" class="env-twine" aria-hidden="true"></span>
    <div v-if="to || from" class="env-address" aria-hidden="true">
      <span class="env-to">{{ to }}</span>
      <span class="env-from">{{ from }}</span>
    </div>
    <div class="env-stamp" aria-hidden="true">
      <PostageStamp :version="version" :width="84" :tilt="1" />
      <Postmark v-if="date" class="env-postmark" :date="date" :width="112" />
    </div>
    <div class="env-seal"><slot name="seal" /></div>
  </div>
</template>

<style scoped>
.envelope {
  --env: #f2ecdf; --env-shade: #e3dac7; --env-light: #f8f4ea; --env-inside: #d9cfba; --env-crease: rgb(120 100 70 / .22); --env-ink: #5b5243;
  position: relative; width: 100%; aspect-ratio: 1.6; perspective: 1200px;
}
:root[data-theme='dark'] .envelope {
  --env: #ddd4c2; --env-shade: #cdc2ab; --env-light: #e6dfcf; --env-inside: #bfb39b; --env-crease: rgb(110 90 60 / .26); --env-ink: #4f473a;
}
.envelope > span, .env-pocket { position: absolute; inset: 0; border-radius: 4px; }
.env-back { background: var(--env-inside); box-shadow: 0 26px 50px -24px rgb(0 0 0 / .6), 0 3px 8px rgb(0 0 0 / .15); }
.env-ghost { background: var(--env-shade); box-shadow: 0 12px 24px -14px rgb(0 0 0 / .5); }
.env-ghost.one { transform: translate(10px, -9px) rotate(2.4deg); }
.env-ghost.two { transform: translate(-12px, -14px) rotate(-3deg); opacity: .85; }
/* 露出来的信纸：和外面那沓信纸同一个纸色。 */
.env-paper { inset: 6% 6% 10% !important; z-index: 1; background: repeating-linear-gradient(to bottom, transparent 0 15px, rgb(150 120 80 / .16) 15px 16px) 0 18px / 100% no-repeat, var(--paper, #fbf7ee); border-radius: 2px !important; box-shadow: 0 -1px 3px rgb(0 0 0 / .08); }
.env-pocket { z-index: 2; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 -1px 1px rgb(0 0 0 / .06)); }
.crease { fill: none; stroke: var(--env-crease); stroke-width: .5; vector-effect: non-scaling-stroke; }
.env-flap { z-index: 4; bottom: auto !important; height: 64% !important; transform-origin: 50% 0; filter: drop-shadow(0 2px 2.5px rgb(0 0 0 / .13)); }
.env-flap svg { display: block; width: 100%; height: 100%; overflow: visible; }
/* 纸纹盖在折边和封盖上（paper.css 同一张图）。 */
.env-grain { z-index: 5; pointer-events: none; background: url('../../assets/letters/paper-grain.png') 0 0 / 220px repeat; opacity: .3; mix-blend-mode: multiply; }
.env-twine { z-index: 6; pointer-events: none;
  background: linear-gradient(to right, transparent calc(50% - 1px), #b08a5a calc(50% - 1px), #b08a5a calc(50% + 1px), transparent calc(50% + 1px)),
    linear-gradient(to bottom, transparent calc(62% - 1px), #b08a5a calc(62% - 1px), #b08a5a calc(62% + 1px), transparent calc(62% + 1px));
  opacity: .85; transition: opacity 300ms ease; }
.env-address { position: absolute; left: 8%; bottom: 10%; z-index: 6; display: grid; gap: 4px; color: var(--env-ink); }
.env-to { font: 400 var(--fs-md)/1.3 'Segoe Script', 'Snell Roundhand', 'KaiTi', 'STKaiti', Georgia, serif; }
.env-from { font: 400 var(--fs-2xs)/1.3 var(--font-sans); letter-spacing: .1em; text-transform: uppercase; opacity: .72; }
.env-stamp { position: absolute; right: 4.5%; top: 6.5%; z-index: 6; }
/* 邮戳只压住邮票左边一角（参考图里波浪线掠过票面，圆戳在外面）。 */
.env-postmark { position: absolute; left: -82px; top: 22px; }
/* 火漆正压在封盖尖上（封盖 64% 高，尖在 60% 处）。 */
.env-seal { position: absolute; left: 50%; top: 59%; z-index: 7; transform: translate(-50%, -50%); }

/* 拆开：封盖翻上去（翻过一半就落到信纸后面），信纸往上抽出来。 */
.is-opening .env-flap { animation: flap-open 560ms cubic-bezier(.4, .1, .3, 1) forwards; }
.is-opening .env-paper, .is-leaving .env-paper { animation: paper-rise 620ms 420ms cubic-bezier(.2, .7, .3, 1) both; }
.is-opening .env-twine, .is-leaving .env-twine { opacity: 0; }
.is-leaving .env-flap { transform: rotateX(178deg); z-index: 0; }
.is-leaving .env-paper { animation: none; transform: translateY(-58%); opacity: 0; }
@keyframes flap-open {
  0% { transform: rotateX(0deg); z-index: 4; }
  49% { z-index: 4; }
  50% { z-index: 0; }
  100% { transform: rotateX(178deg); z-index: 0; }
}
@keyframes paper-rise { to { transform: translateY(-58%); } }
</style>

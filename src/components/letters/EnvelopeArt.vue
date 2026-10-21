<script setup lang="ts">
/**
 * 信封的样子（批次 6；2026-10-21 对着用户的参考照片重做，要有纸的质感）：
 * - 纸：暖灰米白，细密的棉浆纸颗粒（assets/letters/paper-tooth.png，按左上来光算出来的凹凸，soft-light 叠上去），没有花纹。
 * - 封盖：一大片三角压在上面，尖是圆的；边上有一道纸厚的亮边，底下投一层很淡的影子。
 * - 折边：底片和两侧折片几乎同色，只靠一条细亮线（纸边受光）和极淡的影子分开；底片伸进封盖下面，两片是叠着的。
 * - 背面不写地址；火漆压在封盖尖上，邮票贴右上角，邮戳是几道波浪线掠过邮票左下角。
 *
 * state：sealed 封着 → opening 封盖翻开、信纸往上抽出 → leaving 信封往下沉、淡掉（信纸已经变成外面那张信纸）。
 * 翻封盖用 rotateX，前后层次靠离散的 z-index 关键帧换；其余都只动 transform / opacity。
 */
import { useId } from 'vue';
import PostageStamp from './PostageStamp.vue';
import Postmark from './Postmark.vue';

withDefaults(defineProps<{
  version: string;
  state?: 'sealed' | 'opening' | 'leaving' | 'still';
  bundled?: number;
}>(), { state: 'still', bundled: 0 });
const id = `env-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
/* 160 × 100 的坐标。封盖尖在 (80, 60)，圆角。底片不和封盖尖对尖：它往上伸到 (80, 31) 附近、压在封盖下面，
 * 两条边在火漆两侧钻进封盖底下——上下两片叠着、火漆封住叠口，才是旧时封信的样子（2026-10-21 用户指出）。 */
const FLAP = 'M0 0H160C152 6 104 41 87.5 55Q80 61 72.5 55C56 41 8 6 0 0Z';
const FLAP_EDGE = 'M160 0C152 6 104 41 87.5 55Q80 61 72.5 55C56 41 8 6 0 0';
const BOTTOM = 'M0 100C14 86 44 58 62 40Q80 22 98 40C116 58 146 86 160 100Z';
const BOTTOM_EDGE = 'M0 100C14 86 44 58 62 40Q80 22 98 40C116 58 146 86 160 100';
</script>

<template>
  <div :class="['envelope', `is-${state}`, { bundled: bundled > 1 }]">
    <span v-if="bundled > 2" class="env-ghost two" aria-hidden="true"></span>
    <span v-if="bundled > 1" class="env-ghost one" aria-hidden="true"></span>
    <span class="env-back" aria-hidden="true"></span>
    <span class="env-paper" aria-hidden="true"></span>
    <svg class="env-pocket" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient :id="`${id}-side`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--env-side-top)" />
          <stop offset="1" stop-color="var(--env-side)" />
        </linearGradient>
        <linearGradient :id="`${id}-bottom`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--env-bottom-top)" />
          <stop offset="1" stop-color="var(--env-bottom)" />
        </linearGradient>
        <filter :id="`${id}-lip`" x="-5%" y="-20%" width="110%" height="140%">
          <feGaussianBlur stdDeviation=".7" />
        </filter>
      </defs>
      <!-- 两侧折片铺满，底片压在上面；底片边缘往上投一丝影子、边上一道亮线。 -->
      <rect width="160" height="100" :fill="`url(#${id}-side)`" />
      <path :d="BOTTOM_EDGE" class="lip-shadow" :filter="`url(#${id}-lip)`" />
      <path :d="BOTTOM" :fill="`url(#${id}-bottom)`" />
      <path :d="BOTTOM_EDGE" class="lip-light" />
    </svg>
    <span class="env-flap" aria-hidden="true">
      <svg viewBox="0 0 160 62" preserveAspectRatio="none">
        <defs>
          <linearGradient :id="`${id}-flap`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--env-flap-top)" />
            <stop offset="1" stop-color="var(--env-flap)" />
          </linearGradient>
        </defs>
        <path :d="FLAP" :fill="`url(#${id}-flap)`" />
        <path :d="FLAP_EDGE" class="lip-light" />
      </svg>
    </span>
    <span class="env-tooth" aria-hidden="true"></span>
    <span class="env-light" aria-hidden="true"></span>
    <span v-if="bundled > 1" class="env-twine" aria-hidden="true"></span>
    <div class="env-stamp" aria-hidden="true">
      <PostageStamp :version="version" :width="88" :tilt="0.6" />
      <Postmark class="env-postmark" :width="96" />
    </div>
    <div class="env-seal"><slot name="seal" /></div>
  </div>
</template>

<style scoped>
.envelope {
  --env-side-top: #e3ddd2; --env-side: #dcd5c9;
  --env-bottom-top: #e6e0d6; --env-bottom: #e0d9ce;
  --env-flap-top: #ebe6dd; --env-flap: #e5dfd5;
  --env-inside: #cdc4b3; --env-lip: rgb(255 253 248 / .85); --env-lip-shadow: rgb(95 75 45 / .2);
  position: relative; width: 100%; aspect-ratio: 1.6; perspective: 1200px;
}
:root[data-theme='dark'] .envelope {
  --env-side-top: #d6cfc2; --env-side: #cec6b8;
  --env-bottom-top: #d9d2c6; --env-bottom: #d2cabd;
  --env-flap-top: #ded8cd; --env-flap: #d7d0c4;
  --env-inside: #bdb3a1; --env-lip: rgb(250 245 235 / .7);
}
.envelope > span, .env-pocket { position: absolute; inset: 0; border-radius: 5px; }
.env-back { background: var(--env-inside); box-shadow: 0 1px 1.5px rgb(40 30 15 / .16), 0 24px 44px -20px rgb(20 15 5 / .5), 0 6px 14px -6px rgb(20 15 5 / .18); }
.env-ghost { background: var(--env-side); box-shadow: 0 10px 22px -12px rgb(0 0 0 / .45); }
.env-ghost.one { transform: translate(10px, -9px) rotate(2.4deg); }
.env-ghost.two { transform: translate(-12px, -14px) rotate(-3deg); opacity: .85; }
/* 露出来的信纸：和外面那张信纸同一个纸色、同样的横线。 */
.env-paper {
  inset: 6% 6% 10% !important; z-index: 1; border-radius: 2px !important; box-shadow: 0 -1px 3px rgb(0 0 0 / .08);
  background: repeating-linear-gradient(to bottom, transparent 0 15px, rgb(150 120 80 / .16) 15px 16px) 0 18px / 100% no-repeat, #f6f2e9;
}
.env-pocket { z-index: 2; width: 100%; height: 100%; overflow: hidden; }
.lip-light { fill: none; stroke: var(--env-lip); stroke-width: 1.1; vector-effect: non-scaling-stroke; }
.lip-shadow { fill: none; stroke: var(--env-lip-shadow); stroke-width: 2.4; transform: translateY(-.5px); vector-effect: non-scaling-stroke; }
/* 封盖：纸厚的亮边 + 往下投的一层淡影。 */
.env-flap { z-index: 4; bottom: auto !important; height: 62% !important; transform-origin: 50% 0; border-radius: 5px 5px 0 0 !important;
  filter: drop-shadow(0 1.2px 1px rgb(80 60 35 / .26)) drop-shadow(0 6px 9px rgb(80 60 35 / .13)); }
.env-flap svg { display: block; width: 100%; height: 100%; overflow: visible; }
/* 纸面颗粒和整体受光盖在折片和封盖上（同一张纸）。 */
.env-tooth { z-index: 5; pointer-events: none; background: url('../../assets/letters/paper-tooth.png') 0 0 / 128px repeat; mix-blend-mode: soft-light; opacity: .6; }
.env-light { z-index: 5; pointer-events: none; background: radial-gradient(120% 90% at 20% 0%, rgb(255 255 255 / .16), transparent 60%), linear-gradient(170deg, transparent 55%, rgb(60 45 25 / .06)); }
.env-twine { z-index: 6; pointer-events: none;
  background: linear-gradient(to right, transparent calc(50% - 1px), #a8845a calc(50% - 1px), #a8845a calc(50% + 1px), transparent calc(50% + 1px)),
    linear-gradient(to bottom, transparent calc(60% - 1px), #a8845a calc(60% - 1px), #a8845a calc(60% + 1px), transparent calc(60% + 1px));
  opacity: .85; transition: opacity 300ms ease; }
.env-stamp { position: absolute; right: 5%; top: 7%; z-index: 6; }
/* 邮戳：波浪线从邮票左下角掠过，大半在信封上。 */
.env-postmark { position: absolute; left: -52px; bottom: -16px; }
/* 火漆正压在封盖尖上（封盖 62% 高，尖在 60% 处）。 */
.env-seal { position: absolute; left: 50%; top: 58.5%; z-index: 7; transform: translate(-50%, -50%); }

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

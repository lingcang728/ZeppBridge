<script setup lang="ts">
/**
 * 信封的样子（批次 6；2026-10-21 对着用户的参考照片做，要有纸的质感）：
 * - 纸：暖灰米白，细密的棉浆纸颗粒（assets/letters/paper-speck.png，自带透明度的亮点 / 暗点，直接叠，不用混合模式）。
 * - 封盖：一大片三角压在上面，尖是圆的；边上一道纸厚的亮边，底下一层淡影。
 * - 折边：底片和两侧折片几乎同色，只靠细亮线和极淡的影子分开；底片伸进封盖下面，两片叠着、火漆封住叠口。
 * - 两面：正面「寄自 ZeppBridge / 致：用户」、右上角邮票、邮戳（圆戳带收信日期 + 波浪线）掠过邮票左下角；
 *   背面只有封舌、火漆，底片上压一行无墨凸印「寄自 ZeppBridge」。邮票不在封舌上，拆信不会撕坏它。
 *
 * face：front 正面 / back 背面（翻面由外面的容器做，这里只画一面）。state 只对背面有意义：
 * sealed 封着 → opening 封盖翻开（火漆上半块跟着封盖走）、信纸往上抽出 → leaving 信纸已经交给外面那张信纸。
 *
 * 性能（2026-10-21 录屏：点了翻面，整段翻面动画被跳过）：两面都在 3D 翻转的合成层里，所以这里不用 SVG 滤镜、
 * 不用 mix-blend-mode——影子是错开一点的同形暗色路径，纸纹是自带透明度的图。动的只有 transform / opacity；
 * 封盖的层次换（翻到竖直就落到信纸后面）是单独一条 z-index 关键帧，翻转本身留在合成线程。
 */
import { useId } from 'vue';
import PostageStamp from './PostageStamp.vue';
import Postmark from './Postmark.vue';

withDefaults(defineProps<{
  version: string;
  face?: 'front' | 'back';
  state?: 'sealed' | 'opening' | 'leaving' | 'still';
  bundled?: number;
  date?: string | null;
  to?: string;
  from?: string;
}>(), { face: 'back', state: 'still', bundled: 0, date: null, to: '', from: '' });
const id = `env-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
/* 160 × 100 的坐标。封盖尖在 (80, 60)，圆角。底片往上伸到 (80, 31) 附近、压在封盖下面——上下两片叠着、火漆封住叠口。 */
const FLAP = 'M0 0H160C152 6 104 41 87.5 55Q80 61 72.5 55C56 41 8 6 0 0Z';
const FLAP_EDGE = 'M160 0C152 6 104 41 87.5 55Q80 61 72.5 55C56 41 8 6 0 0';
const BOTTOM = 'M0 100C14 86 44 58 62 40Q80 22 98 40C116 58 146 86 160 100Z';
const BOTTOM_EDGE = 'M0 100C14 86 44 58 62 40Q80 22 98 40C116 58 146 86 160 100';
/* 两侧折片：尖在中线附近、是圆的。 */
const LEFT = 'M0 0C20 12 60 37 75 47Q83 52 75 57C60 66 20 88 0 100Z';
const RIGHT = 'M160 0C140 12 100 37 85 47Q77 52 85 57C100 66 140 88 160 100Z';
const SIDE_EDGES = 'M0 0C20 12 60 37 75 47Q83 52 75 57M160 0C140 12 100 37 85 47Q77 52 85 57';
</script>

<template>
  <div :class="['envelope', `face-${face}`, `is-${state}`, { bundled: bundled > 1 }]">
    <span v-if="bundled > 2" class="env-ghost two" aria-hidden="true"></span>
    <span v-if="bundled > 1" class="env-ghost one" aria-hidden="true"></span>
    <span class="env-back" aria-hidden="true"></span>
    <template v-if="face === 'back'">
    <span class="env-paper" aria-hidden="true"></span>
    <svg class="env-pocket" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient :id="`${id}-left`" x1="0" y1=".2" x2="1" y2=".6">
          <stop offset="0" stop-color="var(--env-left-out)" />
          <stop offset="1" stop-color="var(--env-left-in)" />
        </linearGradient>
        <linearGradient :id="`${id}-right`" x1="1" y1=".2" x2="0" y2=".6">
          <stop offset="0" stop-color="var(--env-right-out)" />
          <stop offset="1" stop-color="var(--env-right-in)" />
        </linearGradient>
        <linearGradient :id="`${id}-bottom`" x1=".2" y1="1" x2=".6" y2="0">
          <stop offset="0" stop-color="var(--env-bottom-out)" />
          <stop offset="1" stop-color="var(--env-bottom-in)" />
        </linearGradient>
      </defs>
      <path :d="LEFT" :fill="`url(#${id}-left)`" />
      <path :d="RIGHT" :fill="`url(#${id}-right)`" />
      <path :d="SIDE_EDGES" class="side-edge" />
      <!-- 底片往右下投的影：两层错开的同形暗色（代替 feDropShadow）。 -->
      <path :d="BOTTOM" class="cast soft" transform="translate(.9 1.4)" />
      <path :d="BOTTOM" class="cast" transform="translate(.4 .6)" />
      <path :d="BOTTOM" :fill="`url(#${id}-bottom)`" />
      <path :d="BOTTOM_EDGE" class="lip-light" />
    </svg>
    <span class="env-flap" aria-hidden="true">
      <svg viewBox="0 0 160 62" preserveAspectRatio="none">
        <defs>
          <linearGradient :id="`${id}-flap`" x1=".15" y1="0" x2=".7" y2="1">
            <stop offset="0" stop-color="var(--env-flap-top)" />
            <stop offset="1" stop-color="var(--env-flap)" />
          </linearGradient>
        </defs>
        <path :d="FLAP" class="cast soft" transform="translate(1.2 2.6)" />
        <path :d="FLAP" class="cast" transform="translate(.5 1)" />
        <path :d="FLAP" :fill="`url(#${id}-flap)`" />
        <path :d="FLAP_EDGE" class="lip-light" />
      </svg>
    </span>
    </template>
    <span class="env-tooth" aria-hidden="true"></span>
    <span class="env-light" aria-hidden="true"></span>
    <span v-if="bundled > 1" class="env-twine" aria-hidden="true"></span>
    <template v-if="face === 'front'">
      <div class="env-address" aria-hidden="true">
        <span class="env-from">{{ from }}</span>
        <span class="env-to">{{ to }}</span>
        <span class="env-lines"><i></i><i></i><i></i></span>
      </div>
      <div class="env-stamp" aria-hidden="true">
        <PostageStamp :version="version" :width="88" :tilt="0.6" />
        <Postmark class="env-postmark" :date="date" :width="88" />
      </div>
    </template>
    <template v-else>
      <!-- 无墨凸印的寄信人：同一行字错开一点，一道亮、一道暗。 -->
      <span v-if="from" class="env-emboss" aria-hidden="true">{{ from }}</span>
      <div class="env-seal"><slot name="seal" /></div>
    </template>
  </div>
</template>

<style scoped>
.envelope {
  --env-left-out: #e9e4da; --env-left-in: #ddd6ca;
  --env-right-out: #d3cbbe; --env-right-in: #dcd5c9;
  --env-bottom-out: #d9d2c5; --env-bottom-in: #e6e0d6;
  --env-flap-top: #f0ebe3; --env-flap: #e2dbcf;
  --env-side: #ddd6ca;
  --env-inside: #cdc4b3; --env-lip: rgb(255 253 248 / .85); --env-ink: #4a4237;
  /* 火漆上半块跟着封盖翻：它的转轴在信封上沿。cqw 是信封宽度的百分之一，信封高 = 宽 / 1.6，火漆中心在 58.5% 高处。 */
  container-type: inline-size;
  position: relative; width: 100%; aspect-ratio: 1.6;
}
:root[data-theme='dark'] .envelope {
  --env-left-out: #dcd5c9; --env-left-in: #cfc7b9;
  --env-right-out: #c5bcae; --env-right-in: #cec6b8;
  --env-bottom-out: #cbc3b5; --env-bottom-in: #d8d1c5;
  --env-flap-top: #e2dcd2; --env-flap: #d3cbbe;
  --env-side: #cec6b8;
  --env-inside: #bdb3a1; --env-lip: rgb(250 245 235 / .7);
}
.envelope > span, .env-pocket { position: absolute; inset: 0; border-radius: 5px; }
/* 贴着桌面：一圈实的接触影 + 往下的软影。 */
.env-back { background: var(--env-inside); box-shadow: 0 1.5px 1.5px rgb(40 30 15 / .22), 0 6px 12px -2px rgb(30 20 8 / .2), 0 30px 46px -18px rgb(20 15 5 / .5); }
.env-ghost { background: var(--env-side); box-shadow: 0 10px 22px -12px rgb(0 0 0 / .45); }
.env-ghost.one { transform: translate(10px, -9px) rotate(2.4deg); }
.env-ghost.two { transform: translate(-12px, -14px) rotate(-3deg); opacity: .85; }
/* 装在里面的信：对折的一张纸，露在外面的是空白的一面（字在里面），抽出来以后由外面那张信纸接手再展开。 */
.env-paper {
  inset: 6% 6% 10% !important; z-index: 1; border-radius: 2px !important; box-shadow: 0 -1px 3px rgb(0 0 0 / .08);
  background: linear-gradient(170deg, #fbf7ee, #f4eee2);
}
.env-pocket { z-index: 2; width: 100%; height: 100%; overflow: hidden; }
.lip-light { fill: none; stroke: var(--env-lip); stroke-width: 1.1; vector-effect: non-scaling-stroke; }
.side-edge { fill: none; stroke: rgb(90 70 40 / .16); stroke-width: .8; vector-effect: non-scaling-stroke; }
.cast { fill: rgb(70 50 25 / .2); }
.cast.soft { fill: rgb(70 50 25 / .08); }
.env-flap { z-index: 4; bottom: auto !important; height: 62% !important; transform-origin: 50% 0; border-radius: 5px 5px 0 0 !important; }
.env-flap svg { display: block; width: 100%; height: 100%; overflow: visible; }
/* 纸面颗粒和整体受光盖在折片和封盖上（同一张纸）。 */
.env-tooth { z-index: 5; pointer-events: none; background: url('../../assets/letters/paper-speck.png') 0 0 / 128px repeat; opacity: .9; }
/* 受光与厚度：中间微鼓（中心偏亮、四周压暗），四边折过来的圆边上左亮、下右暗。 */
.env-light { z-index: 5; pointer-events: none;
  background: radial-gradient(70% 80% at 42% 40%, rgb(255 255 255 / .14), transparent 70%), radial-gradient(130% 120% at 30% 20%, transparent 55%, rgb(60 45 25 / .1)), linear-gradient(160deg, rgb(255 255 255 / .1), transparent 40%, rgb(60 45 25 / .07));
  box-shadow: inset 1.5px 1.5px 0 rgb(255 255 255 / .55), inset 0 0 2px 1px rgb(255 255 255 / .18), inset -1.5px -2px 1.5px rgb(70 50 25 / .2), inset -4px -6px 10px -4px rgb(70 50 25 / .12); }
.env-twine { z-index: 6; pointer-events: none;
  background: linear-gradient(to right, transparent calc(50% - 1px), #a8845a calc(50% - 1px), #a8845a calc(50% + 1px), transparent calc(50% + 1px)),
    linear-gradient(to bottom, transparent calc(60% - 1px), #a8845a calc(60% - 1px), #a8845a calc(60% + 1px), transparent calc(60% + 1px));
  opacity: .85; transition: opacity 300ms ease; }
/* 正面：整张纸（不是里衬色），左上角寄件人、中间偏下收件人，像手写在纸上。 */
.face-front .env-back { background: linear-gradient(160deg, var(--env-flap-top), var(--env-left-in) 70%, var(--env-right-out)); }
.env-address { position: absolute; inset: 0; z-index: 6; color: var(--env-ink); pointer-events: none; }
.env-from { position: absolute; left: 7%; top: 9%; font: 400 var(--fs-2xs)/1.4 var(--font-sans); letter-spacing: .08em; opacity: .7; }
/* 收件人：一个名字、底下三道写地址的线（线只是纸上印的格，不编地址）。 */
.env-to { position: absolute; left: 9%; top: 40%; font: 400 var(--fs-xl)/1.3 'Segoe Script', 'Snell Roundhand', 'KaiTi', 'STKaiti', 'Kaiti SC', Georgia, serif; }
.env-lines { position: absolute; left: 9%; top: 58%; display: grid; gap: 15px; width: 46%; }
.env-lines i { display: block; height: 1px; background: rgb(110 90 60 / .3); box-shadow: 0 1px 0 rgb(255 255 255 / .5); }
.env-lines i:nth-child(2) { width: 82%; }
.env-lines i:nth-child(3) { width: 92%; }
.env-stamp { position: absolute; right: 5%; top: 7%; z-index: 6; }
/* 邮戳：圆戳盖在信封上，波浪线从邮票左下角掠过。 */
.env-postmark { position: absolute; right: 50px; bottom: -18px; }
.env-emboss {
  inset: auto 0 9% !important; z-index: 6; text-align: center; pointer-events: none;
  color: var(--env-bottom-in); font: 400 var(--fs-2xs)/1 Georgia, 'Songti SC', serif; letter-spacing: .14em;
  text-shadow: -.6px -.6px 0 rgb(255 253 246 / .8), .6px .6px 0 rgb(90 70 40 / .32);
}
/* 火漆正压在封盖尖上（封盖 62% 高，尖在 60% 处）。 */
.env-seal { position: absolute; left: 50%; top: 58.5%; z-index: 7; transform: translate(-50%, -50%); --seal-hinge: calc(var(--seal-size, 96px) / 2 - 36.5625cqw); }

/*
 * 拆开：封盖往上翻（自己带透视，转轴在信封上沿），翻到竖直就落到信纸后面；火漆上半块粘在封盖上，跟着一起翻、翻过竖直就看不见了。
 * 信纸往上整张抽出来。
 */
.is-opening .env-flap { animation: flap-open 520ms cubic-bezier(.4, .1, .3, 1) forwards, flap-depth 520ms linear forwards; }
.is-opening .env-seal :deep(.wax.top) { transform-origin: 50% var(--seal-hinge); animation: flap-open 520ms cubic-bezier(.4, .1, .3, 1) forwards, seal-hide 520ms linear forwards; }
.is-opening .env-paper { animation: paper-rise 620ms 320ms cubic-bezier(.35, 0, .25, 1) both; }
.is-opening .env-twine, .is-leaving .env-twine { opacity: 0; }
.is-leaving .env-flap { transform: perspective(1200px) rotateX(178deg); z-index: 0; }
.is-leaving .env-seal :deep(.wax.top) { opacity: 0; }
.is-leaving .env-paper { transform: translateY(-112%); opacity: 0; }
@keyframes flap-open { from { transform: perspective(1200px) rotateX(0deg); } to { transform: perspective(1200px) rotateX(178deg); } }
/* 这条缓动约在 37% 的时间翻到竖直。 */
@keyframes flap-depth { 0%, 36% { z-index: 4; } 37%, 100% { z-index: 0; } }
@keyframes seal-hide { 0%, 36% { opacity: 1; } 37%, 100% { opacity: 0; } }
@keyframes paper-rise { to { transform: translateY(-112%); } }
</style>

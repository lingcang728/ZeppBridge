<script setup lang="ts">
/**
 * 信封的样子（批次 6；2026-10-21 对着用户的参考照片重做，要有纸的质感）：
 * - 纸：暖灰米白，细密的棉浆纸颗粒（assets/letters/paper-tooth.png，按左上来光算出来的凹凸，soft-light 叠上去），没有花纹。
 * - 封盖：一大片三角压在上面，尖是圆的；边上有一道纸厚的亮边，底下投一层很淡的影子。
 * - 折边：底片和两侧折片几乎同色，只靠一条细亮线（纸边受光）和极淡的影子分开；底片伸进封盖下面，两片是叠着的。
 * - 两面（2026-10-21 采纳用户转来的建议）：正面写「寄自 / 致」，邮票贴右上角，邮戳（圆戳带收信日期 + 波浪线）掠过邮票左下角；
 *   背面只有封舌和火漆。邮票不在封舌上，拆信时封舌翻起来、邮票不动也不会被撕坏。
 *
 * face：front 正面 / back 背面（翻面由外面的容器做，这里只画一面）。state 只对背面有意义：sealed 封着 → opening 封盖翻开、信纸往上抽出 → leaving 信封往下沉、淡掉（信纸已经变成外面那张信纸）。
 * 立体感（用户 2026-10-21：「注重立体感」）：光从左上来——左折片朝光偏亮、右折片背光偏暗、封盖最亮；
 * 封盖和底片往右下投影；信封四边是折过来的圆边（上左亮、下右暗），中间因为装着信微微鼓起；底下贴桌一圈实影。
 * 背面（2026-10-21 用户嫌不够好看）：两侧折片的尖是圆的；底片上压一行无墨凸印 ZEPPBRIDGE；
 * 封盖里面衬一张深色花纹衬纸（旧式信封那样），封盖翻过一半才看得见。
 * 翻封盖用 rotateX，前后层次靠离散的 z-index 关键帧换；其余都只动 transform / opacity。
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
/* 160 × 100 的坐标。封盖尖在 (80, 60)，圆角。底片不和封盖尖对尖：它往上伸到 (80, 31) 附近、压在封盖下面，
 * 两条边在火漆两侧钻进封盖底下——上下两片叠着、火漆封住叠口，才是旧时封信的样子（2026-10-21 用户指出）。 */
const FLAP = 'M0 0H160C152 6 104 41 87.5 55Q80 61 72.5 55C56 41 8 6 0 0Z';
const FLAP_EDGE = 'M160 0C152 6 104 41 87.5 55Q80 61 72.5 55C56 41 8 6 0 0';
const BOTTOM = 'M0 100C14 86 44 58 62 40Q80 22 98 40C116 58 146 86 160 100Z';
const BOTTOM_EDGE = 'M0 100C14 86 44 58 62 40Q80 22 98 40C116 58 146 86 160 100';
/* 两侧折片：尖在中线附近、是圆的。 */
const LEFT = 'M0 0C20 12 60 37 75 47Q83 52 75 57C60 66 20 88 0 100Z';
const RIGHT = 'M160 0C140 12 100 37 85 47Q77 52 85 57C100 66 140 88 160 100Z';
const SIDE_EDGES = 'M0 0C20 12 60 37 75 47Q83 52 75 57M160 0C140 12 100 37 85 47Q77 52 85 57';
/* 衬纸比封盖小一圈，四周留出纸边。 */
const LINER = 'M7 3H153C144 9 102 39 87 50.5Q80 55.5 73 50.5C58 39 16 9 7 3Z';
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
        <filter :id="`${id}-cast`" x="-5%" y="-10%" width="115%" height="125%">
          <feDropShadow dx=".6" dy=".9" stdDeviation=".8" flood-color="rgb(70 50 25)" flood-opacity=".26" />
        </filter>
      </defs>
      <!-- 左右折片各一片（朝光 / 背光），底片压在上面、往右下投影，边上一道亮线。 -->
      <path :d="LEFT" :fill="`url(#${id}-left)`" />
      <path :d="RIGHT" :fill="`url(#${id}-right)`" />
      <path :d="SIDE_EDGES" class="side-edge" />
      <path :d="BOTTOM" :fill="`url(#${id}-bottom)`" :filter="`url(#${id}-cast)`" />
      <path :d="BOTTOM_EDGE" class="lip-light" />
      <!-- 无墨凸印：同一行字错开半个单位，一道亮、一道暗。 -->
      <g class="emboss" text-anchor="middle">
        <text x="79.7" y="87.7" class="emboss-light">ZEPPBRIDGE</text>
        <text x="80.3" y="88.3" class="emboss-shade">ZEPPBRIDGE</text>
        <text x="80" y="88">ZEPPBRIDGE</text>
      </g>
    </svg>
    <span class="env-flap" aria-hidden="true">
      <svg viewBox="0 0 160 62" preserveAspectRatio="none">
        <defs>
          <linearGradient :id="`${id}-flap`" x1=".15" y1="0" x2=".7" y2="1">
            <stop offset="0" stop-color="var(--env-flap-top)" />
            <stop offset="1" stop-color="var(--env-flap)" />
          </linearGradient>
        </defs>
        <path :d="FLAP" :fill="`url(#${id}-flap)`" />
        <path :d="FLAP_EDGE" class="lip-light" />
      </svg>
      <!-- 封盖里面：翻过一半换成这一面（上下已经翻过来了，花纹对称看不出）。 -->
      <svg class="flap-liner" viewBox="0 0 160 62" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern :id="`${id}-liner`" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="var(--env-liner)" />
            <path d="M0 4L4 0L8 4L4 8Z" fill="none" stroke="var(--env-liner-ink)" stroke-width=".22" />
            <path d="M4 2.6L4.5 4L4 5.4L3.5 4Z M2.6 4L4 3.5L5.4 4L4 4.5Z" fill="var(--env-liner-ink)" />
            <circle v-for="([cx, cy], k) in [[0, 0], [8, 0], [0, 8], [8, 8]]" :key="k" :cx="cx" :cy="cy" r=".5" fill="var(--env-liner-ink)" />
          </pattern>
        </defs>
        <path :d="FLAP" fill="var(--env-inside)" />
        <path :d="LINER" :fill="`url(#${id}-liner)`" />
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
    <div v-else class="env-seal"><slot name="seal" /></div>
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
  --env-liner: #2f3b52; --env-liner-ink: rgb(214 186 122 / .62);
  position: relative; width: 100%; aspect-ratio: 1.6; perspective: 1200px;
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
/* 贴着桌面：一圈实的接触影 + 往右下的软影。 */
.env-back { background: var(--env-inside); box-shadow: 1px 1.5px 1.5px rgb(40 30 15 / .22), 3px 6px 10px -2px rgb(30 20 8 / .2), 10px 30px 46px -18px rgb(20 15 5 / .5); }
.env-ghost { background: var(--env-side); box-shadow: 0 10px 22px -12px rgb(0 0 0 / .45); }
.env-ghost.one { transform: translate(10px, -9px) rotate(2.4deg); }
.env-ghost.two { transform: translate(-12px, -14px) rotate(-3deg); opacity: .85; }
/* 装在里面的信：折着的一张纸，外面是空白的背面，中间一道折痕（抽出来以后接手的那张信纸也是空白的，字等展开才浮上来）。 */
.env-paper {
  inset: 6% 6% 10% !important; z-index: 1; border-radius: 2px !important; box-shadow: 0 -1px 3px rgb(0 0 0 / .08);
  background: linear-gradient(to bottom, transparent calc(50% - 1px), rgb(150 120 80 / .14) calc(50% - 1px) 50%, rgb(255 255 255 / .6) 50% calc(50% + 1px), transparent calc(50% + 1px)), linear-gradient(170deg, #fbf7ee, #f4eee2);
}
.env-pocket { z-index: 2; width: 100%; height: 100%; overflow: hidden; }
.lip-light { fill: none; stroke: var(--env-lip); stroke-width: 1.1; vector-effect: non-scaling-stroke; }
.side-edge { fill: none; stroke: rgb(90 70 40 / .16); stroke-width: .8; vector-effect: non-scaling-stroke; }
.emboss text { font: 400 4.2px/1 Georgia, 'Times New Roman', serif; letter-spacing: .9px; fill: var(--env-bottom-in); }
.emboss .emboss-light { fill: rgb(255 253 246 / .75); }
.emboss .emboss-shade { fill: rgb(90 70 40 / .3); }
/* 封盖：纸厚的亮边 + 往下投的一层淡影。 */
.env-flap { z-index: 4; bottom: auto !important; height: 62% !important; transform-origin: 50% 0; border-radius: 5px 5px 0 0 !important;
  filter: drop-shadow(.8px 1.6px 1.2px rgb(70 50 25 / .3)) drop-shadow(3px 8px 10px rgb(70 50 25 / .16)); }
.env-flap svg { display: block; width: 100%; height: 100%; overflow: visible; }
.env-flap .flap-liner { position: absolute; inset: 0; opacity: 0; }
.is-opening .flap-liner { animation: liner-show 560ms linear forwards; }
.is-leaving .flap-liner { opacity: 1; }
@keyframes liner-show { 0%, 36% { opacity: 0; } 37%, 100% { opacity: 1; } }
/* 纸面颗粒和整体受光盖在折片和封盖上（同一张纸）。 */
.env-tooth { z-index: 5; pointer-events: none; background: url('../../assets/letters/paper-tooth.png') 0 0 / 128px repeat; mix-blend-mode: soft-light; opacity: .6; }
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
.env-from { position: absolute; left: 7%; top: 9%; font: 400 var(--fs-2xs)/1.4 var(--font-sans); letter-spacing: .14em; text-transform: uppercase; opacity: .7; }
/* 收件人：像参考图那样一个名字、底下三道写地址的线（线只是纸上印的格，不编地址）。 */
.env-to { position: absolute; left: 9%; top: 40%; font: 400 var(--fs-xl)/1.3 'Segoe Script', 'Snell Roundhand', 'KaiTi', 'STKaiti', 'Kaiti SC', Georgia, serif; }
.env-lines { position: absolute; left: 9%; top: 58%; display: grid; gap: 15px; width: 46%; }
.env-lines i { display: block; height: 1px; background: rgb(110 90 60 / .3); box-shadow: 0 1px 0 rgb(255 255 255 / .5); }
.env-lines i:nth-child(2) { width: 82%; }
.env-lines i:nth-child(3) { width: 92%; }
.env-stamp { position: absolute; right: 5%; top: 7%; z-index: 6; }
/* 邮戳：圆戳盖在信封上，波浪线从邮票左下角掠过。 */
.env-postmark { position: absolute; right: 50px; bottom: -18px; }
/* 火漆正压在封盖尖上（封盖 62% 高，尖在 60% 处）。 */
.env-seal { position: absolute; left: 50%; top: 58.5%; z-index: 7; transform: translate(-50%, -50%); }

/* 拆开：封盖翻上去（翻过一半就落到信纸后面），信纸往上抽出来。 */
/* 翻转和换层分成两个动画：只有 transform 的那个能交给合成线程，主线程忙的时候封盖也不停（z-index 放在同一组关键帧里会把整段拖回主线程）。 */
.is-opening .env-flap { animation: flap-open 560ms cubic-bezier(.4, .1, .3, 1) forwards, flap-depth 560ms linear forwards; }
/* 信纸整张抽出来（底边过了信封口），外面那张信纸再从这里接手，不会有一截穿过信封。 */
.is-opening .env-paper { animation: paper-rise 760ms 440ms cubic-bezier(.35, 0, .25, 1) both; }
.is-opening .env-twine, .is-leaving .env-twine { opacity: 0; }
.is-leaving .env-flap { transform: rotateX(178deg); z-index: 0; }
.is-leaving .env-paper { transform: translateY(-112%); opacity: 0; }
@keyframes flap-open { from { transform: rotateX(0deg); } to { transform: rotateX(178deg); } }
/* 翻到竖直（这条缓动约在 37% 的时间）就落到信纸后面。 */
@keyframes flap-depth { 0%, 36% { z-index: 4; } 37%, 100% { z-index: 0; } }
@keyframes paper-rise { to { transform: translateY(-112%); } }
</style>

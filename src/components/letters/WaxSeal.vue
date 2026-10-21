<script setup lang="ts">
/**
 * 封口的火漆印（批次 6；参考图里那颗真火漆：assets/letters/wax-seal.webp，带蜡面高光和压印的叶枝）。
 *
 * 交互：点一下，或者按下去随手一划（动过 8px），就裂开；键盘 Enter / 空格同样拆开（2026-10-21 用户：拆封不用长按）。
 * 怎么裂（2026-10-21 用户嫌原来两半半透明地飘走、裂缝线悬在空中）：裂缝沿着封盖的边走（火漆正压在封盖尖上，
 * 封盖边在这里是一个往下的 V）——上半块粘在封盖上，拆开时跟着封盖翻上去（EnvelopeArt 让 .wax.top 跟封盖同一个动画），
 * 下半块留在信封上。两半都不透明，各自带着自己那一侧的断口，没有单独飘着的裂缝线。
 * 断口不能太规整（2026-10-21 用户第三轮：像掰巧克力、像切蛋糕切掉一个角）：裂缝两头顺着封盖边，中间不走到封盖尖、
 * 歪歪扭扭地横过去（剩下的下半块顶上是一道参差的断口，不是一个楔形缺口），长短不一的折、左右不对称；
 * 裂开那一下沿断口崩掉三粒碎屑往下掉（各自一层，只动 transform / opacity），两半上还各有几道发丝细的支裂。
 * `still`：只是摆着看，不能按；`cracked`：画成拆过的样子（两半合着，断口可见）。
 * 只动 transform / opacity；减少动态效果时直接拆开。
 */
import { computed, onBeforeUnmount, ref, useId } from 'vue';
import { lessMotion } from '../../lib/motion/lessMotion';
import { playSealCrack } from '../../lib/letters/sound';
import wax from '../../assets/letters/wax-seal.webp';

const props = withDefaults(defineProps<{ label?: string; size?: number; still?: boolean; cracked?: boolean }>(),
  { label: '', size: 84, still: false, cracked: false });
const emit = defineEmits<{ (event: 'break'): void }>();

const SNAP_PX = 8;
const id = `seal-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
type Pt = [number, number];
const poly = (points: Pt[]) => points.map(([x, y]) => `${x} ${y}`).join('L');
/* 裂缝（120 × 120 坐标，封盖尖在 (60, 66) 附近）：两头顺着封盖边，中间浅浅地、歪扭地横过去，左高右低。 */
const POINTS: Pt[] = [[-2, 15], [6, 21], [12, 20], [17, 27], [24, 31], [27, 36], [33, 38], [38, 44], [43, 43], [47, 49], [52, 47],
  [55, 53], [59, 52], [62, 56], [66, 51], [70, 53], [74, 47], [79, 46], [83, 40], [89, 39], [93, 33], [99, 31], [104, 26],
  [109, 27], [114, 21], [122, 19]];
const CRACK = `M${poly(POINTS)}`;
/* 崩掉的碎屑：贴着断口的小块（上沿就是那几段裂缝），从所在那一半里挖掉，裂开时自己往下掉。dx / dy 是像素。 */
const CHIPS = [
  { key: 'a', half: 'bottom', points: [[24, 31], [27, 36], [33, 38], [34, 44], [28, 46], [22, 38]] as Pt[], dx: -6, dy: 14, rot: -38 },
  { key: 'b', half: 'bottom', points: [[83, 40], [89, 39], [93, 33], [96, 38], [92, 46], [85, 47]] as Pt[], dx: 7, dy: 16, rot: 34 },
  { key: 'c', half: 'top', points: [[52, 47], [55, 53], [59, 52], [60, 45], [54, 41], [49, 44]] as Pt[], dx: -2, dy: 18, rot: 62 },
].map((chip) => {
  const xs = chip.points.map(([x]) => x);
  const ys = chip.points.map(([, y]) => y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const polygon = `polygon(${chip.points.map(([x, y]) => `${(x / 120) * 100}% ${(y / 120) * 100}%`).join(', ')})`;
  return { ...chip, path: `M${poly(chip.points)}Z`, polygon, origin: `${(cx / 120) * 100}% ${(cy / 120) * 100}%` };
});
const holes = (half: 'top' | 'bottom') => CHIPS.filter((chip) => chip.half === half).map((chip) => chip.path).join('');
/* 碎屑的坑只在裂开后挖（封着时两半是整块，碎屑那几块不出现，没有接缝）。 */
const halvesFor = (open: boolean) => [
  { key: 'top', clip: `${CRACK}V-2H-2Z${open ? holes('top') : ''}` },
  { key: 'bottom', clip: `${CRACK}V122H-2Z${open ? holes('bottom') : ''}` },
] as const;
/* 发丝细的支裂：从断口岔出去一小截（两半都画，各自的裁切决定落在哪一半）。 */
const HAIRS = 'M33 38L31 46L34 53L32 60M62 56L64 63L61 70L63 76M99 31L102 38L100 45M17 27L19 20L16 13M79 46L77 39L81 33';
const CHIP_EDGES = CHIPS.map((chip) => chip.path).join('');

const pressed = ref(false);
const broken = ref(false);
const halves = computed(() => halvesFor(broken.value || props.cracked));
let timer: number | undefined;
let start: { x: number; y: number; id: number } | null = null;

const crack = () => {
  if (broken.value || props.still) return;
  pressed.value = false;
  broken.value = true;
  playSealCrack();
  // 断口露出来一下，再通知外面翻开封盖（上半块跟着走）：减少动态效果时立刻。
  timer = window.setTimeout(() => emit('break'), lessMotion() ? 0 : 160);
};
const down = (event: PointerEvent) => {
  if (broken.value || props.still || event.button !== 0) return;
  // 别让外面的信封把这一下当成拖着转。
  event.stopPropagation();
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  start = { x: event.clientX, y: event.clientY, id: event.pointerId };
  pressed.value = true;
};
const move = (event: PointerEvent) => {
  if (!start || event.pointerId !== start.id || broken.value) return;
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) >= SNAP_PX) crack();
};
/* 没划、只是点了一下：松手就开。 */
const up = (event: PointerEvent) => {
  if (start && event.pointerId === start.id && !broken.value) crack();
  start = null;
  pressed.value = false;
};
const cancel = () => { start = null; pressed.value = false; };
const key = (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); crack(); }
};
onBeforeUnmount(() => window.clearTimeout(timer));
</script>

<template>
  <component :is="still ? 'span' : 'button'" :type="still ? undefined : 'button'" :class="['wax-seal', { pressed, broken: broken || cracked, still }]"
    :style="{ width: `${size}px`, height: `${size}px`, '--seal-size': `${size}px` }" :aria-label="still ? undefined : label" :aria-hidden="still || undefined"
    :disabled="still ? undefined : broken" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="cancel" @keydown="key">
    <svg class="defs" width="0" height="0" aria-hidden="true">
      <defs>
        <clipPath v-for="half in halves" :id="`${id}-${half.key}`" :key="half.key"><path :d="half.clip" clip-rule="evenodd" /></clipPath>
        <!-- 断口线只画在蜡上：按蜡块图片的透明度遮住，蜡外面那截（裂缝是贯穿整个方框的折线）不露出来。 -->
        <mask :id="`${id}-wax`" class="wax-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120"><image :href="wax" width="120" height="120" /></mask>
      </defs>
    </svg>
    <svg v-for="half in halves" :key="half.key" :class="['wax', half.key]" viewBox="0 0 120 120" aria-hidden="true">
      <g :clip-path="`url(#${id}-${half.key})`">
        <image :href="wax" width="120" height="120" />
        <!-- 这一半的断口：一道暗缝、贴着一道亮边（蜡断开处的厚度），崩掉碎屑的坑沿、发丝支裂，只在裂开后出现。 -->
        <g class="fracture" :mask="`url(#${id}-wax)`">
          <path class="edge-dark" :d="CRACK + CHIP_EDGES" />
          <path class="edge-light" :d="CRACK" :transform="half.key === 'top' ? 'translate(0 -1.2)' : 'translate(0 1.2)'" />
          <path class="hair" :d="HAIRS" />
        </g>
      </g>
    </svg>
    <!-- 碎屑用 HTML 块（CSS 多边形裁切 + 蜡块图当底）：SVG 的裁切引用在单独合成层里会画成一片白（2026-10-21 无头 Chrome 实测）。 -->
    <span v-for="chip in CHIPS" :key="chip.key" class="chip" aria-hidden="true"
      :style="{ clipPath: chip.polygon, transformOrigin: chip.origin, '--dx': `${chip.dx}px`, '--dy': `${chip.dy}px`, '--rot': `${chip.rot}deg` }"></span>
  </component>
</template>

<style scoped>
.wax-seal {
  position: relative; display: block; padding: 0; border: 0; border-radius: 50%; background: none; touch-action: none;
  /* 蜡是厚的：贴纸面一圈实的影子，再往下一层软的（火漆本身小，这两层影子很便宜）。 */
  filter: drop-shadow(0 2px 1.2px rgb(50 10 10 / .42)) drop-shadow(0 7px 8px rgb(40 15 10 / .24));
  transition: scale 140ms ease;
}
.wax-seal:not(.still):not(:disabled) { cursor: pointer; }
.wax-seal.still { cursor: default; }
.wax-seal:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; }
.wax-seal:disabled { cursor: default; }
.wax-seal.pressed { scale: .965; }
.defs { position: absolute; }
.wax-mask { mask-type: alpha; }
.wax { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; transition: transform 160ms cubic-bezier(.3, .7, .3, 1); }
/* 断口一下子出现（只重画一次，不做渐变）。 */
.fracture { opacity: 0; }
.broken .fracture { opacity: 1; }
.edge-dark, .edge-light, .hair { fill: none; stroke-linejoin: round; stroke-linecap: round; }
.edge-dark { stroke: rgb(30 4 6 / .8); stroke-width: 1.4; }
.edge-light { stroke: rgb(255 170 150 / .3); stroke-width: .8; }
.hair { stroke: rgb(30 4 6 / .55); stroke-width: .6; }
/* 裂开那一下：上半块微微翘起、下半块往下沉一点，断口张开。 */
.broken .wax.top { transform: translate(-.4px, -1.2px) rotate(-.8deg); }
.broken .wax.bottom { transform: translate(.3px, 1px) rotate(.5deg); }
/* 碎屑：摆在原位看不出来；裂开时往下掉、打个转、淡掉（像蜡渣落在纸上滑开）。 */
.chip { position: absolute; inset: 0; pointer-events: none; opacity: 0; background: url('../../assets/letters/wax-seal.webp') 0 0 / 100% 100% no-repeat; }
.broken:not(.still) .chip { animation: chip-fall 560ms cubic-bezier(.45, .05, .8, .6) both; }
@keyframes chip-fall {
  0% { opacity: 1; transform: none; }
  15% { opacity: 1; transform: translate(calc(var(--dx) * .2), -1.5px) rotate(calc(var(--rot) * .15)); }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--rot)); }
}
@media (prefers-reduced-motion: reduce) { .wax { transition: none; } .chip { animation: none !important; } }
</style>

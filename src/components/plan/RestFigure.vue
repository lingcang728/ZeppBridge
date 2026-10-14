<script setup lang="ts">
/**
 * 休息日的小人（2026-10-12 用户看样稿后要的）：圆头小人两手枕在脑后，翘着二郎腿惬意地躺在枕头上，闭着眼，头顶飘两个 z。
 * 周格、右牌计划面的休息行、单天页的休息日都用它（同一个小人，点进去只是放大）。颜色全走 token（睡眠紫），深浅两套主题各一组明暗。
 *
 * 10-12 第二版：第一版的前臂画在头前面，放大以后像脸上长了一截木桩；两只手现在都藏在头后面，只露出朝上的肘尖。
 * `drowsy`：单天页那只大的，头顶的 z 慢慢往上飘、淡出再来（只动 transform / opacity）。周格和右牌里的小号不动。
 */
withDefaults(defineProps<{ size?: number; drowsy?: boolean }>(), { size: 64, drowsy: false });
</script>

<template>
  <svg :class="['rest-figure', { drowsy }]" :width="size" :height="Math.round(size * 0.54)" viewBox="0 0 120 64" aria-hidden="true" focusable="false">
    <ellipse class="shadow" cx="60" cy="57.5" rx="52" ry="3.6" />
    <!-- 枕头 -->
    <rect class="pillow" x="4" y="41" width="32" height="14" rx="7" />
    <path class="pillow-shine" d="M10 44.5 h14" />
    <!-- 后面那只胳膊（暗一档）：肩 → 朝上的肘尖 → 手藏在头后 -->
    <path class="limb arm back" d="M41 44 L34.5 23.5 L19 33" />
    <!-- 支起来的那条腿：大腿朝上到膝盖，小腿落回地面 -->
    <path class="limb leg back" d="M66 49 L81 31 L91 52" />
    <rect class="shoe back" x="88" y="48.5" width="11" height="7" rx="3.5" />
    <!-- 翘在膝盖上的那条腿：大腿搭到膝盖，小腿往前伸 -->
    <path class="limb leg" d="M64 50 L80.5 33.5 L101 29" />
    <rect class="shoe" x="98.5" y="24" width="11" height="7.4" rx="3.7" transform="rotate(-14 104 27.7)" />
    <!-- 身子 -->
    <rect class="shirt" x="33" y="40.5" width="36" height="14.5" rx="7.25" />
    <path class="shirt-shine" d="M40 43.6 h20" />
    <!-- 前面那只胳膊：袖口压在衣服上，手同样藏在头后 -->
    <path class="limb arm" d="M44 45 L37.5 22 L22 30" />
    <!-- 头：闭着眼、一点腮红，左上一道高光 -->
    <circle class="head" cx="24" cy="38" r="11.5" />
    <ellipse class="glint" cx="18.6" cy="32.6" rx="3.6" ry="2.3" transform="rotate(-32 18.6 32.6)" />
    <path class="eye" d="M26.4 33.2 q2.1 2 4.4 .2" />
    <circle class="blush" cx="31.6" cy="38.4" r="2" />
    <!-- 头顶的 z -->
    <path class="zz" d="M41 9.5 h6.4 l-6.4 7.4 h6.4" />
    <path class="zz small" d="M52 2.5 h4.2 l-4.2 4.8 h4.2" />
  </svg>
</template>

<style scoped>
.rest-figure {
  --rf-skin: color-mix(in srgb, var(--sleep) 30%, #f6ece2);
  --rf-skin-back: color-mix(in srgb, var(--sleep) 45%, #b9b0c4);
  --rf-shirt: var(--sleep);
  --rf-pants: color-mix(in srgb, var(--sleep) 58%, #222842);
  --rf-pants-back: color-mix(in srgb, var(--sleep) 42%, #171b2e);
  --rf-shoe: color-mix(in srgb, var(--sleep) 26%, #0e111d);
  --rf-pillow: color-mix(in srgb, var(--sleep) 20%, #3a3f55);
  --rf-ink: #2a2440;
  display: block;
  overflow: visible;
}
:root[data-theme='light'] .rest-figure {
  --rf-skin: color-mix(in srgb, var(--sleep) 14%, #ffe9d8);
  --rf-skin-back: color-mix(in srgb, var(--sleep) 30%, #e9d2c4);
  --rf-pants: color-mix(in srgb, var(--sleep) 72%, #2b2f4a);
  --rf-pants-back: color-mix(in srgb, var(--sleep) 55%, #23263c);
  --rf-shoe: color-mix(in srgb, var(--sleep) 40%, #262a42);
  --rf-pillow: color-mix(in srgb, var(--sleep) 16%, #ffffff);
}
.shadow { fill: color-mix(in srgb, var(--ink) 8%, transparent); }
.pillow { fill: var(--rf-pillow); }
.pillow-shine, .shirt-shine { fill: none; stroke: #fff; stroke-opacity: .3; stroke-width: 2; stroke-linecap: round; }
.limb { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.arm { stroke: var(--rf-skin); stroke-width: 6.4; }
.arm.back { stroke: var(--rf-skin-back); }
.leg { stroke: var(--rf-pants); stroke-width: 8; }
.leg.back { stroke: var(--rf-pants-back); }
.shirt { fill: var(--rf-shirt); }
.shoe { fill: var(--rf-shoe); }
.head { fill: var(--rf-skin); }
.glint { fill: #fff; opacity: .55; }
.eye { fill: none; stroke: var(--rf-ink); stroke-width: 1.5; stroke-linecap: round; opacity: .75; }
.blush { fill: #f08a9b; opacity: .35; }
.zz { fill: none; stroke: var(--sleep); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; opacity: .9; }
.zz.small { stroke-width: 1.7; opacity: .6; }
.drowsy .zz { transform-box: fill-box; transform-origin: center; animation: zz-drift 3.6s cubic-bezier(.4, .6, .2, 1) infinite; }
.drowsy .zz.small { animation-delay: 1.2s; }
@keyframes zz-drift {
  0% { opacity: 0; transform: translate(0, 4px) scale(.8); }
  25% { opacity: .9; }
  75% { opacity: .6; }
  100% { opacity: 0; transform: translate(3px, -7px) scale(1.08); }
}
@media (prefers-reduced-motion: reduce) { .drowsy .zz { animation: none; } }
</style>

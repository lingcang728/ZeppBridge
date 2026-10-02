<script setup lang="ts">
/**
 * 关系网节点里的双色图标：一层淡色的面（类别色 22%）+ 一层实线勾边 + 一处实心重点。
 *
 * 和全站的线性 Icon 不同：节点是一个个小圆盘，单线图标放进去显得空、彼此也太像
 * （以前「训练负荷」和「附件」在一圈里几乎分不出来）。这里每一类画一个有体积的小物件：
 * 秒表、月亮与星、电池、带心电的心、阶梯柱、半身像、便签与笔、回形针文件。
 *
 * 颜色只用 currentColor，深浅主题和「交 / 不交」的明暗都由外面的 color 决定。
 * 画在 32×32 的格子里，作为 SVG 嵌套在节点里（SVG 里套 <svg> 合法）。
 */
import type { AiTaskCategory } from '../../lib/bridge/types';

export type GraphGlyphName = AiTaskCategory;

withDefaults(defineProps<{ name: GraphGlyphName; size?: number; x?: number; y?: number }>(), { size: 28, x: 0, y: 0 });
</script>

<template>
  <svg class="gglyph" :x="x - size / 2" :y="y - size / 2" :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
    <!-- 运动记录：秒表，走过的一段是实心扇形 -->
    <g v-if="name === 'workout'">
      <circle class="soft" cx="16" cy="18" r="10" />
      <path class="solid half" d="M16 18V8a10 10 0 0 1 8.66 15Z" />
      <circle class="line" cx="16" cy="18" r="10" />
      <path class="line" d="M13.2 4.6h5.6M16 4.6V8M24.4 9.4l1.7-1.7" />
      <path class="line strong" d="M16 18l3.6-4.4" />
      <circle class="solid" cx="16" cy="18" r="1.7" />
    </g>
    <!-- 睡眠：月亮与两颗星 -->
    <g v-else-if="name === 'sleep'">
      <path class="soft line" d="M23.6 19.8A9.6 9.6 0 1 1 13.1 7.1a7.6 7.6 0 0 0 10.5 12.7Z" />
      <path class="line" d="M23.5 4.5v4.6M21.2 6.8h4.6" />
      <circle class="solid" cx="27.2" cy="12.6" r="1.25" />
    </g>
    <!-- 恢复状态：电池，电量是实心块 -->
    <g v-else-if="name === 'recovery'">
      <rect class="soft line" x="4.5" y="9.5" width="21" height="14" rx="4" />
      <rect class="solid" x="7.6" y="12.6" width="10.4" height="7.8" rx="1.8" />
      <path class="line strong" d="M28.2 14.2v4.6" />
      <path class="line thin" d="M21.6 13.2l-2.1 3.4h3.2l-2.1 3.4" />
    </g>
    <!-- 心率：心 + 一段心电 -->
    <g v-else-if="name === 'heart_rate'">
      <path class="soft" d="M26.6 12.6c0 6.6-10.6 13-10.6 13S5.4 19.2 5.4 12.6A5.6 5.6 0 0 1 16 9.4a5.6 5.6 0 0 1 10.6 3.2Z" />
      <path class="line" d="M26.6 12.6c0 6.6-10.6 13-10.6 13S5.4 19.2 5.4 12.6A5.6 5.6 0 0 1 16 9.4a5.6 5.6 0 0 1 10.6 3.2Z" />
      <path class="line strong" d="M3 16.4h6.4l2-4.2 3.4 8.6 2.6-6.2 1.6 1.8H29" />
    </g>
    <!-- 训练负荷：三根递增的柱，最高那根实心 -->
    <g v-else-if="name === 'training'">
      <rect class="soft line" x="5.5" y="17" width="5.6" height="9.5" rx="1.8" />
      <rect class="soft line" x="13.2" y="11.5" width="5.6" height="15" rx="1.8" />
      <rect class="solid" x="20.9" y="5.5" width="5.6" height="21" rx="1.8" />
      <path class="line thin" d="M4 28.6h24" />
    </g>
    <!-- 身体状态：半身像，胸口一道刻度线（体重 / 体成分） -->
    <g v-else-if="name === 'body'">
      <path class="soft line" d="M6.5 27.5c0-5.6 4.3-9.3 9.5-9.3s9.5 3.7 9.5 9.3Z" />
      <circle class="soft line" cx="16" cy="10.2" r="5" />
      <path class="line thin" d="M12.4 23.4h7.2" />
      <circle class="solid" cx="16" cy="23.4" r="1.3" />
    </g>
    <!-- 个人说明：便签 + 笔 -->
    <g v-else-if="name === 'personal_note'">
      <rect class="soft line" x="5" y="4.5" width="15.5" height="22" rx="3.4" />
      <path class="line thin" d="M9 10.5h7.5M9 14.6h7.5M9 18.7h4.6" />
      <path class="solid" d="M27.6 12.8 19.4 21l-1.3 4 4-1.3 8.2-8.2a1.9 1.9 0 0 0-2.7-2.7Z" />
    </g>
    <!-- 附件：折角文件 + 回形针 -->
    <g v-else>
      <path class="soft line" d="M8 4.5h10.4l6.1 6.1V27.5H8Z" />
      <path class="line thin" d="M18.4 4.5v6.1h6.1" />
      <path class="line strong" d="M12.6 9.4v9.4a3.4 3.4 0 0 0 6.8 0v-5.6" />
    </g>
  </svg>
</template>

<style scoped>
.gglyph { overflow: visible; pointer-events: none; }
.soft { fill: currentColor; fill-opacity: .2; }
.line { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.soft.line { fill: currentColor; fill-opacity: .2; }
.line.strong { stroke-width: 2.1; }
.line.thin { stroke-width: 1.4; opacity: .8; }
.solid { fill: currentColor; stroke: none; }
.solid.half { fill-opacity: .55; }
</style>

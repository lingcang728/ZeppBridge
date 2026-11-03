<script setup lang="ts">
/**
 * 默认票面：作者没给这一版画邮票时贴这一枚（2026-10-21 用户：别用通用的城堡风景，要有 ZeppBridge 代表性；
 * 试过一套六枚按版本轮换——桥、手表、睡眠、路线、海拔、云——用户只留下海拔这一枚当默认，其余嫌丑删了）。
 * 山就是一条海拔曲线，后面是太阳和图表的格线。右上角留素，面值由 PostageStamp 压在那里（印的是这一版的版本号）。
 * 画在 108 × 84 的票面坐标里，由 PostageStamp 平移到 (8, 8)。全是矢量，不带滤镜、不用混合模式（信封翻面时要便宜）。
 */
</script>

<template>
  <g>
    <rect width="108" height="84" fill="#f0e1bf" />
    <path v-for="y in [18, 32, 46, 60]" :key="y" :d="`M0 ${y}H108`" stroke="#dcc79d" stroke-width=".8" />
    <circle cx="30" cy="26" r="11" fill="#e0884c" />
    <path d="M0 84V56L16 44L28 52L46 30L60 46L72 38L88 50L108 40V84Z" fill="#9db7a1" />
    <path d="M0 84V70L14 64L26 68L40 54L52 60L66 44L78 56L92 50L108 58V84Z" fill="#4c725f" />
    <!-- 前面那座山的轮廓就是一条海拔曲线。 -->
    <path d="M0 70L14 64L26 68L40 54L52 60L66 44L78 56L92 50L108 58" fill="none" stroke="#f3e6c6" stroke-width="1.3" stroke-linejoin="round" />
    <circle cx="66" cy="44" r="2.2" fill="#f3e6c6" stroke="#2e4a3d" stroke-width="1" />
    <path d="M66 41V33" stroke="#2e4a3d" stroke-width="1" />
  </g>
</template>

<script setup lang="ts">
/**
 * ZeppBridge 自己的一套票面（2026-10-21 用户：邮票要有 ZeppBridge 代表性，每版不一样；哪一版用哪枚见 lib/letters/stamp.ts）。
 * 像凹版印的小画：三四个平涂色块 + 细线，不写字（面值由 PostageStamp 压在右上角，所以右上角都留得比较素）。
 * 画在 108 × 84 的票面坐标里，由 PostageStamp 平移到 (8, 8)。全是矢量，不带滤镜、不用混合模式（信封翻面时要便宜）。
 *
 * bridge 桥：一座石拱桥，水里的倒影是一段心跳线——把云端的数据接到本机。
 * watch 手表：表盘上一圈心率和一段心电。
 * sleep 睡眠：月亮，地平线是一夜的睡眠分期。
 * route 路线：等高线地图上一条跑步路线，起点、终点小旗。
 * summit 海拔：山就是一条海拔曲线，后面是太阳和图表的格线。
 * cloud 云到本机：数据从云里一格一格落进小屋的窗口。
 */
import type { StampDesign } from '../../lib/letters/stamp';

defineProps<{ design: StampDesign }>();
const stars: Array<[number, number, number]> = [[8, 40, 0.6], [50, 10, 0.8], [58, 26, 0.6], [46, 36, 0.5], [70, 34, 0.7], [84, 30, 0.5], [98, 42, 0.6], [12, 8, 0.5], [64, 14, 0.5]];
</script>

<template>
  <g v-if="design === 'bridge'">
    <rect width="108" height="84" fill="#efe2c4" />
    <circle cx="26" cy="22" r="10" fill="#e3a05c" />
    <path d="M0 44C16 36 30 40 44 34S76 38 108 31V84H0Z" fill="#a9bfa9" />
    <path d="M0 50C20 46 36 49 54 45S88 48 108 44V84H0Z" fill="#7e9d89" />
    <rect y="54" width="108" height="30" fill="#2f5c60" />
    <!-- 拱桥：桥面、桥身挖出一个大拱和两个小拱。 -->
    <path d="M2 40H106V56H92C90 41 78 34 68 34H40C30 34 18 41 16 56H2Z" fill="#c8915e" />
    <path d="M2 40H106" stroke="#7a4f2c" stroke-width="1.4" />
    <path d="M2 37H106" stroke="#7a4f2c" stroke-width=".8" />
    <path v-for="x in [8, 20, 32, 44, 56, 68, 80, 92]" :key="x" :d="`M${x} 37V40`" stroke="#7a4f2c" stroke-width=".7" />
    <path d="M18 56C20 44 30 37 40 37H68C78 37 88 44 90 56" fill="none" stroke="#7a4f2c" stroke-width=".9" />
    <!-- 倒影是一段心跳。 -->
    <path d="M4 67H34L38 67L42 59L47 76L52 62L56 67H104" fill="none" stroke="#f3e5c6" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" />
    <path d="M10 74H24M66 74H96M18 79H40M70 79H86" stroke="#4f7a7c" stroke-width=".8" stroke-linecap="round" />
  </g>

  <g v-else-if="design === 'watch'">
    <rect width="108" height="84" fill="#d8c59c" />
    <circle v-for="r in [14, 22, 30, 38, 46]" :key="r" cx="54" cy="42" :r="r + 12" fill="none" stroke="#c6b088" stroke-width=".8" />
    <rect x="42" y="0" width="24" height="84" fill="#3b3833" />
    <path v-for="y in [6, 12, 70, 76]" :key="y" :d="`M44 ${y}H64`" stroke="#55514a" stroke-width=".8" />
    <circle cx="54" cy="42" r="25" fill="#2a2926" />
    <rect x="78" y="37" width="5" height="10" rx="1.5" fill="#2a2926" />
    <circle cx="54" cy="42" r="21" fill="#173a33" />
    <circle cx="54" cy="42" r="17" fill="none" stroke="#2d5a50" stroke-width="2.6" />
    <!-- 心率环走了七成。 -->
    <circle cx="54" cy="42" r="17" fill="none" stroke="#e2643f" stroke-width="2.6" stroke-linecap="round" pathLength="100" stroke-dasharray="70 100" transform="rotate(-90 54 42)" />
    <path d="M38 45H45L48 37L52 52L55 40L58 45H70" fill="none" stroke="#f3e7cf" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
    <circle cx="54" cy="31" r="1.4" fill="#e2643f" />
  </g>

  <g v-else-if="design === 'sleep'">
    <rect width="108" height="84" fill="#26344f" />
    <circle v-for="([x, y, r], i) in stars" :key="i" :cx="x" :cy="y" :r="r" fill="#f1e2b4" />
    <!-- 月亮放左上：右上角是面值。 -->
    <circle cx="28" cy="24" r="12" fill="#f2dea4" />
    <circle cx="34" cy="19" r="11" fill="#26344f" />
    <!-- 地平线是一夜的睡眠分期：清醒、浅睡、深睡、REM 高低不一。 -->
    <path d="M0 84V62H12V54H24V70H36V58H50V74H62V60H74V50H86V64H98V56H108V84Z" fill="#4f6d9a" />
    <path d="M0 62H12V54H24V70H36V58H50V74H62V60H74V50H86V64H98V56H108" fill="none" stroke="#9fb7da" stroke-width="1" />
    <path d="M0 84V76H20V72H44V78H70V74H108V84Z" fill="#33496f" />
  </g>

  <g v-else-if="design === 'route'">
    <rect width="108" height="84" fill="#ece0c2" />
    <ellipse v-for="(r, i) in [30, 23, 16, 9]" :key="`a${i}`" cx="40" cy="48" :rx="r * 1.2" :ry="r" fill="none" stroke="#c5b088" stroke-width=".9" />
    <ellipse v-for="(r, i) in [12, 7, 3]" :key="`b${i}`" cx="84" cy="36" :rx="r * 1.3" :ry="r" fill="none" stroke="#c5b088" stroke-width=".9" />
    <path d="M60 84C64 70 58 62 70 54S98 46 108 50" fill="none" stroke="#7ea6b4" stroke-width="3.2" stroke-linecap="round" />
    <path d="M12 70C22 58 30 74 42 60S58 36 70 46S86 66 94 42" fill="none" stroke="#c3462f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="12" cy="70" r="3.4" fill="#2f5c60" stroke="#ece0c2" stroke-width="1.2" />
    <path d="M94 42V28" stroke="#3a2f25" stroke-width="1.2" stroke-linecap="round" />
    <path d="M94 28L103 31.5L94 35Z" fill="#c3462f" />
  </g>

  <g v-else-if="design === 'summit'">
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

  <g v-else>
    <rect width="108" height="84" fill="#e3dcc6" />
    <path v-for="y in [70, 76, 82]" :key="y" :d="`M0 ${y}H108`" stroke="#cfc5a9" stroke-width=".8" />
    <!-- 云：数据一格一格往下落，落进小屋亮着的窗口（存在本机）。 -->
    <path d="M18 34C10 34 8 24 16 22C16 12 30 10 34 18C38 8 56 10 56 22C66 20 70 34 60 34Z" fill="#f8f3e6" stroke="#2f5c60" stroke-width="1.2" stroke-linejoin="round" />
    <rect v-for="(y, i) in [40, 47, 54]" :key="y" :x="36.5" :y="y" width="3" height="3" :opacity="1 - i * 0.22" fill="#2f5c60" />
    <path d="M22 76V60L38 48L54 60V76Z" fill="#c8915e" />
    <path d="M18 61L38 45L58 61" fill="none" stroke="#7a4f2c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    <rect x="33" y="62" width="10" height="8" fill="#f2c96a" stroke="#7a4f2c" stroke-width=".9" />
    <path d="M38 62V70M33 66H43" stroke="#7a4f2c" stroke-width=".7" />
    <path d="M70 76V50H96V76" fill="none" stroke="#2f5c60" stroke-width="1.2" />
    <path d="M74 56H92M74 61H88M74 66H92M74 71H84" stroke="#2f5c60" stroke-width="1" stroke-linecap="round" opacity=".7" />
  </g>
</template>

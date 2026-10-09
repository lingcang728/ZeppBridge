<script setup lang="ts">
/* 图标底座：所有类别图标共用同一种材质（渐变底 + 顶边高光 + 内阴影），
 * 只有图形颜色按数据类别区分。
 *
 * 以前这里是 31 张各自配色的 3D PNG：红褐底的心、墨绿底的仪表盘、青蓝底的
 * 跑步小人，每张一套光影，放在一起像三套图标。现在底座一样、颜色走 token，
 * 深浅两套主题自动换，不用再为浅色主题另画一套图。
 *
 * 品牌类图片（应用图标、Zepp Cloud 标志）仍然用原图。尺寸小于 28px 的地方
 * （按钮里、行内）只画图形，不画底座。 */
import { computed } from 'vue';
import DesignIcon, { type DesignIconName } from './DesignIcon.vue';
import Icon from './Icon.vue';
import { glyphFor, type GlyphTone } from '../lib/glyphs';

defineOptions({ name: 'GlyphTile' });

const props = withDefaults(defineProps<{
  name: DesignIconName;
  size?: number;
  /** 覆盖默认的类别色。 */
  tone?: GlyphTone;
  /** 强制只画图形、不画底座。 */
  plain?: boolean;
  /** 同一形状里，平均 / 最高 / 最低只差颜色深浅。 */
  role?: 'avg' | 'max' | 'min' | 'none';
}>(), {
  size: 32,
  tone: undefined,
  plain: false,
  role: 'none',
});

const spec = computed(() => glyphFor(props.name));
const toneName = computed(() => props.tone ?? spec.value.tone);
const bare = computed(() => props.plain || props.size < 28 || spec.value.bare);
const glyphSize = computed(() => (bare.value ? props.size : Math.round(props.size * 0.54)));
</script>

<template>
  <DesignIcon v-if="spec.image" :name="name" :size="size" />
  <span
    v-else
    :class="['glyph-tile', `tone-${toneName}`, { 'is-bare': bare, 'role-max': role === 'max', 'role-min': role === 'min' }]"
    :style="{ width: `${size}px`, height: `${size}px`, '--tile-radius': `${Math.round(size * 0.3)}px` }"
    aria-hidden="true"
  >
    <Icon :name="spec.glyph!" :size="glyphSize" />
  </span>
</template>

<style scoped>
.glyph-tile {
  --tile-tone: var(--glyph-neutral);
  position: relative;
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--tile-tone) 26%, var(--mat-line));
  border-radius: var(--tile-radius, 12px);
  background:
    radial-gradient(120% 90% at 30% 0%, color-mix(in srgb, var(--tile-tone) 22%, transparent), transparent 70%),
    linear-gradient(160deg, var(--mat-tile-top), var(--mat-tile-bottom));
  box-shadow: var(--mat-tile-rim), 0 4px 12px -6px color-mix(in srgb, var(--tile-tone) 45%, transparent);
  color: var(--tile-tone);
}
.glyph-tile.role-max { color: color-mix(in srgb, var(--tile-tone) 55%, var(--ink)); }
.glyph-tile.role-min { color: color-mix(in srgb, var(--tile-tone) 40%, var(--subtle)); }
.glyph-tile.is-bare {
  border: 0;
  background: none;
  box-shadow: none;
}
.tone-neutral { --tile-tone: var(--glyph-neutral); }
.tone-accent { --tile-tone: var(--accent); }
.tone-heart { --tile-tone: var(--heart); }
.tone-sleep { --tile-tone: var(--sleep); }
.tone-activity { --tile-tone: var(--activity); }
.tone-training { --tile-tone: var(--training); }
.tone-pace { --tile-tone: var(--pace); }
.tone-calories { --tile-tone: var(--calories); }
.tone-altitude { --tile-tone: var(--altitude); }
.glyph-tile.is-bare.tone-neutral { --tile-tone: currentColor; }
</style>

<script setup lang="ts">
/* 二级页里「一组卡片」的分组标题：图标 + 标题 + 一行摘要，下面直接是这一组的内容。
 *
 * 以前这些分组收在 FoldDeck 卡包里，要点开才看得到。可人既然点进了二级页，就是来看
 * 这些的——所以现在一律摊开。分组本身不再包一层卡片底：里面的每张图已经是卡了，
 * 外面再套一张就是「卡里套卡」。 */
import GlyphTile from './GlyphTile.vue';
import type { DesignIconName } from './DesignIcon.vue';
import type { GlyphTone } from '../lib/glyphs';

defineProps<{
  title: string;
  summary?: string;
  icon: DesignIconName;
  tone?: GlyphTone;
}>();
</script>

<template>
  <section class="section-group" :aria-label="title">
    <header class="section-group-head">
      <GlyphTile :name="icon" :tone="tone" :size="36" />
      <span class="section-group-copy">
        <h2>{{ title }}</h2>
        <small v-if="summary">{{ summary }}</small>
      </span>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.section-group { display: grid; gap: 12px; min-width: 0; margin-top: 6px; }
.section-group-head { display: flex; min-width: 0; align-items: center; gap: 12px; padding: 0 4px; }
.section-group-copy { display: grid; min-width: 0; gap: 1px; }
.section-group-copy h2 { margin: 0; color: var(--ink); font-size: var(--fs-lg); font-weight: 700; line-height: 1.3; }
.section-group-copy small { overflow: hidden; color: var(--subtle); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
</style>

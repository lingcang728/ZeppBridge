<script setup lang="ts">
/* 二级页里「一组卡片」的分组标题：图标 + 标题 + 一行摘要，下面直接是这一组的内容。
 *
 * 以前这些分组收在 FoldDeck 卡包里，要点开才看得到。可人既然点进了二级页，就是来看
 * 这些的——所以默认一律摊开。分组本身不再包一层卡片底：里面的每张图已经是卡了，
 * 外面再套一张就是「卡里套卡」。
 *
 * `collapsible`：偏技术、平时用不上的一组（睡眠页的来源与设备）默认收起，标题本身就是开关。 */
import { ref } from 'vue';
import GlyphTile from './GlyphTile.vue';
import Icon from './Icon.vue';
import type { DesignIconName } from './DesignIcon.vue';
import type { GlyphTone } from '../lib/glyphs';

const props = defineProps<{
  title: string;
  summary?: string;
  icon: DesignIconName;
  tone?: GlyphTone;
  collapsible?: boolean;
}>();
const open = ref(!props.collapsible);
</script>

<template>
  <section class="section-group" :class="{ collapsible, open }" :aria-label="title">
    <button v-if="collapsible" class="section-group-head as-toggle" type="button" :aria-expanded="open" @click="open = !open">
      <GlyphTile :name="icon" :tone="tone" :size="36" />
      <span class="section-group-copy">
        <h2>{{ title }}</h2>
        <small v-if="summary">{{ summary }}</small>
      </span>
      <Icon class="section-group-chevron" name="chevron-down" :size="18" />
    </button>
    <header v-else class="section-group-head">
      <GlyphTile :name="icon" :tone="tone" :size="36" />
      <span class="section-group-copy">
        <h2>{{ title }}</h2>
        <small v-if="summary">{{ summary }}</small>
      </span>
    </header>
    <Transition name="section-reveal">
      <div v-if="open" class="section-group-body"><slot /></div>
    </Transition>
  </section>
</template>

<style scoped>
.section-group { display: grid; gap: 12px; min-width: 0; margin-top: 6px; }
.section-group-body { display: grid; gap: 12px; min-width: 0; }
.section-group-head { display: flex; min-width: 0; align-items: center; gap: 12px; padding: 0 4px; }
.section-group-head.as-toggle { width: 100%; padding: 6px 8px 6px 4px; border: 0; border-radius: 14px; background: none; color: inherit; font: inherit; text-align: start; cursor: pointer; transition: background-color .18s ease; }
.section-group-head.as-toggle:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
.section-group-head.as-toggle:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.section-group-chevron { flex: none; margin-inline-start: auto; color: var(--subtle); transition: transform .3s cubic-bezier(.2, .8, .2, 1); }
.section-group.open .section-group-chevron { transform: rotate(180deg); }
.section-group-copy { display: grid; min-width: 0; gap: 1px; }
.section-group-copy h2 { margin: 0; color: var(--ink); font-size: var(--fs-lg); font-weight: 700; line-height: 1.3; }
.section-group-copy small { overflow: hidden; color: var(--subtle); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.section-reveal-enter-active { transition: opacity .32s ease, transform .32s cubic-bezier(.2, .8, .2, 1); }
.section-reveal-leave-active { transition: opacity .18s ease, transform .18s ease; }
.section-reveal-enter-from, .section-reveal-leave-to { opacity: 0; transform: translateY(-6px); }
@media (prefers-reduced-motion: reduce) {
  .section-reveal-enter-active, .section-reveal-leave-active { transition: none; }
}
</style>

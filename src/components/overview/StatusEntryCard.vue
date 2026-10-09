<script setup lang="ts">
/* 概览的入口卡（身体状态 / 训练状态共用）：每一项一格——名字、最新值、近 7 天的一条小线。
 * 以前只有一行数字，卡片下半截整块空着；现在每格自带自己那一项的形状，卡片是满的，
 * 也不会出现「几个数字配一条线、线是哪一项」对不上的问题。
 *
 * 只给数字和形状——解读留给卡片背后的页面和用户自选的 AI。没有采样的那一项不画线（不编数据）。 */
import { RouterLink } from 'vue-router';
import type { DesignIconName } from '../DesignIcon.vue';
import GlyphTile from '../GlyphTile.vue';
import Sparkline from '../Sparkline.vue';

defineOptions({ name: 'OverviewStatusEntryCard' });

export type EntryFact = {
  key: string;
  label: string;
  /** 数字（不含单位）。 */
  text: string;
  /** 单位，紧贴数字、小一号。 */
  unit?: string;
  /** 近 7 天的值；少于两个点不画。 */
  spark?: number[];
  color?: string;
  /** 数字后面跟的一个短标签（训练负荷的档位）。 */
  tag?: string | null;
};

withDefaults(defineProps<{
  to: string;
  icon: DesignIconName;
  title: string;
  /** 只列有值的项；一项都没有时卡片靠 caption 交代。 */
  facts: EntryFact[];
  /** 小线下面的一句说明（画的是哪段时间），或者没有数据时的一句话。 */
  caption?: string | null;
  tone: 'body' | 'training';
}>(), { caption: null });
</script>

<template>
  <!-- 调用方传的 :aria-label 作为透传属性落在这张卡的根 <a> 上。 -->
  <RouterLink :class="['metric-panel', 'entry-panel', `tone-${tone}`]" :to="to">
    <div class="entry-head">
      <GlyphTile :name="icon" :size="38" />
      <p class="entry-label">{{ title }}</p>
      <GlyphTile class="entry-go" name="chevron-right" :size="18" />
    </div>
    <ul v-if="facts.length" class="entry-facts" :style="{ '--cols': Math.min(facts.length, 3) }">
      <li v-for="fact in facts" :key="fact.key" class="entry-fact">
        <span class="fact-label">{{ fact.label }}</span>
        <span class="fact-value"><strong>{{ fact.text }}</strong><small v-if="fact.unit">{{ fact.unit }}</small><em v-if="fact.tag">{{ fact.tag }}</em></span>
        <Sparkline v-if="(fact.spark?.length ?? 0) > 1 && fact.color" class="fact-spark" :values="fact.spark!" :color="fact.color" :label="`${fact.label} · ${caption ?? ''}`" />
        <span v-else class="fact-spark fact-spark-empty" aria-hidden="true"></span>
      </li>
    </ul>
    <p v-if="caption" class="entry-note">{{ caption }}</p>
  </RouterLink>
</template>

<style scoped>
.entry-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 210px;
  height: 100%;
  padding: 18px;
  color: inherit;
  text-decoration: none;
}
.entry-head { display: flex; align-items: center; gap: 9px; min-width: 0; }
.entry-label { flex: 1 1 auto; min-width: 0; margin: 0; color: var(--ink); font-size: var(--fs-md); font-weight: 600; }
.entry-go { opacity: .7; transition: translate var(--dur-base) var(--ease-out), opacity var(--dur-fast) ease; }
.entry-panel:hover .entry-go { opacity: 1; translate: 2px 0; }

.entry-facts { display: grid; flex: 1 1 auto; grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.entry-fact {
  display: grid; align-content: space-between; gap: 4px; min-width: 0; padding: 12px 12px 8px;
  border-radius: var(--radius-md); background: var(--mat-inset); box-shadow: var(--mat-inset-shadow);
}
.fact-label { overflow: hidden; color: var(--subtle); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.fact-value { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 3px; min-width: 0; }
.fact-value strong { color: var(--ink); font-family: 'Inter', var(--font-sans); font-size: var(--fs-2xl); font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.fact-value small { color: var(--muted); font-size: var(--fs-xs); }
.fact-value em { margin-left: 5px; color: var(--muted); font-size: var(--fs-xs); font-style: normal; }
.fact-spark { height: 40px; margin-top: 2px; }
.fact-spark :deep(svg) { height: 40px; }
.fact-spark-empty { display: block; border-radius: 8px;
  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink) 4%, transparent) 0 6px, transparent 6px 12px); }
.entry-note { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.5; }

@container (max-width: 420px) {
  .entry-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* 卡片底色统一走材质；类别只在左下角留一点同色微光，和图标、曲线是同一个颜色。 */
.entry-panel { --entry-tone: var(--accent); }
.tone-body { --entry-tone: var(--heart); }
.tone-training { --entry-tone: var(--training); }
.entry-panel {
  background:
    radial-gradient(320px 200px at 0 100%, color-mix(in srgb, var(--entry-tone) 9%, transparent), transparent 70%),
    var(--mat-card);
}
</style>

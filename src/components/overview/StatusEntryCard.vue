<script setup lang="ts">
/* 概览的入口卡（身体状态 / 训练状态共用）：每一项一行——名字、最新值、近 7 天的一条小线。
 * 3.1 起按 tobi 稿的「指标行 + 迷你曲线」排成紧凑列表（不再一格一块凹槽：卡里套卡），数字下面一行
 * 是和自己比的结论与近 90 天常态（UsualRange，数据不够就没有）。
 * 以前只有一行数字，卡片下半截整块空着；现在每格自带自己那一项的形状，卡片是满的，
 * 也不会出现「几个数字配一条线、线是哪一项」对不上的问题。
 *
 * 只有一项时（比如训练状态只有负荷）行列表会剩下大半张空卡：换成「大数字 + 占满下半截的曲线」，
 * 两三项时各行均分卡片高度。版式只看项数，不看是哪张卡。
 *
 * 只给数字和形状——解读留给卡片背后的页面和用户自选的 AI。没有采样的那一项不画线（不编数据）。 */
import { RouterLink } from 'vue-router';
import type { DesignIconName } from '../DesignIcon.vue';
import GlyphTile from '../GlyphTile.vue';
import Sparkline from '../Sparkline.vue';
import UsualRange from '../ask/UsualRange.vue';

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
  /** 小线画的不是近 7 天时（稀疏项放宽到近 90 天），行尾写一句是哪段时间。 */
  span?: string | null;
  color?: string;
  /** 数字后面跟的一个短标签（训练负荷的档位）。 */
  tag?: string | null;
  /** 给常态范围排数字用（和 text 同一种格式）；没有就不画常态那一行。 */
  format?: (value: number) => string;
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
    <div v-if="facts.length === 1" class="entry-solo">
      <span class="fact-label"><i :style="{ background: facts[0].color }" aria-hidden="true"></i>{{ facts[0].label }}</span>
      <span class="fact-value"><strong>{{ facts[0].text }}</strong><small v-if="facts[0].unit">{{ facts[0].unit }}</small><em v-if="facts[0].tag">{{ facts[0].tag }}</em></span>
      <UsualRange v-if="facts[0].format" class="fact-usual" :metric="facts[0].key" :format="facts[0].format" />
      <Sparkline v-if="(facts[0].spark?.length ?? 0) > 1 && facts[0].color" class="solo-spark" fill :values="facts[0].spark!" :color="facts[0].color" :label="`${facts[0].label} · ${facts[0].span ?? caption ?? ''}`" />
      <em v-if="facts[0].span" class="fact-span solo-span">{{ facts[0].span }}</em>
    </div>
    <ul v-else-if="facts.length" class="entry-facts">
      <li v-for="fact in facts" :key="fact.key" class="entry-fact">
        <span class="fact-label"><i :style="{ background: fact.color }" aria-hidden="true"></i>{{ fact.label }}</span>
        <span class="fact-main">
          <span class="fact-value"><strong>{{ fact.text }}</strong><small v-if="fact.unit">{{ fact.unit }}</small><em v-if="fact.tag">{{ fact.tag }}</em></span>
          <UsualRange v-if="fact.format" class="fact-usual" :metric="fact.key" :format="fact.format" />
        </span>
        <span v-if="(fact.spark?.length ?? 0) > 1 && fact.color" class="spark-cell">
          <Sparkline class="fact-spark" :values="fact.spark!" :color="fact.color" :label="`${fact.label} · ${fact.span ?? caption ?? ''}`" />
          <em v-if="fact.span" class="fact-span">{{ fact.span }}</em>
        </span>
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

.entry-facts { display: grid; flex: 1 1 auto; grid-auto-rows: 1fr; margin: 0; padding: 0; list-style: none; }
.entry-fact {
  display: grid; grid-template-columns: minmax(5em, 1fr) minmax(0, 1.3fr) minmax(64px, 1fr); align-items: center; gap: 12px;
  min-width: 0; padding: 10px 0;
}
.entry-fact + .entry-fact { border-top: 1px solid var(--mat-line); }
.fact-label { display: flex; align-items: center; gap: 7px; overflow: hidden; color: var(--muted); font-size: var(--fs-sm); text-overflow: ellipsis; white-space: nowrap; }
.fact-label i { width: 7px; height: 7px; flex: none; border-radius: 50%; }
.fact-main { display: grid; gap: 1px; min-width: 0; }
.fact-usual { justify-content: flex-start; }
.fact-value { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 3px; min-width: 0; }
.fact-value strong { color: var(--ink); font-family: 'Inter', var(--font-sans); font-size: var(--fs-2xl); font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.fact-value small { color: var(--muted); font-size: var(--fs-xs); }
.fact-value em { margin-left: 5px; color: var(--muted); font-size: var(--fs-xs); font-style: normal; }
.fact-spark { height: 34px; }
.fact-spark :deep(svg) { height: 34px; }
.spark-cell { position: relative; display: block; min-width: 0; }
.fact-span { position: absolute; right: 0; bottom: -15px; color: var(--subtle); font-size: var(--fs-2xs); font-style: normal; white-space: nowrap; }
.solo-span { position: static; align-self: flex-end; }
.fact-spark-empty { display: block; border-radius: 8px;
  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink) 4%, transparent) 0 6px, transparent 6px 12px); }
.entry-solo { display: flex; flex: 1 1 auto; flex-direction: column; gap: 4px; min-height: 0; }
.entry-solo .fact-value { gap: 0 6px; margin-top: 6px; }
.entry-solo .fact-value strong { font-size: 34px; line-height: 1; } /* 和心率卡的大数字同一号（panels.css .figure-value） */
.entry-solo .fact-value small { font-size: var(--fs-md); }
.entry-solo .fact-value em { font-size: var(--fs-sm); }
.solo-spark { min-height: 96px; margin-top: 10px; }
.entry-note { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.5; }

@container (max-width: 420px) {
  .entry-fact { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .spark-cell, .fact-spark-empty { grid-column: 1 / -1; }
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

<script setup lang="ts">
/* 概览的入口卡（身体状态 / 训练状态共用）：图标 + 当日数值，训练卡另有 7 天 Sparkline。
 * 身体卡只列最新值：恢复的 7 天趋势在同名的身体页看，卡上再画一条是重复。
 *
 * 只给数字和形状——解读留给卡片背后的页面和用户自选的 AI。 */
import { RouterLink } from 'vue-router';
import type { DesignIconName } from '../DesignIcon.vue';
import GlyphTile from '../GlyphTile.vue';
import Sparkline from '../Sparkline.vue';

defineOptions({ name: 'OverviewStatusEntryCard' });

withDefaults(defineProps<{
  to: string;
  icon: DesignIconName;
  title: string;
  /** 只列有值的项；一项都没有时卡片靠 note 交代。 */
  facts: { key: string; label: string; text: string }[];
  /** 7 天趋势：只有训练卡还画；身体卡不传就不画。 */
  spark?: number[];
  sparkColor?: string;
  sparkLabel?: string;
  /** 没有 spark 可画时的一句话（数据薄 / 尚未同步）；有数时也可以什么都不说。 */
  caption?: string | null;
  tone: 'body' | 'training';
}>(), { spark: () => [], sparkColor: '', sparkLabel: '', caption: null });
</script>

<template>
  <!-- 调用方传的 :aria-label 作为透传属性落在这张卡的根 <a> 上。 -->
  <RouterLink :class="['metric-panel', 'entry-panel', `tone-${tone}`]" :to="to">
    <div class="entry-icon"><GlyphTile :name="icon" :size="52" /></div>
    <div class="entry-copy">
      <p class="entry-label">{{ title }} <GlyphTile name="chevron-right" :size="18" /></p>
      <p class="entry-facts">
        <span v-for="fact in facts" :key="fact.key">
          {{ fact.label }} <strong>{{ fact.text }}</strong>
        </span>
      </p>
      <!-- 线下写明画的是哪项、哪段时间：旁边的数字有多项，线只有一条，不写就对不上。 -->
      <template v-if="spark.length > 1 && sparkColor">
        <Sparkline :values="spark" :color="sparkColor" :label="sparkLabel" />
        <p class="entry-spark-label" aria-hidden="true">{{ sparkLabel }}</p>
      </template>
      <p v-else-if="caption" class="entry-note">{{ caption }}</p>
    </div>
  </RouterLink>
</template>

<style scoped>
/* 两张入口卡平分一行；各自留一点环境色提示类别。 */
.entry-panel {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 12px;
  min-height: 166px;
  padding: 18px;
  color: inherit;
  text-decoration: none;
}
.entry-panel:hover { border-color: var(--panel-line-hover); }
.entry-icon { display: grid; width: 52px; height: 52px; place-items: center; }
.entry-copy { display: grid; align-content: start; gap: 7px; min-width: 0; }
.entry-label { display: flex; align-items: center; gap: 3px; margin: 0; color: var(--muted); font-size: var(--fs-md); font-weight: 600; }
.entry-facts { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; color: var(--subtle); font-size: var(--fs-xs); }
.entry-facts strong { color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-xl); font-weight: 600; font-variant-numeric: tabular-nums; }
.entry-note { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.5; }
.entry-spark-label { margin: 4px 0 0; color: var(--subtle); font-size: var(--fs-2xs); }

/* 卡片底色统一走材质；类别只在左下角留一点同色微光，和图标、曲线是同一个颜色。
   以前训练状态卡是写死的橄榄棕渐变，身体状态卡是绿底配红心，看起来像两套配色。 */
.entry-panel { --entry-tone: var(--accent); }
.tone-body { --entry-tone: var(--heart); }
.tone-training { --entry-tone: var(--training); }
.entry-panel {
  background:
    radial-gradient(320px 200px at 0 100%, color-mix(in srgb, var(--entry-tone) 9%, transparent), transparent 70%),
    var(--mat-card);
}
</style>

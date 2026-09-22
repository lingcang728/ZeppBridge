<script setup lang="ts">
/* 概览的入口卡（身体状态 / 训练状态共用）：图标 + 当日数值 + 7 天 Sparkline。
 *
 * 只给数字和形状——解读留给卡片背后的页面和用户自选的 AI。 */
import { RouterLink } from 'vue-router';
import DesignIcon, { type DesignIconName } from '../DesignIcon.vue';
import Sparkline from '../Sparkline.vue';

defineOptions({ name: 'OverviewStatusEntryCard' });

defineProps<{
  to: string;
  icon: DesignIconName;
  title: string;
  /** 只列有值的项；一项都没有时卡片靠 note 交代。 */
  facts: { key: string; label: string; text: string }[];
  spark: number[];
  sparkColor: string;
  sparkLabel: string;
  /** spark 画不出来时的一句话（数据薄 / 尚未同步）。 */
  note: string;
  tone: 'body' | 'training';
}>();
</script>

<template>
  <!-- 调用方传的 :aria-label 作为透传属性落在这张卡的根 <a> 上。 -->
  <RouterLink :class="['metric-panel', 'entry-panel', `tone-${tone}`]" :to="to">
    <div class="entry-icon"><DesignIcon :name="icon" :size="52" /></div>
    <div class="entry-copy">
      <p class="entry-label">{{ title }} <DesignIcon name="chevron-right" :size="18" /></p>
      <p class="entry-facts">
        <span v-for="fact in facts" :key="fact.key">
          {{ fact.label }} <strong>{{ fact.text }}</strong>
        </span>
      </p>
      <Sparkline
        v-if="spark.length > 1"
        :values="spark"
        :color="sparkColor"
        :label="sparkLabel"
      />
      <p v-else class="entry-note">{{ note }}</p>
    </div>
  </RouterLink>
</template>

<style scoped>
/* 两张入口卡平分一行；各自留一点环境色提示类别。 */
.entry-panel {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-column: span 6;
  align-items: start;
  gap: 12px;
  min-height: 166px;
  padding: 18px;
  color: inherit;
  text-decoration: none;
}
.entry-panel:hover { border-color: var(--panel-line-hover); }
.entry-icon { display: grid; width: 52px; height: 52px; place-items: center; overflow: hidden; border-radius: 15px; }
.entry-copy { display: grid; align-content: start; gap: 7px; min-width: 0; }
.entry-label { display: flex; align-items: center; gap: 3px; margin: 0; color: var(--muted); font-size: var(--fs-md); font-weight: 600; }
.entry-facts { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; color: var(--subtle); font-size: var(--fs-xs); }
.entry-facts strong { color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-xl); font-weight: 600; font-variant-numeric: tabular-nums; }
.entry-note { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.5; }

.tone-body {
  background:
    radial-gradient(300px 180px at 0 100%, rgba(61, 216, 76, .09), transparent 72%),
    linear-gradient(145deg, #19221C, #1A1D22);
}
.tone-training {
  background:
    radial-gradient(300px 180px at 0 100%, rgba(136, 164, 73, .1), transparent 72%),
    linear-gradient(145deg, #1B1F16, #191D16);
}
html[data-theme="light"] .tone-body {
  background:
    radial-gradient(300px 180px at 0 100%, var(--activity-wash), transparent 72%),
    var(--panel);
}
html[data-theme="light"] .tone-training {
  background:
    radial-gradient(300px 180px at 0 100%, var(--accent-soft), transparent 72%),
    var(--panel);
}
@media (max-width: 1180px) { .entry-panel { grid-column: span 6; } }
@media (max-width: 820px) { .entry-panel { grid-column: 1; } }
</style>

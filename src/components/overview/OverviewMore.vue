<script setup lang="ts">
/* 概览首屏四张主卡下面的其余区块：这一周、身体状态、训练状态、生活事件、数据来源。
 * 直接摊开，不再收成卡包——概览本来就是来「多看一眼」的地方，让人先点开才看得到
 * 是多此一举。每一块自己都有卡头和标题，这里只管排布。
 *
 * 「我关注」选了区块时，身体 / 训练两张入口卡排进上面的主卡格子（选中的模块
 * 靠前），这里就不重复摆一份；没选时维持原位。 */
import WeeklyReportCard from '../WeeklyReportCard.vue';
import LifeEventsPanel from '../LifeEventsPanel.vue';
import SourcesStrip from './SourcesStrip.vue';
import StatusEntryCard from './StatusEntryCard.vue';

type Entry = {
  facts: { key: string; label: string; text: string }[];
  /** 7 天趋势：只有训练卡还画；身体卡只列最新值。 */
  spark?: number[];
  sparkColor?: string;
  sparkLabel?: string;
  /** 没有事实可列（或线画不出来）时的一句说明；有数时可以是 null。 */
  caption: string | null;
};
withDefaults(defineProps<{
  body: Entry;
  training: Entry;
  bodyTitle: string;
  trainingTitle: string;
  bodyAria: string;
  trainingAria: string;
  /** 没选「我关注」时入口卡在这里；选了时它们排进主卡格子，这里不再摆。 */
  showEntries?: boolean;
}>(), { showEntries: true });
</script>

<template>
  <div class="overview-more">
    <WeeklyReportCard />
    <div v-if="showEntries" class="entry-pair">
      <StatusEntryCard to="/body" tone="body" icon="recovery" :aria-label="bodyAria" :title="bodyTitle"
        :facts="body.facts" :caption="body.caption" />
      <StatusEntryCard to="/training" tone="training" icon="training-load" :aria-label="trainingAria" :title="trainingTitle"
        :facts="training.facts" :spark="training.spark" :spark-color="training.sparkColor" :spark-label="training.sparkLabel" :caption="training.caption" />
    </div>
    <!-- 「添加事件」只留生活事件卡右上角那一枚：以前卡片上面还挂着一排快捷胶囊，两个按钮做同一件事。 -->
    <LifeEventsPanel />
    <SourcesStrip />
  </div>
</template>

<style scoped>
.overview-more { display: grid; gap: 16px; min-width: 0; container-type: inline-size; }
.entry-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
@container (max-width: 640px) {
  .entry-pair { grid-template-columns: minmax(0, 1fr); }
}
</style>

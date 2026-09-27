<script setup lang="ts">
/* 概览首屏下面的「更多」：这一周、身体状态、训练状态、生活事件、数据来源收成一叠卡包
 * （FoldDeck），只露卡头和一句摘要，想看哪张点哪张，它飞出来长成完整的卡。
 * 首屏因此只剩心率、步数、睡眠、最近记录四张常看的主卡。 */
import { computed } from 'vue';
import FoldDeck from '../deck/FoldDeck.vue';
import WeeklyReportCard from '../WeeklyReportCard.vue';
import LifeEventsPanel from '../LifeEventsPanel.vue';
import LifeEventShortcut from '../LifeEventShortcut.vue';
import SourcesStrip from './SourcesStrip.vue';
import StatusEntryCard from './StatusEntryCard.vue';
import { useLifeEvents } from '../../composables/useLifeEvents';
import { defineMessages, useMessages } from '../../i18n';

type Entry = {
  facts: { key: string; label: string; text: string }[];
  spark: number[];
  sparkColor: string;
  sparkLabel: string;
  /** 没有事实可列时的一句说明（本地文案）。 */
  caption: string;
};
const props = defineProps<{
  body: Entry;
  training: Entry;
  bodyTitle: string;
  trainingTitle: string;
  bodyAria: string;
  trainingAria: string;
}>();

const t = useMessages(defineMessages(
  {
    label: '更多',
    weekly: '这一周',
    weeklySub: '和你自己此前 28 天比',
    life: '生活事件',
    lifeSub: (n: number) => (n ? `${n} 件事` : '记录这段时间发生的事'),
    sources: '数据来源',
    sourcesSub: '设备与云端账户',
  },
  {
    label: 'More',
    weekly: 'This week',
    weeklySub: 'Against your own previous 28 days',
    life: 'Life events',
    lifeSub: (n: number) => (n ? `${n} events` : 'Note what happened during this time'),
    sources: 'Data sources',
    sourcesSub: 'Devices and cloud account',
  },
  {
    label: 'Más',
    weekly: 'Esta semana',
    weeklySub: 'Frente a tus 28 días anteriores',
    life: 'Eventos personales',
    lifeSub: (n: number) => (n ? `${n} eventos` : 'Anota lo que pasó en este tiempo'),
    sources: 'Fuentes de datos',
    sourcesSub: 'Dispositivos y cuenta en la nube',
  },
  'components/overview/OverviewMore',
));

const { events } = useLifeEvents();
const factLine = (entry: Entry) => entry.facts.map((fact) => `${fact.label} ${fact.text}`).join(' · ') || entry.caption;

const cards = computed(() => [
  { id: 'weekly', title: t.value.weekly, summary: t.value.weeklySub, icon: 'overview' as const, tone: 'accent' as const },
  { id: 'body', title: props.bodyTitle, summary: factLine(props.body), icon: 'recovery' as const, tone: 'heart' as const },
  { id: 'training', title: props.trainingTitle, summary: factLine(props.training), icon: 'training-load' as const, tone: 'training' as const },
  { id: 'life', title: t.value.life, summary: t.value.lifeSub(events.value.length), icon: 'manual-entry' as const, tone: 'sleep' as const },
  { id: 'sources', title: t.value.sources, summary: t.value.sourcesSub, icon: 'health-watch' as const, tone: 'activity' as const },
]);
</script>

<template>
  <FoldDeck :cards="cards" :label="t.label" :heading="t.label" :sub="cards.map((card) => card.title).join(' · ')">
    <template #weekly><WeeklyReportCard /></template>
    <template #body>
      <StatusEntryCard to="/body" tone="body" icon="recovery" :aria-label="bodyAria" :title="bodyTitle"
        :facts="body.facts" :spark="body.spark" :spark-color="body.sparkColor" :spark-label="body.sparkLabel" :note="body.caption" />
    </template>
    <template #training>
      <StatusEntryCard to="/training" tone="training" icon="training-load" :aria-label="trainingAria" :title="trainingTitle"
        :facts="training.facts" :spark="training.spark" :spark-color="training.sparkColor" :spark-label="training.sparkLabel" :note="training.caption" />
    </template>
    <template #life>
      <div class="life-stack"><LifeEventShortcut /><LifeEventsPanel /></div>
    </template>
    <template #sources><SourcesStrip /></template>
  </FoldDeck>
</template>

<style scoped>
.life-stack { display: grid; gap: 12px; }
</style>

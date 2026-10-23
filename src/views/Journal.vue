<script setup lang="ts">
/**
 * 履历（/journal，批次 7 主观层「让数据留在 ZeppBridge」）。
 *
 * 身体数据来自云端；这一页是用户自己写下的那一半：比赛（倒计时、奖牌墙）、PB 墙（从本地采样现算）、
 * 跑鞋（里程、退役提醒）、伤病（人形图）、纪元（给一段日子起名，所有趋势图垫底色）。
 * 全在本机，交给 AI 时一起带上（MCP 的 get_athlete_profile、交给 AI 的 .md）。
 *
 * 编辑都是弹窗，同一时刻只开一个；关掉后各块按需重读（写入在 useLogbook 里）。
 */
import { onActivated, onMounted, shallowRef } from 'vue';
import { RouterLink } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import EpochSection from '../components/journal/EpochSection.vue';
import InjuryEditor from '../components/journal/InjuryEditor.vue';
import InjurySection from '../components/journal/InjurySection.vue';
import RaceEditor from '../components/journal/RaceEditor.vue';
import RaceSection from '../components/journal/RaceSection.vue';
import RecordWall from '../components/journal/RecordWall.vue';
import ShoeEditor from '../components/journal/ShoeEditor.vue';
import ShoeSection from '../components/journal/ShoeSection.vue';
import { useJournalText } from '../components/journal/journal.i18n';
import { useRingsText } from '../components/rings/rings.i18n';
import { useLogbook } from '../composables/useLogbook';
import type { InjuryInput, RaceInput, ShoeInput } from '../types/logbook';

defineOptions({ name: 'Journal' });
const t = useJournalText();
const rings = useRingsText();
const logbook = useLogbook();
onMounted(() => { void logbook.load(); });
onActivated(() => { void logbook.load(); });

/* origin：被点的按钮 / 那一行。弹窗从它长出来、关的时候缩回去（从哪里来，回哪里去）。 */
type Editing = ({ kind: 'race'; value: RaceInput } | { kind: 'shoe'; value: ShoeInput } | { kind: 'injury'; value: InjuryInput }) & { origin?: HTMLElement } | null;
const editing = shallowRef<Editing>(null);
const close = () => { editing.value = null; logbook.error.value = null; };
</script>

<template>
  <section class="page journal-page" aria-labelledby="journal-title">
    <PageHeader title-id="journal-title" :title="t.title">
      <!-- data-morph-card：胶囊比一般的卡小，不标的话换页会从整页展开；标上就从这颗胶囊长出年轮页、返回时缩回来。 -->
      <RouterLink class="pill-button quiet" :to="{ name: 'Rings' }" data-morph-card>{{ rings.entry }} →</RouterLink>
    </PageHeader>
    <div class="journal-grid">
      <RaceSection class="span-races" @edit="(race, origin) => (editing = { kind: 'race', value: race, origin })" />
      <RecordWall class="span-records" />
      <ShoeSection class="span-shoes" @edit="(shoe, origin) => (editing = { kind: 'shoe', value: shoe, origin })" />
      <EpochSection class="span-epochs" />
      <InjurySection class="span-injuries" @edit="(injury, origin) => (editing = { kind: 'injury', value: injury, origin })" />
    </div>
    <RaceEditor v-if="editing?.kind === 'race'" :race="editing.value" :origin="editing.origin" @close="close" />
    <ShoeEditor v-if="editing?.kind === 'shoe'" :shoe="editing.value" :origin="editing.origin" @close="close" />
    <InjuryEditor v-if="editing?.kind === 'injury'" :injury="editing.value" :origin="editing.origin" @close="close" />
  </section>
</template>

<style scoped>
.journal-page.page { display: grid; gap: var(--space-4); align-content: start; }
.journal-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; container: journal / inline-size; }
.span-races { grid-column: span 7; }
.span-records { grid-column: span 5; }
.span-shoes { grid-column: span 7; }
.span-epochs { grid-column: span 5; }
.span-injuries { grid-column: 1 / -1; }
@media (max-width: 1100px) {
  .journal-grid > * { grid-column: 1 / -1; }
}
</style>

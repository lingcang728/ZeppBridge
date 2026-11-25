<script setup lang="ts">
/**
 * 履历的正文：运动列表缩到「年」这一档就是它（/journal 旧链接也落到这里）。
 *
 * 身体数据来自云端；这里是用户自己写下的那一半：比赛（倒计时、奖牌墙）、PB 墙（从本地采样现算）、
 * 跑鞋（里程、退役提醒）、伤病（人形图）、纪元（给一段日子起名，所有趋势图垫底色）。
 * 全在本机，交给 AI 时一起带上（MCP 的 get_athlete_profile、交给 AI 的 .md）。
 * 最上面的全年日历点某一天 → `day` 事件（运动列表放大回日档、滚到那天）。
 *
 * 编辑都是弹窗，同一时刻只开一个；关掉后各块按需重读（写入在 useLogbook 里）。
 */
import { onActivated, onMounted, ref, shallowRef } from 'vue';
import { useSectionTour } from '../../composables/useTour';
import YearDashboard from './year/YearDashboard.vue';
import EpochSection from './EpochSection.vue';
import InjuryEditor from './InjuryEditor.vue';
import InjurySection from './InjurySection.vue';
import RaceEditor from './RaceEditor.vue';
import RaceSection from './RaceSection.vue';
import RecordWall from './RecordWall.vue';
import ShoeEditor from './ShoeEditor.vue';
import ShoeSection from './ShoeSection.vue';
import { useLogbook } from '../../composables/useLogbook';
import type { InjuryInput, RaceInput, ShoeInput } from '../../types/logbook';

const emit = defineEmits<{ day: [day: string] }>();
const logbook = useLogbook();
let mountedOnce = false;
onMounted(() => {
  mountedOnce = true;
  void logbook.load();
});
onActivated(() => {
  if (mountedOnce) {
    mountedOnce = false;
    return;
  }
  void logbook.load();
});

/* origin：被点的按钮 / 那一行。弹窗从它长出来、关的时候缩回去（从哪里来，回哪里去）。 */
type Editing = ({ kind: 'race'; value: RaceInput } | { kind: 'shoe'; value: ShoeInput } | { kind: 'injury'; value: InjuryInput }) & { origin?: HTMLElement } | null;
const editing = shallowRef<Editing>(null);
const editSession = ref(0);
const openEdit = (next: NonNullable<Editing>) => {
  editSession.value += 1;
  editing.value = next;
};
const close = () => { editing.value = null; logbook.error.value = null; };
/* 新手引导：第一次缩到这一档时就地讲一遍（lib/tour/chapters.ts）。 */
useSectionTour('journal');
</script>

<template>
  <div class="journal-body">
    <div class="journal-grid">
      <YearDashboard class="span-full" @day="(day) => emit('day', day)" />
      <RecordWall class="span-full" />
      <EpochSection class="span-full" />
      <RaceSection class="span-half" @edit="(race, origin) => openEdit({ kind: 'race', value: race, origin })" />
      <InjurySection class="span-half" @edit="(injury, origin) => openEdit({ kind: 'injury', value: injury, origin })" />
      <ShoeSection class="span-full" @edit="(shoe, origin) => openEdit({ kind: 'shoe', value: shoe, origin })" />
    </div>
    <RaceEditor v-if="editing?.kind === 'race'" :key="`race-${editSession}`" :race="editing.value" :origin="editing.origin" @close="close" />
    <ShoeEditor v-if="editing?.kind === 'shoe'" :key="`shoe-${editSession}`" :shoe="editing.value" :origin="editing.origin" @close="close" />
    <InjuryEditor v-if="editing?.kind === 'injury'" :key="`injury-${editSession}`" :injury="editing.value" :origin="editing.origin" @close="close" />
  </div>
</template>

<style scoped>
.journal-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; container: journal / inline-size; align-items: start; }
.span-full { grid-column: 1 / -1; }
.span-half { grid-column: span 6; }
@media (max-width: 1100px) {
  .journal-grid > * { grid-column: 1 / -1; }
}
</style>

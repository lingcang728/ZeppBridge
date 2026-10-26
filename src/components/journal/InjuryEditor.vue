<script setup lang="ts">
/* 伤病编辑：怎么了、哪儿（人形图点一处）、多重、哪天开始、好了没有。
   弹窗加宽，人形图单独占左栏、放大了好点（用户 2026-10-23：「屏幕这么大，点击区只占中间这么小一点」），
   其余字段在右栏；窄窗口退回上下一栏。 */
import { computed, ref, watch } from 'vue';
import BodyMap from './BodyMap.vue';
import EditorShell from './EditorShell.vue';
import GlassSwitch from '../GlassSwitch.vue';
import SegmentTrack from '../SegmentTrack.vue';
import DateRows from '../DateRows.vue';
import { useJournalText } from './journal.i18n';
import { useLogbook } from '../../composables/useLogbook';
import { backend } from '../../lib/bridge';
import type { InjuryInput } from '../../types/logbook';

const props = defineProps<{ injury: InjuryInput }>();
const emit = defineEmits<{ (event: 'close'): void }>();
const t = useJournalText();
const { busy, error, write } = useLogbook();

const draft = ref<InjuryInput>({ ...props.injury });
const local = ref<string | null>(null);
watch(() => props.injury, (injury) => { draft.value = { ...injury }; local.value = null; }, { immediate: true });

const parts = computed({
  get: () => (draft.value.body_part ? [draft.value.body_part] : []),
  set: (value: string[]) => { draft.value.body_part = value[0] ?? null; },
});
const severities = computed(() => [1, 2, 3].map(value => ({ value, label: (t.value.severities as Record<number, string>)[value] })));
const ongoing = computed({
  get: () => draft.value.end_date === null,
  set: (value: boolean) => { draft.value.end_date = value ? null : draft.value.start_date; },
});
// 开始日期滚过了好了的日子：好了的日子跟着走。
watch(() => draft.value.start_date, (start) => {
  if (draft.value.end_date && start && draft.value.end_date < start) draft.value.end_date = start;
});

async function save() {
  local.value = null;
  const title = draft.value.title.trim();
  if (!title || !draft.value.start_date) { local.value = t.value.required; return; }
  const input = { ...draft.value, title };
  if (await write(() => backend.injurySave(input), ['injuries'])) emit('close');
}
async function remove() {
  if (draft.value.id && await write(() => backend.injuryDelete(draft.value.id!), ['injuries'])) emit('close');
}
</script>

<template>
  <EditorShell :title="draft.id ? t.editInjury : t.addInjury" :busy="busy" :error="local ?? error" :can-delete="Boolean(draft.id)" :max-width="820"
    @save="save" @close="emit('close')" @remove="remove">
    <div class="injury-layout">
      <div class="field map-col"><span>{{ t.bodyPart }}</span><BodyMap v-model="parts" single /></div>
      <div class="form-col">
        <label>{{ t.injuryTitle }}<input v-model="draft.title" maxlength="120" required data-injury-title></label>
        <div class="field"><span>{{ t.severity }}</span>
          <SegmentTrack compact :model-value="draft.severity ?? 0" :items="severities" :aria-label="t.severity"
            @update:model-value="v => (draft.severity = Number(v) as 1 | 2 | 3)" />
        </div>
        <div class="check"><span>{{ t.stillHurting }}</span>
          <GlassSwitch :model-value="ongoing" :aria-label="t.stillHurting" @update:model-value="ongoing = !ongoing" />
        </div>
        <DateRows v-model:start="draft.start_date" v-model:end="draft.end_date" :start-label="t.startDate" :end-label="t.endDate" />
        <label>{{ t.notes }}<textarea v-model="draft.notes" rows="2" maxlength="2000"></textarea></label>
      </div>
    </div>
  </EditorShell>
</template>

<style scoped>
.injury-layout { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.form-col { display: grid; gap: 12px; min-width: 0; }
/* 人形图放大到这一栏的宽度，矮窗口按高度收，免得脚要滚下去才点得到。 */
.map-col { --bm-figure-max: 220px; --bm-figure-max-h: min(62vh, 560px); }
@media (max-width: 720px) { .injury-layout { grid-template-columns: minmax(0, 1fr); } }
</style>

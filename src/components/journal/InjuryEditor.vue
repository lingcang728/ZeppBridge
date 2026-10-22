<script setup lang="ts">
/* 伤病编辑：怎么了、哪儿（人形图点一处）、多重、哪天开始、好了没有。 */
import { computed, ref, watch } from 'vue';
import BodyMap from './BodyMap.vue';
import EditorShell from './EditorShell.vue';
import GlassSwitch from '../GlassSwitch.vue';
import SegmentTrack from '../SegmentTrack.vue';
import WheelDatePicker from '../WheelDatePicker.vue';
import DateRangeField from '../DateRangeField.vue';
import { useJournalText } from './journal.i18n';
import { useLogbook } from '../../composables/useLogbook';
import { backend } from '../../lib/bridge';
import { localDateString } from '../../lib/format';
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
  set: (value: boolean) => { draft.value.end_date = value ? null : localDateString(new Date()); },
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
  <EditorShell :title="draft.id ? t.editInjury : t.addInjury" :busy="busy" :error="local ?? error" :can-delete="Boolean(draft.id)"
    @save="save" @close="emit('close')" @remove="remove">
    <label>{{ t.injuryTitle }}<input v-model="draft.title" maxlength="120" required data-injury-title></label>
    <div class="field"><span>{{ t.bodyPart }}</span><BodyMap v-model="parts" single /></div>
    <div class="field"><span>{{ t.severity }}</span>
      <SegmentTrack compact :model-value="draft.severity ?? 0" :items="severities" :aria-label="t.severity"
        @update:model-value="v => (draft.severity = Number(v) as 1 | 2 | 3)" />
    </div>
    <!-- 还没好：只有开始日期、居中；好了：开始日期推到左边，「好了」那天从右边出来（DateRangeField）。 -->
    <div class="check"><span>{{ t.stillHurting }}</span>
      <GlassSwitch :model-value="ongoing" :aria-label="t.stillHurting" @update:model-value="ongoing = !ongoing" />
    </div>
    <DateRangeField :show-end="!ongoing">
      <template #start><div class="field"><span>{{ t.startDate }}</span><WheelDatePicker v-model="draft.start_date" :aria-label="t.startDate" /></div></template>
      <template #end><div class="field"><span>{{ t.endDate }}</span>
        <WheelDatePicker :model-value="draft.end_date ?? draft.start_date" :min="draft.start_date" :aria-label="t.endDate"
          @update:model-value="v => { if (draft.end_date !== null) draft.end_date = v; }" />
      </div></template>
    </DateRangeField>
    <label>{{ t.notes }}<textarea v-model="draft.notes" rows="2" maxlength="2000"></textarea></label>
  </EditorShell>
</template>

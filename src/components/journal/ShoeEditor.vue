<script setup lang="ts">
/* 跑鞋编辑：名字、用途、是否默认、登记前已跑多少、多少公里提醒退役、开始穿 / 退役的日子。
   从「Zepp 里记过的鞋」起名进来时带着 Zepp 鞋编号，存下就认上。 */
import { computed, ref, watch } from 'vue';
import EditorShell from './EditorShell.vue';
import GlassSwitch from '../GlassSwitch.vue';
import SegmentTrack from '../SegmentTrack.vue';
import DateRows from '../DateRows.vue';
import { useJournalText } from './journal.i18n';
import { useLogbook } from '../../composables/useLogbook';
import { backend } from '../../lib/bridge';
import type { ShoeInput, ShoeSport } from '../../types/logbook';

const props = defineProps<{ shoe: ShoeInput }>();
const emit = defineEmits<{ (event: 'close'): void }>();
const t = useJournalText();
const { busy, error, write } = useLogbook();

const draft = ref<ShoeInput>({ ...props.shoe });
const startKm = ref('');
const retireKm = ref('');
const local = ref<string | null>(null);
watch(() => props.shoe, (shoe) => {
  draft.value = { ...shoe };
  startKm.value = String(+shoe.start_km.toFixed(1));
  retireKm.value = String(+shoe.retire_km.toFixed(0));
  local.value = null;
}, { immediate: true });

const sports = computed(() => (['running', 'trail', 'walking', 'hiking'] as ShoeSport[]).map(value => ({ value, label: t.value.shoeSports[value] })));
const retired = computed({
  get: () => draft.value.retired_on !== null,
  set: (value: boolean) => {
    draft.value.retired_on = value ? draft.value.started_on : null;
    if (value) draft.value.is_default = false;
  },
});

watch(() => draft.value.started_on, start => { if (draft.value.retired_on && draft.value.retired_on < start) draft.value.retired_on = start; });

async function save() {
  local.value = null;
  const name = draft.value.name.trim();
  const start = Number(startKm.value || 0);
  const retire = Number(retireKm.value);
  if (!name || !draft.value.started_on || !Number.isFinite(start) || start < 0 || !(retire >= 100)) { local.value = t.value.required; return; }
  const input = { ...draft.value, name, start_km: start, retire_km: retire };
  if (await write(() => backend.shoeSave(input), ['shoes'])) emit('close');
}
async function remove() {
  if (draft.value.id && await write(() => backend.shoeDelete(draft.value.id!), ['shoes'])) emit('close');
}
</script>

<template>
  <EditorShell :title="draft.id ? t.editShoe : t.addShoe" :busy="busy" :error="local ?? error" :can-delete="Boolean(draft.id)"
    @save="save" @close="emit('close')" @remove="remove">
    <label>{{ t.shoeName }}<input v-model="draft.name" maxlength="80" required data-shoe-name></label>
    <div class="field"><span>{{ t.shoeSport }}</span>
      <SegmentTrack compact :model-value="draft.sport" :items="sports" :aria-label="t.shoeSport" @update:model-value="v => (draft.sport = v as ShoeSport)" />
    </div>
    <div class="check"><span>{{ t.isDefault }}</span>
      <GlassSwitch :model-value="draft.is_default" :disabled="retired" :aria-label="t.isDefault" @update:model-value="draft.is_default = !draft.is_default" />
    </div>
    <div class="pair">
      <label>{{ t.startKm }}<input v-model="startKm" class="num" inputmode="decimal"></label>
      <label>{{ t.retireKm }}<input v-model="retireKm" class="num" inputmode="numeric"><span class="hint">{{ t.retireHint }}</span></label>
    </div>
    <div class="check"><span>{{ t.retired }}</span>
      <GlassSwitch :model-value="retired" :aria-label="t.retired" @update:model-value="retired = !retired" />
    </div>
        <DateRows v-model:start="draft.started_on" v-model:end="draft.retired_on" :start-label="t.startedOn" :end-label="t.retiredOn" />
    <p v-if="draft.zepp_gear_id" class="hint">{{ t.zeppGear }} · {{ draft.zepp_gear_id }}</p>
    <label>{{ t.notes }}<textarea v-model="draft.notes" rows="2" maxlength="1000"></textarea></label>
  </EditorShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { tauriApi, toUserMessage } from '../composables/useTauriApi';
import { useSyncController } from '../composables/useSyncController';
import { useMessages } from '../i18n';
import { workoutLabel } from '../lib/labels';
import { lastWorkoutEditId as editId } from '../lib/workoutEditHistory';
import TypePicker from './workout/TypePicker.vue';
import { workoutToolsMessages } from './WorkoutTools.i18n';

const props = defineProps<{ ids: string[]; hidden?: boolean }>();
const emit = defineEmits<{ changed: [hidden: boolean | null] }>();
const t = useMessages(workoutToolsMessages);
const { markDataChanged } = useSyncController();
const busy = ref(false);
const error = ref('');
const note = ref('');
const selectedType = ref('');
const keys = ref<string[]>([]);
const options = computed(() => [{ value: '', label: t.value.type }, ...keys.value.map((key) => ({ value: key, label: workoutLabel(key) }))]);
onMounted(() => { void tauriApi.getWorkoutTypeOptions().then((items) => { keys.value = items.map((item) => item.key); }).catch((cause) => { error.value = toUserMessage(cause, t.value.failed); }); });
const apply = async (changeType: boolean, hidden: boolean | null, clear = false) => {
  if (busy.value || !props.ids.length) return;
  busy.value = true; error.value = ''; note.value = '';
  try {
    const result = await tauriApi.editWorkouts([...props.ids], changeType, clear ? null : selectedType.value || null, hidden);
    editId.value = result.id; note.value = t.value.saved(result.changed);
    markDataChanged(); emit('changed', hidden);
  } catch (cause) { error.value = toUserMessage(cause, t.value.failed); }
  finally { busy.value = false; }
};
const undo = async () => {
  if (!editId.value || busy.value) return;
  busy.value = true; error.value = '';
  try {
    const n = await tauriApi.undoWorkoutEdit(editId.value);
    editId.value = null; note.value = t.value.saved(n);
    markDataChanged(); emit('changed', null);
  } catch (cause) { error.value = toUserMessage(cause, t.value.failed); }
  finally { busy.value = false; }
};
</script>

<template>
  <div class="workout-tools">
    <div v-if="ids.length" class="tool-actions">
      <span class="selected-count" role="status" aria-live="polite">{{ t.selected(ids.length) }}</span>
      <TypePicker v-model="selectedType" :items="options" :label="t.type" :disabled="busy" />
      <button type="button" class="button secondary" :disabled="busy || !selectedType" @click="apply(true, null)">{{ t.apply }}</button>
      <button type="button" class="button secondary" :disabled="busy" @click="apply(true, null, true)">{{ t.clearType }}</button>
      <button type="button" class="button secondary" :disabled="busy" @click="apply(false, !hidden)">{{ hidden ? t.restore : t.hide }}</button>
    </div>
    <p v-if="ids.length && selectedType" class="hint-line" role="status" aria-live="polite">{{ t.preview(ids.length, workoutLabel(selectedType)) }}</p>
    <div v-if="editId || note" class="tool-actions" role="status">
      <span>{{ note }}</span><button v-if="editId" class="button secondary" type="button" :disabled="busy" @click="undo">{{ t.undo }}</button>
    </div>
    <p v-if="error" role="alert" class="api-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.workout-tools { display: grid; gap: 8px; margin-block: 12px; }
.tool-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.selected-count { font-variant-numeric: tabular-nums; }
.hint-line, .api-error { margin: 0; }
.tool-actions > * { max-width: 100%; overflow-wrap: anywhere; }
.button:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
</style>

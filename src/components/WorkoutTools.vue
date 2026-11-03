<script setup lang="ts">
/**
 * 改运动类型 / 在本机隐藏。两种用法：
 * - 列表里多选（默认）：选中了才从底部浮起一条操作栏，数字换的时候跳一下；改完只留「撤销」，不再念一句「已更新 N 条」。
 * - 详情页只操作这一条（`single`）：没有「已选 1 条」、也没有类型选择——改类型在头图的「我的纠正」里，
 *   这里只剩一个「在本机隐藏」（用户 2026-10-27：详情页别做成多选的样子，字也太多）。
 */
import { computed, onMounted, ref } from 'vue';
import { tauriApi, toUserMessage } from '../composables/useTauriApi';
import { useSyncController } from '../composables/useSyncController';
import { useMessages } from '../i18n';
import { workoutLabel } from '../lib/labels';
import { lastWorkoutEditId as editId } from '../lib/workoutEditHistory';
import TypePicker from './workout/TypePicker.vue';
import { workoutToolsMessages } from './WorkoutTools.i18n';

const props = defineProps<{ ids: string[]; hidden?: boolean; single?: boolean }>();
const emit = defineEmits<{ changed: [hidden: boolean | null] }>();
const t = useMessages(workoutToolsMessages);
const { markDataChanged } = useSyncController();
const busy = ref(false);
const error = ref('');
const selectedType = ref('');
const keys = ref<string[]>([]);
const options = computed(() => [{ value: '', label: t.value.type }, ...keys.value.map((key) => ({ value: key, label: workoutLabel(key) }))]);
onMounted(() => {
  if (props.single) return;
  void tauriApi.getWorkoutTypeOptions().then((items) => { keys.value = items.map((item) => item.key); }).catch((cause) => { error.value = toUserMessage(cause, t.value.failed); });
});
const apply = async (changeType: boolean, hidden: boolean | null, clear = false) => {
  if (busy.value || !props.ids.length) return;
  busy.value = true; error.value = '';
  try {
    const result = await tauriApi.editWorkouts([...props.ids], changeType, clear ? null : selectedType.value || null, hidden);
    editId.value = result.id;
    markDataChanged(); emit('changed', hidden);
  } catch (cause) { error.value = toUserMessage(cause, t.value.failed); }
  finally { busy.value = false; }
};
const undo = async () => {
  if (!editId.value || busy.value) return;
  busy.value = true; error.value = '';
  try {
    await tauriApi.undoWorkoutEdit(editId.value);
    editId.value = null;
    markDataChanged(); emit('changed', null);
  } catch (cause) { error.value = toUserMessage(cause, t.value.failed); }
  finally { busy.value = false; }
};
</script>

<template>
  <div v-if="single" class="workout-tools is-single">
    <button type="button" class="pill-button quiet" :disabled="busy" @click="apply(false, !hidden)">{{ hidden ? t.restore : t.hide }}</button>
    <p v-if="error" role="alert" class="api-error">{{ error }}</p>
  </div>
  <div v-else class="workout-tools">
    <Transition name="tool-bar">
      <div v-if="ids.length" class="tool-bar" role="toolbar" :aria-label="t.selected(ids.length)">
        <span class="count" aria-live="polite"><Transition name="count-bump" mode="out-in"><b :key="ids.length">{{ ids.length }}</b></Transition><span class="sr-only">{{ t.selected(ids.length) }}</span></span>
        <TypePicker v-model="selectedType" :items="options" :label="t.type" :disabled="busy" />
        <button type="button" class="pill-button" :disabled="busy || !selectedType" @click="apply(true, null)">{{ t.apply }}</button>
        <button type="button" class="pill-button quiet" :disabled="busy" @click="apply(true, null, true)">{{ t.clearType }}</button>
        <button type="button" class="pill-button quiet" :disabled="busy" @click="apply(false, !hidden)">{{ hidden ? t.restore : t.hide }}</button>
      </div>
    </Transition>
    <div v-if="editId && !ids.length" class="tool-undo"><button class="pill-button quiet" type="button" :disabled="busy" @click="undo">{{ t.undo }}</button></div>
    <p v-if="error" role="alert" class="api-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.workout-tools { display: grid; gap: 8px; }
.workout-tools.is-single { display: inline-flex; align-items: center; gap: 8px; }
.api-error { margin: 0; color: var(--warning); font-size: var(--fs-sm); }
/* 多选的操作栏浮在列表底部：选中第一条时从下面弹上来，全部取消再沉下去。 */
.workout-tools:not(.is-single) { position: sticky; bottom: 16px; z-index: 5; }
.tool-bar { justify-self: center; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; max-width: 100%;
  padding: 6px 8px 6px 6px; border-radius: 999px; background: var(--mat-glass-strong); box-shadow: var(--mat-glass-shadow), inset 0 0 0 1px var(--mat-glass-line); }
.count { display: grid; place-items: center; min-width: 34px; height: 34px; padding: 0 10px; border-radius: 999px; background: var(--accent); color: var(--accent-ink); font-variant-numeric: tabular-nums; }
.count b { font-weight: 600; }
.tool-bar .pill-button, .tool-bar :deep(.type-picker) { font-weight: 500; }
.tool-undo { justify-self: start; }
.tool-bar-enter-active { transition: transform 420ms cubic-bezier(.2, 1.3, .4, 1), opacity 240ms ease; }
.tool-bar-leave-active { transition: transform 260ms ease-in, opacity 200ms ease-in; }
.tool-bar-enter-from, .tool-bar-leave-to { transform: translateY(24px) scale(.94); opacity: 0; }
.count-bump-enter-active { transition: transform 260ms cubic-bezier(.2, 1.6, .4, 1), opacity 120ms ease; }
.count-bump-leave-active { transition: transform 120ms ease-in, opacity 120ms ease-in; }
.count-bump-enter-from { transform: translateY(6px) scale(.6); opacity: 0; }
.count-bump-leave-to { transform: translateY(-6px) scale(.6); opacity: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .tool-bar-enter-active, .tool-bar-leave-active, .count-bump-enter-active, .count-bump-leave-active { transition: none; } }
</style>

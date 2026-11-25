<script setup lang="ts">
/**
 * 改运动类型 / 在本机隐藏。两种用法：
 * - 列表里多选（默认）：进入选择就从底部浮起一条有底的操作栏（半悬浮层，带模糊），数字换的时候跳一下；
 *   「全选已加载 / 清空」也在这条栏里。改完只留一枚「撤销」浮条，不再念一句「已更新 N 条」。
 * - 详情页只操作这一条（`single`）：没有「已选 1 条」、也没有类型选择——改类型在头图的「我的纠正」里，
 *   这里只剩一个「在本机隐藏」（详情页别做成多选的样子，字也太多）。
 */
import { computed, onMounted, ref } from 'vue';
import { open as showOpenDialog } from '@tauri-apps/plugin-dialog';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { useSyncController } from '../composables/useSyncController';
import { useMessages } from '../i18n';
import { workoutLabel } from '../lib/labels';
import { lastWorkoutEditId as editId } from '../lib/workoutEditHistory';
import TypePicker from './workout/TypePicker.vue';
import Icon from './Icon.vue';
import { workoutToolsMessages } from './WorkoutTools.i18n';

/** `selecting`：列表正在选择模式（一条没选也浮起操作栏，好点「全选」）。 */
const props = defineProps<{ ids: string[]; hidden?: boolean; single?: boolean; selecting?: boolean }>();
const emit = defineEmits<{ changed: [hidden: boolean | null]; 'select-all': []; clear: [] }>();
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
/** 选中的运动各存一个 .fit 到同一个文件夹；一条失败不拦后面的，最后报存了几个、失败几条。 */
const canExportFit = isTauri();
const fitProgress = ref<{ done: number; total: number } | null>(null);
const note = ref('');
const exportFit = async () => {
  if (busy.value || !props.ids.length) return;
  const ids = [...props.ids];
  error.value = ''; note.value = '';
  let directory: string | null = null;
  try {
    const picked = await showOpenDialog({ title: t.value.exportFitTitle, directory: true, multiple: false });
    directory = typeof picked === 'string' ? picked : null;
  } catch (cause) { error.value = toUserMessage(cause, t.value.exportFitFailed); return; }
  if (!directory) return;
  busy.value = true;
  let saved = 0;
  let lastError: unknown = null;
  fitProgress.value = { done: 0, total: ids.length };
  try {
    for (const [index, workoutId] of ids.entries()) {
      try {
        await tauriApi.saveFitExport({ scope: { kind: 'workout', workoutId }, dataTypes: ['workouts'], detail: 'full' }, directory);
        saved += 1;
      } catch (cause) { lastError = cause; }
      fitProgress.value = { done: index + 1, total: ids.length };
    }
  } finally { busy.value = false; fitProgress.value = null; }
  if (saved) note.value = t.value.exportedFit(saved, ids.length - saved);
  else error.value = toUserMessage(lastError, t.value.exportFitFailed);
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
    <Transition name="tool-bar" mode="out-in">
      <div v-if="selecting || ids.length" key="bar" class="tool-bar" role="toolbar" :aria-label="t.selected(ids.length)">
        <div class="tool-group">
          <span :class="['count', { empty: !ids.length }]" aria-live="polite"><Icon name="circle-check" :size="15" /><Transition name="count-bump" mode="out-in"><b :key="ids.length">{{ ids.length }}</b></Transition><span class="sr-only">{{ t.selected(ids.length) }}</span></span>
          <button v-if="selecting" type="button" class="tool-button" @click="ids.length ? emit('clear') : emit('select-all')">{{ ids.length ? t.clearSelection : t.selectLoaded }}</button>
          <!-- 还在选择里、刚改完一批（勾选已清空）：撤销就放在这条栏上，不用先退出选择。 -->
          <button v-if="editId && !ids.length" type="button" class="tool-button" :disabled="busy" @click="undo"><Icon name="undo" :size="14" />{{ t.undo }}</button>
        </div>
        <span class="tool-sep" aria-hidden="true" />
        <div class="tool-group">
          <TypePicker v-model="selectedType" :items="options" :label="t.type" :disabled="busy || !ids.length" />
          <button type="button" class="tool-button is-accent" :disabled="busy || !ids.length || !selectedType" @click="apply(true, null)">{{ t.apply }}</button>
          <button type="button" class="tool-button" :disabled="busy || !ids.length" @click="apply(true, null, true)">{{ t.clearType }}</button>
        </div>
        <span class="tool-sep" aria-hidden="true" />
        <div class="tool-group">
          <button type="button" class="tool-button" :disabled="busy || !ids.length" @click="apply(false, !hidden)">{{ hidden ? t.restore : t.hide }}</button>
          <!-- 已隐藏的记录本来就不进导出，那一页不给这个按钮。 -->
          <button v-if="canExportFit && !hidden" type="button" class="tool-button" :disabled="busy || !ids.length" @click="exportFit">{{ fitProgress ? t.exportingFit(fitProgress.done, fitProgress.total) : t.exportFit }}</button>
        </div>
      </div>
      <div v-else-if="editId" key="undo" class="tool-bar is-undo">
        <span class="undo-glyph" aria-hidden="true"><Icon name="undo" :size="15" /></span>
        <button class="tool-button" type="button" :disabled="busy" @click="undo">{{ t.undo }}</button>
      </div>
    </Transition>
    <Transition name="tool-note"><p v-if="note" role="status" class="tool-note">{{ note }}</p></Transition>
    <p v-if="error" role="alert" class="api-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.workout-tools { display: grid; gap: 8px; }
.workout-tools.is-single { display: inline-flex; align-items: center; gap: 8px; }
.api-error { margin: 0; color: var(--warning); font-size: var(--fs-sm); }
.tool-note, .workout-tools:not(.is-single) > .api-error { justify-self: center; margin: 0; padding: 5px 14px; border-radius: 999px; background: var(--mat-glass-strong);
  -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur); box-shadow: var(--mat-glass-shadow), inset 0 0 0 1px var(--mat-glass-line); color: var(--muted); font-size: var(--fs-sm); }
.workout-tools:not(.is-single) > .api-error { color: var(--warning); }
/* 多选的操作栏浮在列表底部：进入选择时从下面弹上来，退出再沉下去。它是半悬浮层，背后的列表一直看得见，
   所以留磨砂（和弹窗、说明浮层一档）；底色够实，压在列表行上也读得清。放不下时按组折行，圆角跟着变小。 */
.workout-tools:not(.is-single) { position: sticky; bottom: 16px; z-index: 5; justify-items: center; pointer-events: none; }
.workout-tools:not(.is-single) > * { pointer-events: auto; }
.tool-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px 4px; box-sizing: border-box; max-width: min(100%, 1080px);
  padding: 6px; border-radius: 26px; background: var(--mat-glass-strong);
  -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur);
  box-shadow: var(--mat-glass-shadow), 0 18px 40px -18px rgba(0, 0, 0, .55), inset 0 0 0 1px var(--mat-glass-line); }
/* 已选几条：一枚和其他按钮同高的淡色胶囊，勾 + 数字，不再是一大坨实心绿。一条没选时整枚变淡。 */
.count { display: inline-flex; align-items: center; gap: 6px; min-width: 34px; height: 34px; padding: 0 13px 0 10px; box-sizing: border-box; border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent); color: var(--ink); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; transition: background var(--dur-fast) ease, box-shadow var(--dur-fast) ease; }
.count svg { color: var(--accent); }
.count b { display: inline-block; min-width: 1ch; font-weight: 700; }
.count.empty { background: color-mix(in srgb, var(--ink) 6%, transparent); box-shadow: none; color: var(--muted); }
.count.empty svg { color: var(--subtle); }
.tool-group { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px; min-width: 0; }
/* 组与组之间只留空，不画竖线：折行时竖线会挂在行尾。 */
.tool-sep { width: 8px; height: 1px; }
.tool-button { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; max-width: 100%; padding: 0 14px; border: 0; border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 7%, transparent); color: var(--ink); font: inherit; font-size: var(--fs-xs); font-weight: 600;
  white-space: nowrap; cursor: pointer; transition: background var(--dur-fast) ease, color var(--dur-fast) ease, opacity var(--dur-fast) ease, scale var(--dur-fast) var(--ease-out); }
.tool-button:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 13%, transparent); }
.tool-button:active:not(:disabled) { scale: .96; }
.tool-button:disabled { opacity: .42; cursor: default; }
.tool-button.is-accent:not(:disabled) { background: var(--accent); color: var(--accent-ink); }
.tool-button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.tool-bar :deep(.type-picker) { max-width: 100%; min-height: 34px; padding: 0 12px 0 14px; background: color-mix(in srgb, var(--ink) 7%, transparent); box-shadow: none; font-weight: 600; }
.tool-bar :deep(.type-picker:disabled) { opacity: .42; cursor: default; filter: none; }
.tool-bar.is-undo { gap: 2px; padding: 4px 4px 4px 12px; border-radius: 999px; }
.undo-glyph { display: grid; place-items: center; color: var(--accent); }
.tool-bar.is-undo .tool-button { background: transparent; }
.tool-bar.is-undo .tool-button:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 9%, transparent); }
/* 底部导航挪到窗口底下时（窄窗，或顶栏放不下：shell.css 的 nav-at-bottom），操作栏浮在导航上面，不被它盖住。 */
@media (max-width: 760px) { .workout-tools:not(.is-single) { bottom: calc(84px + env(safe-area-inset-bottom)); } }
:root.nav-at-bottom .workout-tools:not(.is-single) { bottom: calc(84px + env(safe-area-inset-bottom)); }
/* 列表里的操作栏从左下托盘那里长出来、退出选择时原路缩回托盘（托盘在页面左下角，栏在底部居中）。只动 transform、opacity。 */
.tool-bar-enter-active { transform-origin: 0% 100%; transition: transform 460ms cubic-bezier(.32, .72, .24, 1), opacity 220ms ease; }
.tool-bar-leave-active { transform-origin: 0% 100%; transition: transform 300ms cubic-bezier(.4, 0, .6, 1), opacity 200ms ease 80ms; }
.tool-bar-enter-from, .tool-bar-leave-to { transform: translate(-38%, 6px) scale(.25, .6); opacity: 0; }
.tool-note-enter-active, .tool-note-leave-active { transition: transform 300ms var(--ease-out), opacity 220ms ease; }
.tool-note-enter-from, .tool-note-leave-to { transform: translateY(8px); opacity: 0; }
.count-bump-enter-active { transition: transform 260ms cubic-bezier(.2, 1.6, .4, 1), opacity 120ms ease; }
.count-bump-leave-active { transition: transform 120ms ease-in, opacity 120ms ease-in; }
.count-bump-enter-from { transform: translateY(6px) scale(.6); opacity: 0; }
.count-bump-leave-to { transform: translateY(-6px) scale(.6); opacity: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .tool-bar-enter-active, .tool-bar-leave-active, .tool-note-enter-active, .tool-note-leave-active, .count-bump-enter-active, .count-bump-leave-active { transition: none; } }
</style>

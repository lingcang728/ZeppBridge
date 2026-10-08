<script setup lang="ts">
/**
 * 右牌的回执那一面（2026-10-08）：按过门锁以后落下来的那张牌。它本身就是交出去的 `.md` 文件卡——
 * 按住文件块直接拖进 AI 的对话框（系统拖放，同旧底栏），拖不了就在资源管理器里选中它。
 * 还能再复制开场白 / 再打开网站；某一步失败就地写原因和重试；改问题翻回问题牌；AI 谈妥以后在这里接回定稿。
 */
import { computed, ref } from 'vue';
import Icon from '../../Icon.vue';
import HandoffSteps from '../HandoffSteps.vue';
import ReceiveCapsule from '../bridge/ReceiveCapsule.vue';
import { isDesktop } from '../../../lib/bridge';
import { startFileDrag } from '../../../lib/dragOut';
import { formatBytes } from '../../../lib/format';
import { formatTokens } from '../../../lib/aiTask/budget';
import type { AiTaskPrepareResult } from '../../../lib/bridge/types';
import type { HandoffStep, HandoffStepId } from '../../../composables/useAiTaskHandoff';
import { useHandoffText } from '../HandoffDock.i18n';
import { useStageText } from './stage.i18n';

const props = defineProps<{
  ready: AiTaskPrepareResult | null; provider: string; stale: boolean; recalled: boolean;
  steps: Record<HandoffStepId, HandoffStep>; saveError: string | null; question: string;
}>();
const emit = defineEmits<{ copy: []; open: []; reveal: []; retry: [HandoffStepId]; edit: []; received: [] }>();
const t = useHandoffText();
const s = useStageText();
const desktop = isDesktop();
const fileName = computed(() => props.ready?.md_path?.split(/[\\/]/).pop() ?? '');
const dragFailed = ref(false);
const failed = computed(() => Object.values(props.steps).some((step) => step.state === 'failed'));
const onFileDrag = (event: MouseEvent) => {
  const path = props.ready?.md_path;
  if (!desktop || !path || event.button !== 0) return;
  dragFailed.value = false;
  startFileDrag(path, fileName.value).catch(() => { dragFailed.value = true; });
};
</script>

<template>
  <div class="receipt">
    <header>
      <span class="stamp"><Icon name="check" :size="15" /></span>
      <div><h3>{{ s.receiptTitle(provider) }}</h3><p v-if="question">{{ question }}</p></div>
    </header>
    <div v-if="ready?.md_path" :class="['file', { draggable: desktop }]" role="button" tabindex="0" :aria-label="t.fileAria(fileName)"
      @mousedown="onFileDrag" @keydown.enter.prevent="emit('reveal')">
      <Icon name="file" :size="26" class="file-icon" />
      <span class="file-copy"><strong>{{ fileName }}</strong><small>{{ t.fileMeta(formatBytes(ready.byte_len), formatTokens(ready.markdown?.approx_tokens ?? 0)) }}</small></span>
      <Icon name="dots" :size="16" class="grip" />
    </div>
    <p v-else-if="ready" class="note">{{ t.outputAt(ready.output_dir) }}</p>
    <p class="lead">{{ s.receiptLead }}</p>
    <p v-if="recalled" class="note warn"><Icon name="info" :size="13" />{{ s.notOpened }}</p>
    <p v-if="stale" class="note warn"><Icon name="warning" :size="13" />{{ t.stale }}</p>
    <p v-if="dragFailed" class="note warn"><Icon name="warning" :size="13" />{{ t.dragFailed }}</p>
    <p v-if="saveError" class="note warn"><Icon name="warning" :size="13" />{{ saveError }}</p>
    <HandoffSteps v-if="failed" class="steps" :steps="steps" :provider-label="provider" @retry="emit('retry', $event)" />
    <div class="actions">
      <button type="button" class="pill-button quiet" @click="emit('copy')"><Icon name="copy" :size="13" />{{ s.copyAgain }}</button>
      <button type="button" class="pill-button quiet" @click="emit('open')"><Icon name="external" :size="13" />{{ s.openAgain(provider) }}</button>
      <button type="button" class="pill-button quiet" @click="emit('reveal')"><Icon name="folder" :size="13" />{{ t.revealFile }}</button>
    </div>
    <footer>
      <button type="button" class="edit" @click="emit('edit')"><Icon name="edit" :size="13" />{{ s.editQuestion }}</button>
      <ReceiveCapsule compact @received="emit('received')" />
    </footer>
  </div>
</template>

<style scoped>
.receipt { display: grid; grid-template-rows: auto auto auto auto 1fr auto; gap: 10px; height: 100%; min-height: 0; }
header { display: flex; gap: 10px; align-items: flex-start; }
.stamp { display: grid; flex: none; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
h3 { margin: 0; font-size: var(--fs-md); font-weight: 700; }
header p { display: -webkit-box; margin: 3px 0 0; overflow: hidden; color: var(--muted); font-size: var(--fs-xs); line-height: 1.4; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.file { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.file.draggable { cursor: grab; }
.file.draggable:active { cursor: grabbing; }
.file:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.file-icon { color: var(--accent); }
.file-copy { display: grid; min-width: 0; }
.file-copy strong { overflow: hidden; font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.file-copy small { color: var(--subtle); font-size: var(--fs-2xs); }
.grip { color: var(--subtle); }
.lead { margin: 0; color: var(--subtle); font-size: var(--fs-2xs); line-height: 1.45; }
.note { display: flex; gap: 6px; align-items: flex-start; margin: 0; color: var(--muted); font-size: var(--fs-2xs); line-height: 1.4; }
.note.warn { color: var(--warning); }
.steps { font-size: var(--fs-2xs); }
.actions { display: flex; flex-wrap: wrap; align-content: flex-end; gap: 6px; }
.actions .pill-button { gap: 5px; font-size: var(--fs-2xs); }
footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; border-top: 1px solid var(--mat-line); }
.edit { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font-size: var(--fs-2xs); cursor: pointer; }
.edit:hover { background: var(--glass-press); color: var(--ink); }
</style>

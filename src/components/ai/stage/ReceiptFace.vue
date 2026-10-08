<script setup lang="ts">
/**
 * 右牌的回执那一面（2026-10-08；同日第二轮按用户反馈理过：去掉一排绿色小图标和底下那行杂字）。
 *
 *   [这家 AI 的图标]  已交给 ChatGPT          改问题
 *                     问的那一句
 *   ┌ 交出去的 .md 文件（按住拖进对话框；⋯ = 在资源管理器里选中）┐
 *   一行提示 · 有问题才多一行
 *   [ 再复制开场白 ] [ 再打开 ChatGPT ]
 *   [              接回定稿              ]
 *
 * 它本身就是交出去的文件卡：拖不了就在资源管理器里选中它。某一步失败就地写原因和重试。
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
  ready: AiTaskPrepareResult | null; provider: string; providerIcon: string; stale: boolean; recalled: boolean;
  steps: Record<HandoffStepId, HandoffStep>; saveError: string | null; question: string;
}>();
const emit = defineEmits<{ copy: []; open: []; reveal: []; retry: [HandoffStepId]; edit: []; received: [] }>();
const t = useHandoffText();
const s = useStageText();
const desktop = isDesktop();
const fileName = computed(() => props.ready?.md_path?.split(/[\\/]/).pop() ?? '');
const dragFailed = ref(false);
const failed = computed(() => Object.values(props.steps).some((step) => step.state === 'failed'));
/** 只留一句最要紧的提醒：收回了 > 文件旧了 > 拖不出去 > 任务没存上。 */
const note = computed(() => (props.recalled ? s.value.notOpened : props.stale ? t.value.stale : dragFailed.value ? t.value.dragFailed : props.saveError));
const onFileDrag = (event: MouseEvent) => {
  const path = props.ready?.md_path;
  if (!desktop || !path || event.button !== 0 || (event.target as HTMLElement).closest('.reveal')) return;
  dragFailed.value = false;
  startFileDrag(path, fileName.value).catch(() => { dragFailed.value = true; });
};
</script>

<template>
  <div class="receipt">
    <header>
      <span class="logo"><img :src="providerIcon" alt="" /></span>
      <div class="head-copy">
        <h3>{{ s.receiptTitle(provider) }}</h3>
        <p v-if="question">{{ question }}</p>
      </div>
      <button type="button" class="edit" @click="emit('edit')">{{ s.editQuestion }}</button>
    </header>

    <!-- 交出去的那份文件画成一页纸，占满牌的中间：按住它拖进对话框。 -->
    <div v-if="ready?.md_path" :class="['sheet', { draggable: desktop }]" role="button" tabindex="0" :aria-label="t.fileAria(fileName)" :title="s.receiptLead"
      @mousedown="onFileDrag" @keydown.enter.prevent="emit('reveal')">
      <button type="button" class="reveal" :title="t.revealFile" :aria-label="t.revealFile" @click.stop="emit('reveal')"><Icon name="dots" :size="16" /></button>
      <span class="sheet-lines" aria-hidden="true"><i v-for="n in 5" :key="n"></i></span>
      <span class="sheet-tag" aria-hidden="true">.md</span>
      <span class="sheet-copy"><strong>{{ fileName }}</strong><small>{{ t.fileMeta(formatBytes(ready.byte_len), formatTokens(ready.markdown?.approx_tokens ?? 0)) }}</small></span>
    </div>
    <p v-else-if="ready" class="hint">{{ t.outputAt(ready.output_dir) }}</p>
    <p class="hint lead">{{ s.receiptLead }}</p>
    <p v-if="note" class="note" role="status">{{ note }}</p>
    <HandoffSteps v-if="failed" class="steps" :steps="steps" :provider-label="provider" @retry="emit('retry', $event)" />

    <div class="actions">
      <button type="button" class="pill-button quiet" @click="emit('copy')">{{ s.copyAgain }}</button>
      <button type="button" class="pill-button quiet" @click="emit('open')">{{ s.openAgain(provider) }}</button>
    </div>
    <ReceiveCapsule class="receive-row" @received="emit('received')" />
  </div>
</template>

<style scoped>
/* 一条竖的节奏：每块之间同一个 14px，提示和它说的那块之间 8px；动作挤在牌底。 */
.receipt { display: flex; flex-direction: column; gap: 14px; height: 100%; min-height: 0; }
header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: start; }
.logo { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--mat-raised); box-shadow: var(--mat-raised-rim); }
.logo img { width: 22px; height: 22px; border-radius: 5px; object-fit: contain; }
.head-copy { min-width: 0; padding-top: 1px; }
h3 { margin: 0; font-size: var(--fs-md); font-weight: 700; line-height: 1.3; }
.head-copy p { display: -webkit-box; margin: 4px 0 0; overflow: hidden; color: var(--muted); font-size: var(--fs-xs); line-height: 1.45; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.edit { padding: 4px 2px; border: 0; background: none; color: var(--subtle); font-size: var(--fs-2xs); cursor: pointer; white-space: nowrap; }
.edit:hover { color: var(--ink); }
.edit:focus-visible, .reveal:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 6px; }
.sheet { position: relative; display: grid; flex: 1 1 auto; grid-template-rows: 1fr auto auto; gap: 10px; min-height: 120px; padding: 18px 18px 14px;
  border-radius: 6px 22px 6px 6px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
/* 折角：右上角一小块翻过来的纸。 */
.sheet::after { content: ''; position: absolute; top: 0; right: 0; width: 22px; height: 22px; border-radius: 0 22px 0 6px; background: var(--mat-raised); box-shadow: var(--mat-raised-rim); }
.sheet.draggable { cursor: grab; }
.sheet.draggable:active { cursor: grabbing; }
.sheet:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.sheet-lines { display: grid; align-content: start; gap: 8px; padding-top: 6px; }
.sheet-lines i { height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--ink) 7%, transparent); }
.sheet-lines i:nth-child(2) { width: 82%; }
.sheet-lines i:nth-child(4) { width: 64%; }
.sheet-lines i:nth-child(5) { width: 40%; }
.sheet-tag { justify-self: start; padding: 2px 8px; border-radius: 6px; background: var(--mat-raised); box-shadow: var(--mat-raised-rim); color: var(--muted); font: 700 10px var(--font-mono); }
.sheet-copy { display: grid; gap: 2px; min-width: 0; padding-right: 30px; }
.sheet-copy strong { overflow: hidden; font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.sheet-copy small { color: var(--subtle); font-size: var(--fs-2xs); }
.reveal { position: absolute; z-index: 1; right: 8px; bottom: 12px; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--subtle); cursor: pointer; }
.reveal:hover { background: var(--glass-press); color: var(--ink); }
.hint { margin: -4px 0 0; color: var(--subtle); font-size: var(--fs-2xs); line-height: 1.5; }
.note { margin: -6px 0 0; color: var(--warning); font-size: var(--fs-2xs); line-height: 1.5; }
.steps { font-size: var(--fs-2xs); }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.actions .pill-button { justify-content: center; min-width: 0; overflow: hidden; font-size: var(--fs-2xs); text-overflow: ellipsis; white-space: nowrap; }
/* 接回定稿：牌底一整条，和上面两枚是同一种胶囊，只是更重一点；提示字进 title，不再在下面另起一行。 */
.receive-row :deep(.receive-capsule) { justify-content: center; width: 100%; min-height: 40px; }
.receive-row :deep(.receive-capsule > svg:last-child) { display: none; }
.receive-row :deep(p) { display: none; }
</style>

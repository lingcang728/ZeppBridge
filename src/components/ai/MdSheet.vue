<script setup lang="ts">
/**
 * 运动页「问 AI」准备好的那一份 .md：和交给 AI 回执上的纸片同一张，按住拖进网页。
 * 不自动打开网站。复制、在资源管理器里选中、打开网站都是人手点的。
 */
import { computed, ref } from 'vue';
import Icon from '../Icon.vue';
import { isDesktop } from '../../lib/bridge';
import { startFileDrag } from '../../lib/dragOut';
import { formatBytes } from '../../lib/format';
import { formatTokens } from '../../lib/aiTask/budget';
import { aiTaskIssueText } from '../../lib/aiTask/copy';
import type { AiTaskPrepareResult } from '../../lib/bridge/types';
import { useHandoffText } from './HandoffDock.i18n';
import { useStageText } from './stage/stage.i18n';

const props = defineProps<{
  busy: boolean;
  result: AiTaskPrepareResult | null;
  error: string | null;
  provider: string;
  providerIcon: string;
}>();
const emit = defineEmits<{ copy: []; open: []; reveal: [] }>();
const t = useHandoffText();
const s = useStageText();
const desktop = isDesktop();
const fileName = computed(() => props.result?.md_path?.split(/[\\/]/).pop() ?? '');
const dragFailed = ref(false);
const blocked = computed(() => (props.result?.status === 'blocked' ? props.result.blocked : []));
const ready = computed(() => (props.result?.status === 'ready' && props.result.md_path ? props.result : null));

const onFileDrag = (event: MouseEvent) => {
  const path = ready.value?.md_path;
  if (!desktop || !path || event.button !== 0 || (event.target as HTMLElement).closest('.reveal')) return;
  dragFailed.value = false;
  startFileDrag(path, fileName.value).catch(() => { dragFailed.value = true; });
};
</script>

<template>
  <div class="md-sheet">
    <h2 class="md-title" data-pop-item>
      <img v-if="providerIcon" :src="providerIcon" alt="" />
      <Icon v-else name="spark" :size="16" />
      {{ s.lock(provider) }}
    </h2>
    <p v-if="busy" class="md-hint" data-pop-item>{{ s.lockBusy }}</p>
    <ul v-else-if="blocked.length" class="md-issues" role="alert" data-pop-item>
      <li v-for="(issue, i) in blocked" :key="i"><Icon name="warning" :size="13" />{{ aiTaskIssueText(issue) }}</li>
    </ul>
    <template v-else-if="ready">
      <div :class="['sheet', { draggable: desktop }]" role="button" tabindex="0" data-pop-item :aria-label="t.fileAria(fileName)" :title="s.receiptLead"
        @mousedown="onFileDrag" @keydown.enter.prevent="emit('reveal')">
        <button type="button" class="reveal" :title="t.revealFile" :aria-label="t.revealFile" @click.stop="emit('reveal')"><Icon name="dots" :size="16" /></button>
        <span class="sheet-lines" aria-hidden="true"><i v-for="n in 4" :key="n"></i></span>
        <span class="sheet-tag" aria-hidden="true">.md</span>
        <span class="sheet-copy"><strong>{{ fileName }}</strong><small>{{ t.fileMeta(formatBytes(ready.byte_len), formatTokens(ready.markdown?.approx_tokens ?? 0)) }}</small></span>
      </div>
      <p class="md-hint" data-pop-item>{{ s.receiptLead }}</p>
    </template>
    <p v-if="error || dragFailed" class="md-note" role="status" data-pop-item>{{ dragFailed ? t.dragFailed : error }}</p>
    <div v-if="ready" class="md-actions" data-pop-item>
      <button type="button" class="pill-button quiet" @click="emit('copy')">{{ s.copyAgain }}</button>
      <button type="button" class="pill-button quiet" @click="emit('open')">{{ s.openAgain(provider) }}</button>
    </div>
  </div>
</template>

<style scoped>
.md-sheet { display: grid; gap: 12px; }
.md-title { display: flex; align-items: center; gap: 8px; margin: 0; font-size: var(--fs-md); line-height: 1.3; }
.md-title img { width: 18px; height: 18px; border-radius: 4px; object-fit: contain; }
.md-title :deep(svg) { color: var(--accent); }
.md-hint { margin: 0; color: var(--subtle); font-size: var(--fs-2xs); line-height: 1.5; }
.md-note { margin: 0; color: var(--warning); font-size: var(--fs-2xs); line-height: 1.5; }
.md-issues { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; color: var(--danger); font-size: var(--fs-xs); }
.md-issues li { display: flex; align-items: flex-start; gap: 6px; }
.sheet { position: relative; display: grid; grid-template-rows: 1fr auto auto; gap: 10px; min-height: 108px; padding: 16px 16px 12px;
  border-radius: 6px 22px 6px 6px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.sheet::after { content: ''; position: absolute; top: 0; right: 0; width: 22px; height: 22px; border-radius: 0 22px 0 6px; background: var(--mat-raised); box-shadow: var(--mat-raised-rim); }
.sheet.draggable { cursor: grab; }
.sheet.draggable:active { cursor: grabbing; }
.sheet:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.sheet-lines { display: grid; align-content: start; gap: 8px; padding-top: 4px; }
.sheet-lines i { height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--ink) 7%, transparent); }
.sheet-lines i:nth-child(2) { width: 82%; }
.sheet-lines i:nth-child(4) { width: 48%; }
.sheet-tag { justify-self: start; padding: 2px 8px; border-radius: 6px; background: var(--mat-raised); box-shadow: var(--mat-raised-rim); color: var(--muted); font: 700 10px var(--font-mono); }
.sheet-copy { display: grid; gap: 2px; min-width: 0; padding-right: 30px; }
.sheet-copy strong { overflow: hidden; font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.sheet-copy small { color: var(--subtle); font-size: var(--fs-2xs); }
.reveal { position: absolute; z-index: 1; right: 8px; bottom: 10px; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--subtle); cursor: pointer; }
.reveal:hover { background: var(--glass-press); color: var(--ink); }
.reveal:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.md-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.md-actions .pill-button { justify-content: center; min-width: 0; overflow: hidden; font-size: var(--fs-2xs); text-overflow: ellipsis; white-space: nowrap; }
</style>

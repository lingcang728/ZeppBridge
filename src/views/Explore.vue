<script setup lang="ts">
/* 交给 AI（探索版）：左列模板 → 中列提示词与数据摘要 → 右列打包选项。
 *
 * 三列里的左右两列和日期范围行在 components/explore/，数据摘要的估算在
 * composables/useExplorePreview.ts。 */
import { computed, onActivated, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '../components/Icon.vue';
import CoverageNotice from '../components/CoverageNotice.vue';
import ExploreDateRange from '../components/explore/ExploreDateRange.vue';
import ExplorePackPanel from '../components/explore/ExplorePackPanel.vue';
import ExploreTemplatePicker from '../components/explore/ExploreTemplatePicker.vue';
import { useExport, type SaveFormat } from '../composables/useExport';
import { formatBytes, useExplorePreview } from '../composables/useExplorePreview';
import { readDefaultExportFormat } from '../lib/exportScope';
import { useSyncController } from '../composables/useSyncController';
import { isTauri } from '../composables/useTauriApi';
import { useLifeEvents } from '../composables/useLifeEvents';
import { useAiHandoff } from '../composables/useAiHandoff';
import { AI_PROVIDER_BY_ID, type AiProviderId } from '../lib/aiProviders';
import type { ExportScope, ExportSelection } from '../types';
import { exploreMessages, promptTemplates, type PromptTemplate } from './Explore.i18n';
import { intlLocale, locale, useMessages } from '../i18n';

defineOptions({ name: 'Explore' });

const t = useMessages(exploreMessages);
const { events: lifeEvents } = useLifeEvents();

const {
  exportStartDate,
  exportEndDate,
  exportDataTypes,
  exportDetail,
  focusedWorkoutId,
  exportBusy,
  exportError,
  exportMessage,
  applyExportRange,
  saveExportAs,
} = useExport();

const { dataRevision } = useSyncController();

/* 模板文案（含六段提示词）在 Explore.i18n.ts。 */
const templates = computed<PromptTemplate[]>(() => promptTemplates());

/* 从运动详情点「让 AI 展开分析」过来时，范围锁定在那一条记录上。
   互斥的 ExportScope 让「日期范围」和「单次运动」不可能同时生效，
   所以这里不需要任何优先级规则。 */
const route = useRoute();
/* 这一页被 KeepAlive 缓存，第二次进来不会重新挂载，所以锁定范围要在
   activated 时也读一遍 query，否则会沿用上一次的范围。 */
const readFocusFromRoute = () => {
  const workout = route.query.workout;
  focusedWorkoutId.value = typeof workout === 'string' && workout.trim() ? workout.trim() : null;
};
onMounted(readFocusFromRoute);
onActivated(readFocusFromRoute);
const currentScope = (): ExportScope => (focusedWorkoutId.value
  ? { kind: 'workout', workoutId: focusedWorkoutId.value }
  : { kind: 'dateRange', start: exportStartDate.value, end: exportEndDate.value });

const activeTemplateId = ref(templates.value[0].id);
const activeTemplate = computed(() =>
  templates.value.find((tpl) => tpl.id === activeTemplateId.value) ?? templates.value[0]);
const editedPrompt = ref(templates.value[0].prompt);
/* 换语言时，没动过的提示词跟着换成另一种语言的那一份；动过的一个字都不碰
   ——用户自己写的东西不该被一次语言切换抹掉。
   用一个「改过没有」的标记，而不是拿当前文本去和模板比对：切完语言之后
   模板已经是新语言了，比不出来。 */
const promptEdited = ref(false);
watch(locale, () => {
  if (!promptEdited.value) editedPrompt.value = activeTemplate.value.prompt;
});

const selectTemplate = (tpl: PromptTemplate) => {
  activeTemplateId.value = tpl.id;
  editedPrompt.value = tpl.prompt;
  promptEdited.value = false;
  exportDataTypes.value = [...tpl.types, ...(exportDataTypes.value.includes('life_events') ? ['life_events' as const] : [])];
};

/* ── 导出格式与目标工具 ────────────────── */
const activeFormat = ref<SaveFormat>(readDefaultExportFormat());
const activeFormatLabel = computed(() => activeFormat.value.toUpperCase());

const activeProviderId = ref<AiProviderId>('chatgpt');
const activeProvider = computed(() => AI_PROVIDER_BY_ID[activeProviderId.value]);

const { handoffState, handoffError, preparedProvider, prepareAndCopy, retryOpen } = useAiHandoff();

/* ── 数据感知摘要 ─────────────────────── */
const {
  previewBusy, previewError, previewCount, previewBytes,
  datesValid, scopeRangeText, scopeRangeSub, requestedSpanDays, loadPreview,
} = useExplorePreview({
  startDate: exportStartDate,
  endDate: exportEndDate,
  dataTypes: exportDataTypes,
  detail: exportDetail,
  focusedWorkoutId,
  currentScope,
  reloadOn: [dataRevision, lifeEvents],
});
const sendState = ref<'idle' | 'copied' | 'failed'>('idle');

const copyPrompt = async () => {
  try {
    await navigator.clipboard.writeText(editedPrompt.value);
    sendState.value = 'copied';
    window.setTimeout(() => { sendState.value = 'idle'; }, 2500);
  } catch {
    sendState.value = 'failed';
  }
};

const handoffNotice = ref<string | null>(null);

const sendNoticeTone = ref<'ok' | 'bad'>('ok');

const sendToAi = async () => {
  handoffNotice.value = null;
  sendNoticeTone.value = 'ok';
  if (!isTauri()) {
    sendNoticeTone.value = 'bad';
    handoffNotice.value = t.value.needDesktop;
    return;
  }
  if (!focusedWorkoutId.value && !datesValid.value) {
    sendNoticeTone.value = 'bad';
    handoffNotice.value = t.value.needValidDates;
    return;
  }
  if (!exportDataTypes.value.length) {
    sendNoticeTone.value = 'bad';
    handoffNotice.value = t.value.needDataTypes;
    return;
  }
  if (previewError.value) {
    sendNoticeTone.value = 'bad';
    handoffNotice.value = previewError.value;
    return;
  }
  if (previewBusy.value) {
    sendNoticeTone.value = 'bad';
    handoffNotice.value = t.value.stillReading;
    return;
  }
  if (previewCount.value === null) {
    sendNoticeTone.value = 'bad';
    handoffNotice.value = t.value.stillReading;
    return;
  }
  if (previewCount.value <= 0) {
    sendNoticeTone.value = 'bad';
    handoffNotice.value = t.value.nothingInScope;
    return;
  }

  const selection: ExportSelection = {
    scope: currentScope(),
    dataTypes: [...exportDataTypes.value],
    detail: exportDetail.value,
  };
  try {
    const result = await prepareAndCopy(
      activeProvider.value,
      selection,
      editedPrompt.value,
      false, // includePreciseRoute: 默认 false 隐私优先
    );
    const browserOpened = handoffState.value !== 'copied_only';
    sendNoticeTone.value = 'ok';
    if (result.mode === 'attachment') {
      const uploadNotice = t.value.attachmentNotice;
      handoffNotice.value = browserOpened
        ? t.value.attachmentOpened(uploadNotice, activeProvider.value.label)
        : t.value.attachmentNotOpened(uploadNotice, activeProvider.value.label);
    } else {
      handoffNotice.value = browserOpened
        ? t.value.copiedAndOpened(activeProvider.value.label)
        : t.value.copiedOnly(activeProvider.value.label);
    }
  } catch {
    // Error handled via handoffError state
  }
};

const retryOpenAi = async () => {
  try {
    await retryOpen();
    handoffNotice.value = t.value.reopened(preparedProvider.value?.label ?? activeProvider.value.label);
  } catch {
    // Error rendered from handoffError
  }
};

// 每种格式都走各自真实的转换与另存；选了 CSV/GPX 却拿到 JSON 属于骗用户。
const runExport = async () => {
  await saveExportAs(activeFormat.value);
};

</script>

<template>
  <section class="page export-page" aria-labelledby="export-title">
    <header class="page-head">
      <h1 id="export-title">{{ t.title }}</h1>
      <p class="page-intro">{{ t.intro }}</p>
    </header>

    <div v-if="focusedWorkoutId" class="workout-scope-banner" role="status">
      <Icon name="info" :size="14" />
      {{ t.workoutScopeBanner(focusedWorkoutId) }}
      <button class="button secondary" type="button" @click="focusedWorkoutId = null">{{ t.backToDateRange }}</button>
    </div>

    <div class="export-layout">
      <!-- 左列：模板列表 -->
      <ExploreTemplatePicker :templates="templates" :active-id="activeTemplateId" @select="selectTemplate" />

      <!-- 中列：提示词编辑与数据感知摘要 -->
      <div class="col-editor">
        <section class="surface-card pad current-template">
          <div class="current-head">
            <div>
              <p class="col-title">{{ t.currentTemplate }}</p>
              <h2 class="tpl-name">{{ activeTemplate.name }} <Icon name="edit" :size="15" /></h2>
              <p class="tpl-desc">{{ activeTemplate.sub }}</p>
            </div>
            <button class="mini-btn" type="button" @click="copyPrompt" :title="t.copyPromptTitle">
              <Icon name="copy" :size="13" />{{ t.copyPrompt }}
            </button>
          </div>

          <div class="prompt-editor">
            <div class="editor-head">
              <span>{{ t.promptEditor }}<em>{{ t.promptEditorHint }}</em></span>
              <span class="injected"><Icon name="database" :size="13" />{{ t.injected(exportDataTypes.length) }}</span>
            </div>
            <textarea
              v-model="editedPrompt"
              rows="9"
              spellcheck="false"
              :aria-label="t.promptEditorAria"
              @input="promptEdited = true"
            ></textarea>
          </div>

          <!-- 数据感知摘要（四格卡片） -->
          <div class="summary-block">
            <div class="summary-head">
              <span>{{ t.summaryTitle }} <Icon name="info" :size="13" /></span>
              <span class="see-more">{{ t.summaryHint }}</span>
            </div>
            <div class="summary-grid">
              <div class="summary-cell">
                <span class="cell-label"><Icon name="clock" :size="13" />{{ t.cellRange }}</span>
                <strong class="cell-value small">{{ scopeRangeText }}</strong>
                <span class="cell-sub">{{ scopeRangeSub }}</span>
              </div>
              <div class="summary-cell">
                <span class="cell-label"><Icon name="file" :size="13" />{{ t.cellCount }}</span>
                <strong class="cell-value font-mono">{{ previewBusy ? '…' : (previewCount === null ? '—' : previewCount.toLocaleString(intlLocale())) }}</strong>
                <span class="cell-sub">{{ t.cellCountSub }}</span>
              </div>
              <div class="summary-cell">
                <span class="cell-label"><Icon name="sliders" :size="13" />{{ t.cellTypes }}</span>
                <strong class="cell-value font-mono">{{ t.cellTypesValue(exportDataTypes.length) }}</strong>
                <span class="cell-sub">{{ t.cellTypesSub }}</span>
              </div>
              <div class="summary-cell">
                <span class="cell-label"><Icon name="database" :size="13" />{{ t.cellSize }}</span>
                <strong class="cell-value font-mono">{{ previewBusy ? '…' : formatBytes(previewBytes) }}</strong>
                <span class="cell-sub">{{ t.cellSizeSub }}</span>
              </div>
            </div>

            <p v-if="previewError" class="preview-error" role="alert">
              <Icon name="warning" :size="13" />
              <span>{{ previewError }}</span>
              <button class="button button-secondary" type="button" :disabled="previewBusy" @click="loadPreview">{{ t.previewRetry }}</button>
            </p>

            <CoverageNotice :requested-days="requestedSpanDays" />

            <!-- 范围选择与自定义日期选择器 -->
            <ExploreDateRange v-model:start="exportStartDate" v-model:end="exportEndDate" @range="applyExportRange" />
          </div>
        </section>

        <footer class="editor-footer surface-card">
          <p class="secure-note">
            <Icon name="shield" :size="14" />
            {{ t.secureNote }}
            <span class="secure-ok"><Icon name="circle-check" :size="13" />{{ t.secureOk }}</span>
          </p>
          <div class="footer-actions">
            <!-- 三个按钮做的是三件不同的事，名字得让人分得开：
                 「导出文件」存到磁盘、「只复制提示词」不含数据、
                 「交给 X」才是数据+提示词一起复制并打开那个网站。 -->
            <button class="button button-secondary" type="button" :disabled="Boolean(exportBusy)" @click="runExport">
              <Icon name="export" :size="14" />{{ t.exportFile(activeFormatLabel) }}
            </button>
            <button class="button button-secondary" type="button" @click="copyPrompt">
              <Icon name="copy" :size="14" />{{ t.copyPromptOnly }}
            </button>
            <button class="button button-primary send-btn" type="button" :disabled="handoffState === 'preparing'" @click="sendToAi">
              <Icon :name="handoffState === 'preparing' ? 'clock' : 'send'" :size="14" />{{ handoffState === 'preparing' ? t.preparing : t.handTo(activeProvider.label) }}
            </button>
          </div>
        </footer>

        <p v-if="sendState === 'copied'" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />{{ t.promptCopied }}</p>
        <p v-else-if="sendState === 'failed'" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ t.copyFailed }}</p>
        <p v-if="handoffNotice" class="action-note" :class="handoffState === 'failed' || sendNoticeTone === 'bad' ? 'bad' : 'ok'" role="status">{{ handoffNotice }}</p>
        <p v-if="handoffError" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ handoffError }}</p>
        <button
          v-if="handoffState === 'copied_only'"
          class="button button-secondary retry-open"
          type="button"
          @click="retryOpenAi"
        ><Icon name="external" :size="14" />{{ t.retryOpen(preparedProvider?.label ?? activeProvider.label) }}</button>
        <p v-if="exportMessage" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />{{ exportMessage }}</p>
        <p v-if="exportError" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ exportError }}</p>
      </div>

      <!-- 右列：打包选项与目标 AI -->
      <ExplorePackPanel
        v-model:format="activeFormat"
        v-model:detail="exportDetail"
        v-model:data-types="exportDataTypes"
        v-model:provider="activeProviderId"
        :size-text="previewBusy ? '…' : formatBytes(previewBytes)"
      />
    </div>
  </section>
</template>

<style scoped src="./Explore.css"></style>

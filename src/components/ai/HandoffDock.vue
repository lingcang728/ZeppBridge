<script setup lang="ts">
/**
 * 交付坞：浮在时间桥底部的一条玻璃胶囊，整页只有这一个主按钮。
 *
 *   [ 数据就绪度 ]  [ 交给谁（传送带） ]  [ 交给 ChatGPT ]  [ 只导出 ]
 *
 * 就绪度是一枚小胶囊：几类数据、平均多少天有数据、有没有要注意的；点它进「寄出前检查」
 * 二级页（/ai/check，从这枚胶囊长出来）：带了哪些数据、提醒、附件和选项、完整提示词的预览。
 * 2026-10 起这里不再有可以改的「最终提示词」——能改的只有总页那一个输入框。
 *
 * 主按钮一次做完（批次 ⑦）：准备**一个** `.md`（提示词 + 读法 + 数据；附件原件另放）→ 复制一句
 * 开场白 → 打开所选 AI。坞向上长出一截，里面是那张文件卡：按住直接拖进 AI 的对话框；拖不了就
 * 「在资源管理器里选中它」。文件按所选 AI 的预算控制在读得完的量以内（勾「我已订阅」放宽）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from '../Icon.vue';
import CapsuleWheel from '../CapsuleWheel.vue';
import HandoffSteps from './HandoffSteps.vue';
import type { AiTaskPreview } from '../../lib/bridge/types';
import { isDesktop } from '../../lib/bridge';
import { AI_PROVIDERS, type AiProvider, type AiProviderId } from '../../lib/aiProviders';
import { aiTaskIssueText } from '../../lib/aiTask/copy';
import { formatBytes } from '../../lib/format';
import { currentProviderId, FREE_TOKEN_BUDGET, formatTokens, isSubscribed, setSubscribed } from '../../lib/aiTask/budget';
import { markdownGuide } from '../../lib/aiTask/markdownGuide';
import { planGuide } from '../../lib/aiTask/planGuide';
import { startFileDrag } from '../../lib/dragOut';
import { handoffParts } from '../../lib/aiTask/handoffParts';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useAiTaskHandoff, type HandoffStepId } from '../../composables/useAiTaskHandoff';
import { useSyncController } from '../../composables/useSyncController';
import { useHandoffText } from './HandoffDock.i18n';
import { vEdgeSafe } from '../../lib/edgeSafe';

const props = withDefaults(defineProps<{
  preview: AiTaskPreview | null;
  previewError: string | null;
  direction: string | null;
  fallbackTitle: string;
  /** 右列竖卡形态（左流右结布局）：控件纵向排满整列，不再是底部一条横胶囊。 */
  rail?: boolean;
}>(), { rail: false });

const { draft, saveDraft } = useAiTaskDraft();
const handoff = useAiTaskHandoff();
const { steps, prepareResult, saveError } = handoff;
const provider = ref<AiProvider>(handoff.lastProvider.value ?? AI_PROVIDERS[0]);
const desktop = isDesktop();

const t = useHandoffText();
const emit = defineEmits<{ prepared: [] }>();
watch(prepareResult, value => { if (value?.status === 'ready') emit('prepared'); });

/* —— 用户在等的那次同步还没落地：就绪度胶囊说「最新数据还在路上」。
   同步落地后页面按 dataRevision 重新取预览，这里的数字自己会变。 —— */
const { dataReady, isSyncing, syncProgress } = useSyncController();
const waitingForData = computed(() => dataReady.value.phase === 'waiting');

/* —— 交给谁：传送带胶囊，带各家的图标 —— */
const providerItems = computed(() => AI_PROVIDERS.map((item) => ({ value: item.id, label: item.label, image: item.localIcon })));
const pickProvider = (id: AiProviderId) => {
  const next = AI_PROVIDERS.find((item) => item.id === id);
  if (next) provider.value = next;
};
/* 预算跟着所选 AI 走：预览按它估 `.md` 的体量。 */
watch(provider, (next) => { currentProviderId.value = next.id; }, { immediate: true });
const subscribed = computed({
  get: () => isSubscribed(provider.value.id),
  set: (on: boolean) => setSubscribed(provider.value.id, on),
});
const providerNote = computed(() => ({ deepseek: t.value.noteDeepseek, chatgpt: t.value.noteChatgpt } as Partial<Record<AiProviderId, string>>)[provider.value.id] ?? null);
/** 只和免费档有关的提醒（ChatGPT 免费版每天 3 个文件）：订阅了就不再提。DeepSeek 那条和档位无关，一直显示。 */
const freeNote = computed(() => (provider.value.id === 'chatgpt' && subscribed.value ? null : providerNote.value));

/* —— 单个 .md 的体量：「约 2.8 万 token · 免费版能读完」「运动曲线按 30 秒取平均」 —— */
const mdLine = computed(() => {
  const md = props.preview?.markdown;
  if (!md) return null;
  if (md.over_budget) return t.value.tooLong;
  const tokens = formatTokens(md.approx_tokens);
  if (md.approx_tokens <= FREE_TOKEN_BUDGET) return t.value.tokensFree(tokens);
  return subscribed.value ? t.value.tokensPaid(tokens) : t.value.tokensNeedPaid(tokens);
});
/** 内容超过免费版额度却标着免费版：档位开关带一圈警示色，提醒「要么订阅、要么缩范围」。 */
const mdNeedsPaid = computed(() => {
  const md = props.preview?.markdown;
  return !!md && !md.over_budget && md.approx_tokens > FREE_TOKEN_BUDGET;
});
const mdDowngrade = computed(() => {
  const md = props.preview?.markdown;
  if (!md) return [];
  const notes: string[] = [];
  if (md.curve_average_seconds) notes.push(t.value.curveAveraged(md.curve_average_seconds));
  if (md.summarized_workouts.length) notes.push(t.value.summarizedOnly(md.summarized_workouts.length));
  return notes;
});

/* —— 就绪度：几类数据、总体多少天有数据 —— */
const readiness = computed(() => {
  const rows = props.preview?.coverage ?? [];
  if (!rows.length) return null;
  const categories = new Set(rows.map((row) => row.category)).size;
  const total = rows.reduce((sum, row) => sum + row.days_in_range, 0);
  const have = rows.reduce((sum, row) => sum + row.days_with_data, 0);
  return { categories, percent: total > 0 ? Math.round((have / total) * 100) : 0 };
});
/** 同一句提醒只出现一次，后面标次数。 */
const groupedWarnings = computed(() => {
  const counts = new Map<string, number>();
  for (const issue of props.preview?.warnings ?? []) {
    const text = aiTaskIssueText(issue);
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return [...counts.entries()].map(([text, count]) => ({ text, count }));
});
const issueTotal = computed(() => groupedWarnings.value.length + (props.previewError ? 1 : 0));

const blocked = computed(() => (prepareResult.value?.status === 'blocked' && !stale.value ? prepareResult.value.blocked : []));
const ready = computed(() => (prepareResult.value?.status === 'ready' ? prepareResult.value : null));
const stale = computed(() => handoff.isStale(exportTask()));
const busy = computed(() => handoff.inFlight.value || steps.value.prepare.state === 'doing' || steps.value.copy.state === 'doing');
/** 按过主按钮以后，坞向上长出进度那一截。 */
const started = computed(() => steps.value.prepare.state !== 'idle');
/** 进度那一截被人点空白 / Esc 收起了：下次按主按钮再长出来。收起后坞上留一枚「上次导出」。 */
const progressDismissed = ref(false);

/** 标题为空时用自动标题——导出文件夹就按它命名。 */
function exportTask() {
  return { ...draft.value, title: draft.value.title.trim() || props.fallbackTitle };
}

/* 同步进行中不许交付：导出的会是同步前的旧数据，而旁边正写着「最新数据还在路上」。
   两个按钮都等同步落地再亮（用户 2026-09-29 定）。 */
const run = (openSite: boolean) => {
  if (!desktop || busy.value || isSyncing.value) return;
  progressDismissed.value = false;
  // 按下那一刻的交给谁、方向、预览、改过的提示词：保存那段等待里别处再改，也交出按下时的那一版。
  const target = provider.value;
  const direction = props.direction;
  const preview = props.preview;
  void handoff.start(() => saveDraft(props.fallbackTitle), async () => {
    // 任务在保存之后取：新任务要带上刚拿到的 id。
    const task = exportTask();
    const now = handoffParts(task, preview, { hasDirection: Boolean(direction), now: new Date(), format: 'md' });
    const options = {
      briefText: now.brief,
      dataFileStem: now.dataStem,
      promptFileStem: now.promptStem,
      promptOverride: null,
      provider: target.id,
      tokenBudget: preview?.markdown?.token_budget ?? FREE_TOKEN_BUDGET,
      markdownGuide: `${markdownGuide()}

<!-- zeppbridge-final-plan -->
${planGuide()}`,
    };
    if (openSite) await handoff.runAll(task, target, direction, options);
    else await handoff.exportOnly(task, direction, options);
  });
};

/** 交接前那次保存失败了：在这里再存一次，存上了提示就收起。 */
const savingAgain = ref(false);
const saveAgain = async () => {
  savingAgain.value = true;
  try {
    await saveDraft(props.fallbackTitle);
    saveError.value = null;
  } catch {
    // 原因在任务名胶囊下面报着；这条提示留着。
  } finally {
    savingAgain.value = false;
  }
};

const retry = (id: HandoffStepId) => {
  if (id === 'copy') void handoff.runCopy();
  else if (id === 'open') void handoff.runOpen(provider.value);
};

/* —— 文件卡：按住直接拖进浏览器里 AI 的对话框（系统拖放，tauri-plugin-drag） —— */
const fileName = computed(() => ready.value?.md_path?.split(/[\\/]/).pop() ?? '');
const dragFailed = ref(false);
const onFileDrag = (event: MouseEvent) => {
  const path = ready.value?.md_path;
  if (!desktop || !path || event.button !== 0) return;
  dragFailed.value = false;
  startFileDrag(path, fileName.value).catch(() => { dragFailed.value = true; });
};

const dock = ref<HTMLElement | null>(null);
const onDocPointer = (event: PointerEvent) => {
  if (!dock.value || dock.value.contains(event.target as Node)) return;
  if (started.value || blocked.value.length) progressDismissed.value = true;
};
const onDocKey = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;
  if (started.value || blocked.value.length) progressDismissed.value = true;
};
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer);
  document.addEventListener('keydown', onDocKey);

});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer);
  document.removeEventListener('keydown', onDocKey);

});
</script>

<template>
  <section ref="dock" :class="['dock', { rail }]" :aria-label="t.title">
    <Transition name="grow">
      <div v-show="(started || blocked.length) && !progressDismissed" class="progress glass-control">
        <ul v-if="blocked.length" class="issues" role="alert">
          <li v-for="(issue, index) in blocked" :key="index" class="ai-note bad"><Icon name="warning" :size="13" />{{ aiTaskIssueText(issue) }}</li>
        </ul>
        <HandoffSteps :steps="steps" :provider-label="provider.label" @retry="retry" />
        <p v-if="saveError" class="ai-note warn save-failed" role="alert">
          <Icon name="warning" :size="13" /><span>{{ saveError }}</span>
          <button type="button" class="ai-tool" :disabled="savingAgain" @click="saveAgain">{{ t.saveAgain }}</button>
        </p>
        <div v-if="ready" class="output">
          <!-- 一枚大文件卡（批次 ⑦）：名字、大小、约多少 token；按住直接拖进 AI 的对话框。 -->
          <div v-if="ready.md_path" :class="['file-card', { draggable: desktop }]" role="button" tabindex="0"
            :aria-label="t.fileAria(fileName)" @mousedown="onFileDrag" @keydown.enter.prevent="handoff.revealOutput()">
            <Icon name="file" :size="28" class="file-icon" />
            <span class="file-copy">
              <strong>{{ fileName }}</strong>
              <small>{{ t.fileMeta(formatBytes(ready.byte_len), formatTokens(ready.markdown?.approx_tokens ?? 0)) }}<template v-if="ready.copied_attachments"> · {{ t.copiedFiles(ready.copied_attachments) }}</template></small>
            </span>
            <Icon name="dots" :size="18" class="file-grip" />
          </div>
          <p v-else class="ai-note ok"><Icon name="folder" :size="13" />
            <span>{{ t.outputAt(ready.output_dir) }}<template v-if="ready.copied_attachments"> · {{ t.copiedFiles(ready.copied_attachments) }}</template></span>
          </p>
          <p v-if="ready.md_path" class="ai-hint drag-hint">{{ t.dragFile(provider.label) }} {{ t.sideBySide }}</p>
          <div class="output-row">
            <button type="button" class="ai-tool" @click="handoff.revealOutput()"><Icon name="folder" :size="13" />{{ ready.md_path ? t.revealFile : t.reveal }}</button>
            <p v-if="freeNote" class="ai-hint">{{ freeNote }}</p>
          </div>
          <p v-if="dragFailed" class="ai-note warn" role="status"><Icon name="warning" :size="13" />{{ t.dragFailed }}</p>
          <p v-if="stale" class="ai-note warn" role="status"><Icon name="warning" :size="13" />{{ t.stale }}</p>
        </div>
      </div>
    </Transition>

    <Transition name="grow">
      <button v-if="progressDismissed && ready" type="button" class="last-export glass-control" @click="handoff.revealOutput()">
        <Icon name="folder" :size="13" />{{ t.lastExport }}
      </button>
    </Transition>

    <!-- 预览出错不藏进浮层：它决定导出的东西对不对，要一直看得见。 -->
    <p v-if="previewError" class="ai-note bad alert-pill" role="alert"><Icon name="warning" :size="13" />{{ previewError }}</p>

    <!-- 外面传进来的东西（问题条）紧贴在主按钮栏上方，和它一起量高度、一起贴底。 -->
    <div class="core">
      <slot />
    <div :class="['bar', { 'glass-control is-lens-host': !rail }]">
      <RouterLink to="/ai/check" data-morph-card :class="['ready-chip', { 'has-issues': issueTotal, 'is-waiting': waitingForData }]" :title="t.checkHint">
        <i class="ready-dot" aria-hidden="true"></i>
        <span v-if="waitingForData" class="ready-copy" role="status">
          <span>{{ t.readinessWaiting }}</span>
          <small>{{ syncProgress && isSyncing ? t.readinessWaitingStep(syncProgress.current, syncProgress.total) : t.readinessWaitingSub }}</small>
        </span>
        <span v-else class="ready-copy">
          <span>{{ readiness ? t.readiness(readiness.categories, readiness.percent) : t.readinessLoading }}</span>
          <small v-if="preview">{{ mdLine ?? t.packageSize(formatBytes(preview.estimated_bytes)) }}<template v-if="mdDowngrade.length"> · {{ mdDowngrade.join(' · ') }}</template><template v-if="issueTotal"> · {{ t.issueCount(issueTotal) }}</template></small>
        </span>
        <Icon name="chevron-right" :size="14" class="ready-chevron" />
      </RouterLink>

      <CapsuleWheel class="provider-wheel" loop :span="210" :items="providerItems" :model-value="provider.id"
        :aria-label="t.who" @update:model-value="pickProvider" />

      <!-- 订阅档位就摆在主按钮旁边：用户习惯直接点交付，不会先点开就绪度浮层去找那个勾。
           它决定导出的 .md 有多细，所以要一眼看得见、一下能改。 -->
      <span class="plan-wrap">
        <button type="button" role="switch" :aria-checked="subscribed" :class="['plan-toggle', { paid: subscribed, short: !subscribed && mdNeedsPaid }]"
          :aria-label="`${t.planTitle(provider.label)} ${t.subscribedHint}`" aria-describedby="plan-note" @click="subscribed = !subscribed">
          <span class="plan-mark" aria-hidden="true"><Icon v-if="subscribed" name="check" :size="12" /></span>
          <span class="plan-copy"><small>{{ provider.label }}</small><strong>{{ subscribed ? t.planPaid : t.planFree }}</strong></span>
        </button>
        <!-- 右上角的小注释：悬停 / 聚焦开关时展开说明两档的差别（以前这句话躲在最终提示词浮层里）。 -->
        <span class="plan-info" aria-hidden="true">?</span>
        <span id="plan-note" v-edge-safe class="plan-tip" role="tooltip">
          <strong>{{ t.planTitle(provider.label) }}</strong>{{ t.subscribedHint }}<template v-if="providerNote && provider.id === 'chatgpt'"><br>{{ providerNote }}</template>
        </span>
      </span>

      <div class="go-row">
      <button type="button" :class="['go', 'cta', {}]" :disabled="!desktop || busy || isSyncing" :title="isSyncing ? t.goSubSyncing : t.run(provider.label)" @click="run(true)">
        <Icon name="send" :size="17" />
        <span class="go-copy"><strong>{{ t.go(provider.label) }}</strong><small>{{ isSyncing ? t.goSubSyncing : t.goSub }}</small></span>
      </button>
      <button type="button" class="export-only" :disabled="!desktop || busy || isSyncing" :title="t.exportOnly" :aria-label="t.exportOnly" @click="run(false)">
        <Icon name="export" :size="17" />
      </button>
      </div>
    </div>
    </div>
    <p v-if="!desktop" class="ai-note offline">{{ t.desktopOnly }}</p>
  </section>
</template>

<style scoped src="./HandoffDock.css"></style>

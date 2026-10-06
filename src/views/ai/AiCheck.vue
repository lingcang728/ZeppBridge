<script setup lang="ts">
/**
 * 寄出前检查（/ai/check，从底栏的就绪度胶囊长出来）。以前这些挤在底栏的玻璃浮层里：
 *
 *   上半：带了哪些数据（几类、多少天有数据）、要注意的提醒（同一句只出现一次）、逐类覆盖明细；
 *   下半：附件原件和选项（HandoffTray）、完整提示词的只读预览——你写的那一句高亮，点它回到总页的输入框去改。
 *
 * 能改的永远只有一处（总页的输入框）：这里不再有可以改的「最终提示词」。
 * 选项全部平铺、大白话：详细程度玻璃三档、精确路线玻璃开关、每个 AI 各自的「免费版 / 已订阅」玻璃两档。
 * 「允许本机 MCP 查询这个任务」挪到了设置 → MCP。
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import PageHeader from '../../components/PageHeader.vue';
import Icon from '../../components/Icon.vue';
import HandoffTray from '../../components/ai/HandoffTray.vue';
import CoverageDetails from '../../components/ai/CoverageDetails.vue';
import SubscriptionList from '../../components/ai/SubscriptionList.vue';
import { useAiHub } from '../../composables/ai/useAiHub';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useAiTaskPreview } from '../../composables/useAiTaskPreview';
import { useHubText } from '../../components/ai/hub/hub.i18n';
import { useHandoffText } from '../../components/ai/HandoffDock.i18n';
import { aiTaskIssueText, coverageNoteText } from '../../lib/aiTask/copy';
import { handoffParts } from '../../lib/aiTask/handoffParts';
import { formatBytes } from '../../lib/format';
import '../../styles/ai-task.css';

defineOptions({ name: 'AiCheck' });
const router = useRouter();
const hub = useAiHub();
const { draft } = useAiTaskDraft();
const coverage = useAiTaskPreview();
const h = useHubText();
const t = useHandoffText();
const preview = computed(() => coverage.preview.value);
const readiness = computed(() => {
  const rows = preview.value?.coverage ?? [];
  if (!rows.length) return null;
  const categories = new Set(rows.map((row) => row.category)).size;
  const total = rows.reduce((sum, row) => sum + row.days_in_range, 0);
  const have = rows.reduce((sum, row) => sum + row.days_with_data, 0);
  return { categories, percent: total > 0 ? Math.round((have / total) * 100) : 0 };
});
const warnings = computed(() => {
  const counts = new Map<string, number>();
  for (const issue of preview.value?.warnings ?? []) {
    const text = aiTaskIssueText(issue);
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return [...counts.entries()].map(([text, count]) => ({ text, count }));
});
/** 提示词按段落拆开：任务说明、方向、你写的那一句、覆盖说明。和导出用的是同一个函数。 */
const parts = computed(() => {
  const task = { ...draft.value, title: draft.value.title.trim() || hub.title.value };
  const brief = handoffParts(task, preview.value, { hasDirection: Boolean(hub.direction.value), format: 'md' }).brief;
  return [
    { key: 'brief', text: brief.trim(), mine: false },
    { key: 'direction', text: (hub.direction.value ?? '').trim(), mine: false },
    { key: 'question', text: draft.value.prompt.trim(), mine: true },
  ].filter((part) => part.text);
});
const tail = computed(() => coverageNoteText());
/** 点你写的那一句：回到总页，光标落在输入框里。 */
const editQuestion = async () => {
  await router.push('/ai');
  requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.compose-box textarea')?.focus());
};
</script>

<template>
  <section class="page ai-sub-page" aria-labelledby="ai-check-title">
    <PageHeader title-id="ai-check-title" :title="h.checkTitle" :intro="h.checkIntro" />
    <div class="check-grid">
      <div class="ai-panel">
        <h2>{{ h.dataTitle }}</h2>
        <p class="readiness">
          <strong>{{ readiness ? t.readiness(readiness.categories, readiness.percent) : t.readinessLoading }}</strong>
          <small v-if="preview">{{ t.packageSize(formatBytes(preview.estimated_bytes)) }}</small>
        </p>
        <p v-if="coverage.previewError.value" class="ai-note bad" role="alert"><Icon name="warning" :size="13" />{{ coverage.previewError.value }}</p>
        <template v-if="warnings.length">
          <h2>{{ h.warningsTitle }}</h2>
          <ul class="warnings">
            <li v-for="issue in warnings" :key="issue.text" class="ai-note warn"><Icon name="warning" :size="13" /><span>{{ issue.text }}</span><b v-if="issue.count > 1">{{ t.repeat(issue.count) }}</b></li>
          </ul>
        </template>
        <CoverageDetails v-if="preview && preview.coverage.length" :preview="preview" />
      </div>
      <div class="ai-panel">
        <h2>{{ h.optionsTitle }}</h2>
        <HandoffTray :preview="preview" />
      </div>
    </div>
    <div class="ai-panel subs-panel">
      <h2>{{ h.subscriptionTitle }}</h2>
      <SubscriptionList />
    </div>
    <div class="ai-panel prompt-panel">
      <h2>{{ h.promptTitle }}</h2>
      <p class="ai-panel-note">{{ h.promptHint }}</p>
      <div class="prompt">
        <template v-for="part in parts" :key="part.key">
          <button v-if="part.mine" type="button" class="mine" :title="h.yourWords" @click="editQuestion"><small>{{ h.yourWords }}</small>{{ part.text }}</button>
          <p v-else>{{ part.text }}</p>
        </template>
        <p class="tail"><small>{{ t.fixedTail }}</small>{{ tail }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped src="./aiPage.css"></style>
<style scoped>
.check-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.check-grid .ai-panel + .ai-panel { margin-top: 0; }
.prompt-panel, .subs-panel { margin-top: 16px; }
.readiness { display: grid; gap: 2px; margin: 0; }
.readiness strong { font-size: var(--fs-lg); }
.readiness small { color: var(--subtle); font-size: var(--fs-2xs); }
.warnings { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.warnings b { margin-left: auto; color: var(--subtle); font-weight: 600; }
.prompt { display: grid; gap: 12px; padding: 16px 18px; border-radius: 16px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); font-size: var(--fs-sm); line-height: 1.7; white-space: pre-wrap; }
.prompt p { margin: 0; color: var(--muted); }
.prompt small { display: block; margin-bottom: 2px; color: var(--subtle); font-size: var(--fs-2xs); }
.mine { display: grid; padding: 10px 12px; border: 0; border-radius: 12px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--ink); font: inherit; text-align: left; white-space: pre-wrap; cursor: text; transition: background var(--dur-base) ease; }
.mine:hover { background: color-mix(in srgb, var(--accent) 22%, transparent); }
.mine small { color: var(--accent); }
.tail { opacity: .8; }
@media (max-width: 980px) { .check-grid { grid-template-columns: minmax(0, 1fr); } }
</style>

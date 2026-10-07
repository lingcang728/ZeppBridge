<script setup lang="ts">
/**
 * 寄出前检查（/ai/check，从底栏的就绪度胶囊长出来）。以前这些挤在底栏的玻璃浮层里：
 *
 *   上半：带了哪些数据（几类、多少天有数据）、要注意的提醒（同一句只出现一次）、逐类覆盖明细；
 *   下半：附件原件和选项（HandoffTray）、完整提示词——你写的那一句高亮。
 *
 * 就地改（第四轮 1D·D5，用户 10-07）：点「完整提示词」任意处，「你写的这一句」那段就地变成输入框并聚焦；
 * 它和总页的输入框是**同一份草稿**（useAiTaskDraft.setPrompt），两边改哪边都一样。系统自动加的段落仍只读。
 * 选项全部平铺、大白话：详细程度玻璃三档、精确路线玻璃开关、每个 AI 各自的「免费版 / 已订阅」玻璃两档。
 * 「允许本机 MCP 查询这个任务」挪到了设置 → MCP。
 */
import { computed, nextTick, ref } from 'vue';
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
import { useBridgeText } from '../../components/ai/bridge/bridge.i18n';
import { aiTaskIssueText, coverageNoteText } from '../../lib/aiTask/copy';
import { handoffParts } from '../../lib/aiTask/handoffParts';
import { formatBytes } from '../../lib/format';
import '../../styles/ai-task.css';

defineOptions({ name: 'AiCheck' });
const hub = useAiHub();
const ctl = useAiTaskDraft();
const { draft } = ctl;
const bt = useBridgeText();
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
    // 你写的那一句：空着也留一格（写着占位提示），点进来就能写。
    { key: 'question', text: draft.value.prompt.trim(), mine: true },
  ].filter((part) => part.text || part.mine);
});
const tail = computed(() => coverageNoteText());
/** 点完整提示词任意处：你写的那一句就地变成输入框，光标落在末尾。 */
const editing = ref(false);
const box = ref<HTMLTextAreaElement | null>(null);
/* 输入框在 v-for 里：用函数 ref，拿到的是元素本身而不是数组。 */
const setBox = (el: unknown) => { box.value = el instanceof HTMLTextAreaElement ? el : null; };
const startEdit = async () => {
  if (editing.value) return;
  editing.value = true;
  await nextTick();
  const el = box.value;
  if (!el) return;
  el.focus({ preventScroll: true });
  el.setSelectionRange(el.value.length, el.value.length);
};
const stopEdit = () => { editing.value = false; };
</script>

<template>
  <section class="page ai-sub-page story" aria-labelledby="ai-check-title">
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
      <div :class="['prompt', { editing }]" @click="startEdit">
        <template v-for="part in parts" :key="part.key">
          <label v-if="part.mine && editing" class="mine is-editing" @click.stop><small>{{ h.yourWords }}</small>
            <textarea :ref="setBox" :value="draft.prompt" :placeholder="bt.placeholder" rows="2"
              @input="ctl.setPrompt(($event.target as HTMLTextAreaElement).value)" @blur="stopEdit" @keydown.esc.stop.prevent="($event.target as HTMLTextAreaElement).blur()"></textarea>
          </label>
          <button v-else-if="part.mine" type="button" :class="['mine', { empty: !part.text }]" :title="h.yourWords" @click.stop="startEdit"><small>{{ h.yourWords }}</small>{{ part.text || bt.placeholder }}</button>
          <p v-else>{{ part.text }}</p>
        </template>
        <p class="tail"><small>{{ t.fixedTail }}</small>{{ tail }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped src="./aiPage.css"></style>
<style scoped>
/* 单列（方案 B）：带了哪些数据 → 附件与选项 → 你用的是哪一档 → 完整提示词，从上往下读。 */
.check-grid { display: grid; grid-template-columns: minmax(0, 1fr); }
.readiness { display: grid; gap: 2px; margin: 0; }
.readiness strong { font-size: var(--fs-lg); }
.readiness small { color: var(--subtle); font-size: var(--fs-2xs); }
.warnings { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.warnings b { margin-left: auto; color: var(--subtle); font-weight: 600; }
.prompt { display: grid; gap: 12px; padding: 16px 18px; border-radius: 16px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); font-size: var(--fs-sm); line-height: 1.7; white-space: pre-wrap; cursor: text; }
/* 整块是热区：悬停时你那一段先亮一点，告诉人「点这里就能改」。 */
.prompt:not(.editing):hover .mine { background: color-mix(in srgb, var(--accent) 22%, transparent); }
.prompt p { margin: 0; color: var(--muted); }
.prompt small { display: block; margin-bottom: 2px; color: var(--subtle); font-size: var(--fs-2xs); }
.mine { display: grid; padding: 10px 12px; border: 0; border-radius: 12px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--ink); font: inherit; text-align: left; white-space: pre-wrap; cursor: text; transition: background var(--dur-base) ease; }
.mine:hover { background: color-mix(in srgb, var(--accent) 22%, transparent); }
.mine small { color: var(--accent); }
.mine.empty { color: var(--subtle); }
.mine.is-editing { cursor: text; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 60%, transparent); }
.mine textarea { width: 100%; min-height: 3.4em; padding: 0; border: 0; outline: none; background: none; color: var(--ink); font: inherit; line-height: inherit; resize: none; field-sizing: content; }
.tail { opacity: .8; }
</style>

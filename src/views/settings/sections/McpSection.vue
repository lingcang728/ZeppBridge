<script setup lang="ts">
/* MCP：一句话说清是什么，两个按钮，工具名做成小标签。
 *
 * 以前这里有六段说明（跳过提示、和「交给 AI」的比较、为什么不写教程、工具列表、
 * 分发方式…），配置步骤本来就是让用户把提示词丢给 AI 去问的，界面上不用再讲一遍。
 * 将复制的提示词默认收起，想先看看的人点开就行。 */
import { computed, ref } from 'vue';
import Icon from '../../../components/Icon.vue';
import McpTaskScopes from './McpTaskScopes.vue';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);

/* 和 zeppbridge-mcp 的 tools/list 一一对应（顺序同 docs/reference/cli-and-mcp*.md 的工具表）。 */
const MCP_TOOLS = computed(() => [
  { name: 'list_workouts', detail: t.value.mcpToolListWorkouts },
  { name: 'get_workout_insight', detail: t.value.mcpToolWorkoutInsight },
  { name: 'get_workout_detail', detail: t.value.mcpToolWorkoutDetail },
  { name: 'get_workout_series', detail: t.value.mcpToolWorkoutSeries },
  { name: 'get_metric_series', detail: t.value.mcpToolMetricSeries },
  { name: 'get_food_data', detail: t.value.mcpToolFoodData },
  { name: 'list_available_metrics', detail: t.value.mcpToolAvailableMetrics },
  { name: 'get_metric_records', detail: t.value.mcpToolMetricRecords },
  { name: 'list_sleep_sessions', detail: t.value.mcpToolSleepSessions },
  { name: 'get_sleep_detail', detail: t.value.mcpToolSleepDetail },
  { name: 'list_life_events', detail: t.value.mcpToolLifeEvents },
  { name: 'get_data_health', detail: t.value.mcpToolDataHealth },
]);

const mcpConfigExample = computed(() => `{
  "mcpServers": {
    "zeppbridge": {
      "command": "${t.value.mcpConfigPathPlaceholder}",
      "args": ["--scope", "task"]
    }
  }
}`);

const mcpMessage = ref<string | null>(null);
const copy = async (text: string, done: string, failed: string) => {
  try {
    await navigator.clipboard.writeText(text);
    mcpMessage.value = done;
  } catch {
    mcpMessage.value = failed;
  }
};
const copyMcpPrompt = () => copy(t.value.mcpSetupPrompt, t.value.mcpPromptCopied, t.value.mcpPromptCopyFailed);
const copyMcpConfig = () => copy(mcpConfigExample.value, t.value.mcpConfigCopied, t.value.mcpConfigCopyFailed);
</script>

<template>
  <section class="s-section" aria-labelledby="mcp-title">
    <div class="s-section-head">
      <h3 id="mcp-title">{{ d.secMcp }}</h3>
      <span class="s-meta">{{ t.mcpBadge }}</span>
    </div>
    <div class="s-list">
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ d.mcpLead }}</span>
        </div>
      </div>
      <div class="s-row">
        <div class="s-actions">
          <button class="button primary" type="button" @click="copyMcpPrompt">
            <Icon name="copy" :size="14" />{{ t.mcpCopyPrompt }}
          </button>
          <button class="button secondary" type="button" @click="copyMcpConfig">
            <Icon name="copy" :size="14" />{{ t.mcpCopyConfig }}
          </button>
          <span v-if="mcpMessage" class="hint-line ok" role="status">{{ mcpMessage }}</span>
        </div>
      </div>
      <details class="s-row is-block prompt-fold">
        <summary>{{ d.mcpPreview }}</summary>
        <pre class="mcp-config"><code>{{ t.mcpSetupPrompt }}</code></pre>
      </details>
      <div class="s-row is-block">
        <div class="s-row-main">
          <span class="s-row-title">{{ d.mcpToolsLabel }}</span>
          <span class="s-row-sub">{{ d.mcpTools }}</span>
        </div>
        <div class="mcp-tools">
          <code v-for="tool in MCP_TOOLS" :key="tool.name" class="chip" :title="tool.detail">{{ tool.name }}</code>
        </div>
      </div>
      <McpTaskScopes />
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.prompt-fold > summary { color: var(--accent); font-size: var(--fs-sm); cursor: pointer; }
.mcp-config { max-height: 220px; margin: 10px 0 0; padding: 12px 14px; overflow: auto; border-radius: var(--radius-sm); background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-xs); line-height: 1.7; white-space: pre-wrap; }
.mcp-config code { color: inherit; font-size: inherit; }
.mcp-tools { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.mcp-tools .chip { color: var(--ink); font-family: var(--font-mono); cursor: help; }
</style>

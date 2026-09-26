<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '../../../components/Icon.vue';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';

const t = useMessages(settingsMessages);

const MCP_TOOLS = computed(() => [
  { name: 'list_workouts', detail: t.value.mcpToolListWorkouts },
  { name: 'get_workout_insight', detail: t.value.mcpToolWorkoutInsight },
  { name: 'get_metric_series', detail: t.value.mcpToolMetricSeries },
  { name: 'get_sleep_detail', detail: t.value.mcpToolSleepDetail },
  { name: 'get_data_health', detail: t.value.mcpToolDataHealth },
]);

/* 与其在界面上写一大篇配置教程，不如给用户一段能直接丢给 AI 的话。
   配置细节因工具、因操作系统、因安装路径而异，AI 看着他的实际情况给指引，
   比这里写死的四步准得多；用户本来也就是要截图去问 AI 的。
   两种语言的提示词都在 Settings.i18n.ts 里。 */
const mcpConfigExample = computed(() => `{
  "mcpServers": {
    "zeppbridge": {
      "command": "${t.value.mcpConfigPathPlaceholder}",
      "args": ["--scope", "task"]
    }
  }
}`);

const mcpMessage = ref<string | null>(null);
const copyMcpPrompt = async () => {
  try {
    await navigator.clipboard.writeText(t.value.mcpSetupPrompt);
    mcpMessage.value = t.value.mcpPromptCopied;
  } catch {
    mcpMessage.value = t.value.mcpPromptCopyFailed;
  }
};

const copyMcpConfig = async () => {
  try {
    await navigator.clipboard.writeText(mcpConfigExample.value);
    mcpMessage.value = t.value.mcpConfigCopied;
  } catch {
    mcpMessage.value = t.value.mcpConfigCopyFailed;
  }
};
</script>

<template>
  <section class="settings-card mcp-card" aria-labelledby="mcp-title">
    <div class="section-heading-row">
      <h2 id="mcp-title">{{ t.mcpTitle }}</h2>
      <span class="capability-checked">{{ t.mcpBadge }}</span>
    </div>
    <p class="section-description">
      <strong>{{ t.mcpSkip }}</strong>
      {{ t.mcpCompareA }}<strong>{{ t.mcpCompareStrong }}</strong>{{ t.mcpCompareB }}
    </p>

    <div class="mcp-handoff">
      <p class="mcp-sub">
        {{ t.mcpAskA }}<strong>{{ t.mcpAskStrong }}</strong>{{ t.mcpAskB }}
      </p>
      <pre class="mcp-config"><code>{{ t.mcpSetupPrompt }}</code></pre>
      <div class="inline-actions">
        <button class="button primary" type="button" @click="copyMcpPrompt">
          <Icon name="copy" :size="14" />{{ t.mcpCopyPrompt }}
        </button>
        <button class="button secondary" type="button" @click="copyMcpConfig">
          <Icon name="copy" :size="14" />{{ t.mcpCopyConfig }}
        </button>
      </div>
      <p v-if="mcpMessage" class="hint-line ok" role="status">{{ mcpMessage }}</p>
    </div>

    <p class="mcp-sub">{{ t.mcpToolsLead }}</p>
    <div class="mcp-tools">
      <div v-for="tool in MCP_TOOLS" :key="tool.name" class="mcp-tool">
        <code>{{ tool.name }}</code>
        <span>{{ tool.detail }}</span>
      </div>
    </div>

    <p class="retain-note">
      <code>zeppbridge-mcp</code>{{ t.mcpFootA }}
    </p>
  </section>
</template>

<style scoped src="../settings-base.css"></style>
<style scoped>
.mcp-handoff { margin-bottom: var(--space-4); }
.mcp-handoff .mcp-config { max-height: 200px; overflow: auto; white-space: pre-wrap; font-size: var(--fs-xs); line-height: 1.75; }
.mcp-handoff .inline-actions { margin-top: 10px; }
.mcp-tools { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-2); margin-bottom: var(--space-3); }
.mcp-tool { display: grid; gap: 2px; padding: 9px 11px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); min-width: 0; }
.mcp-tool code { color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-sm); }
.mcp-tool span { color: var(--muted); font-size: var(--fs-xs); }
.mcp-sub { margin: 0 0 6px; color: var(--muted); font-size: var(--fs-sm); }
.mcp-config { margin: 0; padding: 12px 14px; overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-sm); line-height: 1.6; }
</style>

<script setup lang="ts">
/**
 * 「连到 Claude Code / Codex / Claude Desktop」（3B 打包）。
 *
 * 安装包把 zeppbridge-mcp 放在 exe 旁边，后端告诉我们它在哪，按钮就能给出
 * 能直接跑的命令；Claude Desktop 则存一个 .mcpb 让用户双击安装。
 * 开发构建、浏览器预览里没有 sidecar，三个按钮不可点，退回下面的提示词 / 配置。
 */
import { onMounted, ref } from 'vue';
import Icon from '../../../components/Icon.vue';
import { backend, isDesktop, toUserMessage } from '../../../lib/bridge';
import type { McpSidecar } from '../../../lib/bridge/types';
import { claudeCodeCommands, codexCommands } from '../../../lib/mcpClients';
import { useMessages } from '../../../i18n';
import { aiCardMessages } from './ai.i18n';

const a = useMessages(aiCardMessages);
const emit = defineEmits<{ sidecar: [McpSidecar | null] }>();
const sidecar = ref<McpSidecar | null>(null);
const note = ref<{ text: string; ok: boolean } | null>(null);
const busy = ref(false);

onMounted(async () => {
  if (!isDesktop()) return;
  try {
    sidecar.value = await backend.getMcpSidecar();
  } catch {
    sidecar.value = null;
  }
  emit('sidecar', sidecar.value);
});

const copyCommands = async (build: (s: McpSidecar) => string | null) => {
  const text = sidecar.value ? build(sidecar.value) : null;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    note.value = { text: a.value.connectCopied, ok: true };
  } catch (e) {
    note.value = { text: toUserMessage(e, ''), ok: false };
  }
};

const saveBundle = async () => {
  busy.value = true;
  note.value = null;
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const directory = await open({ directory: true, title: a.value.bundlePick });
    if (!directory || Array.isArray(directory)) return;
    const saved = await backend.saveMcpBundle(String(directory));
    note.value = { text: a.value.bundleSaved, ok: true };
    const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
    await revealItemInDir(saved).catch(() => undefined);
  } catch (e) {
    note.value = { text: toUserMessage(e, ''), ok: false };
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <div class="s-row is-block">
    <div class="s-row-main">
      <span class="s-row-title">{{ a.connectTitle }}</span>
      <span class="s-row-sub">{{ sidecar?.path ? a.connectSub : a.sidecarMissing }}</span>
    </div>
    <div class="s-actions connect-actions">
      <button class="button secondary" type="button" :disabled="!sidecar?.path" @click="copyCommands(claudeCodeCommands)">
        <Icon name="terminal" :size="14" />Claude Code
      </button>
      <button class="button secondary" type="button" :disabled="!sidecar?.path" @click="copyCommands(codexCommands)">
        <Icon name="terminal" :size="14" />Codex
      </button>
      <button class="button secondary" type="button" :disabled="!sidecar?.path || busy" @click="saveBundle">
        <Icon name="export" :size="14" />Claude Desktop
      </button>
    </div>
    <p v-if="note" class="hint-line" :class="{ ok: note.ok }" :role="note.ok ? 'status' : 'alert'">{{ note.text }}</p>
  </div>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.connect-actions { margin-top: 10px; }
</style>

<script setup lang="ts">
/**
 * 「只给共享任务」（3.1.2）。默认关：本地 AI 读整个库，也能写那几本用户自己的账（都能撤销）。
 * 开着时生成的配置带 `--scope task`：只看得到下面开放给 MCP 的任务，写工具一律被拒。
 * 已经登记好的客户端不会自己变，要用上面的按钮重新连一次（连接行会标出对不上的）。
 */
import { onMounted, ref } from 'vue';
import GlassSwitch from '../../../components/GlassSwitch.vue';
import { backend, isDesktop, toUserMessage } from '../../../lib/bridge';
import { useMessages } from '../../../i18n';
import { aiCardMessages } from './ai.i18n';

const props = defineProps<{ initial: boolean }>();
const emit = defineEmits<{ changed: [boolean] }>();
const a = useMessages(aiCardMessages);
const on = ref(props.initial);
const busy = ref(false);
const changed = ref(false);
const error = ref<string | null>(null);
onMounted(() => { on.value = props.initial; });

const toggle = async () => {
  if (!isDesktop()) return;
  busy.value = true;
  error.value = null;
  try {
    on.value = await backend.setMcpTaskOnly(!on.value);
    changed.value = true;
    emit('changed', on.value);
  } catch (e) {
    error.value = toUserMessage(e, '');
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <div class="s-row">
    <div class="s-row-main">
      <span class="s-row-title">{{ a.taskOnlyTitle }}</span>
      <span class="s-row-sub">{{ on ? a.taskOnlyOn : a.taskOnlyOff }}</span>
      <span v-if="changed" class="s-row-sub reconnect">{{ a.taskOnlyReconnect }}</span>
    </div>
    <GlassSwitch :model-value="on" :aria-label="a.taskOnlyTitle" :disabled="busy" @update:model-value="toggle" />
    <p v-if="error" class="hint-line" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.reconnect { color: var(--warning); }
</style>

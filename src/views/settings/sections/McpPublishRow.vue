<script setup lang="ts">
/**
 * 「允许 AI 直接发布训练计划」（3B）：和 MCP 的 publish_training_plan 同一批上线——
 * 没有能发布的工具时单放一个开关不起作用、还会误导。默认关：AI 只能起草，
 * 草稿出现在「交给 AI」页，由你确认后才发到手表。
 */
import { onMounted, ref } from 'vue';
import GlassSwitch from '../../../components/GlassSwitch.vue';
import { backend, isDesktop, toUserMessage } from '../../../lib/bridge';
import { useMessages } from '../../../i18n';
import { aiCardMessages } from './ai.i18n';

const a = useMessages(aiCardMessages);
const allowed = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  if (!isDesktop()) return;
  try {
    allowed.value = (await backend.trainingPlanState()).ai_may_publish;
  } catch {
    // 读不到就按默认的「关」显示；开关本身仍可点，点了以后端回的值为准。
  }
});

const toggle = async () => {
  busy.value = true;
  error.value = null;
  try {
    allowed.value = await backend.trainingPlanSetAiPublish(!allowed.value);
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
      <span class="s-row-title">{{ a.publishTitle }}</span>
      <span class="s-row-sub">{{ allowed ? a.publishOn : a.publishOff }}</span>
    </div>
    <GlassSwitch :model-value="allowed" :aria-label="a.publishTitle" :disabled="busy" @update:model-value="toggle" />
    <p v-if="error" class="hint-line" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped src="../settings-local.css"></style>

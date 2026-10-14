<script setup lang="ts">
/**
 * 「全自动交给 AI」（计划 12.1，10-13）：默认关。关着时交出去的 `.md` 只放进剪贴板，用户在对话框里 Ctrl+V；
 * 开着时打开 AI 网站后替用户粘贴、回车（useAutoHandoff）。替用户按键只做了 Windows，别的系统不显示这一行。
 */
import GlassSwitch from '../../../components/GlassSwitch.vue';
import { autoPasteOn, autoSupported, setAutoPaste } from '../../../composables/ai/useAutoHandoff';
import { useMessages } from '../../../i18n';
import { aiCardMessages } from './ai.i18n';

const a = useMessages(aiCardMessages);
const supported = autoSupported();
</script>

<template>
  <div v-if="supported" class="s-row">
    <div class="s-row-main">
      <span class="s-row-title">{{ a.autoTitle }}</span>
      <span class="s-row-sub">{{ autoPasteOn ? a.autoOn : a.autoOff }}</span>
    </div>
    <GlassSwitch data-setting="auto-paste" :model-value="autoPasteOn" :aria-label="a.autoTitle" @update:model-value="setAutoPaste" />
  </div>
</template>

<style scoped src="../settings-local.css"></style>

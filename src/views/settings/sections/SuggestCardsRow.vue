<script setup lang="ts">
/**
 * 首页「今日一问」一键关掉。默认开；记在这台电脑的浏览器存储里（useSuggestCards）。
 */
import { computed } from 'vue';
import GlassSwitch from '../../../components/GlassSwitch.vue';
import { useSuggestCards } from '../../../composables/useSuggestCards';
import { defineMessages, useMessages } from '../../../i18n';

const messages = defineMessages(
  {
    title: '首页「今日一问」',
    on: '首页每天按你最近的情况挑一个问题，点开就发好牌交给 AI，不想问这个可以换',
    off: '首页不出「今日一问」',
  },
  {
    title: 'Question of the day',
    on: 'Each day the home page picks a question from how you have been doing; open it and the right data is dealt for your AI, or switch to another question',
    off: 'No question of the day on the home page',
  },
  {
    title: 'La pregunta del día',
    on: 'Cada día la página principal elige una pregunta según cómo te ha ido; ábrela y se reparten los datos adecuados para tu IA, o cámbiala por otra',
    off: 'Sin pregunta del día en la página principal',
  },
  'views/settings/sections/SuggestCardsRow',
);
const m = useMessages(messages);
const prefs = useSuggestCards();
const on = computed(() => prefs.state.value.enabled);
</script>

<template>
  <div class="s-row">
    <div class="s-row-main">
      <span class="s-row-title">{{ m.title }}</span>
      <span class="s-row-sub">{{ on ? m.on : m.off }}</span>
    </div>
    <GlassSwitch data-setting="suggest-cards" :model-value="on" :aria-label="m.title" @update:model-value="prefs.setEnabled" />
  </div>
</template>

<style scoped src="../settings-local.css"></style>

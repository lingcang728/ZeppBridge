<script setup lang="ts">
/**
 * 首页建议卡（刚练完、昨晚睡得差、很久没动、帮我排明天）一键关掉。默认开；记在这台电脑的浏览器存储里（useSuggestCards）。
 */
import { computed } from 'vue';
import GlassSwitch from '../../../components/GlassSwitch.vue';
import { useSuggestCards } from '../../../composables/useSuggestCards';
import { defineMessages, useMessages } from '../../../i18n';

const messages = defineMessages(
  {
    title: '首页建议卡',
    on: '刚练完、昨晚睡得差、很久没动时，首页给一张建议卡，点一下就发好牌交给 AI',
    off: '首页不出建议卡',
  },
  {
    title: 'Home suggestion cards',
    on: 'After a workout, a rough night or a long break, the home page offers a card that deals the right data to your AI in one tap',
    off: 'No suggestion cards on the home page',
  },
  {
    title: 'Sugerencias de la página principal',
    on: 'Después de entrenar, dormir mal o pasar tiempo sin entrenar, la página principal te ofrece una tarjeta con los datos adecuados para la IA en un solo toque',
    off: 'Sin sugerencias en la página principal',
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

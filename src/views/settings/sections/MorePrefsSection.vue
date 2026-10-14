<script setup lang="ts">
/* 高级卡「更多偏好」：不常改、又不想删掉的偏好，从各自的卡挪到这里排成一块列表。 */
import { useMessages } from '../../../i18n';
import { advancedCardMessages } from './advanced.i18n';
import DisplayMoreRows from './DisplayMoreRows.vue';
import FileNameRow from './FileNameRow.vue';

const m = useMessages(advancedCardMessages);
</script>

<template>
  <section id="more-prefs" class="s-section" aria-labelledby="more-prefs-title">
    <div class="s-section-head"><h3 id="more-prefs-title">{{ m.secPrefs }}</h3></div>
    <div class="s-list">
      <DisplayMoreRows />
      <FileNameRow />
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>

<script setup lang="ts">
/* 反馈问题（2026-11-10 起「写信 = 反馈」）：诊断报告随信寄，入口在信匣。这张卡只剩一句说明和一个去写信的按钮；
   Beta 实验室卡上线时整张卡让位（/settings/feedback 改成跳信匣）。 */
import { RouterLink } from 'vue-router';
import { useMessages } from '../../../i18n';
import { accountCardMessages } from './account.i18n';

const a = useMessages(accountCardMessages);
</script>

<template>
  <section id="feedback" class="s-section">
    <div class="s-list">
      <div class="diagnostic-panel">
        <p>{{ a.writeToAuthorBody }}</p>
        <RouterLink class="button primary write-author" :to="{ path: '/letters', query: { write: 'report' } }">{{ a.writeToAuthor }}</RouterLink>
      </div>
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.write-author { justify-self: start; text-decoration: none; }
</style>

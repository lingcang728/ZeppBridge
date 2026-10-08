<script setup lang="ts">
/* 反馈问题：提交脱敏的诊断报告。从隐私卡挪来——只有设备或运动没认出时才用得上。 */
import DiagnosticReportForm from '../DiagnosticReportForm.vue';
import { createDiagnosticForm } from '../../../composables/settings/useDiagnosticReport';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);
const form = createDiagnosticForm();
</script>

<template>
  <section id="feedback" class="s-section" aria-labelledby="feedback-title">
    <div class="s-section-head"><h3 id="feedback-title">{{ d.secFeedback }}</h3></div>
    <div class="s-list">
      <div class="diagnostic-panel">
        <strong>{{ t.privacyReportTitle }}</strong>
        <p>{{ t.privacyReportBody }}</p>
        <DiagnosticReportForm :form="form" />
      </div>
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>

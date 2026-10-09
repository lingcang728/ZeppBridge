<script setup lang="ts">
/* 反馈问题：提交脱敏的诊断报告。单独一张卡（卡头就是标题，这里不再重复小标题）。 */
import DiagnosticReportForm from '../DiagnosticReportForm.vue';
import { createDiagnosticForm } from '../../../composables/settings/useDiagnosticReport';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';

const t = useMessages(settingsMessages);
const form = createDiagnosticForm();
</script>

<template>
  <section id="feedback" class="s-section">
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

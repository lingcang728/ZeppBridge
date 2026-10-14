<script setup lang="ts">
/* 反馈问题：提交脱敏的诊断报告。单独一张卡（卡头就是标题，这里不再重复小标题）。
   最上面一行请用得顺手的人去 GitHub 点个 Star（10-14 用户要的引导）：常驻、不弹窗、不打扰。 */
import { openUrl } from '@tauri-apps/plugin-opener';
import Icon from '../../../components/Icon.vue';
import DiagnosticReportForm from '../DiagnosticReportForm.vue';
import { createDiagnosticForm } from '../../../composables/settings/useDiagnosticReport';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';

const t = useMessages(settingsMessages);
const form = createDiagnosticForm();
/** 地址写死、并在 capabilities/default.json 里单独放行，别的链接打不开。 */
const REPO = 'https://github.com/lingcang728/ZeppBridge';
const star = () => { void openUrl(REPO).catch(() => undefined); };
</script>

<template>
  <section id="feedback" class="s-section">
    <div class="s-list">
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ t.starTitle }}</span>
          <span class="s-row-sub">{{ t.starBody }}</span>
        </div>
        <button type="button" class="pill-button" @click="star"><Icon name="star" :size="14" />{{ t.starAction }}</button>
      </div>
      <div class="diagnostic-panel">
        <strong>{{ t.privacyReportTitle }}</strong>
        <p>{{ t.privacyReportBody }}</p>
        <DiagnosticReportForm :form="form" />
      </div>
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>

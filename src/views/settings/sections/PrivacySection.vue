<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Icon from '../../../components/Icon.vue';
import ModalDialog from '../../../components/ModalDialog.vue';
import DiagnosticReportForm from '../DiagnosticReportForm.vue';
import { createDiagnosticForm } from '../../../composables/settings/useDiagnosticReport';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';

const t = useMessages(settingsMessages);
const privacyDiagnostic = createDiagnosticForm();
const privacyModalOpen = ref(false);

/* 这里曾有三个只写 localStorage、没有任何后端行为的开关（本地数据加密 /
   启动解锁保护 / 匿名使用洞察）。一个默认打开、写着「加密保护」却什么都不做的
   开关，和把缺失值填成 0 的曲线是同一种错误，所以它们被删掉，而不是留成
   「计划中」继续占位。顺手清掉旧安装遗留的偏好值。 */
const STALE_PRIVACY_PREF_KEYS = [
  'zeppbridge-pref-encrypt',
  'zeppbridge-pref-launch-lock',
  'zeppbridge-pref-anon',
];
onMounted(() => {
  for (const key of STALE_PRIVACY_PREF_KEYS) window.localStorage.removeItem(key);
});
</script>

<template>
  <section id="privacy-section" class="settings-card" aria-labelledby="privacy-title">
    <h2 id="privacy-title">{{ t.privacyTitle }}</h2>
    <ul class="fact-list">
      <li>
        <span class="toggle-icon"><Icon name="lock" :size="14" /></span>
        <div>
          <strong>{{ t.privacyDbTitle }}</strong>
          <span>{{ t.privacyDbBody }}</span>
        </div>
      </li>
      <li>
        <span class="toggle-icon"><Icon name="shield" :size="14" /></span>
        <div>
          <strong>{{ t.privacyTokenTitle }}</strong>
          <span>{{ t.privacyTokenBody }}</span>
        </div>
      </li>
      <li>
        <span class="toggle-icon"><Icon name="user" :size="14" /></span>
        <div>
          <strong>{{ t.privacyTelemetryTitle }}</strong>
          <span>{{ t.privacyTelemetryBody }}</span>
        </div>
      </li>
    </ul>
    <button class="privacy-link-btn" type="button" @click="privacyModalOpen = true">
      <Icon name="shield" :size="13" />{{ t.privacyModalLink }}
    </button>
    <div class="diagnostic-panel">
      <strong>{{ t.privacyReportTitle }}</strong>
      <p>{{ t.privacyReportBody }}</p>
      <DiagnosticReportForm :form="privacyDiagnostic" />
    </div>

    <!-- 隐私政策弹窗（Teleport 到 body，放在这里只是为了跟着这一块的作用域样式） -->
    <ModalDialog v-if="privacyModalOpen" labelledby="privacy-dialog-title" @close="privacyModalOpen = false">
      <div class="modal-head">
        <div class="modal-title-row">
          <Icon name="shield" :size="18" class="shield-ic" />
          <h3 id="privacy-dialog-title">{{ t.privacyModalTitle }}</h3>
        </div>
        <button type="button" class="close-btn" :aria-label="t.closeDialog" @click="privacyModalOpen = false"><Icon name="x" :size="16" /></button>
      </div>
      <div class="modal-body">
        <p><strong>{{ t.privacyPoint1Title }}</strong>{{ t.privacyPoint1 }}</p>
        <p><strong>{{ t.privacyPoint2Title }}</strong>{{ t.privacyPoint2 }}</p>
        <p><strong>{{ t.privacyPoint3Title }}</strong>{{ t.privacyPoint3 }}</p>
        <p><strong>{{ t.privacyPoint4Title }}</strong>{{ t.privacyPoint4 }}</p>
        <p><strong>{{ t.privacyPoint5Title }}</strong>{{ t.privacyPoint5 }}</p>
      </div>
      <div class="modal-foot">
        <button type="button" class="button primary" @click="privacyModalOpen = false">{{ t.privacyModalOk }}</button>
      </div>
    </ModalDialog>
  </section>
</template>

<style scoped src="../settings-base.css"></style>
<style scoped>
.fact-list { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.fact-list li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: start; }
.fact-list strong { display: block; margin-bottom: 3px; color: var(--ink); font-size: var(--fs-sm); font-weight: 600; }
.fact-list span { color: var(--subtle); font-size: var(--fs-xs); line-height: 1.55; }
.privacy-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 6px 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: var(--fs-sm);
  cursor: pointer;
  transition: color 140ms ease;
}
.privacy-link-btn:hover { color: var(--accent); }
</style>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Icon from '../../../components/Icon.vue';
import ModalDialog from '../../../components/ModalDialog.vue';
import DiagnosticReportForm from '../DiagnosticReportForm.vue';
import { createDiagnosticForm } from '../../../composables/settings/useDiagnosticReport';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);
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
  <section id="privacy-section" class="privacy" aria-labelledby="privacy-title">
    <div class="s-section">
      <div class="s-section-head">
        <h3 id="privacy-title">{{ d.secLocalData }}</h3>
        <button class="link-btn" type="button" @click="privacyModalOpen = true">
          <Icon name="shield" :size="13" />{{ t.privacyModalLink }}
        </button>
      </div>
      <div class="s-list">
      <div class="s-row">
        <span class="fact-icon"><Icon name="lock" :size="15" /></span>
        <div class="s-row-main">
          <span class="s-row-title">{{ t.privacyDbTitle }}</span>
          <span class="s-row-sub">{{ t.privacyDbBody }}</span>
        </div>
      </div>
      <div class="s-row">
        <span class="fact-icon"><Icon name="shield" :size="15" /></span>
        <div class="s-row-main">
          <span class="s-row-title">{{ t.privacyTokenTitle }}</span>
          <span class="s-row-sub">{{ t.privacyTokenBody }}</span>
        </div>
      </div>
      <div class="s-row">
        <span class="fact-icon"><Icon name="user" :size="15" /></span>
        <div class="s-row-main">
          <span class="s-row-title">{{ t.privacyTelemetryTitle }}</span>
          <span class="s-row-sub">{{ t.privacyTelemetryBody }}</span>
        </div>
      </div>
      </div>
    </div>
    <div class="s-section">
      <div class="s-section-head"><h3>{{ d.secFeedback }}</h3></div>
      <div class="s-list">
        <div class="diagnostic-panel">
          <strong>{{ t.privacyReportTitle }}</strong>
          <p>{{ t.privacyReportBody }}</p>
          <DiagnosticReportForm :form="privacyDiagnostic" />
        </div>
      </div>
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
.privacy { display: grid; gap: 22px; }
.privacy > .s-section + .s-section { margin-top: 0; }
.fact-icon { display: grid; width: 32px; height: 32px; flex: 0 0 32px; place-items: center; border-radius: 10px; background: var(--accent-soft); color: var(--accent); }
.link-btn { display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: transparent; color: var(--accent); font-size: var(--fs-sm); cursor: pointer; }
.link-btn:hover { text-decoration: underline; }
</style>

<script setup lang="ts">
/* 诊断报告表单：设备区块（识别不出设备时）和隐私区块各放一份。
 * 渲染成多个根节点，直接落进调用方的 `.diagnostic-panel` 网格里。 */
import Icon from '../../components/Icon.vue';
import SelectMenu from '../../components/SelectMenu.vue';
import { useSettingsContext } from '../../composables/settings/context';
import { DIAGNOSTIC_NOTE_MAX, type DiagnosticFormState } from '../../composables/settings/useDiagnosticReport';
import { useSettingsFormat } from '../../composables/settings/useSettingsFormat';
import { useMessages } from '../../i18n';
import { settingsMessages } from '../Settings.i18n';

const props = defineProps<{ form: DiagnosticFormState }>();

const t = useMessages(settingsMessages);
const { formatDateTime } = useSettingsFormat();
const { diagnosticBusy, reportCategories, submitDiagnosticReport } = useSettingsContext().diagnostics;
// 表单对象由调用方创建（reactive），这里只改它的字段。
const form = props.form;
</script>

<template>
  <div class="diagnostic-note">
    <span>{{ t.reportWhat }}<em>{{ t.reportWhatHint }}</em></span>
    <SelectMenu
      v-model="form.category"
      :options="reportCategories"
      :placeholder="t.reportCategoryPlaceholder"
      :aria-label="t.reportCategoryAria"
    />
  </div>
  <label class="diagnostic-note">
    <span>{{ t.reportNote }}<em>{{ t.reportNoteHint }}</em></span>
    <textarea
      v-model="form.note"
      rows="3"
      :maxlength="DIAGNOSTIC_NOTE_MAX"
      :placeholder="t.reportNotePlaceholder"
    ></textarea>
    <small>{{ t.reportNoteCounter(form.note.length, DIAGNOSTIC_NOTE_MAX) }}</small>
  </label>
  <button class="button secondary" type="button" :disabled="diagnosticBusy" @click="submitDiagnosticReport(form)">
    <Icon name="send" :size="14" />{{ diagnosticBusy ? t.reportSubmitting : t.reportSubmit }}
  </button>
  <div v-if="form.result" class="diagnostic-done" role="status">
    <strong><Icon name="circle-check" :size="14" />{{ t.reportDoneTitle }}</strong>
    <p>{{ t.reportDoneLine(form.result.reportId, formatDateTime(form.result.submittedAt)) }}</p>
    <p class="diagnostic-done-note">{{ t.reportDoneNote }}</p>
  </div>
  <p v-if="form.error" class="api-error" role="alert">{{ form.error }}</p>
</template>

<style scoped src="./settings-base.css"></style>

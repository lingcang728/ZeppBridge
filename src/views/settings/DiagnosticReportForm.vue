<script setup lang="ts">
/* 诊断报告表单：设备区块（识别不出设备时）和隐私区块各放一份。
 * 渲染成多个根节点，直接落进调用方的 `.diagnostic-panel` 网格里。 */
import Icon from '../../components/Icon.vue';
import { computed } from 'vue';
import SegmentTrack from '../../components/SegmentTrack.vue';
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
/* 选中那一类的一句说明，跟在胶囊下面（以前藏在下拉的每一项里）。 */
const categoryHint = computed(() => reportCategories.value.find((item) => item.value === form.category)?.hint ?? '');
</script>

<template>
  <div class="diagnostic-note">
    <span>{{ t.reportWhat }}<em>{{ t.reportWhatHint }}</em></span>
    <SegmentTrack v-model="form.category" compact class="report-kind" :items="reportCategories" :aria-label="t.reportCategoryAria" />
    <small v-if="categoryHint">{{ categoryHint }}</small>
  </div>
  <label class="diagnostic-note">
    <span>{{ t.reportNote }}<em>{{ t.reportNoteHint }}</em></span>
    <textarea
      v-model="form.note"
      class="mat-field"
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

<style scoped src="./settings-local.css"></style>
<style scoped>
/* 要压过 SegmentTrack 自己的 overflow: hidden，所以留在组件的作用域里，别挪进全局的
   settings-base.css——那里的规则没有作用域属性，优先级低一档。 */
.report-kind { justify-self: start; max-width: 100%; overflow-x: auto; }
</style>

import { computed, reactive, ref } from 'vue';
import { backend, toUserMessage } from '../../lib/bridge';
import { useMessages } from '../../i18n';
import { settingsMessages } from '../../views/Settings.i18n';
import type { SettingsFeedback } from './useSettingsFeedback';

/* 用户自己写的一句说明。
 *
 * 只发字段结构和编号时，收到报告的人经常判断不出这是哪一款表；
 * 「我的表是 Balance 2，但显示未识别」这一句往往比十个字段都管用。
 * 自由文本会在后端过一遍脱敏（本机路径、邮箱、长串标识）并截到 500 字。 */
export const DIAGNOSTIC_NOTE_MAX = 500;

export type DiagnosticFormState = {
  category: string;
  note: string;
  result: { reportId: string; submittedAt: string } | null;
  error: string | null;
};

export const createDiagnosticForm = () => reactive<DiagnosticFormState>({
  category: '',
  note: '',
  result: null,
  error: null,
});

/**
 * 诊断报告。设备区块和隐私区块各有一张表单，但同一时刻只允许一份在提交，
 * 所以「提交中」由设置页统一持有。
 */
export const createDiagnosticReport = (feedback: SettingsFeedback) => {
  const t = useMessages(settingsMessages);
  const diagnosticBusy = ref(false);

  /* 让用户自己说要报什么。
     本机的自动检测只能发现「有未识别的设备或运动编号」；用户遇到的可能是
     别的（数据对不上、某项一直是空）。以前这些人会被「无需提交报告」顶回去，
     而界面上又没有任何地方能说明情况。 */
  const reportCategories = computed(() =>
    (['device', 'workout', 'data', 'other'] as const).map((value) => ({
      value,
      label: t.value.reportCategory[value].label,
      hint: t.value.reportCategory[value].hint,
    })));

  const submitDiagnosticReport = async (form: DiagnosticFormState) => {
    const confirmed = window.confirm(t.value.reportConfirm);
    if (!confirmed) return;
    diagnosticBusy.value = true;
    form.error = null;
    form.result = null;
    feedback.dataError.value = null;
    feedback.dataMessage.value = null;
    try {
      const note = form.note.trim();
      const result = await backend.submitDiagnosticReport(
        note || undefined,
        form.category || undefined,
      );
      form.result = { reportId: result.reportId, submittedAt: result.submittedAt };
      form.note = '';
      form.category = '';
    } catch (error) {
      form.error = toUserMessage(error, t.value.reportFailed);
    } finally {
      diagnosticBusy.value = false;
    }
  };

  return { diagnosticBusy, reportCategories, submitDiagnosticReport };
};

export type DiagnosticReport = ReturnType<typeof createDiagnosticReport>;

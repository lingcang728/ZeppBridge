/**
 * 跑后打分的系统通知（批次 7）：同步落地后有一条该问的、而窗口不在眼前，就发一条系统通知。
 * Windows 上通知直接带五档按钮，点了就记下，不用打开应用；其他平台是普通通知。
 *
 * 每条运动只发一次（后端记着）；窗口在前台时不发——概览上那张卡已经在问了。
 * 文案在这里按界面语言组好，后端只管发。
 */
import { watch } from 'vue';
import { backend, isDesktop } from '../lib/bridge';
import { useFeedbackText } from '../components/feedback/feedback.i18n';
import { feedbackAsk } from '../components/feedback/feedbackAsk';
import { useSyncController } from './useSyncController';

let started = false;

export const useFeedbackToast = () => {
  if (started || !isDesktop()) return;
  started = true;
  const t = useFeedbackText();
  const { dataRevision } = useSyncController();
  const away = () => document.visibilityState === 'hidden' || !document.hasFocus();
  watch(dataRevision, async () => {
    if (!away()) return;
    try {
      const due = await backend.workoutFeedbackToastDue();
      if (!due) return;
      const text = t.value;
      await backend.workoutFeedbackToastShow({
        token: due.token,
        title: feedbackAsk(due.prompt, text),
        body: text.toastBody,
        labels: [text.level1, text.level2, text.level3, text.level4, text.level5],
      });
    } catch {
      // 通知发不出去不打扰：概览上的卡照样会问。
    }
  });
};

/**
 * 交出去以后那一句提示（回执卡、运动页「问 AI」浮层共用，同一句话只有这一份渲染）：
 * 全自动的进度 > 文件已在剪贴板（Ctrl+V，Mac 上 ⌘V）> 拖文件（放不进剪贴板时）。
 */
import { computed } from 'vue';
import { autoStage, clip } from '../../../composables/ai/useAutoHandoff';
import { withPlatformKeys } from '../../../lib/platformKeys';
import { useStageText } from './stage.i18n';

type StageText = ReturnType<typeof useStageText>['value'];

const lead = (s: StageText, p: string): string => {
  switch (autoStage.value) {
    case 'waiting': return s.autoWaiting(p);
    case 'file': return s.autoFilling;
    case 'filled': return s.autoFilled;
    case 'sent': return s.autoSent(p);
    case 'aborted': case 'timeout': return s.autoStopped;
    default: return clip.value === 'file' ? s.receiptPaste(p) : s.receiptLead;
  }
};

export const useHandoffLead = (provider: () => string) => {
  const s = useStageText();
  return computed(() => withPlatformKeys(lead(s.value, provider())));
};

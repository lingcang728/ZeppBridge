import { computed, ref } from 'vue';
import { useSyncController } from '../useSyncController';
import { backend, toUserMessage } from '../../lib/bridge';
import { useMessages } from '../../i18n';
import { settingsMessages } from '../../views/Settings.i18n';
import type { WorkoutCodeLabel } from '../../types';

/* 未识别运动编号命名。
   「本机推不出来，就问用户」，而不是让应用去猜：Zepp 的自定义训练模板只给编号不给名字。 */
export const useUnknownCodes = () => {
  const t = useMessages(settingsMessages);
  const { markDataChanged } = useSyncController();
  const unknownCodes = ref<WorkoutCodeLabel[]>([]);
  const codeDrafts = ref<Record<number, string>>({});
  const codeBusy = ref<number | null>(null);
  const codeError = ref<string | null>(null);
  const codeMessage = ref<string | null>(null);

  const unnamedCodeCount = computed(() => unknownCodes.value.filter((entry) => !entry.label).length);

  /* 起名字的快捷入口。这些只是「少打几个字」，不是对编号的识别结论——
     点一下只是把文本填进输入框，用户仍然可以改成任何名字。 */
  const codeNameSuggestions = computed(() => t.value.codeSuggestions);

  const loadCorrections = async () => {
    const codes = await backend.getUnknownWorkoutCodes().catch(() => [] as WorkoutCodeLabel[]);
    unknownCodes.value = codes;
    codeDrafts.value = Object.fromEntries(codes.map((entry) => [entry.zeppType, entry.label]));
  };

  const saveCodeLabel = async (zeppType: number) => {
    codeBusy.value = zeppType;
    codeError.value = null;
    codeMessage.value = null;
    try {
      const draft = (codeDrafts.value[zeppType] || '').trim();
      unknownCodes.value = await backend.setWorkoutCodeLabel(zeppType, draft || null);
      codeDrafts.value = Object.fromEntries(unknownCodes.value.map((entry) => [entry.zeppType, entry.label]));
      codeMessage.value = draft
        ? t.value.codeSaved(zeppType, draft)
        : t.value.codeCleared(zeppType);
      markDataChanged();
    } catch (error) {
      codeError.value = toUserMessage(error, t.value.codeSaveFailed);
    } finally {
      codeBusy.value = null;
    }
  };

  return {
    unknownCodes,
    codeDrafts,
    codeBusy,
    codeError,
    codeMessage,
    unnamedCodeCount,
    codeNameSuggestions,
    loadCorrections,
    saveCodeLabel,
  };
};

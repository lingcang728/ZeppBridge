<script setup lang="ts">
/**
 * 「交给 AI」页下方的训练计划段：AI 的回复贴回来 → 检查 → 发到手表。
 *
 * 收在页面的「收到 AI 的计划？贴回来」折叠段里（AiComposer 供标题与摘要），
 * 问 AI 和收 AI 的计划在同一页，来回不用跳。
 *   - 顶上一行「上次发到手表的计划」账本（有过推送才出现）：撤销上一次 / 清空 7 天；
 *   - 贴回来之前是「AI 给了训练计划？」入口；贴回来之后换成审阅卡；
 *   - 每次操作的结局用一句话说清（已送达 / 没有确认 / 被拒绝），不报没验证过的成功。
 */
import { computed, onMounted, watch } from 'vue';
import PlanLedger from './PlanLedger.vue';
import PlanPasteBar from './PlanPasteBar.vue';
import PlanReview from './PlanReview.vue';
import ModalDialog from '../ModalDialog.vue';
import Icon from '../Icon.vue';
import { useTrainingPlan, type PlanNotice } from '../../composables/useTrainingPlan';
import { useSyncController } from '../../composables/useSyncController';
import { isDesktop } from '../../lib/bridge';
import { usePlanText } from './usePlanText';

const { t } = usePlanText();
const plan = useTrainingPlan();
const { state, preview, busy, notice, clearPending } = plan;

onMounted(() => { void plan.resume(); });
/* 同步落地以后窗口可能往前滚了一天，滚动推送也可能刚发过：重新读账本。 */
const { dataRevision } = useSyncController();
watch(dataRevision, () => { void plan.load(); });

const written = computed(() => state.value?.drafts.find((draft) => draft.id === plan.draftId.value)?.document.workouts ?? []);
const showLedger = computed(() => !!state.value && (!!state.value.last_publish || state.value.sent.length > 0));

const pasteError = computed(() => {
  const current = notice.value;
  if (current?.kind !== 'paste_failed') return null;
  return { empty: t.value.pasteEmpty, no_json: t.value.pasteNoJson, not_a_plan: t.value.pasteNotPlan }[current.failure];
});

const NOTICE_TONE: Record<PlanNotice['kind'], 'ok' | 'warn'> = {
  sent: 'ok', undone: 'ok', cleared: 'ok', not_needed: 'ok', nothing_to_undo: 'ok',
  unconfirmed: 'warn', rejected: 'warn', invalid: 'warn', paste_failed: 'warn', error: 'warn',
};
const noticeText = computed(() => {
  const current = notice.value;
  if (!current || current.kind === 'paste_failed') return null;
  switch (current.kind) {
    case 'sent': return t.value.noticeSent;
    case 'unconfirmed': return t.value.noticeUnconfirmed;
    case 'rejected': return t.value.noticeRejected;
    case 'not_needed': return t.value.noticeNotNeeded;
    case 'nothing_to_undo': return t.value.noticeNothingToUndo;
    case 'undone': return t.value.noticeUndone;
    case 'cleared': return t.value.noticeCleared;
    case 'invalid': return t.value.noticeInvalid;
    default: return current.text || t.value.noticeError;
  }
});
const noticeTone = computed(() => (notice.value ? NOTICE_TONE[notice.value.kind] : 'ok'));
</script>

<template>
  <!-- 无段头：标题与摘要在 AiComposer 的折叠头上；账本是内容里的第一行。 -->
  <div v-if="isDesktop()" class="plan-section" aria-live="polite">
    <PlanLedger v-if="showLedger && state" :state="state" :busy="busy" @undo="plan.undo()" @clear="plan.clear(false)" />

    <div v-if="noticeText" :class="['notice', noticeTone]" role="status">
      <Icon :name="noticeTone === 'ok' ? 'check' : 'warning'" :size="16" />
      <span>{{ noticeText }}</span>
      <button type="button" class="pill-button quiet" @click="plan.dismissNotice()">{{ t.dismiss }}</button>
    </div>

    <PlanReview v-if="preview" :preview="preview" :written="written" :busy="busy" @send="plan.publish()" @discard="plan.discard()" />
    <PlanPasteBar v-else :busy="busy" :error="pasteError" @submit="plan.paste($event)" />

    <ModalDialog v-if="clearPending" labelledby="plan-clear-title" @close="plan.cancelClear()">
      <div class="clear">
        <h2 id="plan-clear-title">{{ t.clearTitle }}</h2>
        <p>{{ t.clearBody }}</p>
        <div class="clear-acts">
          <button type="button" class="pill-button quiet" @click="plan.cancelClear()">{{ t.cancel }}</button>
          <button type="button" class="button danger-button confirm" :disabled="busy" @click="plan.clear(true)">{{ t.clearConfirm }}</button>
        </div>
      </div>
    </ModalDialog>
  </div>
</template>

<style scoped>
.plan-section { display: grid; gap: 14px; }
.notice { display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 16px; border-radius: 18px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); font-size: var(--fs-xs); line-height: 1.5; }
.notice.ok { color: var(--accent); }
.notice.warn { color: var(--warning); }
.notice span { flex: 1; min-width: 0; color: var(--ink); }
.clear { display: grid; gap: 12px; }
.clear h2 { margin: 0; font-size: var(--fs-xl); }
.clear p { margin: 0; color: var(--muted); font-size: var(--fs-sm); line-height: 1.6; }
.clear-acts { display: flex; justify-content: flex-end; gap: 8px; }
.confirm { min-height: 38px; border-radius: 999px; padding-inline: 20px; }
</style>

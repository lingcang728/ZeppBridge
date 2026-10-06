/**
 * 训练计划的界面状态：手表上上次发的、手上这份草稿的预览，以及粘贴 / 发送 / 撤销 / 清空。
 *
 * 流程：粘贴 AI 的回复 → 取出计划（`extractPlan`）→ 存成草稿 → 预览（后端逐日对比「发之前 / 发之后」
 * 并校验）→ 看完点「发到手表」。默认要人确认，不自动发。
 *
 * 全局单例：交给 AI 页和以后概览里的「这一周」读同一份，不各查各的。
 *
 * 诚实：官方没有读取接口，`state.sent` 只是**账本**里上次发过去的，不是手表上现在有的；
 * 最近一次结果不确定（断网 / 超时）时 `uncertain` 为真，界面照实说「没有确认」，不报成功。
 */
import { computed, ref } from 'vue';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { locale } from '../i18n';
import { extractPlan, type ExtractFailure } from '../lib/trainingPlan/extract';
import type {
  PlanDraftPreview,
  PlanPublishAction,
  PlanPublishResult,
  PlanPublishRecord,
  TrainingPlanState,
  PlanDocument,
} from '../types/trainingPlan';

/** 一次操作的结局，界面据此换成对应语言的一句话。 */
export type PlanNotice =
  | { kind: 'sent' }
  | { kind: 'unconfirmed' }
  | { kind: 'rejected'; errorCode: string | null }
  /** 有的周送到了、有的没有：`weeks` 是没送达那几周的起始日。 */
  | { kind: 'partial'; weeks: string[] }
  | { kind: 'not_needed' }
  | { kind: 'nothing_to_undo' }
  | { kind: 'undone' }
  | { kind: 'cleared' }
  | { kind: 'invalid' }
  | { kind: 'paste_failed'; failure: ExtractFailure }
  | { kind: 'clipboard_not_a_plan' }
  | { kind: 'error'; text: string };

const state = ref<TrainingPlanState | null>(null);
const draftId = ref<string | null>(null);
const preview = ref<PlanDraftPreview | null>(null);
const busy = ref(false);
const notice = ref<PlanNotice | null>(null);
/** 「清空」要先问一遍：后端说需要确认时置真，界面弹确认，确认后带 confirm 再发。 */
const clearPending = ref(false);
let pendingAction: PlanPublishAction | null = null;
const document = ref<PlanDocument | null>(null);
const transcript = ref<{ lines: string[]; total: number } | null>(null);
const accepted = ref(true);
const revision = ref(0);

let loadSeq = 0;

const load = async () => {
  if (!isDesktop()) return;
  const mine = ++loadSeq;
  try {
    const next = await backend.trainingPlanState();
    if (mine === loadSeq) state.value = next;
  } catch {
    // 读不到就保持现状；界面不因为一次读失败把已经显示的计划抹掉。
  }
};

const loadPreview = async (id: string) => {
  const next = await backend.trainingPlanPreview(id);
  preview.value = next;
  draftId.value = id;
};

/** 打开页面时：有没有还没处理的草稿（比如 MCP 或上次粘贴后没发）。有就接着看。 */
const resume = async () => {
  await load();
  if (draftId.value || !state.value) return;
  const open = state.value.drafts[0];
  if (!open) return;
  try {
    await loadPreview(open.id);
    document.value = open.document;
    accepted.value = open.origin !== 'mcp';
  } catch {
    // 草稿读不出来就当没有。
  }
};

const report = (error: unknown): PlanNotice => ({ kind: 'error', text: toUserMessage(error, '') });

/** 粘贴 AI 的回复。 */
const paste = async (reply: string): Promise<boolean> => {
  notice.value = null;
  const found = extractPlan(reply);
  if (!found.ok) {
    notice.value = { kind: 'paste_failed', failure: found.failure };
    return false;
  }
  busy.value = true;
  try {
    const id = await backend.trainingPlanSaveDraft(found.document, true);
    document.value = found.document;
    accepted.value = true;
    await loadPreview(id);
    await load();
    revision.value++;
    return true;
  } catch (error) {
    notice.value = report(error);
    return false;
  } finally {
    busy.value = false;
  }
};

const receiveFromClipboard = async (): Promise<boolean> => {
  if (busy.value) return false;
  busy.value = true;
  notice.value = null;
  try {
    const reply = await backend.readClipboardText();
    if (!extractPlan(reply).ok) { notice.value = { kind: 'clipboard_not_a_plan' }; return false; }
    const lines = reply.split(/\r?\n/);
    transcript.value = { lines: lines.filter(line => line.trim()).slice(0, 5), total: lines.length };
    const ok = await paste(reply);
    if (!ok) transcript.value = null;
    return ok;
  } catch (error) { notice.value = report(error); return false; }
  finally { busy.value = false; }
};

const reshape = async (next: PlanDocument) => {
  if (busy.value || !draftId.value || !accepted.value) return;
  busy.value = true;
  try {
    if (!(await backend.trainingPlanUpdateDraft(draftId.value, next))) throw new Error('');
    document.value = next;
    await loadPreview(draftId.value);
    await load(); revision.value++;
  } catch (error) { notice.value = report(error); }
  finally { busy.value = false; }
};

const discard = async () => {
  const id = draftId.value;
  if (!id) return;
  busy.value = true;
  try {
    await backend.trainingPlanDiscard(id);
    draftId.value = null;
    document.value = null;
    preview.value = null;
    notice.value = null;
    await load();
    revision.value++;
  } catch (error) {
    notice.value = report(error);
  } finally {
    busy.value = false;
  }
};

const recordNotice = (record: PlanPublishRecord | null, records: PlanPublishRecord[], fallback: PlanNotice): PlanNotice => {
  if (!record) return fallback;
  if (record.state === 'sent') return fallback;
  if (record.state === 'rejected') return { kind: 'rejected', errorCode: record.error_code };
  if (record.state === 'partial') {
    // 占位那一行不是用户的一周，不单独报；它没送到时前一周的重推会补上。
    const weeks = records.filter((row) => row.state === 'rejected' && row.role !== 'placeholder').map((row) => row.window_start);
    return { kind: 'partial', weeks: [...new Set(weeks)].sort() };
  }
  return { kind: 'unconfirmed' };
};

const run = async (action: PlanPublishAction, confirmClear: boolean): Promise<void> => {
  busy.value = true;
  notice.value = null;
  clearPending.value = false;
  try {
    const result: PlanPublishResult = await backend.trainingPlanPublish(action, confirmClear, locale.value);
    const { outcome, record } = result;
    const records = result.records ?? [];
    switch (outcome.outcome) {
      case 'send': {
        const done: PlanNotice = action.kind === 'undo' ? { kind: 'undone' } : action.kind === 'clear' ? { kind: 'cleared' } : { kind: 'sent' };
        notice.value = recordNotice(record, records, done);
        // 发成功（或结果不确定、已按已发记下）以后这份草稿就办完了；被拒绝则草稿重新打开，留着让人改了再发。
        if (action.kind === 'draft' && record?.state !== 'rejected') {
          draftId.value = null;
          preview.value = null;
        } else if (action.kind === 'draft' && draftId.value) {
          await loadPreview(draftId.value);
        }
        break;
      }
      case 'not_needed':
        notice.value = { kind: 'not_needed' };
        if (action.kind === 'draft') { draftId.value = null; preview.value = null; }
        break;
      case 'nothing_to_undo':
        notice.value = { kind: 'nothing_to_undo' };
        break;
      case 'needs_clear_confirmation':
        pendingAction = action;
        clearPending.value = true;
        break;
      case 'invalid':
        notice.value = { kind: 'invalid' };
        if (draftId.value) await loadPreview(draftId.value);
        break;
    }
  } catch (error) {
    notice.value = report(error);
  } finally {
    busy.value = false;
    await load();
    revision.value++;
  }
};

const publish = () => {
  if (busy.value || !accepted.value || blocking.value.length) return Promise.resolve();
  const id = draftId.value;
  if (id) return run({ kind: 'draft', id }, false);
  return Promise.resolve();
};
const undo = () => run({ kind: 'undo' }, false);
const clear = (confirmed = false) => run({ kind: 'clear' }, confirmed);

const dismissNotice = () => { notice.value = null; };
const cancelClear = () => { clearPending.value = false; pendingAction = null; };
const confirmClear = () => { const action = pendingAction; pendingAction = null; return action ? run(action,true) : Promise.resolve(); };

/** Errors and unverified shapes both block delivery; warnings do not. The backend enforces the same gate. */
const blocking = computed(() => preview.value?.check.issues.filter((issue) => issue.severity !== 'warning') ?? []);
const unverified = computed(() => preview.value?.check.issues.filter((issue) => issue.severity === 'unverified') ?? []);

export const useTrainingPlan = () => ({
  state, draftId, preview, busy, notice, clearPending, blocking, unverified,
  document, transcript, accepted, revision, receiveFromClipboard, reshape,
  accept: () => { accepted.value = true; },
  load, resume, paste, discard, publish, undo, clear, dismissNotice, cancelClear, confirmClear,
});

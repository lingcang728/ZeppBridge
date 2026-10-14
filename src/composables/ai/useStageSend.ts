/**
 * 舞台上按门锁的那一下（2026-10-08，用户拍板「一按到底，卡是回执」）。
 *
 * 逻辑原样搬自旧底栏（HandoffDock 的 run）：先保存任务 → 按下那一刻的 AI / 方向 / 预览拼 options →
 * 准备**一个** `.md`。不同的是三步拆开放：准备文件和汇聚动画同时跑（动画盖住准备的耗时），回执牌落定以后
 * 才复制开场白、打开网站。中途收回（Esc / 再点锁）：牌原路飞回，文件照常备好落成回执牌，但不自动打开网站。
 *
 * 状态是模块级单例：切到 /ai/check 再回来，回执牌还在。
 */
import { computed, ref, watch } from 'vue';
import { AI_PROVIDERS, type AiProvider, type AiProviderId } from '../../lib/aiProviders';
import { currentProviderId, FREE_TOKEN_BUDGET, formatTokens, isSubscribed } from '../../lib/aiTask/budget';
import { handoffParts } from '../../lib/aiTask/handoffParts';
import { markdownGuide } from '../../lib/aiTask/markdownGuide';
import { planGuide } from '../../lib/aiTask/planGuide';
import { isDesktop } from '../../lib/bridge';
import type { AiTask, AiTaskPrepareResult, AiTaskPreview } from '../../lib/bridge/types';
import { useAiTaskDraft } from '../useAiTaskDraft';
import { useAiTaskHandoff } from '../useAiTaskHandoff';
import { useAiTaskPreview } from '../useAiTaskPreview';
import { useSyncController } from '../useSyncController';
import { useAiDerived } from './useAiHub';
import { useHandoffText } from '../../components/ai/HandoffDock.i18n';

export type FutureFace = 'question' | 'receipt' | 'plan';

const handoff = useAiTaskHandoff();
const provider = ref<AiProvider>(handoff.lastProvider.value ?? AI_PROVIDERS[0]!);
/** 右牌现在朝外的那一面。 */
const face = ref<FutureFace>('question');
/** 这一次是不是半路收回的（回执牌上说一句「没有自动打开」）。 */
const recalled = ref(false);
/** 汇聚编排在跑（锁的环在转）。 */
const gathering = ref(false);
watch(provider, (next) => { currentProviderId.value = next.id; }, { immediate: true });

export interface SendChoreography {
  /** 牌飞进锁（和准备文件同时开跑）。被 `recall` 打断时提前 resolve。 */
  gather: () => Promise<void>;
  /** 回执牌从锁里长出来、落到右边。 */
  emerge: () => Promise<void>;
  /** 牌原路飞回（失败、被拦下）。 */
  scatter: () => Promise<void>;
}

/** 交给后端的准备选项：按下那一刻的预览、方向和 AI（同旧底栏）。 */
const optionsFor = (task: AiTask, preview: AiTaskPreview | null, direction: string | null, id: AiProviderId) => {
  const parts = handoffParts(task, preview, { hasDirection: Boolean(direction), now: new Date(), format: 'md' });
  return {
    briefText: parts.brief, dataFileStem: parts.dataStem, promptFileStem: parts.promptStem, promptOverride: null,
    provider: id, tokenBudget: preview?.markdown?.token_budget ?? FREE_TOKEN_BUDGET,
    markdownGuide: `${markdownGuide()}\n<!-- zeppbridge-final-plan -->\n${planGuide()}`,
  };
};

export const useStageSend = () => {
  const ctl = useAiTaskDraft();
  const derived = useAiDerived();
  const coverage = useAiTaskPreview();
  const { isSyncing } = useSyncController();
  const t = useHandoffText();
  const desktop = isDesktop();

  const ready = computed(() => (handoff.prepareResult.value?.status === 'ready' ? handoff.prepareResult.value : null));
  const blocked = computed(() => (handoff.prepareResult.value?.status === 'blocked' ? handoff.prepareResult.value.blocked : []));
  const exportTask = () => ({ ...ctl.draft.value, title: ctl.draft.value.title.trim() || derived.title.value });
  const stale = computed(() => handoff.isStale(exportTask()));
  const busy = computed(() => handoff.inFlight.value || gathering.value || handoff.steps.value.prepare.state === 'doing');
  const disabled = computed(() => !desktop || isSyncing.value);
  const subscribed = computed(() => isSubscribed(provider.value.id));

  /** 「约 2.8 万 token · 免费版能读完」：同旧底栏。 */
  const mdLine = computed(() => {
    const md = coverage.preview.value?.markdown;
    if (!md) return null;
    if (md.over_budget) return t.value.tooLong;
    const tokens = formatTokens(md.approx_tokens);
    if (md.approx_tokens <= FREE_TOKEN_BUDGET) return t.value.tokensFree(tokens);
    return subscribed.value ? t.value.tokensPaid(tokens) : t.value.tokensNeedPaid(tokens);
  });
  /** 就绪度：几类数据、总体多少天有数据。 */
  const readiness = computed(() => {
    const rows = coverage.preview.value?.coverage ?? [];
    if (!rows.length) return null;
    const categories = new Set(rows.map((row) => row.category)).size;
    const total = rows.reduce((sum, row) => sum + row.days_in_range, 0);
    const have = rows.reduce((sum, row) => sum + row.days_with_data, 0);
    return { categories, percent: total > 0 ? Math.round((have / total) * 100) : 0 };
  });
  const issueCount = computed(() => (coverage.preview.value?.warnings.length ?? 0) + (coverage.previewError.value ? 1 : 0));

  let recall: (() => void) | null = null;

  /** 按锁：保存 → 准备（同时汇聚）→ 落回执 → 复制 → 打开。 */
  const send = async (motion: SendChoreography, onPrepared?: (result: AiTaskPrepareResult) => void) => {
    if (disabled.value || busy.value) return;
    recalled.value = false;
    gathering.value = true;
    const target = provider.value;
    const direction = derived.direction.value;
    const preview = coverage.preview.value;
    let interrupted = false;
    const recalledNow = new Promise<void>((resolve) => { recall = () => { interrupted = true; resolve(); }; });
    try {
      await handoff.start(() => ctl.saveDraft(derived.title.value), async () => {
        const task = exportTask();
        const preparing = handoff.runPrepare(task, direction, optionsFor(task, preview, direction, target.id));
        await Promise.race([Promise.all([motion.gather(), preparing]), recalledNow]);
        // 半路收回：牌从此刻原路飞回；文件照常等它备好，落成回执牌，但不自动打开网站。
        if (interrupted) {
          await motion.scatter();
          const late = await preparing;
          if (late?.status === 'ready') { face.value = 'receipt'; recalled.value = true; onPrepared?.(late); }
          return;
        }
        const result = await preparing;
        if (!result || result.status !== 'ready') { await motion.scatter(); return; }
        // 先换成回执那一面，再让它从锁里长出来（emerge 等 DOM 换好再放）。
        face.value = 'receipt';
        onPrepared?.(result);
        await motion.emerge();
        await new Promise((resolve) => window.setTimeout(resolve, 400));
        if (interrupted) { recalled.value = true; return; }
        if (await handoff.runCopy()) await handoff.runOpen(target);
      });
    } finally {
      gathering.value = false;
      recall = null;
    }
  };

  return {
    provider, face, recalled, gathering, ready, blocked, stale, busy, disabled, mdLine, readiness, issueCount, subscribed,
    steps: handoff.steps, saveError: handoff.saveError,
    send,
    /** 只导出到桌面（不复制、不打开网站、不放汇聚）：同旧底栏右边那枚小按钮。 */
    exportOnly: async () => {
      if (disabled.value || busy.value) return;
      const preview = coverage.preview.value;
      const direction = derived.direction.value;
      await handoff.start(() => ctl.saveDraft(derived.title.value), async () => {
        const task = exportTask();
        await handoff.exportOnly(task, direction, optionsFor(task, preview, direction, provider.value.id));
        if (handoff.prepareResult.value?.status === 'ready') face.value = 'receipt';
      });
    },
    /** 汇聚途中 Esc / 再点锁。 */
    recall: () => { recall?.(); },
    pick: (id: AiProviderId) => { const next = AI_PROVIDERS.find((p) => p.id === id); if (next) provider.value = next; },
    copyAgain: () => handoff.runCopy(),
    openAgain: () => handoff.runOpen(provider.value),
    reveal: () => handoff.revealOutput(),
    retry: (id: 'copy' | 'open') => (id === 'copy' ? handoff.runCopy() : handoff.runOpen(provider.value)),
  };
};

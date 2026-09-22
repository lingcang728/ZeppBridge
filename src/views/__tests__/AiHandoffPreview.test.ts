/**
 * 交付预览页 SSR 断言（与 OrbitCanvas.test.ts 同一形态）：
 * node 环境没有 DOM、不跑事件，只验标记契约——主 CTA 的 disabled 态、
 * 「重新准备」按钮的出现条件、attach 确认键的门。
 *
 * B3 回归：修好附件后（草稿变化 → stale + 实时 preview 不再 missing），
 * 主 CTA 必须恢复可用——上一轮 blocked 结果不许把按钮锁死。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, ref } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { newTaskDraft, taskSnapshot } from '../../lib/aiTask/draft';
import type {
  AiTask,
  AiTaskAttachmentRef,
  AiTaskAttachmentStatus,
  AiTaskPrepareResult,
  AiTaskPreview,
} from '../../lib/bridge/types';
import type { HandoffStep, HandoffStepId } from '../../composables/useAiTaskHandoff';

const draftRef = ref<AiTask>(newTaskDraft());
const idleStep = (): HandoffStep => ({ state: 'idle', errorText: null });
const freshSteps = (): Record<HandoffStepId, HandoffStep> => ({
  prepare: idleStep(),
  copy: idleStep(),
  attach: { state: 'waiting', errorText: null },
});

const handoff = {
  preview: ref<AiTaskPreview | null>(null),
  previewLoading: ref(false),
  previewError: ref<string | null>(null),
  prepareResult: ref<AiTaskPrepareResult | null>(null),
  preparedSnapshot: ref<string | null>(null),
  isStale: () => false,
  steps: ref<Record<HandoffStepId, HandoffStep>>(freshSteps()),
  openOutcome: ref<'opened' | 'skipped' | 'failed' | null>(null),
  openError: ref<string | null>(null),
  lastProvider: ref(null),
  loadPreview: vi.fn(async () => {}),
  runPrepare: vi.fn(async () => null),
  runCopy: vi.fn(async () => false),
  runOpen: vi.fn(async () => false),
  runAll: vi.fn(async () => {}),
  exportOnly: vi.fn(async () => null),
  markAttached: vi.fn(),
  reset: vi.fn(),
};

vi.mock('../../composables/useAiTaskDraft', () => ({
  useAiTaskDraft: () => ({
    draft: draftRef,
    setPrompt: vi.fn(),
    removeAttachment: vi.fn(),
    replaceAttachment: vi.fn(),
  }),
}));

vi.mock('../../composables/useAiTaskHandoff', () => ({
  useAiTaskHandoff: () => handoff,
}));

// isDesktop=true：canRun 只看步骤态与 blocked，不因「非桌面」再叠一层禁用。
vi.mock('../../lib/bridge', () => ({
  isDesktop: () => true,
  backend: {},
  toUserMessage: (_error: unknown, fallback: string) => fallback,
}));

import AiHandoffPreview from '../AiHandoffPreview.vue';

const ATTACHMENT: AiTaskAttachmentRef = {
  id: 'a-1',
  path: 'C:\\docs\\f.pdf',
  display_name: 'f.pdf',
  kind: 'pdf',
  byte_len: 10,
  added_at: 't',
};

const previewWith = (attachments: AiTaskAttachmentStatus[]): AiTaskPreview => ({
  task_id: 't-1',
  workouts: [],
  coverage: [],
  attachments,
  estimated_bytes: 0,
  warnings: [],
});

const blockedPrepare = (): AiTaskPrepareResult => ({
  status: 'blocked',
  task_id: 't-1',
  output_dir: '',
  json_path: null,
  prompt_path: null,
  prompt_text: '',
  byte_len: 0,
  attachments: [],
  blocked: [{ code: 'ui.ai_task.blocked.attachment_missing', message: 'x' }],
});

const readyPrepare = (): AiTaskPrepareResult => ({
  status: 'ready',
  task_id: 't-1',
  output_dir: 'data/exports/ai-tasks/t-1',
  json_path: 'data/exports/ai-tasks/t-1/health-context.json',
  prompt_path: 'data/exports/ai-tasks/t-1/prompt.md',
  prompt_text: 'prompt',
  byte_len: 1,
  attachments: [],
  blocked: [],
});

const render = () => renderToString(createSSRApp(AiHandoffPreview));

/** 主 CTA（button-primary）开标签里有没有 disabled。 */
const primaryDisabled = (html: string): boolean => {
  const tag = html.match(/<button[^>]*button-primary[^>]*>/);
  return tag ? /\bdisabled\b/.test(tag[0]) : false;
};

/** attach 步骤「我已添加」确认键的开标签（中文界面文案）。 */
const attachConfirmDisabled = (html: string): boolean => {
  const tag = html.match(/<button[^>]*>[^<]*我已在 AI 对话里添加附件[^<]*<\/button>/);
  return tag ? /\bdisabled\b/.test(tag[0]) : false;
};

describe('AiHandoffPreview SSR', () => {
  beforeEach(() => {
    draftRef.value = newTaskDraft();
    handoff.preview.value = null;
    handoff.previewLoading.value = false;
    handoff.previewError.value = null;
    handoff.prepareResult.value = null;
    handoff.preparedSnapshot.value = null;
    handoff.steps.value = freshSteps();
    handoff.openOutcome.value = null;
    handoff.openError.value = null;
    handoff.lastProvider.value = null;
  });

  it('B3：附件修复后旧 blocked 结果不再锁死主 CTA', async () => {
    draftRef.value = { ...newTaskDraft(), attachments: [ATTACHMENT] };
    handoff.preview.value = previewWith([{ id: 'a-1', status: 'missing', byte_len: 10 }]);
    handoff.prepareResult.value = blockedPrepare();
    // prepare 之后草稿还没动过 → 旧 blocked 清单作数，CTA 置灰。
    handoff.preparedSnapshot.value = taskSnapshot(draftRef.value);
    expect(await render()).toSatisfy(primaryDisabled);

    // 用户把缺失附件从草稿里移除 → 草稿变了（stale），实时 preview
    // 也不再报 missing → CTA 必须解锁，可以直接重跑。
    draftRef.value = { ...draftRef.value, attachments: [] };
    handoff.preview.value = previewWith([]);
    const html = await render();
    expect(html).not.toSatisfy(primaryDisabled);
  });

  it('B3：附件还在缺（preview 仍 missing）时 CTA 继续置灰', async () => {
    draftRef.value = { ...newTaskDraft(), attachments: [ATTACHMENT] };
    handoff.preview.value = previewWith([{ id: 'a-1', status: 'missing', byte_len: 10 }]);
    // 用户改了提示词但没修附件：旧 blocked 不作数了，实时体检仍拦着。
    handoff.preparedSnapshot.value = taskSnapshot(newTaskDraft());
    expect(await render()).toSatisfy(primaryDisabled);
  });

  it('N5：attach 确认键在 prepare 未完成或无附件时禁用', async () => {
    draftRef.value = { ...newTaskDraft(), attachments: [ATTACHMENT] };
    // prepare 还没跑 → 不许确认「已添加」。
    expect(await render()).toSatisfy(attachConfirmDisabled);

    handoff.steps.value = {
      ...freshSteps(),
      prepare: { state: 'done', errorText: null },
    };
    expect(await render()).not.toSatisfy(attachConfirmDisabled);

    // 没有附件要添加时同样禁用。
    draftRef.value = { ...draftRef.value, attachments: [] };
    expect(await render()).toSatisfy(attachConfirmDisabled);
  });

  it('N4：草稿改过（stale）时出现「重新准备」按钮', async () => {
    handoff.prepareResult.value = readyPrepare();
    handoff.preparedSnapshot.value = taskSnapshot(newTaskDraft());
    draftRef.value = { ...newTaskDraft(), prompt: '改过之后' };
    const html = await render();
    expect(html).toContain('重新准备');
  });
});

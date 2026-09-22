/**
 * 交付状态机的门：哪步失败停在哪步、各步能单独重试、
 * 「打开了网站」永远不是「已发送」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiTaskPrepareResult, AiTaskPreview } from '../../lib/bridge/types';
import { newTaskDraft } from '../../lib/aiTask/draft';

const prepareMock = vi.fn();
const previewMock = vi.fn();
const copyMock = vi.fn(async (_text: string) => {});
const openMock = vi.fn(async (_provider: unknown): Promise<'opened' | 'skipped'> => 'opened');

vi.mock('../../lib/bridge', () => ({
  backend: {
    aiTaskPrepare: (...args: unknown[]) => prepareMock(...args),
    aiTaskPreview: (...args: unknown[]) => previewMock(...args),
  },
  toUserMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('../useAiHandoff', () => ({
  copyTextToClipboard: (text: string) => copyMock(text),
  openProviderSite: (provider: unknown) => openMock(provider),
}));

import { useAiTaskHandoff } from '../useAiTaskHandoff';
import { AI_PROVIDERS } from '../../lib/aiProviders';

const ready = (patch: Partial<AiTaskPrepareResult> = {}): AiTaskPrepareResult => ({
  status: 'ready',
  task_id: 't-1',
  output_dir: 'data/exports/ai-tasks/t-1',
  json_path: 'data/exports/ai-tasks/t-1/health-context.json',
  prompt_path: 'data/exports/ai-tasks/t-1/prompt.md',
  prompt_text: 'prompt body',
  byte_len: 1234,
  attachments: [],
  blocked: [],
  ...patch,
});

const preview = (patch: Partial<AiTaskPreview> = {}): AiTaskPreview => ({
  task_id: 't-1',
  workouts: [],
  coverage: [],
  attachments: [],
  estimated_bytes: 0,
  warnings: [],
  ...patch,
});

describe('useAiTaskHandoff', () => {
  beforeEach(() => {
    prepareMock.mockReset();
    previewMock.mockReset();
    copyMock.mockReset();
    copyMock.mockResolvedValue(undefined);
    openMock.mockReset();
    openMock.mockResolvedValue('opened');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runAll 全绿：prepare→copy→open，attach 停在 waiting（手动步不会自己完成）', async () => {
    prepareMock.mockResolvedValue(ready());
    const handoff = useAiTaskHandoff();
    await handoff.runAll(newTaskDraft(), AI_PROVIDERS[0]);
    expect(prepareMock).toHaveBeenCalledTimes(1);
    expect(copyMock).toHaveBeenCalledWith('prompt body');
    expect(openMock).toHaveBeenCalledWith(AI_PROVIDERS[0]);
    expect(handoff.steps.value.prepare.state).toBe('done');
    expect(handoff.steps.value.copy.state).toBe('done');
    expect(handoff.steps.value.attach.state).toBe('waiting');
    expect(handoff.openOutcome.value).toBe('opened');
  });

  it('prepare 被后端阻塞：copy 不进 doing，停在 idle', async () => {
    prepareMock.mockResolvedValue(ready({
      status: 'blocked',
      blocked: [{ code: 'ui.ai_task.blocked.attachment_missing', message: 'x' }],
    }));
    const handoff = useAiTaskHandoff();
    await handoff.runAll(newTaskDraft(), AI_PROVIDERS[0]);
    expect(handoff.steps.value.prepare.state).toBe('blocked');
    expect(handoff.steps.value.copy.state).toBe('idle');
    expect(copyMock).not.toHaveBeenCalled();
    expect(openMock).not.toHaveBeenCalled();
  });

  it('prepare 抛错：prepare=failed，后续步不碰', async () => {
    prepareMock.mockRejectedValue(new Error('disk full'));
    const handoff = useAiTaskHandoff();
    await handoff.runAll(newTaskDraft(), AI_PROVIDERS[0]);
    expect(handoff.steps.value.prepare.state).toBe('failed');
    expect(handoff.steps.value.prepare.errorText).toBeTruthy();
    expect(copyMock).not.toHaveBeenCalled();
  });

  it('copy 失败：copy=failed，open 不执行；runCopy 可单独重试成功', async () => {
    prepareMock.mockResolvedValue(ready());
    copyMock.mockRejectedValueOnce(new Error('no clipboard'));
    const handoff = useAiTaskHandoff();
    await handoff.runAll(newTaskDraft(), AI_PROVIDERS[0]);
    expect(handoff.steps.value.copy.state).toBe('failed');
    expect(openMock).not.toHaveBeenCalled();
    // 单独重试复制。
    copyMock.mockResolvedValueOnce(undefined);
    expect(await handoff.runCopy()).toBe(true);
    expect(handoff.steps.value.copy.state).toBe('done');
  });

  it('open 失败如实记录 failed，不假装打开过', async () => {
    prepareMock.mockResolvedValue(ready());
    openMock.mockRejectedValue(new Error('no opener'));
    const handoff = useAiTaskHandoff();
    await handoff.runAll(newTaskDraft(), AI_PROVIDERS[0]);
    expect(handoff.openOutcome.value).toBe('failed');
    expect(handoff.openError.value).toBeTruthy();
    // copy 那步的成功仍然保留。
    expect(handoff.steps.value.copy.state).toBe('done');
  });

  it('网页预览：open 返回 skipped，状态如实', async () => {
    prepareMock.mockResolvedValue(ready());
    openMock.mockResolvedValue('skipped');
    const handoff = useAiTaskHandoff();
    await handoff.runAll(newTaskDraft(), AI_PROVIDERS[0]);
    expect(handoff.openOutcome.value).toBe('skipped');
  });

  it('exportOnly 只准备，不复制不打开', async () => {
    prepareMock.mockResolvedValue(ready());
    const handoff = useAiTaskHandoff();
    await handoff.exportOnly(newTaskDraft());
    expect(handoff.steps.value.prepare.state).toBe('done');
    expect(copyMock).not.toHaveBeenCalled();
    expect(openMock).not.toHaveBeenCalled();
  });

  it('草稿在 prepare 之后被改过 → isStale 如实报旧；重新 prepare 后回落', async () => {
    prepareMock.mockResolvedValue(ready());
    const handoff = useAiTaskHandoff();
    const task = newTaskDraft();
    await handoff.runAll(task, AI_PROVIDERS[0]);
    expect(handoff.isStale(task)).toBe(false);
    const edited = { ...task, prompt: 'edited afterwards' };
    expect(handoff.isStale(edited)).toBe(true);
    await handoff.runPrepare(edited);
    expect(handoff.isStale(edited)).toBe(false);
  });

  it('重跑 prepare：上一轮 copy/attach 结果作废，回到各自待办态', async () => {
    prepareMock.mockResolvedValue(ready());
    const handoff = useAiTaskHandoff();
    await handoff.runAll(newTaskDraft(), AI_PROVIDERS[0]);
    handoff.markAttached();
    expect(handoff.steps.value.copy.state).toBe('done');
    expect(handoff.steps.value.attach.state).toBe('done');
    await handoff.runPrepare(newTaskDraft());
    expect(handoff.steps.value.prepare.state).toBe('done');
    expect(handoff.steps.value.copy.state).toBe('idle');
    expect(handoff.steps.value.attach.state).toBe('waiting');
  });

  it('lastProvider 持久化：交付过的提供方存起来，新实例按它初始化', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, String(value)); },
        removeItem: (key: string) => { store.delete(key); },
      },
    });
    const first = useAiTaskHandoff();
    expect(first.lastProvider.value).toBeNull();
    await first.runOpen(AI_PROVIDERS[2]); // gemini
    expect(store.get('zeppbridge.ai.handoff.provider')).toBe('gemini');
    const second = useAiTaskHandoff();
    expect(second.lastProvider.value?.id).toBe('gemini');
  });

  it('localStorage 里的提供方 id 不认识时不恢复', async () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => 'not-a-provider',
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    });
    expect(useAiTaskHandoff().lastProvider.value).toBeNull();
  });

  it('markAttached 只改用户确认标记', async () => {
    const handoff = useAiTaskHandoff();
    expect(handoff.steps.value.attach.state).toBe('waiting');
    handoff.markAttached();
    expect(handoff.steps.value.attach.state).toBe('done');
  });

  it('loadPreview 失败进 previewError，不残留半成品', async () => {
    previewMock.mockRejectedValue(new Error('backend down'));
    const handoff = useAiTaskHandoff();
    await handoff.loadPreview(newTaskDraft());
    expect(handoff.preview.value).toBeNull();
    expect(handoff.previewError.value).toBeTruthy();
  });

  it('loadPreview 成功存结果', async () => {
    previewMock.mockResolvedValue(preview());
    const handoff = useAiTaskHandoff();
    await handoff.loadPreview(newTaskDraft());
    expect(handoff.preview.value?.task_id).toBe('t-1');
    expect(handoff.previewError.value).toBeNull();
  });
});

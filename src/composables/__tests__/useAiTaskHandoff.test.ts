/**
 * 交付状态机的门：哪步失败停在哪步、各步能单独重试、
 * 「打开了网站」永远不是「已发送」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiTaskPrepareResult } from '../../lib/bridge/types';
import { newTaskDraft } from '../../lib/aiTask/draft';

const prepareMock = vi.fn();
const copyMock = vi.fn(async (_text: string) => {});
const openMock = vi.fn(async (_provider: unknown): Promise<'opened' | 'skipped'> => 'opened');
const revealMock = vi.fn(async (_path: string) => {});

vi.mock('../../lib/bridge', () => ({
  backend: { aiTaskPrepare: (...args: unknown[]) => prepareMock(...args) },
  toUserMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('../useAiHandoff', () => ({
  copyTextToClipboard: (text: string) => copyMock(text),
  openProviderSite: (provider: unknown) => openMock(provider),
  revealInFolder: (path: string) => revealMock(path),
}));

import { useAiTaskHandoff } from '../useAiTaskHandoff';
import { AI_PROVIDERS } from '../../lib/aiProviders';

const ready = (patch: Partial<AiTaskPrepareResult> = {}): AiTaskPrepareResult => ({
  status: 'ready',
  task_id: 't-1',
  output_dir: 'C:/Users/me/Desktop/ZeppBridge AI/恢复跑_20260924-1530',
  json_path: 'x/health-context.json',
  prompt_path: 'x/prompt.txt',
  prompt_text: 'prompt body',
  byte_len: 1234,
  attachments: [],
  blocked: [],
  ...patch,
});

describe('useAiTaskHandoff', () => {
  beforeEach(() => {
    prepareMock.mockReset();
    copyMock.mockReset();
    copyMock.mockResolvedValue(undefined);
    openMock.mockReset();
    openMock.mockResolvedValue('opened');
    revealMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runAll 全绿：导出→复制→打开网站，并在资源管理器选中导出文件夹', async () => {
    prepareMock.mockResolvedValue(ready());
    const handoff = useAiTaskHandoff();
    await handoff.runAll(newTaskDraft(), AI_PROVIDERS[0], 'Direction');
    expect(prepareMock).toHaveBeenCalledWith(expect.anything(), expect.any(String), 'Direction', undefined);
    expect(copyMock).toHaveBeenCalledWith('prompt body');
    expect(openMock).toHaveBeenCalledWith(AI_PROVIDERS[0]);
    expect(revealMock).toHaveBeenCalledWith(ready().output_dir);
    expect(handoff.steps.value.prepare.state).toBe('done');
    expect(handoff.steps.value.copy.state).toBe('done');
    expect(handoff.steps.value.open.state).toBe('done');
  });

  it('prepare 被后端阻塞：后面两步不动，也不打开文件夹', async () => {
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
    expect(revealMock).not.toHaveBeenCalled();
  });

  it('prepare 抛错：prepare=failed，后续步不碰', async () => {
    prepareMock.mockRejectedValue(new Error('disk full'));
    const handoff = useAiTaskHandoff();
    await handoff.runAll(newTaskDraft(), AI_PROVIDERS[0]);
    expect(handoff.steps.value.prepare.state).toBe('failed');
    expect(handoff.steps.value.prepare.errorText).toBeTruthy();
    expect(copyMock).not.toHaveBeenCalled();
  });

  it('copy 失败：open 不执行；runCopy 可单独重试成功', async () => {
    prepareMock.mockResolvedValue(ready());
    copyMock.mockRejectedValueOnce(new Error('no clipboard'));
    const handoff = useAiTaskHandoff();
    await handoff.runAll(newTaskDraft(), AI_PROVIDERS[0]);
    expect(handoff.steps.value.copy.state).toBe('failed');
    expect(openMock).not.toHaveBeenCalled();
    copyMock.mockResolvedValueOnce(undefined);
    expect(await handoff.runCopy()).toBe(true);
    expect(handoff.steps.value.copy.state).toBe('done');
  });

  it('open 失败如实记录 failed，复制那步的成功仍保留', async () => {
    prepareMock.mockResolvedValue(ready());
    openMock.mockRejectedValue(new Error('no opener'));
    const handoff = useAiTaskHandoff();
    await handoff.runAll(newTaskDraft(), AI_PROVIDERS[0]);
    expect(handoff.steps.value.open.state).toBe('failed');
    expect(handoff.steps.value.open.errorText).toBeTruthy();
    expect(handoff.steps.value.copy.state).toBe('done');
  });

  it('网页预览：open 返回 skipped，状态如实', async () => {
    prepareMock.mockResolvedValue(ready());
    openMock.mockResolvedValue('skipped');
    const handoff = useAiTaskHandoff();
    await handoff.runAll(newTaskDraft(), AI_PROVIDERS[0]);
    expect(handoff.steps.value.open.state).toBe('skipped');
  });

  it('exportOnly 只导出并选中文件夹，不复制不打开', async () => {
    prepareMock.mockResolvedValue(ready());
    const handoff = useAiTaskHandoff();
    await handoff.exportOnly(newTaskDraft());
    expect(handoff.steps.value.prepare.state).toBe('done');
    expect(revealMock).toHaveBeenCalled();
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

  it('重跑 prepare：上一轮复制/打开的结果作废', async () => {
    prepareMock.mockResolvedValue(ready());
    const handoff = useAiTaskHandoff();
    await handoff.runAll(newTaskDraft(), AI_PROVIDERS[0]);
    await handoff.runPrepare(newTaskDraft());
    expect(handoff.steps.value.prepare.state).toBe('done');
    expect(handoff.steps.value.copy.state).toBe('idle');
    expect(handoff.steps.value.open.state).toBe('idle');
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
    expect(useAiTaskHandoff().lastProvider.value?.id).toBe('gemini');
  });

  it('localStorage 里的提供方 id 不认识时不恢复', () => {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => 'not-a-provider', setItem: vi.fn(), removeItem: vi.fn() },
    });
    expect(useAiTaskHandoff().lastProvider.value).toBeNull();
  });

  it('start：保存还没回来时再按一次直接忽略，保存、导出各只跑一次（R11）', async () => {
    const handoff = useAiTaskHandoff();
    let release!: () => void;
    const save = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const go = vi.fn(async () => {});
    const first = handoff.start(save, go);
    expect(handoff.inFlight.value).toBe(true);
    expect(await handoff.start(save, go)).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledTimes(1);
    expect(handoff.inFlight.value).toBe(false);
  });

  it('start：保存失败不吞，记进 saveError，交接照常往下走；下一次成功就清掉', async () => {
    const handoff = useAiTaskHandoff();
    const go = vi.fn(async () => {});
    await handoff.start(async () => { throw new Error('disk full'); }, go);
    expect(go).toHaveBeenCalledTimes(1);
    expect(handoff.saveError.value).toContain('任务没保存上');
    await handoff.start(async () => {}, go);
    expect(handoff.saveError.value).toBeNull();
  });

  it('start：交接本身抛错也会放开 inFlight', async () => {
    const handoff = useAiTaskHandoff();
    await expect(handoff.start(async () => {}, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(handoff.inFlight.value).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { AiTaskPreview } from '../../lib/bridge/types';
import { newTaskDraft } from '../../lib/aiTask/draft';

const previewMock = vi.fn();

vi.mock('../../lib/bridge', () => ({
  backend: { aiTaskPreview: (...args: unknown[]) => previewMock(...args) },
  isDesktop: () => false,
  toUserMessage: (_error: unknown, fallback: string) => fallback,
}));

import { useAiTaskPreview } from '../useAiTaskPreview';

const preview = (patch: Partial<AiTaskPreview> = {}): AiTaskPreview => ({
  task_id: 't-1', workouts: [], coverage: [], attachments: [], estimated_bytes: 0, warnings: [], ...patch,
});

describe('useAiTaskPreview', () => {
  it('失败进 previewError，不残留半成品', async () => {
    previewMock.mockRejectedValue(new Error('backend down'));
    const state = useAiTaskPreview();
    await state.loadPreview(newTaskDraft());
    expect(state.preview.value).toBeNull();
    expect(state.previewError.value).toBeTruthy();
  });

  it('成功存结果；过时的响应不覆盖新的', async () => {
    let resolveOld: (value: AiTaskPreview) => void = () => {};
    previewMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(preview({ task_id: 'new' }));
    const state = useAiTaskPreview();
    const old = state.loadPreview(newTaskDraft());
    await state.loadPreview(newTaskDraft());
    resolveOld(preview({ task_id: 'old' }));
    await old;
    expect(state.preview.value?.task_id).toBe('new');
    expect(state.previewError.value).toBeNull();
  });
});

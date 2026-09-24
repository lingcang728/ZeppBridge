/**
 * 草稿控制器：单例状态、撤销栈还原选择快照、模板只设方向不碰问题。
 * 本文件里模块单例状态是跨用例共享的，用例顺序别拆开重排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newTaskDraft } from '../../lib/aiTask/draft';
import type { AiTask, AiTaskTemplate } from '../../lib/bridge/types';
import type { Workout } from '../../types';

const listMock = vi.fn(async () => []);
const getMock = vi.fn();
const saveMock = vi.fn();
const workoutsMock = vi.fn(async () => []);
const workoutDetailMock = vi.fn(async (_id: string): Promise<Workout | null> => null);
const templatesMock = vi.fn(async (): Promise<AiTaskTemplate[]> => []);

vi.mock('../../lib/bridge', () => ({
  backend: {
    aiTaskList: () => listMock(),
    aiTaskGet: (id: string) => getMock(id),
    aiTaskSave: (task: AiTask) => saveMock(task),
    aiTaskDelete: vi.fn(async () => {}),
    aiTemplateList: () => templatesMock(),
    getRecentWorkouts: () => workoutsMock(),
    getWorkoutDetail: (id: string) => workoutDetailMock(id),
  },
  toUserMessage: (_error: unknown, fallback: string) => fallback,
}));

import { useAiTaskDraft } from '../useAiTaskDraft';
import { useAiTaskLibrary } from '../useAiTaskLibrary';

const template = (patch: Partial<AiTaskTemplate> = {}): AiTaskTemplate => ({
  schema_version: 1,
  id: 'tpl-1',
  builtin: true,
  name: 'T',
  name_code: null,
  categories: [],
  detail_level: 'detailed',
  prompt_template: 'seed',
  prompt_code: null,
  default_summaries: [],
  required_series: [],
  created_at: '',
  updated_at: '',
  ...patch,
});

describe('useAiTaskDraft', () => {
  const draft = useAiTaskDraft();
  const library = useAiTaskLibrary();

  beforeEach(() => {
    draft.resetDraft();
    listMock.mockClear();
    getMock.mockReset();
    saveMock.mockReset();
    workoutsMock.mockReset();
    workoutsMock.mockResolvedValue([]);
    workoutDetailMock.mockReset();
    workoutDetailMock.mockResolvedValue(null);
    templatesMock.mockReset();
    templatesMock.mockResolvedValue([]);
  });

  it('类别进出进撤销栈；undo 还原到动作前', () => {
    draft.setCategoryEnabled('sleep', false);
    expect(draft.canUndo.value).toBe(true);
    draft.undo();
    expect(draft.draft.value.categories.find((r) => r.category === 'sleep')?.enabled).toBe(true);
    expect(draft.canUndo.value).toBe(false);
  });

  it('join 后 leave 再 undo 回到 member', () => {
    draft.setCategoryEnabled('body', false);
    draft.setCategoryEnabled('body', true);
    draft.undo();
    expect(draft.draft.value.categories.find((r) => r.category === 'body')?.enabled).toBe(false);
  });

  it('toggleWorkout 往返增删', () => {
    draft.toggleWorkout('w-1');
    expect(draft.draft.value.workout_ids).toEqual(['w-1']);
    draft.toggleWorkout('w-1');
    expect(draft.draft.value.workout_ids).toEqual([]);
  });

  it('拖放运动选择幂等且可逐步撤销', () => {
    draft.setWorkoutSelected('w-1', true);
    draft.setWorkoutSelected('w-1', true);
    expect(draft.draft.value.workout_ids).toEqual(['w-1']);
    draft.setWorkoutSelected('w-1', false);
    expect(draft.draft.value.workout_ids).toEqual([]);
    draft.undo();
    expect(draft.draft.value.workout_ids).toEqual(['w-1']);
    draft.undo();
    expect(draft.draft.value.workout_ids).toEqual([]);
  });

  it('套模板只设方向与推荐范围，用户的问题保留；可以撤销', () => {
    draft.setPrompt('my own words');
    draft.setTemplate(template());
    expect(draft.draft.value.prompt).toBe('my own words');
    expect(draft.draft.value.template_id).toBe('tpl-1');
    expect(draft.draft.value.detail_level).toBe('detailed');
    draft.undo();
    expect(draft.draft.value.template_id).toBeNull();
    expect(draft.draft.value.detail_level).toBe('standard');
  });

  it('单独排除一个指标，撤销后恢复', () => {
    draft.setMetricExcluded('recovery', 'stress', true);
    draft.setMetricExcluded('recovery', 'stress', true);
    expect(draft.draft.value.categories.find((r) => r.category === 'recovery')?.excluded_metrics).toEqual(['stress']);
    draft.undo();
    expect(draft.draft.value.categories.find((r) => r.category === 'recovery')?.excluded_metrics).toEqual([]);
  });

  it('写个人说明自动把 personal_note 类别带进任务', () => {
    expect(draft.draft.value.categories.find((r) => r.category === 'personal_note')?.enabled).toBe(false);
    draft.setPersonalNote('context');
    expect(draft.draft.value.categories.find((r) => r.category === 'personal_note')?.enabled).toBe(true);
  });

  it('加附件自动启用 attachment 类别；删空后关掉', () => {
    draft.addAttachments([{
      id: 'a-1', path: 'C:\\x\\f.pdf', display_name: 'f.pdf',
      kind: 'pdf', byte_len: 1, added_at: 't',
    }]);
    expect(draft.draft.value.categories.find((r) => r.category === 'attachment')?.enabled).toBe(true);
    draft.removeAttachment('a-1');
    expect(draft.draft.value.categories.find((r) => r.category === 'attachment')?.enabled).toBe(false);
  });

  it('replaceAttachment 保 id 换路径', () => {
    draft.addAttachments([{
      id: 'a-1', path: 'C:\\x\\old.pdf', display_name: 'old.pdf',
      kind: 'pdf', byte_len: 1, added_at: 't',
    }]);
    draft.replaceAttachment('a-1', {
      id: 'other', path: 'C:\\x\\new.pdf', display_name: 'new.pdf',
      kind: 'pdf', byte_len: 2, added_at: 't2',
    });
    const att = draft.draft.value.attachments[0];
    expect(att.id).toBe('a-1');
    expect(att.path).toBe('C:\\x\\new.pdf');
  });

  it('saveDraft：空标题给默认名，成功后清脏并记 id', async () => {
    saveMock.mockImplementation(async (task: AiTask) => ({
      ...task, id: 'server-id', created_at: 'c', updated_at: 'u',
    }));
    draft.setTitle('   ');
    const saved = await draft.saveDraft();
    expect(saved.id).toBe('server-id');
    expect(draft.draft.value.id).toBe('server-id');
    expect(draft.dirty.value).toBe(false);
    expect(listMock).toHaveBeenCalled();
  });

  it('loadTask 载入后端任务并清 undo', async () => {
    const stored = { ...newTaskDraft(), id: 't-9', title: 'saved task' };
    getMock.mockResolvedValue(stored);
    draft.setCategoryEnabled('sleep', false);
    await draft.loadTask('t-9');
    expect(draft.draft.value.title).toBe('saved task');
    expect(draft.canUndo.value).toBe(false);
    expect(draft.dirty.value).toBe(false);
  });

  it('loadTask 失败透传错误，lastError 有本地化兜底', async () => {
    getMock.mockRejectedValue(new Error('gone'));
    await expect(draft.loadTask('x')).rejects.toThrow('gone');
    expect(draft.lastError.value).toBeTruthy();
  });

  it('「不使用模板」摘掉 template_id；模板已写入的范围不回退', () => {
    draft.setTemplate(template());
    draft.setTemplate(null);
    expect(draft.draft.value.template_id).toBeNull();
    expect(draft.draft.value.detail_level).toBe('detailed');
  });

  it('saveDraft 用调用方给的自动标题兜底', async () => {
    saveMock.mockImplementation(async (task: AiTask) => ({ ...task, id: 's-2' }));
    const saved = await draft.saveDraft('恢复跑 · 9/24');
    expect(saved.title).toBe('恢复跑 · 9/24');
  });

  const beyondWorkout = (id: string) => ({
    workout_id: id,
    workout_type: 'running',
    normalized_type: 'running',
    type_source: 'numeric_mapped',
    effective_type: 'running',
    start_time: '2024-01-01T00:00:00Z',
    end_time: '2024-01-01T01:00:00Z',
    source_scope: 'cloud',
  });

  it('关联运动在最近列表之外：loadTask 后按 id 补取进来', async () => {
    getMock.mockResolvedValue({ ...newTaskDraft(), id: 't-7', workout_ids: ['w-old'] });
    workoutDetailMock.mockResolvedValue(beyondWorkout('w-old'));
    await library.loadRecentWorkouts();
    await draft.loadTask('t-7');
    expect(workoutDetailMock).toHaveBeenCalledWith('w-old');
    expect(library.recentWorkouts.value.some((w) => w.workout_id === 'w-old')).toBe(true);
  });

  it('补取不受加载顺序影响：任务先到、最近列表后覆盖也会补齐', async () => {
    getMock.mockResolvedValue({ ...newTaskDraft(), id: 't-8', workout_ids: ['w-old2'] });
    workoutDetailMock.mockResolvedValue(beyondWorkout('w-old2'));
    // 任务先回来（此时 recentWorkouts 还没有它），随后最近列表覆盖落地。
    await draft.loadTask('t-8');
    await library.loadRecentWorkouts();
    expect(library.recentWorkouts.value.some((w) => w.workout_id === 'w-old2')).toBe(true);
  });
});

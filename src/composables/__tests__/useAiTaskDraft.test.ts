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
    getUserPrefs: async () => ({ ai_profile_note: '' }),
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

  it('载入带旧指标排除的任务：排除丢弃、提示置真，不算脏', async () => {
    const stored = newTaskDraft();
    stored.id = 't-legacy';
    stored.categories = stored.categories.map((range) =>
      range.category === 'recovery' ? { ...range, excluded_metrics: ['stress'] } : range);
    getMock.mockResolvedValue(stored);
    await draft.loadTask('t-legacy');
    expect(draft.draft.value.categories.find((r) => r.category === 'recovery')?.excluded_metrics).toEqual([]);
    expect(draft.legacyNotice.value).toBe(true);
    expect(draft.dirty.value).toBe(false);
    draft.dismissLegacyNotice();
    expect(draft.legacyNotice.value).toBe(false);
  });

  it('干净任务不提示；再载入干净任务时提示消失', async () => {
    const legacy = newTaskDraft();
    legacy.id = 't-old';
    legacy.categories = legacy.categories.map((range) =>
      range.category === 'sleep' ? { ...range, excluded_metrics: ['rem_minutes'] } : range);
    getMock.mockResolvedValue(legacy);
    await draft.loadTask('t-old');
    expect(draft.legacyNotice.value).toBe(true);
    getMock.mockResolvedValue({ ...newTaskDraft(), id: 't-clean' });
    await draft.loadTask('t-clean');
    expect(draft.legacyNotice.value).toBe(false);
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

  /* —— 代码审查 R02 / R03：身份与乱序回执 —— */
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
  };
  const echoSave = (id: string) => async (task: AiTask) => ({ ...task, id: task.id || id, created_at: 'c', updated_at: 'u' });

  it('R02：新草稿和已保存任务同名，也新建而不是覆盖旧任务', async () => {
    library.taskList.value = [{ id: 'old', title: '最近 14 天' } as never];
    saveMock.mockImplementation(echoSave('new-id'));
    draft.setTitle('最近 14 天');
    const saved = await draft.saveDraft();
    expect(saveMock.mock.calls[0][0].id).toBe('');
    expect(saved.id).toBe('new-id');
    library.taskList.value = [];
  });

  it('R03：保存途中改了标题，回执不冲掉新标题，仍标脏', async () => {
    const gate = deferred<AiTask>();
    saveMock.mockImplementation(() => gate.promise);
    draft.setTitle('A');
    const pending = draft.saveDraft();
    draft.setTitle('A 改');
    gate.resolve({ ...draft.draft.value, title: 'A', id: 'sid', created_at: 'c', updated_at: 'u' });
    await pending;
    expect(draft.draft.value.title).toBe('A 改');
    expect(draft.draft.value.id).toBe('sid');
    expect(draft.dirty.value).toBe(true);
  });

  it('R03：先载 A 再载 B，A 后到也显示 B', async () => {
    const a = deferred<AiTask>();
    const b = deferred<AiTask>();
    getMock.mockImplementation((id: string) => (id === 'A' ? a.promise : b.promise));
    const la = draft.loadTask('A');
    const lb = draft.loadTask('B');
    b.resolve({ ...newTaskDraft(), id: 'B', title: 'B' });
    await lb;
    expect(draft.busy.value).toBe(false);
    a.resolve({ ...newTaskDraft(), id: 'A', title: 'A' });
    await la;
    expect(draft.draft.value.id).toBe('B');
  });

  it('R03：载 A 未回时点新建并输入，A 的回执不覆盖新草稿', async () => {
    const a = deferred<AiTask>();
    getMock.mockImplementation(() => a.promise);
    const la = draft.loadTask('A');
    draft.resetDraft();
    draft.setTitle('新的');
    a.resolve({ ...newTaskDraft(), id: 'A', title: 'A' });
    await la;
    expect(draft.draft.value.id).toBe('');
    expect(draft.draft.value.title).toBe('新的');
  });

  it('R03：保存 A 途中切到 B，A 的回执不改 B', async () => {
    getMock.mockResolvedValue({ ...newTaskDraft(), id: 'A', title: 'A' });
    await draft.loadTask('A');
    const gate = deferred<AiTask>();
    saveMock.mockImplementation(() => gate.promise);
    const pending = draft.saveDraft();
    getMock.mockResolvedValue({ ...newTaskDraft(), id: 'B', title: 'B' });
    await draft.loadTask('B');
    gate.resolve({ ...newTaskDraft(), id: 'A', title: 'A', created_at: 'c', updated_at: 'u2' });
    await pending;
    expect(draft.draft.value.id).toBe('B');
    expect(draft.dirty.value).toBe(false);
  });

  it('R03：连续保存两次按顺序执行，第二次沿用第一次拿到的 id', async () => {
    const gate = deferred<AiTask>();
    saveMock.mockImplementationOnce(() => gate.promise).mockImplementation(echoSave('unused'));
    draft.setTitle('两次');
    const first = draft.saveDraft();
    const second = draft.saveDraft();
    expect(saveMock).toHaveBeenCalledTimes(1);
    gate.resolve({ ...draft.draft.value, id: 'once', created_at: 'c', updated_at: 'u' });
    await first;
    await second;
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock.mock.calls[1][0].id).toBe('once');
  });
});

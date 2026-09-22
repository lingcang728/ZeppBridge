/**
 * 草稿控制器：单例状态、undo 栈只管轨道意图、模板套用保留用户稿。
 * 本文件里模块单例状态是跨用例共享的，用例顺序别拆开重排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newTaskDraft } from '../../lib/aiTask/draft';
import type { AiTask, AiTaskTemplate } from '../../lib/bridge/types';

const listMock = vi.fn(async () => []);
const getMock = vi.fn();
const saveMock = vi.fn();
const workoutsMock = vi.fn(async () => []);
const templatesMock = vi.fn(async () => []);

vi.mock('../../lib/bridge', () => ({
  backend: {
    aiTaskList: () => listMock(),
    aiTaskGet: (id: string) => getMock(id),
    aiTaskSave: (task: AiTask) => saveMock(task),
    aiTaskDelete: vi.fn(async () => {}),
    aiTemplateList: () => templatesMock(),
    getRecentWorkouts: () => workoutsMock(),
  },
  toUserMessage: (_error: unknown, fallback: string) => fallback,
}));

import { useAiTaskDraft } from '../useAiTaskDraft';

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

  beforeEach(() => {
    draft.resetDraft();
    listMock.mockClear();
    getMock.mockReset();
    saveMock.mockReset();
  });

  it('轨道意图进 undo 栈；undo 把节点设回 join/leave 前的状态', () => {
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

  it('用户改过提示词 → 套模板不覆盖；没改过 → 模板初稿进入', () => {
    draft.setPrompt('my own words');
    draft.applyTemplate(template());
    expect(draft.draft.value.prompt).toBe('my own words');
    draft.resetDraft();
    draft.applyTemplate(template());
    expect(draft.draft.value.prompt).toBe('seed');
    expect(draft.draft.value.template_id).toBe('tpl-1');
    expect(draft.draft.value.detail_level).toBe('detailed');
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
});

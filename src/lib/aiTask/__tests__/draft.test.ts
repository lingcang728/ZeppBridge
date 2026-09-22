import { describe, expect, it } from 'vitest';
import {
  AI_TASK_PROMPT_MAX,
  applyTemplateToDraft,
  isTaskDirty,
  newTaskDraft,
  taskSnapshot,
} from '../draft';
import { defaultCategoryRanges } from '../categories';
import type { AiTaskTemplate } from '../../bridge/types';

const template = (patch: Partial<AiTaskTemplate> = {}): AiTaskTemplate => ({
  schema_version: 1,
  id: 'tpl-1',
  builtin: true,
  name: 'Template',
  name_code: null,
  categories: defaultCategoryRanges().map((range) =>
    range.category === 'sleep' ? { ...range, days_before: 30 } : range),
  detail_level: 'detailed',
  prompt_template: 'seed prompt',
  prompt_code: null,
  default_summaries: [],
  required_series: [],
  created_at: '',
  updated_at: '',
  ...patch,
});

describe('newTaskDraft', () => {
  it('隐私默认值：精确 GPS 关、MCP 关、无附件', () => {
    const task = newTaskDraft();
    expect(task.include_precise_gps).toBe(false);
    expect(task.mcp_shared).toBe(false);
    expect(task.attachments).toEqual([]);
    expect(task.id).toBe('');
    expect(task.schema_version).toBe(1);
  });

  it('数据类别默认启用，内容类别（personal_note/attachment）默认关', () => {
    const task = newTaskDraft();
    const byCategory = new Map(task.categories.map((range) => [range.category, range]));
    expect(byCategory.get('sleep')?.enabled).toBe(true);
    expect(byCategory.get('personal_note')?.enabled).toBe(false);
    expect(byCategory.get('attachment')?.enabled).toBe(false);
    expect(byCategory.get('sleep')?.days_before).toBe(14);
  });
});

describe('applyTemplateToDraft', () => {
  it('模板只携带规则：类别范围、detail_level、提示词初稿；运动与附件原样保留', () => {
    const task = {
      ...newTaskDraft(),
      workout_ids: ['w-1'],
      attachments: [{
        id: 'a-1', path: 'C:\\x\\report.pdf', display_name: 'report.pdf',
        kind: 'pdf' as const, byte_len: 10, added_at: '2026-01-01T00:00:00Z',
      }],
      personal_note: 'keep me',
    };
    const next = applyTemplateToDraft(task, template(), 'seed prompt', false);
    expect(next.template_id).toBe('tpl-1');
    expect(next.detail_level).toBe('detailed');
    expect(next.prompt).toBe('seed prompt');
    expect(next.workout_ids).toEqual(['w-1']);
    expect(next.attachments).toHaveLength(1);
    expect(next.personal_note).toBe('keep me');
    expect(next.categories.find((range) => range.category === 'sleep')?.days_before).toBe(30);
  });

  it('用户改过提示词后，模板不再覆盖它', () => {
    const task = { ...newTaskDraft(), prompt: 'my own question' };
    const next = applyTemplateToDraft(task, template(), 'seed prompt', true);
    expect(next.prompt).toBe('my own question');
    expect(next.template_id).toBe('tpl-1');
  });
});

describe('taskSnapshot / isTaskDirty', () => {
  it('字段顺序与运动/附件顺序不影响快照', () => {
    const a = { ...newTaskDraft(), workout_ids: ['b', 'a'], title: 't' };
    const b = { ...newTaskDraft(), workout_ids: ['a', 'b'], title: 't' };
    expect(taskSnapshot(a)).toBe(taskSnapshot(b));
  });

  it('脏标记：改了才算脏', () => {
    const task = newTaskDraft();
    const baseline = taskSnapshot(task);
    expect(isTaskDirty(task, baseline)).toBe(false);
    expect(isTaskDirty({ ...task, prompt: 'x' }, baseline)).toBe(true);
    expect(isTaskDirty({ ...task, id: 'server-set', created_at: 't', updated_at: 't' }, baseline)).toBe(false);
  });
});

describe('AI_TASK_PROMPT_MAX', () => {
  it('提示词上限是设计稿的 500', () => {
    expect(AI_TASK_PROMPT_MAX).toBe(500);
  });
});

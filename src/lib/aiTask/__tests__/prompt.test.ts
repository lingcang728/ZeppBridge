import { describe, expect, it } from 'vitest';
import { templateName, templatePromptSeed, isBuiltinTemplate } from '../prompt';
import { aiTaskTextFor, coverageNoteText } from '../copy';
import type { AiTaskTemplate } from '../../bridge/types';

const template = (patch: Partial<AiTaskTemplate> = {}): AiTaskTemplate => ({
  schema_version: 1,
  id: 't',
  builtin: false,
  name: 'Stored name',
  name_code: null,
  categories: [],
  detail_level: 'standard',
  prompt_template: 'stored prompt',
  prompt_code: null,
  default_summaries: [],
  required_series: [],
  created_at: '',
  updated_at: '',
  ...patch,
});

describe('templateName / templatePromptSeed', () => {
  it('无码时用存储原文；有码时按码取界面文案', () => {
    expect(templateName(template())).toBe('Stored name');
    expect(templatePromptSeed(template())).toBe('stored prompt');
    // 内置模板码（copy.ts 里有 zh 文案；测试在 node 下默认 zh 判定）。
    const builtin = template({
      builtin: true,
      name_code: 'ui.ai_template.recovery_run.name',
      prompt_code: 'ui.ai_template.recovery_run.prompt',
    });
    expect(templateName(builtin)).toBe('恢复跑');
    expect(templatePromptSeed(builtin)).toContain('恢复');
  });

  it('isBuiltinTemplate 只是 builtin 字段的直通', () => {
    expect(isBuiltinTemplate(template({ builtin: true }))).toBe(true);
    expect(isBuiltinTemplate(template())).toBe(false);
  });
});

describe('copy 表', () => {
  it('类别/模板/阻塞码都能取到文案；未知码给 undefined', () => {
    expect(aiTaskTextFor('ui.ai_task.cat.sleep')).toBe('睡眠');
    expect(aiTaskTextFor('ui.ai_task.blocked.attachment_missing')).toBeTruthy();
    expect(aiTaskTextFor('ui.ai_task.nope')).toBeUndefined();
    expect(aiTaskTextFor(null)).toBeUndefined();
  });

  it('coverage_note 是传给 ai_task_prepare 的本地化开头语', () => {
    expect(coverageNoteText()).toBe(aiTaskTextFor('ui.ai_task.prompt.coverage_note'));
  });
});

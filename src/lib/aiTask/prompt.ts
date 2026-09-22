/**
 * 提示词组装：模板初稿 + 用户自由编辑。
 *
 * 界面侧只管「初稿是什么」；最终交给 AI 的 `prompt_text` 由后端在
 * `ai_task_prepare` 里拼（用户提示词 + 覆盖说明段），说明段的开头文本由
 * 前端按 `ui.ai_task.prompt.coverage_note` 传进去——见 `copy.ts`。
 */
import type { AiTaskTemplate } from '../bridge/types';
import { aiTaskTextFor, coverageNoteText } from './copy';

export { coverageNoteText };

/** 模板名：`name_code` 优先（内置模板按界面语言取），回落到存储的 `name`。 */
export const templateName = (template: AiTaskTemplate): string =>
  aiTaskTextFor(template.name_code) ?? template.name;

/**
 * 模板给任务种下的提示词初稿：`prompt_code` 指向本地化文案（内置模板），
 * 用户自建模板只有 `prompt_template` 原文。
 */
export const templatePromptSeed = (template: AiTaskTemplate): string =>
  aiTaskTextFor(template.prompt_code) ?? template.prompt_template;

/** 内置模板不可改不可删（P3：`err.ai_template.builtin_readonly`）。 */
export const isBuiltinTemplate = (template: AiTaskTemplate): boolean => template.builtin;

/**
 * 提示词组装：分析方向（模板）+ 我的问题 + 覆盖说明。
 *
 * 模板是全局方向，问题是这次的侧重点——两者并存，不再二选一。
 * 最终交给 AI 的 `prompt_text` 由后端在 `ai_task_prepare` 里拼，方向段和覆盖
 * 说明段都由前端按界面语言传进去；`composePromptPreview` 用同一规则在界面上
 * 先拼一遍，给用户看「复制出去的就是这段」。
 */
import type { AiTaskTemplate } from '../bridge/types';
import { defineMessages, messagesOf } from '../../i18n';
import { aiTaskTextFor, coverageNoteText } from './copy';

export { coverageNoteText };

const messages = defineMessages(
  { directionHeading: '分析方向：' },
  { directionHeading: 'Analysis direction: ' },
  { directionHeading: 'Enfoque del análisis: ' },
  'lib/aiTask/prompt',
);

/** 模板名：`name_code` 优先（内置模板按界面语言取），回落到存储的 `name`。 */
export const templateName = (template: AiTaskTemplate): string =>
  aiTaskTextFor(template.name_code) ?? template.name;

/** 模板的方向正文：`prompt_code` 指向本地化文案（内置模板），用户模板只有原文。 */
export const templatePromptSeed = (template: AiTaskTemplate): string =>
  aiTaskTextFor(template.prompt_code) ?? template.prompt_template;

/** 传给 `ai_task_prepare` 的方向段；没选模板时为 null。 */
export const directionText = (template: AiTaskTemplate | null | undefined): string | null => {
  if (!template) return null;
  const seed = templatePromptSeed(template).trim();
  return seed ? `${messagesOf(messages).directionHeading}${seed}` : null;
};

/** 与后端 `assemble_task_prompt` 同一规则：非空段落用空行连接。 */
export const composePromptPreview = (parts: {
  direction: string | null;
  question: string;
  coverageNote?: string;
}): string =>
  [parts.direction ?? '', parts.question.trim(), (parts.coverageNote ?? coverageNoteText()).trim()]
    .filter((part) => part.length > 0)
    .join('\n\n');

/** 内置模板不可改不可删（P3：`err.ai_template.builtin_readonly`）。 */
export const isBuiltinTemplate = (template: AiTaskTemplate): boolean => template.builtin;

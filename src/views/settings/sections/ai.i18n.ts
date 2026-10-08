import { defineMessages } from '../../../i18n';

/* 设置「交给 AI 工具」卡（2A 极简重写）。 */
export const aiCardMessages = defineMessages(
  {
    lead: '让本机的 AI 工具（Claude Code、Codex 等）直接查你的数据',
    toolsLabel: 'AI 能用的工具（悬停看说明）',
    scopesHint: '只对以 --scope task 启动的 MCP 生效',
  },
  {
    lead: 'Let AI tools on this computer (Claude Code, Codex and the like) query your data directly',
    toolsLabel: 'Tools the AI can use (hover for details)',
    scopesHint: 'Only applies to MCP started with --scope task',
  },
  {
    lead: 'Permite que las herramientas de IA de este equipo (Claude Code, Codex y similares) consulten tus datos directamente',
    toolsLabel: 'Herramientas que puede usar la IA (pasa el cursor para ver el detalle)',
    scopesHint: 'Solo se aplica al MCP iniciado con --scope task',
  },
  'views/settings/sections/ai',
);

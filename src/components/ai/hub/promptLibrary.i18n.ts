import { defineMessages, useMessages } from '../../../i18n';

/* 已保存任务页上的 Prompt 库：按类别筛、版本历史、.zbprompt 导出 / 导入（批次 7）。只写中英西。 */
const messages = defineMessages(
  {
    all: '全部',
    filterLabel: '按数据类别筛',
    noMatch: '没有带这一类数据的任务。',
    history: '以前的问法',
    historyEmpty: '这个任务的提示词还没改过。',
    historyLoadFailed: '没能读出以前的问法',
    replacedAt: (when: string) => `用到 ${when}`,
    useVersion: '用这一版',
    exportPrompt: '导出 .zbprompt',
    exported: (path: string) => `已导出到 ${path}`,
    importPrompt: '导入 .zbprompt',
    imported: (title: string) => `已导入「${title}」，挑好运动就能用`,
    fileFilter: 'ZeppBridge 问法',
  },
  {
    all: 'All',
    filterLabel: 'Filter by data category',
    noMatch: 'No task uses this kind of data.',
    history: 'Earlier wordings',
    historyEmpty: 'This task’s prompt hasn’t been changed yet.',
    historyLoadFailed: 'Couldn’t load the earlier wordings',
    replacedAt: (when: string) => `used until ${when}`,
    useVersion: 'Use this one',
    exportPrompt: 'Export .zbprompt',
    exported: (path: string) => `Exported to ${path}`,
    importPrompt: 'Import .zbprompt',
    imported: (title: string) => `Imported “${title}”. Pick workouts and it’s ready.`,
    fileFilter: 'ZeppBridge prompt',
  },
  {
    all: 'Todas',
    filterLabel: 'Filtrar por tipo de datos',
    noMatch: 'Ninguna tarea usa este tipo de datos.',
    history: 'Versiones anteriores',
    historyEmpty: 'La pregunta de esta tarea aún no se ha cambiado.',
    historyLoadFailed: 'No se pudieron cargar las versiones anteriores',
    replacedAt: (when: string) => `usada hasta ${when}`,
    useVersion: 'Usar esta',
    exportPrompt: 'Exportar .zbprompt',
    exported: (path: string) => `Exportado a ${path}`,
    importPrompt: 'Importar .zbprompt',
    imported: (title: string) => `Se importó «${title}». Elige los entrenos y listo.`,
    fileFilter: 'Pregunta de ZeppBridge',
  },
  'components/ai/hub/promptLibrary',
);

export const usePromptLibraryText = () => useMessages(messages);

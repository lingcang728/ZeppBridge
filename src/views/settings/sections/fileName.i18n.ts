import { defineMessages } from '../../../i18n';

/* 交给 AI 的文件命名规则（高级卡）。从 ExportDefaultsSection 搬来，语言包里的译文跟着改了模块名。 */
export const fileNameMessages = defineMessages(
  {
    nameTitle: '交给 AI 的文件命名',
    nameSub: '每次导出按这个规则起名，看文件名就知道是哪段时间、哪些数据。',
    ruleRange: '日期范围 + 内容',
    ruleTask: '任务名 + 时刻',
    ruleApp: 'ZeppBridge + 日期',
    example: '例如',
    exampleTitle: '最近 14 天',
  },
  {
    nameTitle: 'AI handoff file names',
    nameSub: 'Every export follows this rule — the file name says the period and the data.',
    ruleRange: 'Date range + content',
    ruleTask: 'Task name + time',
    ruleApp: 'ZeppBridge + date',
    example: 'e.g.',
    exampleTitle: 'Last 14 days',
  },
  {
    nameTitle: 'Nombres de archivo para la IA',
    nameSub: 'Cada exportación sigue esta regla de nombre: el archivo mismo dice qué periodo y qué datos trae.',
    ruleRange: 'Rango de fechas + contenido',
    ruleTask: 'Nombre de tarea + hora',
    ruleApp: 'ZeppBridge + fecha',
    example: 'p. ej.',
    exampleTitle: 'Últimos 14 días',
  },
  'views/settings/sections/fileName',
);

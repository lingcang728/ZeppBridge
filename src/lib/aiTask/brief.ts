/**
 * 提示词最前面的「任务说明」段。
 *
 * 以前没写问题、没选模板时，交出去的提示词只有一句「不要推测缺失」，用户把文件夹
 * 和提示词都给了 GPT，GPT 还是反问「你想让我做什么」。这一段让 prompt.txt 自己就
 * 说清楚：数据是什么、文件怎么读、要做什么、怎么回答——AI 读完直接开工。
 *
 * 内容按界面语言本地化，传给后端原样放在最前（后端不产文案）。
 */
import type { AiTaskCategory } from '../bridge/types';
import { defineMessages, messagesOf } from '../../i18n';
import { categoryLabel } from './categories';

export interface BriefInput {
  /** 数据实际覆盖的起止日（YYYY-MM-DD）；未知时为 null。 */
  start: string | null;
  end: string | null;
  /** 交出去的数据类别（不含个人说明 / 附件）。 */
  categories: AiTaskCategory[];
  /** 数据文件的文件名（含扩展名）。 */
  dataFile: string;
  /** 交付形态：`md` = 提示词和数据在同一个 `.md` 里（批次 ⑦，AI 页默认）；`json` = 旧的 JSON + txt。 */
  format?: 'json' | 'md';
  attachmentCount: number;
  hasPersonalNote: boolean;
  /** 关联了几条运动（0 = 按「最近 N 天」）。 */
  workoutCount: number;
  /** 用户写了问题或选了分析方向：有就围绕它答，没有就给默认的全面分析清单。 */
  hasQuestion: boolean;
}

const messages = defineMessages(
  {
    heading: '任务说明：',
    intro: (range: string) => `附件是我从 Zepp 手表导出的个人健康数据（${range}，由 ZeppBridge 在本机整理，只含我自己的数据）。`,
    range: (start: string, end: string) => (start === end ? start : `${start} 至 ${end}`),
    rangeUnknown: '最近一段时间',
    fileData: (file: string, labels: string) => `- ${file}：全部数据。context 按类别（${labels}）逐日列出指标、睡眠和运动；coverage 写明每类实际有数据的日期；units 是各字段单位；task.personal_note 是我的个人背景。`,
    fileWorkouts: (n: number) => `- 其中 workouts 是我专门挑出的 ${n} 条运动，是分析重点。`,
    fileAttachments: (n: number) => `- attachments/ 里是我另附的 ${n} 个原件（如体检报告、截图），一并参考。`,
    fileNote: '- 个人背景里有我的情况，结合判断。',
    introMd: (range: string) => `这份文件是我从 Zepp 手表导出的个人健康数据（${range}，由 ZeppBridge 在本机整理，只含我自己的数据）。`,
    fileDataMd: (labels: string) => `- 下面「# Data」之后是全部数据（${labels}），怎么读见紧接着的「读法」。`,
    fileWorkoutsMd: (n: number) => `- Selected workouts 是我专门挑出的 ${n} 条运动，是分析重点。`,
    fileAttachmentsMd: (n: number) => `- 我另外附了 ${n} 个原件（如体检报告、截图），一并参考。`,
    start: '直接开始分析，不用先问我要做什么。',
    followQuestion: '围绕下面的「分析方向」和我的问题回答。',
    defaultPlan: '我没指定具体问题，按下面的顺序给一份完整分析：',
    step1: '1. 一句话结论：这段时间我的整体状态如何。',
    step2: (labels: string) => `2. 逐类看（${labels}）：水平、趋势，与我此前常态的比较。`,
    step3: '3. 类别间的关系：如睡眠、恢复与训练负荷是否互相影响。',
    step4: '4. 异常与值得注意的点：哪些日期或指标明显偏离常态，可能原因。',
    step5: '5. 接下来 1–2 周可执行的建议：具体到做什么、做多少、何时做。',
    rules: '回答要求：先结论后证据；引用具体日期和数值；数据缺口直接指出，不要推测或补全缺失日期；用中文回答。',
  },
  {
    heading: '[Task]',
    intro: (range: string) => `Attached is my personal health data exported from my Zepp watch (${range}, organised locally by ZeppBridge; it only contains my own data).`,
    range: (start: string, end: string) => (start === end ? start : `${start} to ${end}`),
    rangeUnknown: 'a recent period',
    fileData: (file: string, labels: string) => `- ${file}: all the data. "context" lists metrics, sleep and workouts day by day per category (${labels}); "coverage" states which dates actually have data; "units" gives the unit of each field; "task.personal_note" is my own background note.`,
    fileWorkouts: (n: number) => `- "workouts" holds the ${n} workout(s) I picked on purpose — they are the focus.`,
    fileAttachments: (n: number) => `- The attachments/ folder holds ${n} original file(s) I added (e.g. lab reports, screenshots); please use them too.`,
    fileNote: '- I described my situation in the personal background; take it into account.',
    introMd: (range: string) => `This file is my personal health data exported from my Zepp watch (${range}, organised locally by ZeppBridge; it only contains my own data).`,
    fileDataMd: (labels: string) => `- Everything after "# Data" below is the data (${labels}); the "How to read" note right after this explains the tables.`,
    fileWorkoutsMd: (n: number) => `- "Selected workouts" are the ${n} workout(s) I picked on purpose — they are the focus.`,
    fileAttachmentsMd: (n: number) => `- I also attached ${n} original file(s) (e.g. lab reports, screenshots); please use them too.`,
    start: 'Please start the analysis right away — do not ask me what I want first.',
    followQuestion: 'Answer around the "analysis direction" and my question below.',
    defaultPlan: 'I have not asked a specific question, so give me a complete analysis in this order:',
    step1: '1. One-line verdict: how I have been doing overall in this period.',
    step2: (labels: string) => `2. Category by category (${labels}): level, trend, and how it compares with my own usual baseline.`,
    step3: '3. How the categories relate — e.g. whether sleep, recovery and training load affect each other.',
    step4: '4. Anomalies worth noting: which dates or metrics clearly deviate from my norm, and likely reasons.',
    step5: '5. Actionable advice for the next 1–2 weeks: what to do, how much, and when.',
    rules: 'How to answer: conclusion first, then evidence; cite specific dates and values; point out data gaps plainly and never guess or fill in missing dates; answer in English.',
  },
  {
    heading: '[Tarea]',
    intro: (range: string) => `Adjunto mis datos de salud de mi reloj Zepp (${range}, organizados localmente por ZeppBridge; solo contienen mis propios datos).`,
    range: (start: string, end: string) => (start === end ? start : `${start} a ${end}`),
    rangeUnknown: 'un periodo reciente',
    fileData: (file: string, labels: string) => `- ${file}: todos los datos. "context" lista métricas, sueño y entrenamientos día a día por categoría (${labels}); "coverage" indica las fechas con datos reales de cada categoría; "units" da la unidad de cada campo; "task.personal_note" es mi contexto personal.`,
    fileWorkouts: (n: number) => `- "workouts" contiene los ${n} entrenamientos seleccionados: son el foco principal.`,
    fileAttachments: (n: number) => `- La carpeta attachments/ incluye ${n} archivo(s) original(es) adjunto(s) (informes, capturas); consúltalos también.`,
    fileNote: '- Mi contexto personal describe mi situación; tómalo en cuenta.',
    introMd: (range: string) => `Este archivo contiene mis datos de salud de mi reloj Zepp (${range}, organizados localmente por ZeppBridge; solo contienen mis propios datos).`,
    fileDataMd: (labels: string) => `- Todo lo que sigue a «# Data» son los datos (${labels}); la nota «Cómo leer» justo después explica las tablas.`,
    fileWorkoutsMd: (n: number) => `- «Selected workouts» son los ${n} entrenamientos que elegí: son el foco principal.`,
    fileAttachmentsMd: (n: number) => `- También adjunto ${n} archivo(s) original(es) (informes, capturas); consúltalos también.`,
    start: 'Inicia el análisis directamente, sin preguntarme primero qué hacer.',
    followQuestion: 'Responde enfocado en la «dirección de análisis» y mi pregunta.',
    defaultPlan: 'Sin pregunta específica: proporciona un análisis completo en este orden:',
    step1: '1. Conclusión en una frase: estado general en este periodo.',
    step2: (labels: string) => `2. Por categoría (${labels}): nivel, tendencia y comparación con mi línea base habitual.`,
    step3: '3. Relación entre categorías: cómo interactúan sueño, recuperación y carga de entrenamiento.',
    step4: '4. Anomalías y puntos clave: fechas o métricas con desviaciones claras y posibles causas.',
    step5: '5. Recomendaciones prácticas para las próximas 1–2 semanas: qué hacer, cuánto y cuándo.',
    rules: 'Criterios de respuesta: primero conclusiones, luego evidencia; cita fechas y valores concretos; menciona vacíos de datos sin especular ni rellenar fechas faltantes; responde en español.',
  },
  'lib/aiTask/brief',
);

export const buildBrief = (input: BriefInput): string => {
  const t = messagesOf(messages);
  const labels = input.categories.map(categoryLabel).join(' / ');
  const range = input.start && input.end ? t.range(input.start, input.end) : t.rangeUnknown;
  const md = input.format === 'md';
  const lines: string[] = md
    ? [t.heading, t.introMd(range), '', t.fileDataMd(labels || '—')]
    : [t.heading, t.intro(range), '', t.fileData(input.dataFile, labels || '—')];
  if (input.workoutCount > 0) lines.push(md ? t.fileWorkoutsMd(input.workoutCount) : t.fileWorkouts(input.workoutCount));
  if (input.attachmentCount > 0) lines.push(md ? t.fileAttachmentsMd(input.attachmentCount) : t.fileAttachments(input.attachmentCount));
  if (input.hasPersonalNote) lines.push(t.fileNote);
  lines.push('', t.start);
  if (input.hasQuestion) {
    lines.push(t.followQuestion);
  } else {
    lines.push(t.defaultPlan, t.step1, t.step2(labels || '—'), t.step3, t.step4, t.step5);
  }
  lines.push('', t.rules);
  return lines.join('\n');
};

/**
 * `ui.ai_task.*` / `ui.ai_template.*` 文案表。
 *
 * 后端只给稳定码（warnings/blocked 的 `code`、内置模板的 `name_code`/
 * `prompt_code`），句子按界面语言在这里取——和 `storageEstimateText.ts`
 * 处理 `ui.estimate.*` 是同一套约定。码本身是契约，不能改名。
 *
 * `coverageNote` 特殊一点：它不是后端发来的，而是前端**传给**
 * `ai_task_prepare` 的本地化文本——后端把实际覆盖统计附在这段话后面，
 * 自己不产界面文案。
 */
import { backendText } from '../../i18n/backendText';
import { defineMessages, messagesOf } from '../../i18n';
import type { AiTaskIssue } from '../bridge/types';

const messages = defineMessages(
  {
    /* —— 类别名（ui.ai_task.cat.*） —— */
    'ui.ai_task.cat.workout': '期间运动记录',
    'ui.ai_task.cat.sleep': '睡眠',
    'ui.ai_task.cat.recovery': '恢复状态',
    'ui.ai_task.cat.resting_hr': '静息心率',
    'ui.ai_task.cat.heart_rate': '全天心率',
    'ui.ai_task.cat.training': '训练负荷',
    'ui.ai_task.cat.body': '身体状态',
    'ui.ai_task.cat.personal_note': '个人说明',
    'ui.ai_task.cat.attachment': '附件',

    /* —— 传给 ai_task_prepare 的覆盖说明段开头 —— */
    'ui.ai_task.prompt.coverage_note':
      '以下是 ZeppBridge 按本机数据统计的实际覆盖与时间窗；无数据日期已如实标注，不要推测或编造缺失部分。',

    /* —— 交付阻塞（prepare.blocked 的 ui 码） —— */
    'ui.ai_task.blocked.attachment_missing': '有附件原件找不到了。重新选择文件，或移除这条引用。',
    'ui.ai_task.blocked.no_workouts': '任务还没关联运动。回编辑页至少选一条再交付。',
    'ui.ai_task.blocked.empty': '当前选择覆盖不到任何数据，先调整类别或运动范围。',

    /* —— 预览警告（preview.warnings 的 ui 码） —— */
    'ui.ai_task.warn.attachment_changed': '附件大小和添加时不同——交付前确认还是同一份原件。',
    'ui.ai_task.warn.category_missing': '该类别在所选时间窗内没有数据，导出会如实标注缺失。',
    'ui.ai_task.warn.partial_coverage': '时间窗内只有部分日期有数据。',
    'ui.ai_task.unknown': '未识别的状态说明',

    /* —— 附件区提示 —— */
    'ui.ai_task.attach.no_redaction':
      '导出会把原件复制到桌面的交付文件夹（不脱敏）。确认你愿意把它交给所选 AI。',

    /* —— 内置模板（ui.ai_template.<id>.name / .prompt） —— */
    'ui.ai_template.recovery_run.name': '恢复跑',
    'ui.ai_template.recovery_run.prompt':
      '这是一次恢复期训练。结合前两周的睡眠、恢复状态与心率评估：强度是否匹配当前恢复水平？接下来 48 小时如何安排训练？',
    'ui.ai_template.long_run_compare.name': '多次长跑比较',
    'ui.ai_template.long_run_compare.prompt':
      '比较这几组长跑：配速/心率漂移、体感与恢复背景的差异。哪次负荷效率最高？下次长跑强度如何安排？',
    'ui.ai_template.hr_drift.name': '心率漂移',
    'ui.ai_template.hr_drift.prompt':
      '分析这次运动的心率漂移：对照同等配速下心率上升幅度，结合前两周睡眠与训练负荷判断是疲劳、天气还是体能变化。',

    'ui.ai_template.sleep_review.name': '最近睡眠',
    'ui.ai_template.sleep_review.prompt':
      '请看看最近两周的睡眠：时长和入睡、醒来时间是否规律，深睡与 REM 的占比有没有变化，夜间心率和 HRV 怎么走。指出哪几晚明显不同，并结合当天的运动和我的说明推测可能的原因。',
    'ui.ai_template.recovery_trend.name': '恢复趋势',
    'ui.ai_template.recovery_trend.prompt':
      '最近四周我的恢复是在变好还是变差？请看静息心率、HRV、睡眠和训练负荷各自的走向、相互是否对得上，区分真实趋势和日常波动，数据缺失的日子如实说明。',
    'ui.ai_template.next_week.name': '排下周',
    'ui.ai_template.next_week.prompt': '结合最近的训练、睡眠、恢复与饮食，先讨论下周安排并允许多轮调整；只有我说定稿后，再按文件末尾的格式输出最终计划。',
    'ui.ai_template.week_review.name': '这一周',
    'ui.ai_template.week_review.prompt':
      '请看看这一周：睡眠、恢复、心率和运动量和平时比有什么变化，哪些值得留意，哪些只是正常波动。只根据数据说话，不做诊断，缺数据的日子如实说明。',

    /* —— 界面兜底 —— */
    fallbackIssue: '有一条状态说明无法识别',
  },
  {
    'ui.ai_task.cat.workout': 'Workouts in window',
    'ui.ai_task.cat.sleep': 'Sleep',
    'ui.ai_task.cat.recovery': 'Readiness',
    'ui.ai_task.cat.resting_hr': 'Resting HR',
    'ui.ai_task.cat.heart_rate': 'All-day heart rate',
    'ui.ai_task.cat.training': 'Training load',
    'ui.ai_task.cat.body': 'Body status',
    'ui.ai_task.cat.personal_note': 'Personal note',
    'ui.ai_task.cat.attachment': 'Attachments',

    'ui.ai_task.prompt.coverage_note':
      'The coverage below was measured on-device by ZeppBridge. Days without data are marked as missing — do not infer or invent them.',

    'ui.ai_task.blocked.attachment_missing': 'An original attachment can no longer be found. Reselect the file or remove the reference first.',
    'ui.ai_task.blocked.no_workouts': 'No workout is linked to this task yet. Go back and pick at least one.',
    'ui.ai_task.blocked.empty': 'The current selection covers no data. Adjust categories or workouts first.',

    'ui.ai_task.warn.attachment_changed': 'An attachment\'s size changed since it was added — confirm it is still the same file before handing off.',
    'ui.ai_task.warn.category_missing': 'This category has no data in the selected window; the export marks it as missing.',
    'ui.ai_task.warn.partial_coverage': 'Only part of the window has data.',
    'ui.ai_task.unknown': 'Unrecognized status note',

    'ui.ai_task.attach.no_redaction':
      'On export, originals are copied to the desktop handoff folder unredacted. Only share them with the chosen AI if you are comfortable with that.',

    'ui.ai_template.recovery_run.name': 'Recovery run',
    'ui.ai_template.recovery_run.prompt':
      'This was a recovery-phase workout. Using the two weeks of sleep, readiness and heart-rate context before it, assess whether the intensity matched my recovery level, and suggest training for the next 48 hours.',
    'ui.ai_template.long_run_compare.name': 'Long run comparison',
    'ui.ai_template.long_run_compare.prompt':
      'Compare these long runs: pace/heart-rate drift, perceived effort and recovery context. Which session was most efficient, and how should I set intensity for the next one?',
    'ui.ai_template.hr_drift.name': 'Heart-rate drift',
    'ui.ai_template.hr_drift.prompt':
      'Analyze the heart-rate drift in this workout: the rise at constant pace, judged against two weeks of sleep and training load — fatigue, weather, or fitness change?',

    'ui.ai_template.sleep_review.name': 'Recent sleep',
    'ui.ai_template.sleep_review.prompt':
      'Look back at my last two weeks of sleep: duration and how regular bedtime and wake time were, whether the share of deep and REM sleep changed, and how overnight heart rate and HRV moved. Point out the nights that stand out and suggest likely reasons using that day’s workouts and my notes.',
    'ui.ai_template.recovery_trend.name': 'Recovery trend',
    'ui.ai_template.recovery_trend.prompt':
      'Over the last four weeks, is my recovery getting better or worse? Look at resting heart rate, HRV, sleep and training load, whether they agree with each other, and separate real trends from day-to-day noise. Say plainly where data is missing.',
    'ui.ai_template.next_week.name': 'Plan next week',
    'ui.ai_template.next_week.prompt': 'Discuss next week using recent training, sleep, recovery and food. Allow changes across multiple turns; only return the final plan format when I say finalize.',
    'ui.ai_template.week_review.name': 'This week',
    'ui.ai_template.week_review.prompt':
      'Review this week: how sleep, recovery, heart rate and activity compare with usual, which changes are worth noticing and which are ordinary variation. Stick to the data, no diagnosis, and say plainly where data is missing.',

    fallbackIssue: 'A status note could not be recognized',
  },
  {
    'ui.ai_task.cat.workout': 'Entrenamientos en la ventana',
    'ui.ai_task.cat.sleep': 'Sueño',
    'ui.ai_task.cat.recovery': 'Recuperación',
    'ui.ai_task.cat.resting_hr': 'FC en reposo',
    'ui.ai_task.cat.heart_rate': 'FC de todo el día',
    'ui.ai_task.cat.training': 'Carga de entrenamiento',
    'ui.ai_task.cat.body': 'Estado corporal',
    'ui.ai_task.cat.personal_note': 'Nota personal',
    'ui.ai_task.cat.attachment': 'Adjuntos',

    'ui.ai_task.prompt.coverage_note':
      'A continuación, la cobertura real y las ventanas de tiempo que ZeppBridge midió en este equipo; los días sin datos están marcados como tal: no los deduzcas ni los inventes.',

    'ui.ai_task.blocked.attachment_missing': 'Falta el archivo adjunto original. Vuelve a seleccionarlo o quita la referencia.',
    'ui.ai_task.blocked.no_workouts': 'La tarea no tiene entrenamientos vinculados. Vuelve y selecciona al menos uno.',
    'ui.ai_task.blocked.empty': 'La selección actual no abarca datos. Ajusta las categorías o entrenamientos primero.',

    'ui.ai_task.warn.attachment_changed': 'El tamaño del adjunto cambió desde que se agregó; confirma que sigue siendo el mismo archivo antes de pasarlo a la IA.',
    'ui.ai_task.warn.category_missing': 'Esta categoría no tiene datos en la ventana seleccionada; la exportación la marcará como faltante.',
    'ui.ai_task.warn.partial_coverage': 'Solo parte de la ventana contiene datos.',
    'ui.ai_task.unknown': 'Nota de estado no reconocida',

    'ui.ai_task.attach.no_redaction':
      'Al exportar, el original se copia sin anonimizar a la carpeta de entrega en el escritorio. Confirma que deseas compartirlo con la IA elegida.',

    'ui.ai_template.recovery_run.name': 'Carrera de recuperación',
    'ui.ai_template.recovery_run.prompt':
      'Esta fue una sesión de recuperación. Con el sueño, la recuperación y la frecuencia cardíaca de las dos semanas previas, evalúa: ¿la intensidad encajó con mi nivel de recuperación actual? ¿Cómo entrenar las próximas 48 horas?',
    'ui.ai_template.long_run_compare.name': 'Comparación de carreras largas',
    'ui.ai_template.long_run_compare.prompt':
      'Compara estas carreras largas: deriva de ritmo/frecuencia cardíaca, esfuerzo percibido y recuperación. ¿Cuál fue más eficiente y qué intensidad programar para la próxima?',
    'ui.ai_template.hr_drift.name': 'Deriva de frecuencia cardíaca',
    'ui.ai_template.hr_drift.prompt':
      'Analiza la deriva de frecuencia cardíaca de esta sesión: el aumento a ritmo constante, valorado con dos semanas de sueño y carga. ¿Fatiga, clima o cambio de forma?',

    'ui.ai_template.sleep_review.name': 'Sueño reciente',
    'ui.ai_template.sleep_review.prompt':
      'Repasa mis dos últimas semanas de sueño: duración y regularidad de la hora de acostarme y de despertar, si cambió la proporción de sueño profundo y REM, y cómo evolucionaron la frecuencia cardíaca nocturna y la VFC. Señala las noches que destacan y sugiere causas probables con los entrenamientos de ese día y mis notas.',
    'ui.ai_template.recovery_trend.name': 'Tendencia de recuperación',
    'ui.ai_template.recovery_trend.prompt':
      'En las últimas cuatro semanas, ¿mi recuperación va a mejor o a peor? Mira la frecuencia cardíaca en reposo, la VFC, el sueño y la carga de entrenamiento, si coinciden entre sí, y separa las tendencias reales de la variación diaria. Indica claramente dónde faltan datos.',
    'ui.ai_template.next_week.name': 'Planificar la próxima semana',
    'ui.ai_template.next_week.prompt': 'Hablemos de la próxima semana usando entrenamiento, sueño, recuperación y alimentación. Podemos ajustar varias veces; da el formato final solo cuando diga versión final.',
    'ui.ai_template.week_review.name': 'Esta semana',
    'ui.ai_template.week_review.prompt':
      'Repasa esta semana: cómo se comparan el sueño, la recuperación, la frecuencia cardíaca y la actividad con lo habitual, qué cambios merecen atención y cuáles son variación normal. Cíñete a los datos, sin diagnósticos, e indica claramente dónde faltan datos.',

    fallbackIssue: 'No se pudo reconocer una nota de estado',
  },
  'lib/aiTask/copy',
);

const copy = () => messagesOf(messages) as Record<string, string>;

/** 按码取当前界面语言的 `ui.ai_task.*`/`ui.ai_template.*` 文案；没有就 undefined。 */
export const aiTaskTextFor = (code: string | null | undefined): string | undefined => {
  if (!code) return undefined;
  const value = copy()[code];
  return typeof value === 'string' && value ? value : undefined;
};

/**
 * 后端在 `warnings`/`blocked` 里定稿的例外码：这一条以 `err.*` 发出
 * （它同时是命令层的真实错误码），但界面文案仍取 `ui.*` 表那一份。
 * 码表契约不能改，所以在入口做别名，不新增重复文案。
 */
const ISSUE_CODE_ALIAS: Record<string, string> = {
  'err.ai_task.attachment_missing': 'ui.ai_task.blocked.attachment_missing',
};

/**
 * `warnings`/`blocked` 元素的渲染口径：先按 `code` 取界面文案，取不到才过
 * `backendText` 闸门回落到后端原文（英文界面下中文原文会被闸门换掉）。
 *
 * 用解构取 `message` 而不是 `issue.message`：不是绕门禁，而是这行就是
 * 「先查码再回落」的实现本体——和 `toUserMessage` 里 `candidate.message`
 * 的登记性质相同。
 */
export const aiTaskIssueText = (issue: AiTaskIssue, fallback = copy().fallbackIssue): string => {
  const { code, message: backendFallback } = issue;
  const lookupCode = code ? (ISSUE_CODE_ALIAS[code] ?? code) : code;
  return aiTaskTextFor(lookupCode) ?? backendText(backendFallback, fallback);
};

/** `ai_task_prepare` 要的 `coverage_note` 参数：本地化、由前端提供。 */
export const coverageNoteText = (): string => copy()['ui.ai_task.prompt.coverage_note'];

/** 附件区的「不自动脱敏」固定提示。 */
export const attachmentPlainReferenceNote = (): string => copy()['ui.ai_task.attach.no_redaction'];

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
    'ui.ai_task.cat.workout': '运动',
    'ui.ai_task.cat.sleep': '睡眠',
    'ui.ai_task.cat.recovery': '恢复状态',
    'ui.ai_task.cat.heart_rate': '心率',
    'ui.ai_task.cat.training': '训练负荷',
    'ui.ai_task.cat.body': '身体状态',
    'ui.ai_task.cat.personal_note': '个人说明',
    'ui.ai_task.cat.attachment': '附件',

    /* —— 传给 ai_task_prepare 的覆盖说明段开头 —— */
    'ui.ai_task.prompt.coverage_note':
      '以下是 ZeppBridge 按本机数据统计出的实际覆盖范围与时间窗；没有数据的日期已如实标注，请不要推测或编造缺失部分。',

    /* —— 交付阻塞（prepare.blocked 的 ui 码） —— */
    'ui.ai_task.blocked.attachment_missing': '有附件原件找不到了。请重新选择文件，或明确移除这条引用。',
    'ui.ai_task.blocked.no_workouts': '任务还没有关联运动。回到编辑页至少选一条运动后再交付。',
    'ui.ai_task.blocked.empty': '当前选择覆盖不到任何数据，请先调整类别或运动范围。',

    /* —— 预览警告（preview.warnings 的 ui 码） —— */
    'ui.ai_task.warn.attachment_changed': '附件大小和添加时不一样——交付前请确认还是同一份原件。',
    'ui.ai_task.warn.category_missing': '这一类别在所选时间窗内没有数据，导出里会如实标注缺失。',
    'ui.ai_task.warn.partial_coverage': '时间窗内只有部分日期有数据，覆盖详情见下表。',
    'ui.ai_task.unknown': '未识别的状态说明',

    /* —— 附件区提示 —— */
    'ui.ai_task.attach.no_redaction':
      '原件只按引用交付，不会自动脱敏。请确认你愿意把这份原文件手动发给所选 AI。',

    /* —— 内置模板（ui.ai_template.<id>.name / .prompt） —— */
    'ui.ai_template.recovery_run.name': '恢复跑',
    'ui.ai_template.recovery_run.prompt':
      '这是一次恢复期的训练。请结合运动前两周的睡眠、恢复状态与心率背景评估：这次运动强度是否匹配当前恢复水平？接下来 48 小时的训练建议是什么？',
    'ui.ai_template.long_run_compare.name': '多次长跑比较',
    'ui.ai_template.long_run_compare.prompt':
      '请比较这几组长跑：配速/心率漂移、体感与恢复背景的差异。哪一次的负荷效率最好？下一次长跑如何安排强度？',
    'ui.ai_template.hr_drift.name': '心率漂移',
    'ui.ai_template.hr_drift.prompt':
      '请分析这次运动的心率漂移：对照同等配速下心率的上升幅度，结合前两周睡眠与训练负荷判断是疲劳、天气还是体能变化。',

    /* —— 界面兜底 —— */
    fallbackIssue: '有一条状态说明无法识别',
  },
  {
    'ui.ai_task.cat.workout': 'Workouts',
    'ui.ai_task.cat.sleep': 'Sleep',
    'ui.ai_task.cat.recovery': 'Readiness',
    'ui.ai_task.cat.heart_rate': 'Heart rate',
    'ui.ai_task.cat.training': 'Training load',
    'ui.ai_task.cat.body': 'Body status',
    'ui.ai_task.cat.personal_note': 'Personal note',
    'ui.ai_task.cat.attachment': 'Attachments',

    'ui.ai_task.prompt.coverage_note':
      'The coverage below was measured on-device by ZeppBridge. Days without data are marked as missing — do not infer or invent them.',

    'ui.ai_task.blocked.attachment_missing': 'An original attachment can no longer be found. Reselect the file or remove the reference first.',
    'ui.ai_task.blocked.no_workouts': 'No workout is linked to this task yet. Go back and pick at least one.',
    'ui.ai_task.blocked.empty': 'The current selection covers no data. Adjust categories or workouts first.',

    'ui.ai_task.warn.attachment_changed': 'An attachment\'s size differs from when it was added — confirm it is still the same original before handing off.',
    'ui.ai_task.warn.category_missing': 'This category has no data in the selected window; the export marks it as missing.',
    'ui.ai_task.warn.partial_coverage': 'Only part of the window has data. See the coverage table below.',
    'ui.ai_task.unknown': 'Unrecognized status note',

    'ui.ai_task.attach.no_redaction':
      'Originals are referenced as-is and are not redacted. Confirm you are willing to attach this file to the chosen AI yourself.',

    'ui.ai_template.recovery_run.name': 'Recovery run',
    'ui.ai_template.recovery_run.prompt':
      'This was a recovery-phase workout. Using the two weeks of sleep, readiness and heart-rate context before it, assess whether the intensity matched my recovery level, and suggest training for the next 48 hours.',
    'ui.ai_template.long_run_compare.name': 'Long run comparison',
    'ui.ai_template.long_run_compare.prompt':
      'Compare these long runs: pace/heart-rate drift, perceived effort and recovery context. Which session was most efficient, and how should I set intensity for the next one?',
    'ui.ai_template.hr_drift.name': 'Heart-rate drift',
    'ui.ai_template.hr_drift.prompt':
      'Analyze the heart-rate drift in this workout: the rise at constant pace, judged against two weeks of sleep and training load — fatigue, weather, or fitness change?',

    fallbackIssue: 'A status note could not be recognized',
  },
  {
    'ui.ai_task.cat.workout': 'Entrenamientos',
    'ui.ai_task.cat.sleep': 'Sueño',
    'ui.ai_task.cat.recovery': 'Recuperación',
    'ui.ai_task.cat.heart_rate': 'Frecuencia cardíaca',
    'ui.ai_task.cat.training': 'Carga de entrenamiento',
    'ui.ai_task.cat.body': 'Estado corporal',
    'ui.ai_task.cat.personal_note': 'Nota personal',
    'ui.ai_task.cat.attachment': 'Adjuntos',

    'ui.ai_task.prompt.coverage_note':
      'La cobertura siguiente la midió ZeppBridge en este equipo. Los días sin datos están marcados como faltantes: no los deduzcas ni los inventes.',

    'ui.ai_task.blocked.attachment_missing': 'Un adjunto original ya no se encuentra. Vuelve a elegir el archivo o quita la referencia.',
    'ui.ai_task.blocked.no_workouts': 'La tarea aún no tiene entrenamientos. Vuelve y elige al menos uno.',
    'ui.ai_task.blocked.empty': 'La selección actual no cubre ningún dato. Ajusta categorías o entrenamientos primero.',

    'ui.ai_task.warn.attachment_changed': 'El tamaño de un adjunto difiere del que tenía al añadirse: confirma que sigue siendo el mismo original.',
    'ui.ai_task.warn.category_missing': 'Esta categoría no tiene datos en la ventana elegida; la exportación lo marca como faltante.',
    'ui.ai_task.warn.partial_coverage': 'Solo parte de la ventana tiene datos. Revisa la tabla de cobertura.',
    'ui.ai_task.unknown': 'Nota de estado no reconocida',

    'ui.ai_task.attach.no_redaction':
      'Los originales se entregan por referencia y sin redacción automática. Confirma que quieres adjuntar este archivo a la IA elegida.',

    'ui.ai_template.recovery_run.name': 'Carrera de recuperación',
    'ui.ai_template.recovery_run.prompt':
      'Esta fue una sesión de recuperación. Con las dos semanas previas de sueño, recuperación y frecuencia cardíaca, evalúa si la intensidad encajó con mi estado y sugiere el entrenamiento de las próximas 48 horas.',
    'ui.ai_template.long_run_compare.name': 'Comparación de tiradas largas',
    'ui.ai_template.long_run_compare.prompt':
      'Compara estas tiradas largas: deriva de ritmo/frecuencia cardíaca, esfuerzo percibido y contexto de recuperación. ¿Cuál fue más eficiente y cómo ajusto la próxima?',
    'ui.ai_template.hr_drift.name': 'Deriva de frecuencia cardíaca',
    'ui.ai_template.hr_drift.prompt':
      'Analiza la deriva de frecuencia cardíaca de esta sesión: el aumento a ritmo constante, valorado con dos semanas de sueño y carga — ¿fatiga, clima o cambio de forma?',

    fallbackIssue: 'No se pudo reconocer una nota de estado',
  },
);

const copy = () => messagesOf(messages) as Record<string, string>;

/** 按码取当前界面语言的 `ui.ai_task.*`/`ui.ai_template.*` 文案；没有就 undefined。 */
export const aiTaskTextFor = (code: string | null | undefined): string | undefined => {
  if (!code) return undefined;
  const value = copy()[code];
  return typeof value === 'string' && value ? value : undefined;
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
  // 接缝映射（W3 集成者加）：后端按协议 231 行在 blocked 里发
  // `err.ai_task.attachment_missing`，本表挂的是 `ui.*` 同义键——
  // 先映射再查码，否则非中文界面只剩通用兜底。
  const key =
    code === 'err.ai_task.attachment_missing' ? 'ui.ai_task.blocked.attachment_missing' : code;
  return aiTaskTextFor(key) ?? backendText(backendFallback, fallback);
};

/** `ai_task_prepare` 要的 `coverage_note` 参数：本地化、由前端提供。 */
export const coverageNoteText = (): string => copy()['ui.ai_task.prompt.coverage_note'];

/** 附件区的「不自动脱敏」固定提示。 */
export const attachmentPlainReferenceNote = (): string => copy()['ui.ai_task.attach.no_redaction'];

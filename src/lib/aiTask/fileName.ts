/**
 * 交给 AI 的两个文件叫什么。
 *
 * 以前固定叫 `health-context.json` / `prompt.txt`：同一个对话里第二次拖进去，
 * AI 那边显示成 `health-context(1).json`，谁是哪次、装的什么全看不出来。现在按
 * 规则起名，每次导出天然不同名，AI 看文件名就知道是哪段时间、哪些数据。
 *
 * 规则三选一（设置 → 交给 AI 工具里切换，存本机）：
 *   range_content  ZeppBridge_0914-0927_睡眠心率等6类   （默认）
 *   task_time      最近14天 · 9月27日周日_20260927-1642
 *   app_date       ZeppBridge_2026-09-27_1642
 * 提示词文件 = 同名 + `_提示词`，两者挨着排。
 *
 * 名字在前端按界面语言拼好传给后端；后端仍按 Windows 规则清洗、截到 60 字。
 */
import type { AiTaskCategory } from '../bridge/types';
import { defineMessages, messagesOf } from '../../i18n';

export type FileNameRule = 'range_content' | 'task_time' | 'app_date';
export const FILE_NAME_RULES: readonly FileNameRule[] = ['range_content', 'task_time', 'app_date'];
export const DEFAULT_FILE_NAME_RULE: FileNameRule = 'range_content';

const RULE_KEY = 'zeppbridge.ai.fileNameRule';
/** 后端 sanitize_file_name 截到 60 个字符；提示词文件还要多挂一个后缀。 */
const MAX_STEM = 48;

const messages = defineMessages(
  {
    promptSuffix: '提示词',
    cat_workout: '运动',
    cat_sleep: '睡眠',
    cat_recovery: '恢复',
    cat_resting_hr: '静息心率',
    cat_heart_rate: '心率',
    cat_training: '训练',
    cat_body: '身体',
    cat_personal_note: '说明',
    cat_attachment: '附件',
    twoCategories: (a: string, b: string) => `${a}${b}`,
    manyCategories: (a: string, b: string, n: number) => `${a}${b}等${n}类`,
    noData: '无数据',
  },
  {
    promptSuffix: 'prompt',
    cat_workout: 'workouts',
    cat_sleep: 'sleep',
    cat_recovery: 'recovery',
    cat_resting_hr: 'resting HR',
    cat_heart_rate: 'heart rate',
    cat_training: 'training',
    cat_body: 'body',
    cat_personal_note: 'notes',
    cat_attachment: 'files',
    twoCategories: (a: string, b: string) => `${a} and ${b}`,
    manyCategories: (a: string, _b: string, n: number) => `${a} and ${n - 1} more`,
    noData: 'no data',
  },
  {
    promptSuffix: 'prompt',
    cat_workout: 'entrenos',
    cat_sleep: 'sueño',
    cat_recovery: 'recuperación',
    cat_resting_hr: 'FC en reposo',
    cat_heart_rate: 'pulso',
    cat_training: 'carga',
    cat_body: 'cuerpo',
    cat_personal_note: 'notas',
    cat_attachment: 'archivos',
    twoCategories: (a: string, b: string) => `${a} y ${b}`,
    manyCategories: (a: string, _b: string, n: number) => `${a} y ${n - 1} más`,
    noData: 'sin datos',
  },
  'lib/aiTask/fileName',
);

export const isFileNameRule = (value: unknown): value is FileNameRule =>
  typeof value === 'string' && (FILE_NAME_RULES as readonly string[]).includes(value);

export const readFileNameRule = (): FileNameRule => {
  try {
    const raw = window.localStorage.getItem(RULE_KEY);
    if (isFileNameRule(raw)) return raw;
  } catch {
    // 读不了就用默认规则。
  }
  return DEFAULT_FILE_NAME_RULE;
};

export const writeFileNameRule = (rule: FileNameRule): void => {
  try {
    window.localStorage.setItem(RULE_KEY, rule);
  } catch {
    // 写不进只影响下次的默认值。
  }
};

export interface FileNameInput {
  /** 数据实际覆盖的起止日（YYYY-MM-DD）；预览还没回来时为 null。 */
  start: string | null;
  end: string | null;
  /** 交出去的数据类别，按界面顺序。 */
  categories: AiTaskCategory[];
  /** 任务名（空时由调用方给自动标题）。 */
  title: string;
  now: Date;
}

export interface ExportFileStems {
  data: string;
  prompt: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const compactDay = (iso: string, withYear: boolean) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return withYear ? `${y}${m}${d}` : `${m}${d}`;
};

/** 按 Windows 文件名规则清洗；和后端同一套字符表，只是这里先截短、给后缀留位置。 */
export const safeFileStem = (raw: string): string => {
  const cleaned = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
  const chars = Array.from(cleaned);
  const cut = chars.length > MAX_STEM ? chars.slice(0, MAX_STEM).join('').trimEnd() : cleaned;
  return cut || 'ZeppBridge';
};

const contentLabel = (categories: AiTaskCategory[]): string => {
  const t = messagesOf(messages);
  const labels = categories.map((category) => t[`cat_${category}`]);
  if (!labels.length) return t.noData;
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return t.twoCategories(labels[0]!, labels[1]!);
  return t.manyCategories(labels[0]!, labels[1]!, labels.length);
};

export const exportFileStems = (rule: FileNameRule, input: FileNameInput): ExportFileStems => {
  const { now } = input;
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const clock = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  let stem: string;
  if (rule === 'task_time') {
    stem = `${input.title.trim() || 'ZeppBridge'}_${today.replace(/-/g, '')}-${clock}`;
  } else if (rule === 'app_date') {
    stem = `ZeppBridge_${today}_${clock}`;
  } else {
    const start = input.start ?? today;
    const end = input.end ?? today;
    // 跨年或不是今年的区间带上年份，免得明年再看不知道是哪年。
    const withYear = start.slice(0, 4) !== end.slice(0, 4) || end.slice(0, 4) !== String(now.getFullYear());
    const range = start === end ? compactDay(start, withYear) : `${compactDay(start, withYear)}-${compactDay(end, withYear)}`;
    stem = `ZeppBridge_${range}_${contentLabel(input.categories)}`;
  }
  const data = safeFileStem(stem);
  return { data, prompt: `${data}_${messagesOf(messages).promptSuffix}` };
};

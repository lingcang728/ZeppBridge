/** 导入一个训练文件：按内容认格式（不信扩展名），`.fit` 看头里的签名，`.zwo` 看 `<workout_file>`。 */
import { looksLikeFit, parseFit } from './fit';
import { looksLikeZwo, parseZwo } from './zwo';
import type { ImportOptions, ImportResult } from './common';

export type { ImportedWorkout, ImportFailure, ImportNeed, ImportNote, ImportOptions, ImportResult } from './common';

/** 文件选择框只列这两种。 */
export const IMPORT_ACCEPT = '.zwo,.fit';

export const importWorkout = (buffer: ArrayBuffer, options: ImportOptions): ImportResult => {
  if (looksLikeFit(buffer)) return parseFit(buffer, options);
  const text = new TextDecoder().decode(buffer);
  if (looksLikeZwo(text)) return parseZwo(text, options);
  return { ok: false, failure: 'unreadable' };
};

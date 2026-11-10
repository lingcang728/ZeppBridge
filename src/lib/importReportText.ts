/* 导入报告的一行字：运动页「从别处导入」和 Beta 实验室的 unstrap 导入共用这一份。 */
import type { ImportReport } from '../types/imports';

export interface ImportReportWords {
  added: (n: number) => string;
  health: (n: number) => string;
  nothingNew: string;
  duplicates: (n: number) => string;
  unreadable: (n: number) => string;
}

export const importReportText = (report: ImportReport, words: ImportReportWords): string => {
  const parts: string[] = [];
  if (report.added) parts.push(words.added(report.added));
  if (report.health_added) parts.push(words.health(report.health_added));
  if (!parts.length) parts.push(words.nothingNew);
  if (report.duplicates) parts.push(words.duplicates(report.duplicates));
  if (report.unreadable) parts.push(words.unreadable(report.unreadable));
  return parts.join(' · ');
};

/** 从别处导入的运动（GPX / FIT / Strava 整包 / Apple 健康）。和后端 core::storage::imports 同形。 */

export type ImportSourceKey = 'gpx' | 'fit' | 'strava' | 'apple_health';

export interface ImportReport {
  /** 一条都没加进来时没有批次。 */
  batch_id: number | null;
  added: number;
  duplicates: number;
  unreadable: number;
}

export interface ImportBatch {
  id: number;
  source: ImportSourceKey;
  file_name: string | null;
  imported_at: string;
  added: number;
  duplicates: number;
  unreadable: number;
  /** 撤销过的批次：运动已删，只留记录。 */
  undone_at: string | null;
  first_start: string | null;
  last_start: string | null;
}

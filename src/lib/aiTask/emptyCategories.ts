/**
 * 「你的过去」里一天记录都没有的类别（第四轮 1D·D8，用户 10-07：身体状态全黑，是因为 90 天没有体脂秤数据）。
 *
 * 条带一次取满 90 天（useBridgeStrip）：一行里没有一格 `has`、也没有一格有读数，就是「这段时间没有记录」——
 * 界面画一行灰字、不画空格子，新草稿默认不勾它。勾上了照样交出去，导出如实标缺失（不在这里改）。
 */
import type { AiTaskCategory } from '../bridge/types';
import type { DayStripRow } from '../../types/timeBridge';

export const emptyCategories = (rows: DayStripRow[]): Set<AiTaskCategory> =>
  new Set(rows.filter((row) => row.cells.length > 0 && row.cells.every((cell) => !cell.has && cell.value === null)).map((row) => row.category));

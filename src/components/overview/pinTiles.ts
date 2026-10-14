import type { ComputedRef, InjectionKey } from 'vue';
import type { PinnableMetric } from '../../lib/pinnedMetrics';

/** 一块「我的指标」磁贴要画的东西（PinnedMetrics 算好，PinTile 画）。 */
export type PinTileData = {
  id: string;
  metric: PinnableMetric;
  label: string;
  value: string;
  unit: string;
  when: string | null;
  spark: number[];
  coverage: string;
  tone: string;
};

export const PIN_TILES: InjectionKey<ComputedRef<Map<string, PinTileData>>> = Symbol('pin-tiles');

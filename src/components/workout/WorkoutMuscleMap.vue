<script setup lang="ts">
/* 力量卡的肌肉负荷人形（#163）：正反两面，主练每组记 1、辅助记 0.5，按累计分三档深浅；
 * 只当过辅助的肌肉加斜线。和逐组明细双向联动：表格里停在某一组 → 这里只亮那个动作的肌肉；
 * 这里停在某块肌肉 → 通知卡片把练到它的行亮出来（状态在 WorkoutStrengthCard）。 */
import { computed } from 'vue';
import AnatomyFigure from '../anatomy/AnatomyFigure.vue';
import { useAnatomyText } from '../anatomy/anatomy.i18n';
import type { MuscleLoad } from '../../lib/anatomy/zeppMuscles';
import type { AnatomyRegion, AnatomyRegionState, AnatomySide, AnatomySlug, AnatomyView } from '../../lib/anatomy/types';

const props = defineProps<{
  load: MuscleLoad;
  /** 表格里正停着的那一行。 */
  activeRow: string | null;
  /** 这里正停着的那块（`view:slug:side`）。 */
  activeShape: string | null;
  /** 右栏肌群胶囊正停着时，这个肌群的那几块（可能左右两侧、正反两面）。 */
  activeShapes?: ReadonlySet<string> | null;
}>();
const emit = defineEmits<{
  (event: 'hover-shape', key: string | null): void;
  (event: 'pin-shape', key: string): void;
}>();

const t = useAnatomyText();
const views: AnatomyView[] = ['front', 'back'];

const parse = (key: string) => {
  const [view, slug, side] = key.split(':') as [AnatomyView, AnatomySlug, AnatomySide];
  return { view, slug, side };
};

const regions = computed(() => {
  const out: Record<AnatomyView, AnatomyRegion[]> = { front: [], back: [] };
  for (const [key, load] of props.load.byShape) {
    const { view, slug, side } = parse(key);
    const name = (t.value.muscles as Record<string, string>)[slug] ?? slug;
    out[view].push({ key, label: t.value.loadTitle(name, load.primarySets, load.secondarySets), shapes: [{ slug, side }] });
  }
  return out;
});

const states = computed(() => {
  const out: Record<string, AnatomyRegionState> = {};
  const row = props.activeRow ? props.load.byRow.get(props.activeRow) : null;
  for (const [key, load] of props.load.byShape) {
    if (row) {
      if (row.primary.has(key)) out[key] = { level: 3 };
      else if (row.secondary.has(key)) out[key] = { level: 2, hatched: true };
      else out[key] = { level: load.level, hatched: load.secondaryOnly, dim: true };
    } else {
      const group = props.activeShapes?.size ? props.activeShapes : null;
      const hot = props.activeShape === key || !!group?.has(key);
      const focused = !!props.activeShape || !!group;
      out[key] = { level: load.level, hatched: load.secondaryOnly, hot, dim: focused && !hot };
    }
  }
  return out;
});
</script>

<template>
  <div class="muscle-map">
    <div class="figures">
      <figure v-for="view in views" :key="view" class="figure">
        <AnatomyFigure
          :view="view"
          :regions="regions[view]"
          :states="states"
          mode="hover"
          :aria-label="t.figureAria(view === 'front' ? t.front : t.back)"
          @hover="emit('hover-shape', $event)"
          @activate="emit('pin-shape', $event)"
        />
        <figcaption>{{ view === 'front' ? t.front : t.back }}</figcaption>
      </figure>
    </div>
    <div class="scale" aria-hidden="true">
      <span class="scale-end">{{ t.legendLight }}</span>
      <span class="swatch lv1" /><span class="swatch lv2" /><span class="swatch lv3" />
      <span class="scale-end">{{ t.legendHeavy }}</span>
      <span class="swatch hatched" />
      <span class="scale-end">{{ t.legendSecondary }}</span>
    </div>
  </div>
</template>

<style scoped>
.muscle-map { display: grid; gap: 8px; justify-items: center; min-width: 0; }
.figures { display: flex; justify-content: center; gap: 6px; width: 100%; }
.figure { display: grid; justify-items: center; gap: 4px; margin: 0; flex: 1 1 0; max-width: 132px; min-width: 0; }
.figure figcaption { color: var(--subtle); font-size: var(--fs-2xs); font-weight: 600; letter-spacing: .08em; }
.scale { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; justify-content: center; color: var(--subtle); font-size: var(--fs-2xs); }
.scale-end { margin: 0 3px; }
.swatch { width: 14px; height: 8px; border-radius: 3px; --an-base: color-mix(in srgb, var(--ink) 15%, var(--mat-inset)); --an-load: var(--anatomy-load, var(--training)); }
.swatch.lv1 { background: color-mix(in srgb, var(--an-load) 38%, var(--an-base)); }
.swatch.lv2 { background: color-mix(in srgb, var(--an-load) 68%, var(--an-base)); }
.swatch.lv3 { background: var(--an-load); }
.swatch.hatched { margin-left: 8px; background: repeating-linear-gradient(-50deg, color-mix(in srgb, var(--an-load) 68%, var(--an-base)) 0 3px, var(--an-base) 3px 6px); }
</style>

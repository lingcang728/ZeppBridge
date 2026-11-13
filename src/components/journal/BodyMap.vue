<script setup lang="ts">
/**
 * 人形图（伤病、酸痛）：正面 + 背面两个人体分块图，点选部位。
 *
 * 2026-11-13 起换成和力量卡同一套解剖分块素材（lib/anatomy，改编自 react-native-body-highlighter，MIT），
 * 原来的达芬奇墨线 + 椭圆区退役（用户：这种不熟悉的就别自研，适配现成的）。
 * 部位直接是肌肉块（膝、踝、手、脚也有形状）；素材里没有的肘、腕、髋、跟腱、髂胫束画成小椭圆。
 * 点块本身就是点那个部位，悬停时上方浮出部位名；键盘 Tab 到每个部位、空格切换。
 * `single` 时只能选一个（伤病记录），再点一次取消；`readonly` 时只显示。
 */
import { computed } from 'vue';
import AnatomyFigure from '../anatomy/AnatomyFigure.vue';
import { BODY_PARTS, BODY_PART_PLACES } from '../../lib/logbook/body';
import type { AnatomyRegion, AnatomyRegionState, AnatomyView } from '../../lib/anatomy/types';
import { useBodyPartName, useBodyText } from './body.i18n';

const props = withDefaults(defineProps<{
  modelValue: string[];
  single?: boolean;
  readonly?: boolean;
  /** 只淡淡标出来、不算选中的部位（例如以前伤过的地方）。 */
  marked?: string[];
  /** 下面那排已选部位的胶囊。 */
  showList?: boolean;
}>(), { single: false, readonly: false, marked: () => [], showList: true });
const emit = defineEmits<{ (event: 'update:modelValue', value: string[]): void }>();

const t = useBodyText();
const partName = useBodyPartName();
const views: AnatomyView[] = ['front', 'back'];

function toggle(part: string) {
  if (props.readonly) return;
  const has = props.modelValue.includes(part);
  if (props.single) emit('update:modelValue', has ? [] : [part]);
  else emit('update:modelValue', has ? props.modelValue.filter(p => p !== part) : [...props.modelValue, part]);
}

const regions = computed<AnatomyRegion[]>(() =>
  BODY_PARTS.map((part) => ({ key: part, label: partName.value(part), ...BODY_PART_PLACES[part] })),
);
const states = computed(() => {
  const out: Record<string, AnatomyRegionState> = {};
  for (const part of props.marked) out[part] = { marked: true };
  for (const part of props.modelValue) out[part] = { selected: true };
  return out;
});
</script>

<template>
  <div class="body-map" :class="{ readonly }">
    <div class="figures">
      <figure v-for="view in views" :key="view" :class="['figure', `is-${view}`]">
        <AnatomyFigure
          :view="view"
          :regions="regions"
          :states="states"
          :mode="readonly ? 'none' : 'toggle'"
          float-label
          :aria-label="`${t.figure} · ${view === 'front' ? t.front : t.back}`"
          @activate="toggle"
        />
        <figcaption>{{ view === 'front' ? t.front : t.back }}</figcaption>
      </figure>
    </div>
    <div v-if="showList" class="picked" aria-live="polite">
      <template v-if="modelValue.length">
        <button v-for="part in modelValue" :key="part" type="button" class="chip" :disabled="readonly" @click="toggle(part)">
          {{ partName(part) }}<span v-if="!readonly" aria-hidden="true">×</span>
        </button>
        <button v-if="!readonly && !single && modelValue.length > 1" type="button" class="clear" @click="emit('update:modelValue', [])">{{ t.clear }}</button>
      </template>
      <span v-else class="none">{{ t.none }}</span>
    </div>
  </div>
</template>

<style scoped>
.body-map { display: grid; gap: 10px; min-width: 0; }
/* 两个人形共用一块底，正反面靠下面的小签条分。人形宽度由 --bm-figure-max 定（默认 160px），
   弹窗里放大；--bm-figure-max-h 给矮窗口兜底。 */
.figures { display: flex; justify-content: center; gap: 10px; padding: 12px 10px 10px; border-radius: 18px; background: var(--mat-inset); box-shadow: var(--cap-track-shadow); }
.figure { display: grid; justify-items: center; gap: 6px; margin: 0; flex: 1 1 0; max-width: var(--bm-figure-max, 160px); min-width: 0; }
.figure :deep(svg) { max-height: var(--bm-figure-max-h, none); }
.figure figcaption { padding: 2px 10px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--muted); font-size: var(--fs-xs); font-weight: 600; letter-spacing: .08em; }
.picked { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 28px; }
.chip { display: inline-flex; align-items: center; gap: 6px; min-height: 26px; padding: 0 10px; border: 0; border-radius: 999px;
  background: color-mix(in srgb, var(--heart) 16%, transparent); color: var(--ink); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.chip:disabled { cursor: default; }
.chip span { color: var(--muted); }
.clear { padding: 2px 6px; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.clear:hover { color: var(--ink); }
.none { color: var(--subtle); font-size: var(--fs-xs); }
</style>

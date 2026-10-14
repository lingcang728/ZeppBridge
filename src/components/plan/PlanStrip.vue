<script setup lang="ts">
/**
 * 一条训练的总览条（2026-10-12 第 3 批，替换 SVG 的 PlanChart）。
 *
 * 旧图的 viewBox 是 760×178、被 preserveAspectRatio 拉宽两倍多：字跟着放大、离柱子很远，柱子点了没反应，
 * 悬停冒出一块整高的灰框。现在用 HTML / CSS 画，高约 60px，刻度紧贴在下面，字号固定：
 *   - 宽度按秒（flex-grow = 秒数）；高度和周视图的训练形状同一把尺（summary.segmentLevel）：有心率目标按目标中点，
 *     否则按强度类别；有心率目标的再叠一层目标带（同一个心率坐标，柱顶落在带子中间）；
 *   - 按距离写的步骤宽度只是示意，加斜纹；
 *   - 点柱子 = 选中那一步（`select`，键是步骤路径 `i` / `i.j`，重复组每一轮是同一个键）；
 *     悬停只把柱子提亮，读数放在自绘的玻璃提示里；`active` 是外面悬停 / 展开着的那一步，所有轮次一起亮。
 * 没有 `interactive` 时（只读）不响应点击。
 */
import { computed, ref } from 'vue';
import type { ProfileSegment, WorkoutProfile } from '../../lib/trainingPlan/profile';
import { segmentLevel, sharedHrDomain } from '../../lib/trainingPlan/summary';
import { INTENSITY_COLOR } from '../../lib/trainingPlan/intensity';
import { usePlanText } from './usePlanText';

const props = withDefaults(defineProps<{
  profile: WorkoutProfile;
  /** 一段的读数（「热身 · 10 分钟 · 心率 110–130」），提示里显示。 */
  describe?: (segment: ProfileSegment) => string;
  active?: string | null;
  interactive?: boolean;
}>(), { describe: undefined, active: null, interactive: false });
const emit = defineEmits<{ select: [key: string]; hover: [key: string | null] }>();
const { t } = usePlanText();

const keyOf = (segment: ProfileSegment) => segment.path.join('.');
const total = computed(() => Math.max(1, props.profile.seconds));
const domain = computed(() => sharedHrDomain([props.profile]));
const bars = computed(() => {
  let at = 0;
  return props.profile.segments.map((segment, index) => {
    const start = at;
    at += segment.seconds;
    const d = domain.value;
    const band = d && segment.low !== null && segment.high !== null
      ? { bottom: ((segment.low - d.min) / (d.max - d.min)) * 100, height: ((segment.high - segment.low) / (d.max - d.min)) * 100 }
      : null;
    return {
      index, segment, key: keyOf(segment), band,
      level: Math.round(segmentLevel(segment, domain.value) * 100),
      color: INTENSITY_COLOR[segment.intensity],
      center: ((start + segment.seconds / 2) / total.value) * 100,
    };
  });
});

/** 刻度：按总时长挑 5 / 10 / 20 / 30 分钟一格；末尾一格写总时长（有按距离写的步骤就是约数）。 */
const ticks = computed(() => {
  const minutes = total.value / 60;
  const step = minutes <= 30 ? 5 : minutes <= 60 ? 10 : minutes <= 120 ? 20 : 30;
  const out: { left: number; label: string; end?: boolean }[] = [{ left: 0, label: '0' }];
  for (let m = step; m < minutes - step * 0.45; m += step) out.push({ left: (m / minutes) * 100, label: String(m) });
  const end = t.value.minutes(Math.round(minutes));
  out.push({ left: 100, label: props.profile.approx ? t.value.totalAbout(end) : end, end: true });
  return out;
});

const hover = ref<number | null>(null);
const tip = computed(() => {
  if (hover.value === null || !props.describe) return null;
  const bar = bars.value[hover.value];
  return bar ? { left: Math.min(88, Math.max(12, bar.center)), text: props.describe(bar.segment) } : null;
});
const enter = (index: number) => {
  hover.value = index;
  emit('hover', bars.value[index]?.key ?? null);
};
const leave = () => {
  hover.value = null;
  emit('hover', null);
};
</script>

<template>
  <div class="plan-strip" role="group" :aria-label="t.chartAria" @pointerleave="leave">
    <div class="bars">
      <component :is="interactive ? 'button' : 'span'" v-for="bar in bars" :key="bar.index" :type="interactive ? 'button' : undefined"
        :class="['bar', { on: active === bar.key, approx: bar.segment.approx, hover: hover === bar.index }]"
        :style="{ flexGrow: bar.segment.seconds, '--c': bar.color, '--level': `${bar.level}%` }"
        :aria-label="describe ? describe(bar.segment) : undefined"
        @pointerenter="enter(bar.index)" @focus="enter(bar.index)" @blur="leave" @click="interactive && emit('select', bar.key)">
        <span class="fill"></span>
        <span v-if="bar.band" class="band" :style="{ bottom: `${bar.band.bottom}%`, height: `${Math.max(4, bar.band.height)}%` }"></span>
      </component>
    </div>
    <div class="ticks" aria-hidden="true">
      <span v-for="tick in ticks" :key="tick.left" :class="{ end: tick.end, start: tick.left === 0 }" :style="{ left: `${tick.left}%` }">{{ tick.label }}</span>
    </div>
    <Transition name="tip">
      <div v-if="tip" class="tip" role="tooltip" :style="{ left: `${tip.left}%` }">{{ tip.text }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.plan-strip { position: relative; display: grid; gap: 4px; min-width: 0; margin-top: 6px; user-select: none; }
.bars { display: flex; align-items: flex-end; gap: 2px; height: 60px; }
.bar { position: relative; flex: 1 1 0; min-width: 3px; height: 100%; padding: 0; border: 0; border-radius: 6px 6px 3px 3px; background: none; font: inherit; }
button.bar { cursor: pointer; }
button.bar:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.fill { position: absolute; right: 0; bottom: 0; left: 0; height: var(--level); border-radius: inherit; background: var(--c); opacity: .82; }
.approx .fill { background: repeating-linear-gradient(135deg, var(--c) 0 5px, color-mix(in srgb, var(--c) 55%, transparent) 5px 9px); }
/* 提亮：叠一层白，只动它的透明度。 */
.fill::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: #fff; opacity: 0; transition: opacity 160ms ease; }
.bar.hover .fill::after { opacity: .18; }
.bar.on .fill { opacity: 1; box-shadow: 0 0 0 2px color-mix(in srgb, var(--c) 45%, transparent); }
.band { position: absolute; right: 0; left: 0; border-block: 1px solid color-mix(in srgb, var(--c) 80%, var(--ink)); border-radius: 2px;
  background: color-mix(in srgb, var(--c) 26%, transparent); pointer-events: none; }
.ticks { position: relative; height: 14px; color: var(--subtle); font-size: 11px; line-height: 14px; font-variant-numeric: tabular-nums; }
.ticks span { position: absolute; top: 0; translate: -50% 0; white-space: nowrap; }
.ticks span.start { translate: 0 0; }
.ticks span.end { translate: -100% 0; color: var(--muted); font-weight: 600; }
.tip { position: absolute; bottom: calc(100% - 12px); z-index: 2; padding: 6px 11px; border: 1px solid var(--mat-glass-line); border-radius: 12px; background: var(--mat-glass-strong);
  -webkit-backdrop-filter: var(--mat-glass-blur); backdrop-filter: var(--mat-glass-blur); box-shadow: var(--mat-glass-shadow); color: var(--ink);
  font-size: var(--fs-xs); font-weight: 600; white-space: nowrap; translate: -50% -14px; pointer-events: none; }
.tip-enter-active, .tip-leave-active { transition: opacity 140ms ease; }
.tip-enter-from, .tip-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .fill::after, .tip-enter-active, .tip-leave-active { transition: none; } }
</style>

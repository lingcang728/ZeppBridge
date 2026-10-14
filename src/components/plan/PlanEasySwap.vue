<script setup lang="ts">
/**
 * 早上恢复差、今天又排了间歇：一行「准备度 48，平时 66 · 4×1km」+「换成轻松跑」。
 *
 * 点了只是把今天那条改成草稿（同运动、同子类型，见 lib/trainingPlan/easyDay.ts），发不发仍由周视图的
 * 长按「重新同步到手表」确认。`goToPlan`：在概览上点的，改完跳到周视图去发；周视图里点的就地变。
 * 条件不满足（今天没间歇、没准备度、比平时低得不多、今天点过「今天不用」）整行不画。
 */
import { onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useEasySwap } from '../../composables/useEasySwap';
import { useRevisionReload } from '../../composables/useRevisionReload';
import { useTrainingPlan } from '../../composables/useTrainingPlan';
import { useEasySwapText } from './easySwap.i18n';
import type { PlanSport, PlanWorkoutInput } from '../../types/trainingPlan';

const props = withDefaults(defineProps<{ goToPlan?: boolean }>(), { goToPlan: false });
const router = useRouter();
const plan = useTrainingPlan();
const easy = useEasySwap();
const t = useEasySwapText();

onMounted(async () => {
  if (!plan.state.value) await plan.load();
  void easy.refresh();
});
watch(() => easy.todays.value.length, (count) => { if (count) void easy.refresh(); });
useRevisionReload(() => { void easy.refresh(true); });

const isRide = (sport: string) => sport === 'cycling';
const isSwim = (sport: string) => sport === 'pool_swim' || sport === 'open_water_swim';
const swapLabel = (sport: PlanSport) => (isRide(sport) ? t.value.swapRide : isSwim(sport) ? t.value.swapSwim : t.value.swapRun);
const words = (workout: PlanWorkoutInput) => ({
  name: isRide(workout.sport) ? t.value.nameRide : isSwim(workout.sport) ? t.value.nameSwim : t.value.nameRun,
  focus: t.value.focus,
  description: t.value.description,
});

const swap = async () => {
  if (await easy.swap(words) && props.goToPlan) void router.push('/ai/plan');
};
</script>

<template>
  <div v-if="easy.suggestion.value" class="easy-swap" role="status">
    <i class="easy-shape" aria-hidden="true"></i>
    <span class="easy-text">
      <strong>{{ t.readiness(easy.suggestion.value.readiness, easy.suggestion.value.usual) }}</strong>
      <span class="easy-name">{{ easy.suggestion.value.name }}</span>
    </span>
    <button type="button" class="pill-button" :disabled="easy.busy.value" @click="swap">{{ swapLabel(easy.suggestion.value.sport) }}</button>
    <button type="button" class="pill-button quiet" @click="easy.dismiss()">{{ t.notToday }}</button>
  </div>
</template>

<style scoped>
/* 颜色只表达「哪项指标」：这一行不用警示色铺底，是一块中性的小板；三角用训练类别色。 */
.easy-swap { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 14px; border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--ink) 4%, transparent); box-shadow: inset 0 0 0 1px var(--mat-line); }
/* 三角 = 间歇，和「接下来」那一行、计划牌同一套读法。 */
.easy-shape { flex: none; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 11px solid var(--training); }
.easy-text { display: flex; flex: 1 1 200px; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; min-width: 0; color: var(--ink); font-size: var(--fs-sm); }
.easy-text strong { font-weight: 600; }
.easy-name { overflow: hidden; min-width: 0; color: var(--muted); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
</style>

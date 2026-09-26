<script setup lang="ts">
/* 概览的「昨晚睡眠」卡：总时长 + 阶段比例条。 */
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import DesignIcon from '../DesignIcon.vue';
import { isFiniteNumber } from '../../lib/format';
import { sleepStageLabel } from '../../lib/sleepStages';
import { stageMinutesForBar } from '../../lib/missingValues';
import type { SleepSession } from '../../types';
import { defineMessages, useMessages } from '../../i18n';

defineOptions({ name: 'OverviewSleepCard' });

const messages = defineMessages(
  {
    sleepPanelAria: '打开睡眠详情',
    sleepTitle: '昨晚睡眠',
    sleepSub: '睡眠结构简介',
    sleepBarAria: '睡眠阶段比例',
    sleepEmpty: '同步后展示昨晚睡眠。',
    seeMore: '看更多',
    durationHours: (hours: number, minutes: number) => `${hours} 小时 ${minutes} 分`,
    durationMinutes: (minutes: number) => `${minutes} 分`,
  },
  {
    sleepPanelAria: 'Open sleep detail',
    sleepTitle: 'Last night',
    sleepSub: 'Sleep structure at a glance',
    sleepBarAria: 'Sleep stage share',
    sleepEmpty: "Last night's sleep shows up here after a sync.",
    seeMore: 'See more',
    durationHours: (hours: number, minutes: number) => `${hours} hr ${minutes} min`,
    durationMinutes: (minutes: number) => `${minutes} min`,
  },
  {
    sleepPanelAria: 'Abrir el detalle de sueño',
    sleepTitle: 'Anoche',
    sleepSub: 'Estructura del sueño de un vistazo',
    sleepBarAria: 'Proporción de fases del sueño',
    sleepEmpty: 'El sueño de anoche aparece aquí después de sincronizar.',
    seeMore: 'Ver más',
    durationHours: (hours: number, minutes: number) => `${hours} h ${minutes} min`,
    durationMinutes: (minutes: number) => `${minutes} min`,
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'components/overview/SleepCard',
);
const t = useMessages(messages);

const props = defineProps<{
  sleep: SleepSession | null;
}>();

const hm = (minutes?: number | null) => {
  if (!isFiniteNumber(minutes) || minutes < 0) return '—';
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return hours > 0 ? t.value.durationHours(hours, remainder) : t.value.durationMinutes(remainder);
};

const sleepStages = computed(() => {
  const sleep = props.sleep;
  if (!sleep) return [];
  // 阶段色走 token（内联 style 里的 var() 会随 data-theme 换）。
  return [
    { key: 'deep', label: sleepStageLabel('deep'), minutes: sleep.deep_minutes, color: 'var(--sleep-deep)' },
    { key: 'light', label: sleepStageLabel('light'), minutes: sleep.light_minutes, color: 'var(--sleep-light)' },
    { key: 'rem', label: sleepStageLabel('rem'), minutes: sleep.rem_minutes, color: 'var(--sleep-rem)' },
    { key: 'awake', label: sleepStageLabel('awake'), minutes: sleep.awake_minutes, color: 'var(--sleep-awake)' },
  ];
});
const sleepBarStages = computed(() =>
  sleepStages.value.flatMap((stage) => {
    const minutes = stageMinutesForBar(stage.minutes);
    return minutes === null ? [] : [{ ...stage, minutes }];
  }),
);
const activeStage = ref<{ label: string; minutes: number } | null>(null);
const hoverLeft = ref(50);
const hoverStage = (event: PointerEvent) => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  hoverLeft.value = Math.max(14, Math.min(86, fraction * 100));
  const total = sleepBarStages.value.reduce((sum, stage) => sum + stage.minutes, 0);
  let end = 0;
  activeStage.value = sleepBarStages.value.find(stage => { end += stage.minutes / (total || 1); return fraction <= end; }) ?? null;
};
</script>

<template>
  <RouterLink class="metric-panel sleep-panel" :to="sleep ? `/sleep/${sleep.sleep_id}` : '/sleep'" :aria-label="t.sleepPanelAria">
    <div class="panel-head"><span class="panel-title"><DesignIcon name="sleep" :size="38" /><span><strong>{{ t.sleepTitle }}</strong><small>{{ t.sleepSub }}</small></span></span><span v-if="sleep && isFiniteNumber(sleep.score)" class="sleep-score">{{ sleep.score }}</span></div>
    <template v-if="sleep">
      <p class="sleep-total">{{ hm(sleep.duration_minutes) }}</p>
      <div class="sleep-bar-hit" @pointermove="hoverStage" @pointerdown.stop.prevent="hoverStage" @click.stop.prevent @pointerleave="activeStage = null"><div class="sleep-bar" :aria-label="t.sleepBarAria"><span v-for="stage in sleepBarStages" :key="stage.key" :style="{ flex: Math.max(1, stage.minutes), background: stage.color }"></span></div><span v-if="activeStage" class="sleep-tooltip" role="tooltip" :style="{ left: `${hoverLeft}%` }">{{ activeStage.label }} · {{ hm(activeStage.minutes) }}</span></div>
      <ul class="sleep-stages"><li v-for="stage in sleepStages" :key="stage.key"><i :style="{ background: stage.color }"></i><span>{{ stage.label }}</span><strong>{{ hm(stage.minutes) }}</strong></li></ul>
    </template>
    <div v-else class="panel-empty compact"><DesignIcon name="sleep" :size="50" /><span>{{ t.sleepEmpty }}</span></div>
    <span class="panel-more">{{ t.seeMore }} <DesignIcon name="chevron-right" :size="18" /></span>
  </RouterLink>
</template>

<style scoped>
/* 睡眠卡带一层紫色的环境光，浅色里换成白卡 + 同色系淡影。 */
.sleep-panel.metric-panel {
  display: flex; flex-direction: column;
  grid-column: span 3;
  height: 100%;
  min-height: 286px;
  padding: 18px;
  background:
    radial-gradient(380px 240px at 90% 0, rgba(104, 87, 217, .12), transparent 70%),
    linear-gradient(145deg, #1D1F29, #191C25);
}
html[data-theme="light"] .sleep-panel.metric-panel {
  display: flex; flex-direction: column;
  background:
    radial-gradient(380px 240px at 90% 0, var(--sleep-wash), transparent 70%),
    var(--panel);
}
.sleep-score {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--sleep-wash);
  color: var(--sleep-rem);
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
}
.sleep-total { margin: 16px 0 10px; color: var(--ink); font-family: var(--font-mono); font-size: 20px; font-weight: 600; }
.sleep-bar { display: flex; gap: 3px; height: 7px; overflow: hidden; border-radius: 999px; }
.sleep-bar span { min-width: 3px; border-radius: 999px; }
.sleep-stages { display: grid; grid-template-columns: minmax(0, 1fr); gap: 9px; margin: 14px 0 0; padding: 0; list-style: none; }
.sleep-stages li { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 8px; min-width: 0; color: var(--subtle); font-size: var(--fs-sm); }
.sleep-stages i { width: 6px; height: 6px; border-radius: 50%; }
.sleep-stages strong { color: var(--muted); font-family: var(--font-mono); font-size: var(--fs-sm); font-weight: 600; white-space: nowrap; }
@media (max-width: 1180px) { .sleep-panel { grid-column: span 6; } }
@media (max-width: 820px) { .sleep-panel { grid-column: 1; } }
.sleep-panel .panel-more { margin-top: auto; padding-top: 10px; }
.sleep-bar-hit { position: relative; padding: 8px 0; margin: -8px 0; }
.sleep-tooltip { position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); z-index: 2; white-space: nowrap; padding: 7px 10px; border: 1px solid var(--line-control); border-radius: 9px; background: var(--surface-raised); color: var(--ink); font-size: var(--fs-sm); pointer-events: none; }
</style>

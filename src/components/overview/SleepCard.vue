<script setup lang="ts">
/* 概览的睡眠卡：最近一觉的总时长 + 阶段比例条。
   只有这一觉是今天早上醒来的才叫「昨晚」；两天没同步时写那一觉醒来的日期，不冒充昨晚。 */
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import GlyphTile from '../GlyphTile.vue';
import Icon from '../Icon.vue';
import { isFiniteNumber } from '../../lib/format';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { sleepStageLabel } from '../../lib/sleepStages';
import { stageMinutesForBar } from '../../lib/missingValues';
import type { SleepSession } from '../../types';
import { defineMessages, useMessages } from '../../i18n';
import { vEdgeSafe } from '../../lib/edgeSafe';

defineOptions({ name: 'OverviewSleepCard' });

const messages = defineMessages(
  {
    sleepPanelAria: '打开睡眠详情',
    sleepTitle: '昨晚睡眠',
    sleepTitleOn: (day: string) => `${day}的睡眠`,
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
    sleepTitleOn: (day: string) => `Sleep · ${day}`,
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
    sleepTitleOn: (day: string) => `Sueño · ${day}`,
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

/** 按醒来那天判断：今天醒来的才是「昨晚」。 */
const title = computed(() => {
  const sleep = props.sleep;
  if (!sleep) return t.value.sleepTitle;
  const woke = new Date(sleep.end_time || sleep.start_time);
  if (Number.isNaN(woke.getTime())) return t.value.sleepTitle;
  const now = new Date();
  if (woke.getFullYear() === now.getFullYear() && woke.getMonth() === now.getMonth() && woke.getDate() === now.getDate()) {
    return t.value.sleepTitle;
  }
  return t.value.sleepTitleOn(displayDateTimeFormatter({ month: 'short', day: 'numeric' }).format(woke));
});

const hm = (minutes?: number | null) => {
  if (!isFiniteNumber(minutes) || minutes < 0) return '—';
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return hours > 0 ? t.value.durationHours(hours, remainder) : t.value.durationMinutes(remainder);
};

/** 「8 小时 10 分」拆成数字和单位两种片段：数字用大号，单位小一号（任何语言的写法都适用）。 */
const figureParts = (text: string) => text.split(/(\d+)/).map((part) => part.trim()).filter(Boolean)
  .map((part) => ({ text: part, unit: !/^\d+$/.test(part) }));

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
    <div class="panel-head">
      <span class="panel-title"><GlyphTile name="sleep" :size="38" /><span><strong>{{ title }}</strong><small>{{ t.sleepSub }}</small></span></span>
      <span class="panel-head-end">
        <span v-if="sleep && isFiniteNumber(sleep.score)" class="sleep-score">{{ sleep.score }}</span>
        <span class="panel-go" :title="t.seeMore" aria-hidden="true"><Icon name="chevron-right" :size="16" /></span>
      </span>
    </div>
    <template v-if="sleep">
      <p class="panel-figure"><span class="figure-value"><template v-for="(part, index) in figureParts(hm(sleep.duration_minutes))" :key="index"><i v-if="part.unit">{{ part.text }}</i><template v-else>{{ part.text }}</template></template></span></p>
      <div class="sleep-bar-hit" @pointermove="hoverStage" @pointerdown.stop.prevent="hoverStage" @click.stop.prevent @pointerleave="activeStage = null"><div class="sleep-bar" :aria-label="t.sleepBarAria"><span v-for="stage in sleepBarStages" :key="stage.key" :style="{ flex: Math.max(1, stage.minutes), background: stage.color }"></span></div><span v-if="activeStage" v-edge-safe class="sleep-tooltip" role="tooltip" :style="{ left: `${hoverLeft}%` }">{{ activeStage.label }} · {{ hm(activeStage.minutes) }}</span></div>
      <ul class="sleep-stages"><li v-for="stage in sleepStages" :key="stage.key"><i :style="{ background: stage.color }"></i><span>{{ stage.label }}</span><strong>{{ hm(stage.minutes) }}</strong></li></ul>
    </template>
    <div v-else class="panel-empty compact"><GlyphTile name="sleep" :size="50" /><span>{{ t.sleepEmpty }}</span></div>
  </RouterLink>
</template>

<style scoped>
/* 睡眠卡带一层紫色的环境光，浅色里换成白卡 + 同色系淡影。 */
.sleep-panel.metric-panel {
  display: flex; flex-direction: column;
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
  font-size: var(--fs-sm);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.sleep-bar { display: flex; gap: 3px; height: 7px; overflow: hidden; border-radius: 999px; }
.sleep-bar span { min-width: 3px; border-radius: 999px; }
.sleep-stages { display: grid; grid-template-columns: minmax(0, 1fr); gap: 9px; margin: 14px 0 0; padding: 0; list-style: none; }
.sleep-stages li { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 8px; min-width: 0; color: var(--subtle); font-size: var(--fs-sm); }
.sleep-stages i { width: 6px; height: 6px; border-radius: 50%; }
.sleep-stages strong { color: var(--muted); font-size: var(--fs-sm); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sleep-bar-hit { position: relative; padding: 8px 0; margin: -8px 0; }
.sleep-tooltip { position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); z-index: 2; white-space: nowrap; padding: 7px 10px; border: 1px solid var(--line-control); border-radius: 9px; background: var(--mat-glass-strong); color: var(--ink); font-size: var(--fs-sm); pointer-events: none; box-shadow: var(--mat-glass-shadow); }
</style>

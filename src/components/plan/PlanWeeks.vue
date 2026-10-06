<script setup lang="ts">
/**
 * 每一周（从今天起按 7 天切）按账本的样子：几条训练、送没送到。下一周送到了写「已送达 Zepp，临近时会同步到手表」
 * ——手表本身只显示 7 天以内（2026-10-06 R4 实测），不能说成没发出去，也不能留一个点了没反应的按钮。
 * 没送达的那一周如实标出来、带上原因；滚动推送下次同步后会补发。
 */
import { computed } from 'vue';
import Icon from '../Icon.vue';
import type { PlanWeekStatus } from '../../types/trainingPlan';
import { errorTextFor } from '../../i18n/errors';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { addDays } from '../../lib/aiTask/bridgeScale';
import { useBridgeText } from '../ai/bridge/bridge.i18n';
import { useHubText } from '../ai/hub/hub.i18n';
import { usePlanText } from './usePlanText';

const props = defineProps<{ weeks: PlanWeekStatus[] }>();
const t = useBridgeText();
const h = useHubText();
const { t: pt } = usePlanText();
const short = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const lines = computed(() => props.weeks.map((week, index) => ({
  key: week.start,
  range: h.value.weekOf(short(week.start), short(addDays(week.start, 6))),
  count: week.planned,
  tone: week.state === 'in_sync' ? 'ok' : week.state === 'uncertain' ? 'warn' : 'bad',
  text: week.state === 'not_sent'
    ? `${pt.value.weekNotSent}${week.error_code ? ` · ${errorTextFor(week.error_code) ?? ''}` : ''}`
    : week.state === 'uncertain' ? pt.value.ledgerUncertain
      : index === 0 ? t.value.delivered : pt.value.laterDelivered,
})));
</script>

<template>
  <ul class="plan-weeks">
    <li v-for="line in lines" :key="line.key" :class="line.tone">
      <i aria-hidden="true"></i>
      <span class="range">{{ line.range }}</span>
      <span class="count"><Icon name="run" :size="12" />{{ line.count }}</span>
      <span class="text">{{ line.text }}</span>
    </li>
  </ul>
</template>

<style scoped>
.plan-weeks { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.plan-weeks li { display: grid; grid-template-columns: 8px minmax(110px, auto) 48px minmax(0, 1fr); align-items: center; gap: 12px; padding: 9px 14px; border-radius: 12px; background: var(--mat-inset); font-size: var(--fs-xs); }
.plan-weeks i { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.plan-weeks .warn i { background: var(--warning); }
.plan-weeks .bad i { background: var(--danger); }
.range { color: var(--ink); font-variant-numeric: tabular-nums; }
.count { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); font-variant-numeric: tabular-nums; }
.text { color: var(--muted); }
.bad .text { color: var(--danger); }
</style>

<script setup lang="ts">
/**
 * 「上次发到手表的计划」一行：什么时候发的、是否确认送达、接下来 7 天里有几天有安排，以及撤销 / 清空。
 *
 * 诚实：官方没有读取接口，这一行是 ZeppBridge **账本**里的记录，不是手表上现在有的——
 * 你在别的 App 里删掉的这里看不到，说明文字写在悬停提示里。最近一次结果不确定时点黄，写「没有确认送达」。
 */
import { computed } from 'vue';
import { formatWhen } from '../../lib/format';
import type { TrainingPlanState } from '../../types/trainingPlan';
import { usePlanText } from './usePlanText';

const props = defineProps<{ state: TrainingPlanState; busy: boolean }>();
const emit = defineEmits<{ undo: []; clear: [] }>();
const { t } = usePlanText();

const record = computed(() => props.state.last_publish);
const sentDays = computed(() => new Set(props.state.sent.map((workout) => workout.date)).size);
const when = computed(() => {
  const at = record.value?.finished_at ?? record.value?.created_at;
  return at ? formatWhen(at) : null;
});
const delivered = computed(() => record.value?.state === 'sent' && !props.state.uncertain);
const empty = computed(() => !record.value && props.state.sent.length === 0);
</script>

<template>
  <div class="ledger" :title="t.ledgerNote">
    <span :class="['lead', { warn: !delivered && !empty }]"><i aria-hidden="true"></i>{{ t.ledgerTitle }}</span>
    <template v-if="!empty">
      <span v-if="when" class="when">{{ t.ledgerWhen(when) }}</span>
      <span class="state">{{ delivered ? t.ledgerDelivered : t.ledgerUncertain }}</span>
      <span class="days">{{ t.ledgerDays(sentDays) }}</span>
    </template>
    <span v-else class="when">{{ t.ledgerNone }}</span>
    <span class="acts">
      <button v-if="state.can_undo" type="button" class="pill-button quiet" :disabled="busy" @click="emit('undo')">{{ t.undoLast }}</button>
      <button v-if="sentDays > 0" type="button" class="pill-button quiet danger" :disabled="busy" @click="emit('clear')">{{ t.clearWindow }}</button>
    </span>
  </div>
</template>

<style scoped>
/* 标题右边的一行小字：不再是一整条凹槽。 */
.ledger { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; color: var(--muted); font-size: var(--fs-2xs); }
.lead { display: inline-flex; align-items: center; gap: 7px; color: var(--ink); font-size: var(--fs-xs); font-weight: 600; }
.lead i { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.lead.warn i { background: var(--warning); }
.state { color: var(--ink); }
.days { color: var(--subtle); }
.acts { display: flex; gap: 2px; }
.acts .pill-button { min-height: 30px; padding-inline: 12px; font-size: var(--fs-2xs); }
.pill-button.danger { color: var(--danger); }
</style>

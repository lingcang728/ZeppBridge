<script setup lang="ts">
/**
 * 「上次发到手表的计划」一行：什么时候发的、是否确认送达、接下来 7 天里有几天有安排，以及撤销 / 清空。
 *
 * 诚实：官方没有读取接口，这一行是 ZeppBridge **账本**里的记录，不是手表上现在有的——
 * 你在别的 App 里删掉的这里看不到，说明文字写在悬停提示里。最近一次结果不确定时点黄，写「没有确认送达」。
 */
import { computed, ref } from 'vue';
import Icon from '../Icon.vue';
import { useWidthMorph } from '../../composables/useWidthMorph';
import { formatWhen } from '../../lib/format';
import type { TrainingPlanState } from '../../types/trainingPlan';
import { usePlanText } from './usePlanText';
import { useBridgeText } from '../ai/bridge/bridge.i18n';
import { useHubText } from '../ai/hub/hub.i18n';

/* `sending`：正在发（批次 4.4 的送达动画里牌飞进这一行的手表图标），状态那一格从「发送中」宽度平滑变到结果。 */
const props = defineProps<{ state: TrainingPlanState | null; busy: boolean; simulated?: boolean; sending?: boolean }>();
const emit = defineEmits<{ undo: []; clear: [] }>();
const { t } = usePlanText();
const bt = useBridgeText();
const h = useHubText();

const record = computed(() => props.state?.last_publish ?? null);
const sentDays = computed(() => new Set((props.state?.sent ?? []).map((workout) => workout.date)).size);
const when = computed(() => {
  const at = record.value?.finished_at ?? record.value?.created_at;
  return at ? formatWhen(at) : null;
});
const delivered = computed(() => record.value?.state === 'sent' && !props.state?.uncertain);
const empty = computed(() => !record.value && !props.state?.sent.length);
const stateText = computed(() => (props.sending ? t.value.sending
  : record.value?.state === 'rejected' ? t.value.noticeRejected
    : record.value?.state === 'partial' ? h.value.partial
      : delivered.value ? t.value.ledgerDelivered : t.value.ledgerUncertain));
const stateEl = ref<HTMLElement | null>(null);
useWidthMorph(stateEl, stateText);
</script>

<template>
  <div class="ledger" :title="t.ledgerNote">
    <span :class="['lead', { warn: !delivered && !empty && !sending, sending }]"><span class="ledger-watch" aria-hidden="true"><Icon name="watch" :size="14" /></span>{{ simulated ? bt.demoLedger : t.ledgerTitle }}</span>
    <span v-if="!empty || sending" class="body">
      <span ref="stateEl" class="state">{{ stateText }}</span>
      <span v-if="!sending" class="meta"><template v-if="when">{{ simulated ? when : t.ledgerWhen(when) }} · </template>{{ t.ledgerDays(sentDays) }}</span>
    </span>
    <span v-else class="body"><span class="meta">{{ t.ledgerNone }}</span></span>
    <span class="acts">
      <button v-if="state?.can_undo" type="button" class="pill-button quiet" :disabled="busy" @click="emit('undo')">{{ t.undoLast }}</button>
      <button v-if="sentDays > 0" type="button" class="pill-button quiet danger" :disabled="busy" @click="emit('clear')">{{ t.clearWindow }}</button>
    </span>
  </div>
</template>

<style scoped>
/* 一枚两行的小牌（10-08 H13：以前是一长串粗细不一的小字挤在一行，长语言折成两行就乱了）：
   左边手表图标和标题，中间「状态」一行 + 「什么时候发的 · 接下来几天有安排」一行，右边撤销 / 清空。 */
.ledger { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; min-width: 0; color: var(--muted); font-size: var(--fs-2xs); }
.body { display: grid; flex: 1 1 150px; gap: 1px; min-width: 0; }
.meta { overflow: hidden; color: var(--subtle); text-overflow: ellipsis; white-space: nowrap; }
.lead { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 7px; color: var(--ink); font-size: var(--fs-xs); font-weight: 600; white-space: nowrap; }
.ledger-watch { display: grid; width: 22px; height: 22px; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
.lead.warn .ledger-watch { background: color-mix(in srgb, var(--warning) 16%, transparent); color: var(--warning); }
.lead.sending .ledger-watch { animation: ledger-pulse 1.1s ease-in-out infinite; }
@keyframes ledger-pulse { 50% { scale: 1.18; } }
@media (prefers-reduced-motion: reduce) { .lead.sending .ledger-watch { animation: none; } }
.state { display: inline-block; overflow: hidden; color: var(--ink); font-size: var(--fs-xs); font-weight: 600; white-space: nowrap; }
.acts { display: flex; gap: 2px; margin-left: auto; }
.acts .pill-button { min-height: 30px; padding-inline: 12px; font-size: var(--fs-2xs); }
.pill-button.danger { color: var(--danger); }
</style>

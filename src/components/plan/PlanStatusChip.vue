<script setup lang="ts">
/**
 * 「上次发到手表」的状态胶囊（2026-10-12 第 3 批，替换原来首页和周视图底下那一整条账本行）：
 * 平时只是一枚小胶囊——手表图标 + 一个词（草稿待发 / 已送达 / 部分送达 / 未确认），发送中手表图标脉冲。
 * 点开是一块玻璃弹层：什么时候发的、每一周送没送到、撤销上一次、清空手表计划。
 *
 * 诚实：官方没有读取接口，弹层里写的是 ZeppBridge 账本里的记录；这句说明放在悬停提示里，不占版面。
 * 送达动画（周视图 deliver()）的落点是胶囊里的手表图标（.plan-chip-watch）。
 */
import { computed, ref } from 'vue';
import GlassPopover from '../GlassPopover.vue';
import Icon from '../Icon.vue';
import { useWidthMorph } from '../../composables/useWidthMorph';
import { paced } from '../../lib/motion/timing';
import { formatWhen } from '../../lib/format';
import { planStatus, statusTone } from '../../lib/trainingPlan/status';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { addDays } from '../../lib/aiTask/bridgeScale';
import { errorTextFor } from '../../i18n/errors';
import type { TrainingPlanState } from '../../types/trainingPlan';
import { usePlanText } from './usePlanText';
import { useStatusText } from './status.i18n';
import { useBridgeText } from '../ai/bridge/bridge.i18n';

const props = withDefaults(defineProps<{
  state: TrainingPlanState | null; drafting: boolean; busy: boolean; sending?: boolean; simulated?: boolean;
  /** 手上有草稿：弹层里多一个「丢弃草稿」。 */
  discardable?: boolean;
}>(), { sending: false, simulated: false, discardable: false });
const emit = defineEmits<{ undo: []; clear: []; discard: [] }>();
const s = useStatusText();
const { t: pt } = usePlanText();
const bt = useBridgeText();

const kind = computed(() => planStatus(props.state, props.drafting, props.sending));
const tone = computed(() => (kind.value ? statusTone(kind.value) : 'warn'));
const text = computed(() => (kind.value ? s.value[kind.value] : ''));
const label = ref<HTMLElement | null>(null);
useWidthMorph(label, text);

const record = computed(() => props.state?.last_publish ?? null);
const when = computed(() => {
  const at = formatWhen(record.value?.finished_at ?? record.value?.created_at);
  return at ? s.value.sentAt(at) : s.value.never;
});
const sentDays = computed(() => new Set((props.state?.sent ?? []).map((workout) => workout.date)).size);
const short = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const weeks = computed(() => (props.state?.weeks ?? []).map((week, index) => ({
  key: week.start,
  range: `${short(week.start)} – ${short(addDays(week.start, 6))}`,
  count: week.planned,
  tone: week.state === 'in_sync' ? 'ok' : week.state === 'uncertain' ? 'warn' : 'bad',
  text: week.state === 'not_sent'
    ? `${pt.value.weekNotSent}${week.error_code ? ` · ${errorTextFor(week.error_code) ?? ''}` : ''}`
    : week.state === 'uncertain' ? s.value.unconfirmed
      : index === 0 ? s.value.delivered : pt.value.laterDelivered,
})));

const anchor = ref<HTMLElement | null>(null);
const open = ref(false);
const popover = ref<InstanceType<typeof GlassPopover> | null>(null);
const act = async (which: 'undo' | 'clear' | 'discard') => {
  await popover.value?.close();
  if (which === 'undo') emit('undo');
  else if (which === 'clear') emit('clear');
  else emit('discard');
};
/** 状态胶囊闪一下（接回定稿落定、发送结果回来时由父组件调用）。 */
const flash = () => {
  const curve = { duration: paced(520), easing: 'cubic-bezier(.4, .6, .2, 1)' };
  anchor.value?.animate([{ scale: 1 }, { scale: 1.08, offset: 0.35 }, { scale: 1 }], curve);
  anchor.value?.querySelector('.plan-chip-watch')?.animate([{ scale: 1 }, { scale: 1.35, offset: 0.35 }, { scale: 1 }], curve);
};
defineExpose({ flash });
</script>

<template>
  <button v-if="kind" ref="anchor" type="button" :class="['plan-chip', `tone-${tone}`]" :aria-expanded="open" :title="pt.ledgerNote" @click="open = true">
    <span class="plan-chip-watch" aria-hidden="true"><Icon name="watch" :size="15" /></span>
    <span ref="label" class="plan-chip-text">{{ text }}</span>
  </button>
  <GlassPopover v-if="open" ref="popover" :anchor="anchor" labelledby="plan-chip-title" :width="360" @close="open = false">
    <header class="pop-head" data-pop-item>
      <span class="pop-watch" aria-hidden="true"><Icon name="watch" :size="22" /></span>
      <div><h4 id="plan-chip-title">{{ s.title }}</h4><p>{{ simulated ? `${s.demo} · ${when}` : when }}</p></div>
    </header>
    <ul v-if="weeks.length" class="pop-weeks" data-pop-item>
      <li v-for="week in weeks" :key="week.key" :class="week.tone">
        <i aria-hidden="true"></i><span class="range">{{ week.range }}</span>
        <span class="count"><Icon name="run" :size="12" />{{ week.count }}</span><span class="state">{{ week.text }}</span>
      </li>
    </ul>
    <footer v-if="state?.can_undo || sentDays > 0 || discardable" class="pop-acts" data-pop-item>
      <button v-if="discardable" type="button" class="pill-button quiet" :disabled="busy" @click="act('discard')"><Icon name="x" :size="13" />{{ bt.discard }}</button>
      <button v-if="state?.can_undo" type="button" class="pill-button quiet" :disabled="busy" @click="act('undo')"><Icon name="undo" :size="13" />{{ s.undo }}</button>
      <button v-if="sentDays > 0" type="button" class="pill-button quiet danger" :disabled="busy" @click="act('clear')"><Icon name="trash" :size="13" />{{ s.clear }}</button>
    </footer>
  </GlassPopover>
</template>

<style scoped>
.plan-chip { --tone: var(--warning); display: inline-flex; flex: 0 0 auto; align-items: center; gap: 6px; min-height: 28px; padding: 0 11px 0 5px; border: 1px solid var(--mat-line); border-radius: 999px;
  background: var(--mat-inset); color: var(--ink); font: inherit; font-size: var(--fs-2xs); font-weight: 650; white-space: nowrap; cursor: pointer; transition: background var(--dur-base) ease; }
.plan-chip:hover { background: color-mix(in srgb, var(--tone) 12%, var(--mat-inset)); }
.plan-chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.plan-chip.tone-ok { --tone: var(--accent); }
.plan-chip.tone-bad { --tone: var(--danger); }
.plan-chip.tone-draft { --tone: var(--pace); }
.plan-chip.tone-sending { --tone: var(--accent); }
.plan-chip-watch { display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--tone) 18%, transparent); color: var(--tone); }
.plan-chip-text { display: inline-block; overflow: hidden; }
.tone-sending .plan-chip-watch { animation: chip-pulse 1.1s ease-in-out infinite; }
@keyframes chip-pulse { 50% { scale: 1.2; opacity: .75; } }
@media (prefers-reduced-motion: reduce) { .tone-sending .plan-chip-watch { animation: none; } }

.pop-head { display: flex; align-items: center; gap: 12px; }
.pop-watch { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 13px; color: var(--accent);
  background: radial-gradient(120% 90% at 30% 0%, color-mix(in srgb, var(--accent) 24%, transparent), transparent 70%), linear-gradient(160deg, var(--mat-tile-top), var(--mat-tile-bottom));
  box-shadow: var(--mat-tile-rim); }
.pop-head h4 { margin: 0; font-size: var(--fs-sm); font-weight: 700; }
.pop-head p { margin: 2px 0 0; color: var(--muted); font-size: var(--fs-xs); }
.pop-weeks { display: grid; gap: 2px; margin: 4px 0 0; padding: 0; list-style: none; }
.pop-weeks li { display: grid; grid-template-columns: 7px auto 40px minmax(0, 1fr); align-items: center; gap: 10px; padding: 8px 12px; border-radius: 12px; background: var(--mat-inset); font-size: var(--fs-xs); }
.pop-weeks i { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.pop-weeks .warn i { background: var(--warning); }
.pop-weeks .bad i { background: var(--danger); }
.range { color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
.count { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); font-variant-numeric: tabular-nums; }
.state { overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
.bad .state { color: var(--danger); }
.pop-acts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; padding-top: 6px; border-top: 1px solid var(--mat-line); }
.pop-acts .pill-button { display: inline-flex; align-items: center; gap: 6px; }
.pill-button.danger { color: var(--danger); }
</style>

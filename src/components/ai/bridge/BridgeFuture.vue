<script setup lang="ts">
/**
 * 一周一页的计划：每天一格（训练形状、名字、时长），长按「发到手表」。
 *
 * 2026-10 起每一格是去单天页（/ai/plan/:date）的链接，点开从这一格长出来（usePageMorph）；
 * 往返记录里的旧计划只读，格子不是链接（`linkDays = false`）。走路这类发不到手表的训练照原样占住那一天。
 *
 * 批次 4.1：拖一格跟手走，其余格子弹簧让位——放在另一格上是交换，放在两格之间的缝隙是插入并顺移
 * （useDayDrag）；休息日也是一张可以拖的卡。键盘：选中后 ← → 和相邻一天交换，Delete 删掉这天。
 * 翻周用玻璃分段（也可以在格子上横向滑动），换页时新的一周淡入。
 */
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import PlanShape from '../../plan/PlanShape.vue';
import SegmentTrack from '../../SegmentTrack.vue';
import { useDayDrag } from '../../../composables/useDayDrag';
import Icon from '../../Icon.vue';
import { workoutProfile } from '../../../lib/trainingPlan/profile';
import { sharedHrDomain } from '../../../lib/trainingPlan/summary';
import { useBridgeText } from './bridge.i18n';
import { useHubText } from '../hub/hub.i18n';
import { usePlanText } from '../../plan/usePlanText';
import { usePressHold } from '../../../composables/usePressHold';
import { useTrainingPlan } from '../../../composables/useTrainingPlan';
import type { PlanDraftPreview } from '../../../types/trainingPlan';
import { addDays } from '../../../lib/aiTask/bridgeScale';

const props = withDefaults(defineProps<{
  preview: PlanDraftPreview | null; readonly?: boolean; stamped?: boolean; linkDays?: boolean; showSummary?: boolean;
  /** 拖到另一格上 / 缝隙里：交给页面改草稿，返回的 Promise 落定以后才撤掉拖拽的位移。 */
  swap?: (from: string, to: string) => Promise<unknown> | void;
  insert?: (from: string, to: string) => Promise<unknown> | void;
  /** 从已发出的计划改过来的、有几处改动：长按按钮写「有 N 处改动 · 重新同步到手表」。 */
  changes?: number;
}>(), { linkDays: true, showSummary: true, changes: 0 });
const emit = defineEmits<{ move: [string, string]; delete: [string]; publish: [] }>();
const t = useBridgeText(), h = useHubText(), plan = useTrainingPlan(), { t: pt, activity } = usePlanText();
/* 走路这类发不到手表的训练：照原样占住那一天，绝不画成休息日。 */
const heldOn = (date: string) => props.preview?.check.held?.filter(item => item.date === date && item.activity) ?? [];
/* 能发的大类、只是缺目的 / 缺描述 / 步骤写错的：照样画出它的形状，标「要改」，点进单天页补。 */
const fixOn = (date: string) => props.preview?.check.held?.filter(item => item.date === date && !item.activity) ?? [];
const fixProfile = (date: string) => {
  const item = fixOn(date)[0];
  return item?.steps.length ? workoutProfile({ date, sport: 'running', name: item.name, steps: item.steps }) : null;
};
const dayName = (day: { date: string; after: { name: string }[] }) => day.after[0]?.name ?? heldOn(day.date)[0]?.name ?? fixOn(day.date)[0]?.name ?? t.value.rest;
const page = ref(0);
const board = ref<HTMLElement | null>(null);
const profiles = computed(() => (props.preview?.days ?? []).flatMap(d => d.after.map(workoutProfile)));
const domain = computed(() => sharedHrDomain(profiles.value));
const scale = computed(() => Math.max(3600, ...profiles.value.map(p => p.seconds)));
const pages = computed(() => Math.max(1, Math.ceil((props.preview?.days.length ?? 7) / 7)));
const days = computed(() => props.preview?.days.slice(Math.min(page.value, pages.value - 1) * 7, (Math.min(page.value, pages.value - 1) + 1) * 7) ?? []);
const hold = usePressHold(() => { if (sendable.value) emit('publish'); });
// 只有提醒（名字太长）不挡发送；每一周都会一起送到 Zepp，所以翻到哪一页都能发。
const sendable = computed(() => !props.readonly && !!props.preview && !props.preview.check.issues.some(issue => issue.severity !== 'warning') && !plan.busy.value && plan.accepted.value);
const bedtime = (minutes: number | null | undefined) => minutes == null ? '' : `${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`;
const key = (event: KeyboardEvent, date: string) => {
  if (props.readonly || plan.busy.value) return;
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); emit('delete',date); }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); emit('move',date,addDays(date,event.key === 'ArrowLeft' ? -1 : 1)); }
};
const canDrag = computed(() => !props.readonly && !plan.busy.value && plan.accepted.value);
const drag = useDayDrag({
  root: board,
  enabled: () => canDrag.value,
  swap: (from, to) => props.swap?.(from, to),
  insert: (from, to) => props.insert?.(from, to),
});
const short = (date: string) => date.slice(5).replace('-', '/');
const weekItems = computed(() => Array.from({ length: pages.value }, (_, i) => {
  const list = props.preview?.days.slice(i * 7, i * 7 + 7) ?? [];
  return { value: i, label: list.length ? `${short(list[0]!.date)}–${short(list[list.length - 1]!.date).slice(3)}` : String(i + 1) };
}));
watch(pages, (n) => { if (page.value > n - 1) page.value = Math.max(0, n - 1); });
/* 触控板横向滑动翻周：攒够一段再翻，翻完歇一会儿，免得一甩翻过好几页。 */
let swipe = 0;
let swipeAt = 0;
const onWheel = (event: WheelEvent) => {
  if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || pages.value < 2) return;
  event.preventDefault();
  const now = performance.now();
  if (now - swipeAt < 450) return;
  swipe += event.deltaX;
  if (Math.abs(swipe) < 60) return;
  page.value = Math.min(pages.value - 1, Math.max(0, page.value + Math.sign(swipe)));
  swipe = 0;
  swipeAt = now;
};
</script>
<template>
  <div class="bridge-future" :class="{ 'is-empty': !preview, stamped, 'no-summary': !showSummary }">
    <template v-if="preview">
      <p v-if="showSummary" class="plan-summary">{{ preview.check.summary }}</p>
      <SegmentTrack v-if="pages > 1" class="week-track" compact :items="weekItems" :model-value="page" :aria-label="t.future" @update:model-value="page = $event" />
      <div ref="board" :key="page" class="future-days" :class="{ 'is-dragging': drag.dragging.value }" @pointerdown="drag.onPointerDown" @click.capture="drag.onClickCapture" @wheel="onWheel">
        <component :is="linkDays ? RouterLink : 'div'" v-for="(day,i) in days" :key="day.date"
          v-bind="linkDays ? { to: `/ai/plan/${day.date}`, 'data-morph-card': '' } : { tabindex: 0 }"
          :data-day="day.date" draggable="false"
          :class="['future-day', { lifted: drag.dragging.value === day.date }]" :style="{ '--i': i }"
          :aria-label="`${day.date} · ${dayName(day)}`" :title="t.shape"
          @keydown="key($event, day.date)" @dragstart.prevent>
          <span v-if="!day.after.length && heldOn(day.date).length" class="held-mark" :title="pt.heldBadge"><Icon name="steps" :size="16"/><small>{{ activity(heldOn(day.date)[0]!.activity!) }}</small><em>{{ pt.heldBadge }}</em></span>
          <span v-else-if="!day.after.length && fixOn(day.date).length" class="held-mark fix"><Icon name="warning" :size="14"/><em>{{ pt.issueError }}</em></span>
          <span v-else-if="day.rest || !day.after.length" class="rest-moon"><Icon name="moon" :size="18"/><small>{{ bedtime(day.rest?.bedtime_minutes) }}</small></span>
          <span class="workout-shape"><PlanShape v-if="day.after[0]" :profile="workoutProfile(day.after[0])" :scale-seconds="scale" :domain="domain"/><PlanShape v-else-if="fixProfile(day.date)" :profile="fixProfile(day.date)!" :scale-seconds="scale" :domain="domain"/><i v-else-if="!heldOn(day.date).length" class="rest-line"></i></span>
          <span class="day-name">{{ dayName(day) }}</span>
          <span v-if="day.after[0]" class="day-duration">{{ Math.round(workoutProfile(day.after[0]).seconds / 60) }} <small>min</small></span>
          <span v-if="stamped && day.after.length" class="stamp"><Icon name="watch" :size="11"/></span>
          <span class="day-date">{{ day.date.slice(5).replace('-',' / ') }}</span>
        </component>
      </div>
      <footer class="future-footer">
        <span class="window-note"><i></i>{{ page === 0 ? t.watchWindow : stamped ? pt.laterDelivered : t.laterWindow }}</span>
        <button v-if="!readonly" type="button" class="hold-button" :disabled="!sendable" :title="t.holdHint" :style="{ '--progress': hold.progress.value }" @pointerdown="hold.pointerdown" @pointerup="hold.cancel" @pointerleave="hold.cancel" @pointercancel="hold.cancel" @lostpointercapture="hold.cancel" @keydown="hold.keydown" @keyup="hold.keyup" @blur="hold.cancel"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13"/><circle cx="16" cy="16" r="13" class="progress"/></svg><Icon name="watch" :size="13"/><span>{{ changes ? h.resync(changes) : t.hold }}</span></button>
      </footer>
    </template>
    <div v-else class="future-empty"><div class="future-grid" aria-hidden="true"><i v-for="n in 7" :key="n"></i></div></div>
  </div>
</template>
<style scoped src="./BridgeFuture.css"></style>

<script setup lang="ts">
/* 「我的指标」的挑选面板。
 *
 * 上面四个槽，下面按目的分组的候选胶囊。点一枚胶囊，它从原地沿弧线飞进下一个空槽，
 * 落地时槽里的卡轻轻弹一下；点已选的胶囊或槽上的 ×，它飞回原位，后面的槽顺次前移。
 * 满四个以后其余胶囊变暗，再点会轻晃一下并提示先去掉一个。顺序就是点选的顺序。
 * 面板本身沿用全应用的弹窗：从「调整」按钮里长出来，关的时候缩回去。 */
import { computed, nextTick, ref } from 'vue';
import Icon from '../Icon.vue';
import ModalDialog from '../ModalDialog.vue';
import { MAX_PINS, PINNABLE_METRICS, type PinGroup } from '../../lib/pinnedMetrics';
import { flyPin } from '../../lib/motion/pinFlight';
import { useMessages } from '../../i18n';
import { pinnedMetricsMessages } from './PinnedMetrics.i18n';

const props = defineProps<{ pins: string[]; label: (id: string) => string }>();
const emit = defineEmits<{ close: []; done: [pins: string[]] }>();
const t = useMessages(pinnedMetricsMessages);

const draft = ref<string[]>([...props.pins]);
const root = ref<HTMLElement | null>(null);
/** 正在飞进来的那一项：落地前槽里的内容先藏着，免得和替身叠成两份。 */
const landing = ref<string | null>(null);
/** 刚落地、要弹一下的那一项。 */
const popped = ref<string | null>(null);
const shaking = ref<string | null>(null);
const busy = ref(false);

const full = computed(() => draft.value.length >= MAX_PINS);
const GROUPS: PinGroup[] = ['recovery', 'activity', 'body'];
const groups = computed(() => GROUPS.map((group) => ({
  group,
  title: group === 'recovery' ? t.value.groupRecovery : group === 'activity' ? t.value.groupActivity : t.value.groupBody,
  metrics: PINNABLE_METRICS.filter((metric) => metric.group === group),
})));
const emptySlots = computed(() => Array.from({ length: MAX_PINS - draft.value.length }, (_, index) => draft.value.length + index + 1));

const find = (selector: string) => root.value?.querySelector<HTMLElement>(selector) ?? null;
const rectOf = (selector: string) => find(selector)?.getBoundingClientRect() ?? null;

const add = async (id: string) => {
  const from = rectOf(`[data-chip="${id}"]`);
  landing.value = id;
  draft.value = [...draft.value, id];
  await nextTick();
  const to = rectOf(`[data-slot="${id}"]`);
  if (from && to) await flyPin(from, to, props.label(id));
  landing.value = null;
  popped.value = id;
  window.setTimeout(() => { if (popped.value === id) popped.value = null; }, 360);
};

const remove = async (id: string) => {
  const from = rectOf(`[data-slot="${id}"]`);
  draft.value = draft.value.filter((item) => item !== id);
  await nextTick();
  const to = rectOf(`[data-chip="${id}"]`);
  if (from && to) await flyPin(from, to, props.label(id), { back: true });
};

const shake = (id: string) => {
  shaking.value = null;
  void nextTick(() => { shaking.value = id; });
  window.setTimeout(() => { if (shaking.value === id) shaking.value = null; }, 420);
};

/* 一次只飞一枚：连点时后一枚等前一枚落地，槽位顺序不会乱。 */
const toggle = async (id: string) => {
  if (busy.value) return;
  const selected = draft.value.includes(id);
  if (!selected && full.value) {
    shake(id);
    return;
  }
  busy.value = true;
  try {
    await (selected ? remove(id) : add(id));
  } finally {
    busy.value = false;
  }
};

const clear = () => { draft.value = []; };
const orderOf = (id: string) => draft.value.indexOf(id) + 1;
</script>

<template>
  <ModalDialog labelledby="pin-picker-title" @close="emit('close')">
    <div ref="root" class="pp">
      <div class="pp-head">
        <h2 id="pin-picker-title">{{ t.pickerTitle }}</h2>
        <button type="button" class="pp-close" :aria-label="t.close" @click="emit('close')"><Icon name="x" :size="16" /></button>
      </div>
      <p :class="['pp-hint', { warn: shaking }]" aria-live="polite">
        {{ shaking ? t.pickerFull : t.pickerHint }}<span class="pp-count">{{ t.pickerCount(draft.length, MAX_PINS) }}</span>
      </p>

      <TransitionGroup tag="ol" name="pp-slot" class="pp-slots">
        <li v-for="(id, index) in draft" :key="id" :data-slot="id"
          :class="['pp-slot', 'filled', { hidden: landing === id, pop: popped === id }]">
          <span class="pp-no">{{ index + 1 }}</span>
          <strong>{{ label(id) }}</strong>
          <button type="button" class="pp-remove" :aria-label="t.remove(label(id))" :disabled="busy" @click="toggle(id)">
            <Icon name="x" :size="13" />
          </button>
        </li>
        <li v-for="slot in emptySlots" :key="`empty-${slot}`" class="pp-slot empty">
          <span class="pp-no">{{ slot }}</span>{{ t.slotEmpty }}
        </li>
      </TransitionGroup>

      <section v-for="group in groups" :key="group.group" class="pp-group">
        <h3>{{ group.title }}</h3>
        <div class="pp-chips">
          <button v-for="metric in group.metrics" :key="metric.id" type="button" :data-chip="metric.id"
            :class="['pp-chip', { on: draft.includes(metric.id), dim: full && !draft.includes(metric.id), shake: shaking === metric.id }]"
            :aria-pressed="draft.includes(metric.id)" @click="toggle(metric.id)">
            <span v-if="draft.includes(metric.id)" class="pp-order" aria-hidden="true">{{ orderOf(metric.id) }}</span>
            {{ label(metric.id) }}
          </button>
        </div>
      </section>

      <div class="pp-actions">
        <button type="button" class="button secondary" :disabled="!draft.length || busy" @click="clear">{{ t.clear }}</button>
        <button type="button" class="button primary" :disabled="busy" @click="emit('done', draft)">{{ t.done }}</button>
      </div>
    </div>
  </ModalDialog>
</template>

<style scoped>
.pp { display: grid; gap: 14px; }
.pp-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.pp-head h2 { margin: 0; font-size: var(--fs-lg); }
.pp-close { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); cursor: pointer; }
.pp-close:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--ink); }
.pp-hint { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; margin: -6px 0 0; color: var(--muted); font-size: var(--fs-sm); transition: color var(--dur-fast) ease; }
.pp-hint.warn { color: var(--warning); }
.pp-count { color: var(--subtle); font-variant-numeric: tabular-nums; }

.pp-slots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.pp-slot { position: relative; display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 46px; padding: 8px 10px; border-radius: var(--radius-md); font-size: var(--fs-sm); }
.pp-slot.filled { background: color-mix(in srgb, var(--accent) 14%, var(--mat-card)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent); color: var(--ink); transition: opacity 160ms ease; }
.pp-slot.filled strong { flex: 1; overflow: hidden; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.pp-slot.hidden { opacity: 0; }
.pp-slot.pop { animation: pp-pop 340ms cubic-bezier(.3, 1.6, .5, 1); }
.pp-slot.empty { border: 1.5px dashed color-mix(in srgb, var(--ink) 16%, transparent); color: var(--subtle); }
.pp-no { display: grid; flex: 0 0 auto; place-items: center; width: 20px; height: 20px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--muted); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; }
.filled .pp-no { background: var(--accent); color: var(--accent-ink); }
.pp-remove { display: grid; flex: 0 0 auto; place-items: center; width: 26px; height: 26px; margin: -4px -4px -4px 0; border: 0; border-radius: 999px; background: transparent; color: var(--muted); cursor: pointer; }
.pp-remove:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink); }

.pp-group h3 { margin: 0 0 8px; color: var(--subtle); font-size: var(--fs-xs); font-weight: 650; }
.pp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pp-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 5px 13px; border: 1px solid transparent; border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--muted); font: inherit; font-size: var(--fs-sm); cursor: pointer;
  transition: background var(--dur-fast) ease, color var(--dur-fast) ease, opacity var(--dur-base) ease, transform var(--dur-fast) ease; }
.pp-chip:hover { background: color-mix(in srgb, var(--ink) 10%, transparent); color: var(--ink); }
.pp-chip:active { transform: scale(.96); }
.pp-chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.pp-chip.on { border-color: color-mix(in srgb, var(--accent) 45%, transparent); background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--ink); font-weight: 600; }
.pp-chip.dim { opacity: .45; }
.pp-chip.shake { animation: pp-shake 380ms ease; }
.pp-order { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 999px; background: var(--accent); color: var(--accent-ink); font-size: var(--fs-2xs); font-weight: 700; animation: pp-pop 300ms cubic-bezier(.3, 1.6, .5, 1); }

.pp-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }

/* 槽位前移：只动 transform。离开的槽立即让位（替身已经在飞），新空槽淡入。 */
.pp-slot-move { transition: transform 320ms cubic-bezier(.2, .8, .2, 1); }
.pp-slot-enter-active { transition: opacity 200ms ease; }
.pp-slot-enter-from { opacity: 0; }
.pp-slot-leave-active { display: none; }

@keyframes pp-pop { 0% { transform: scale(.9); } 60% { transform: scale(1.05); } 100% { transform: scale(1); } }
@keyframes pp-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(3px); } }
@media (prefers-reduced-motion: reduce) {
  .pp-slot.pop, .pp-chip.shake, .pp-order { animation: none; }
  .pp-slot-move { transition: none; }
}
</style>

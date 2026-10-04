<script setup lang="ts">
/* 「我的指标」的挑选面板。
 *
 * 上面四个固定的槽，下面按目的分组的候选胶囊。点一枚胶囊，下一个空槽从底边往上漫满绿色，
 * 满了以后名字浮出来；点已选的胶囊或槽上的 ×：
 *   - 去掉的是最后一个：那一槽的绿色往下退回灰色，「空位」同时淡入；
 *   - 去掉的在中间：它的名字淡掉，后面的名字各自**滑**进前一槽（FLIP，只动 transform），
 *     空出来的是最后一槽——绿色往下退、「空位」淡入。
 *   以前是退完色停一下，然后名字和「空位」一帧换好（用户 2026-10-04 录屏：水位降完是硬切）。
 * 胶囊自己的选中态也是同一种由下往上的填色。
 *
 * 以前是一枚替身从胶囊飞进槽里：新槽先藏着、空槽立刻消失、替身落地再换回真内容——
 * 几个元素轮流出现消失，看上去就是「闪一下」（用户 2026-09-30 录屏）。现在四个槽从头到尾
 * 都在原位，变的只是槽里那层颜色（transform: scaleY）和名字的透明度。
 *
 * 满四个以后其余胶囊变暗，再点会轻晃一下并提示先去掉一个。顺序就是点选的顺序。
 * 面板本身沿用全应用的弹窗：从「调整」按钮里长出来，关的时候缩回去。 */
import { computed, nextTick, ref } from 'vue';
import Icon from '../Icon.vue';
import ModalDialog from '../ModalDialog.vue';
import { MAX_PINS, PINNABLE_METRICS, type PinGroup } from '../../lib/pinnedMetrics';
import { useMessages } from '../../i18n';
import { pinnedMetricsMessages } from './PinnedMetrics.i18n';

const props = defineProps<{ pins: string[]; label: (id: string) => string }>();
const emit = defineEmits<{ close: []; done: [pins: string[]] }>();
const t = useMessages(pinnedMetricsMessages);

const draft = ref<string[]>([...props.pins]);
/** 正在退色的那一槽（下标）：颜色退完才真正从草稿里拿掉。 */
const draining = ref<number | null>(null);
/** 名字正在淡掉的那一槽（去掉的在中间：槽不退色，后面的名字滑过来补上）。 */
const vanishing = ref<number | null>(null);
/** 前移那一帧不放名字的淡入淡出：滑过来的名字是用 transform 动画带过去的。 */
const shifting = ref(false);
const shaking = ref<string | null>(null);
const busy = ref(false);
const slotList = ref<HTMLElement | null>(null);

/** 槽里的颜色漫满 / 退掉的时长，和 CSS 里 .pp-fill 的过渡一致。 */
const FILL_MS = 340;
/** 中间那一槽的名字淡掉、后面的名字滑过去的时长。 */
const FADE_MS = 160;
const SLIDE_MS = 360;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const wait = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, reducedMotion() ? 0 : ms); });

const full = computed(() => draft.value.length >= MAX_PINS);
const GROUPS: PinGroup[] = ['recovery', 'activity', 'body'];
const groups = computed(() => GROUPS.map((group) => ({
  group,
  title: group === 'recovery' ? t.value.groupRecovery : group === 'activity' ? t.value.groupActivity : t.value.groupBody,
  metrics: PINNABLE_METRICS.filter((metric) => metric.group === group),
})));
const slots = computed(() => Array.from({ length: MAX_PINS }, (_, index) => draft.value[index] ?? null));

const add = async (id: string) => {
  draft.value = [...draft.value, id];
  await wait(FILL_MS);
};

/** 每个名字此刻在屏幕上的位置（按指标 id）。 */
const namePositions = () => new Map([...(slotList.value?.querySelectorAll<HTMLElement>('strong.pp-name[data-id]') ?? [])]
  .map((el) => [el.dataset.id!, el.getBoundingClientRect()] as const));

const remove = async (id: string) => {
  const index = draft.value.indexOf(id);
  if (index < 0) return;
  if (index === draft.value.length - 1 || reducedMotion()) {
    // 最后一个：退色和「空位」淡入同时放完，放完再从草稿里拿掉（那时名字已经透明，换掉看不出来）。
    draining.value = index;
    await wait(FILL_MS);
    draining.value = null;
    draft.value = draft.value.filter((item) => item !== id);
    return;
  }
  // 中间的：名字先淡掉（槽的绿色留着，马上有人补进来）……
  vanishing.value = index;
  await wait(FADE_MS);
  const before = namePositions();
  shifting.value = true;
  vanishing.value = null;
  draft.value = draft.value.filter((item) => item !== id);
  await nextTick();
  // ……后面的名字从原来的槽滑进前一槽；最后一槽此刻空了，绿色往下退、「空位」淡入（CSS 过渡）。
  for (const el of slotList.value?.querySelectorAll<HTMLElement>('strong.pp-name[data-id]') ?? []) {
    const from = before.get(el.dataset.id!);
    if (!from) continue;
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      { duration: SLIDE_MS, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { shifting.value = false; }));
  await wait(Math.max(SLIDE_MS, FILL_MS));
};

const shake = (id: string) => {
  shaking.value = null;
  void nextTick(() => { shaking.value = id; });
  window.setTimeout(() => { if (shaking.value === id) shaking.value = null; }, 420);
};

/* 一次只处理一枚：连点时后一枚**排队**等前一枚放完，槽位顺序不会乱。以前是忙时直接
   丢掉这一下（和这句注释说的相反），快点两枚只选上一枚、也没有任何反馈。
   选没选上、满没满在轮到它时再判断：前面那枚可能刚好把槽占满。 */
let queue: Promise<void> = Promise.resolve();
const toggle = (id: string): Promise<void> => {
  queue = queue.then(async () => {
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
  }).catch(() => undefined);
  return queue;
};

const clear = () => { draft.value = []; };
const orderOf = (id: string) => draft.value.indexOf(id) + 1;
</script>

<template>
  <ModalDialog labelledby="pin-picker-title" @close="emit('close')">
    <div class="pp">
      <div class="pp-head">
        <h2 id="pin-picker-title">{{ t.pickerTitle }}</h2>
        <button type="button" class="pp-close" :aria-label="t.close" @click="emit('close')"><Icon name="x" :size="16" /></button>
      </div>
      <p :class="['pp-hint', { warn: shaking }]" aria-live="polite">
        {{ shaking ? t.pickerFull : t.pickerHint }}<span class="pp-count">{{ t.pickerCount(draft.length, MAX_PINS) }}</span>
      </p>

      <ol ref="slotList" :class="['pp-slots', { shifting }]">
        <li v-for="(id, index) in slots" :key="index"
          :class="['pp-slot', { filled: id && draining !== index, vanishing: vanishing === index }]">
          <span class="pp-fill" aria-hidden="true"></span>
          <span class="pp-no">{{ index + 1 }}</span>
          <!-- 名字和「空位」叠在同一格里交叉淡入淡出，不再 v-if 一帧换掉。 -->
          <span class="pp-label">
            <strong v-if="id" class="pp-name" :data-id="id">{{ label(id) }}</strong>
            <span class="pp-name pp-empty-text" aria-hidden="true">{{ t.slotEmpty }}</span>
          </span>
          <!-- 空槽也留着这颗 ×（透明、不可点）：它跟着退色淡掉，而不是在某一帧凭空消失。 -->
          <button type="button" class="pp-remove" :aria-label="id ? t.remove(label(id)) : undefined" :aria-hidden="!id"
            :tabindex="id ? 0 : -1" :disabled="busy || !id" @click="id && toggle(id)">
            <Icon name="x" :size="13" />
          </button>
        </li>
      </ol>

      <section v-for="group in groups" :key="group.group" class="pp-group">
        <h3>{{ group.title }}</h3>
        <div class="pp-chips">
          <button v-for="metric in group.metrics" :key="metric.id" type="button"
            :class="['pp-chip', { on: draft.includes(metric.id) && draining !== orderOf(metric.id) - 1 && vanishing !== orderOf(metric.id) - 1, dim: full && !draft.includes(metric.id), shake: shaking === metric.id }]"
            :aria-pressed="draft.includes(metric.id)" @click="toggle(metric.id)">
            <span class="pp-fill" aria-hidden="true"></span>
            <span v-if="draft.includes(metric.id)" class="pp-order" aria-hidden="true">{{ orderOf(metric.id) }}</span>
            <span class="pp-chip-text">{{ label(metric.id) }}</span>
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

/* 槽和胶囊共用的那层颜色：平时压扁在底边（scaleY 0），选中时从底边往上漫满。
   只动 transform / opacity，合成器就能做；这层在内容下面，不挡字。 */
.pp-fill {
  position: absolute; inset: 0; z-index: 0; border-radius: inherit; pointer-events: none;
  background: linear-gradient(0deg, color-mix(in srgb, var(--accent) 30%, transparent), color-mix(in srgb, var(--accent) 16%, transparent));
  transform: scaleY(0); transform-origin: 50% 100%; opacity: 0;
  transition: transform 340ms cubic-bezier(.3, .7, .2, 1), opacity 200ms ease;
}
.filled > .pp-fill, .pp-chip.on > .pp-fill { transform: scaleY(1); opacity: 1; }
/* 退色：先往下退，最后才淡掉。 */
.pp-slot:not(.filled) > .pp-fill, .pp-chip:not(.on) > .pp-fill { transition: transform 340ms cubic-bezier(.4, 0, .6, 1), opacity 160ms ease 180ms; }
.shifting strong.pp-name { transition: none !important; }

.pp-slots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
/* 不裁切：前移时名字要从后一槽滑过来，裁了就只看得见一截（颜色层自己带圆角，不靠这里裁）。 */
.pp-slot { position: relative; display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 46px; padding: 8px 10px;
  border-radius: var(--radius-md); background: color-mix(in srgb, var(--ink) 5%, transparent); font-size: var(--fs-sm); }
.pp-slot > :not(.pp-fill) { position: relative; z-index: 1; }
.pp-label { z-index: 2; }
.pp-label { display: grid; flex: 1; min-width: 0; }
.pp-label > * { grid-area: 1 / 1; }
.pp-name { min-width: 0; overflow: hidden; color: var(--ink); font-weight: 650; text-overflow: ellipsis; white-space: nowrap;
  transition: opacity 200ms ease 140ms, translate 260ms var(--ease-out) 140ms; }
.pp-slot:not(.filled) strong.pp-name, .pp-slot.vanishing strong.pp-name { opacity: 0; translate: 0 4px; transition: opacity 140ms ease, translate 140ms ease; }
/* 「空位」：槽空着时淡入（跟着退色一起放），槽满着时让开。 */
.pp-empty-text { color: var(--subtle); font-weight: 400; opacity: 0; transition: opacity 120ms ease; }
.pp-slot:not(.filled) .pp-empty-text { opacity: 1; transition: opacity 220ms ease 140ms; }
.pp-slot.vanishing .pp-remove { opacity: 0; }
.pp-no { display: grid; flex: 0 0 auto; place-items: center; width: 20px; height: 20px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--muted); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums;
  transition: background 200ms ease 120ms, color 200ms ease 120ms; }
.filled .pp-no { background: var(--accent); color: var(--accent-ink); }
.pp-remove { display: grid; flex: 0 0 auto; place-items: center; width: 26px; height: 26px; margin: -4px -4px -4px 0; border: 0; border-radius: 999px; background: transparent; color: var(--muted); cursor: pointer;
  transition: opacity 140ms ease; }
/* 退色途中 × 一起淡掉，退完那一帧它被拿掉时已经看不见。 */
.pp-slot:not(.filled) .pp-remove { opacity: 0; pointer-events: none; }
.pp-remove:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink); }

.pp-group h3 { margin: 0 0 8px; color: var(--subtle); font-size: var(--fs-xs); font-weight: 650; }
.pp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pp-chip { position: relative; display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 5px 13px; overflow: hidden; border: 0; border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--muted); font: inherit; font-size: var(--fs-sm); cursor: pointer;
  transition: color var(--dur-base) ease, opacity var(--dur-base) ease, transform var(--dur-fast) ease; }
.pp-chip > :not(.pp-fill) { position: relative; z-index: 1; }
.pp-chip:hover { color: var(--ink); }
.pp-chip:active { transform: scale(.96); }
.pp-chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.pp-chip.on { color: var(--ink); font-weight: 600; }
.pp-chip.dim { opacity: .45; }
.pp-chip.shake { animation: pp-shake 380ms ease; }
.pp-order { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 999px; background: var(--accent); color: var(--accent-ink); font-size: var(--fs-2xs); font-weight: 700; animation: pp-order-in 260ms ease 120ms both; }

.pp-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }

@keyframes pp-order-in { from { opacity: 0; scale: .6; } }
@keyframes pp-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(3px); } }
@media (prefers-reduced-motion: reduce) {
  .pp-fill, .pp-name, .pp-no { transition: none !important; }
  .pp-chip.shake, .pp-order { animation: none; }
}
</style>

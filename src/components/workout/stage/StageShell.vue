<script setup lang="ts">
/**
 * 运动详情的「台前调度」（2026-11-13，用户：参考 iPadOS 台前调度，卡片别再定死位置）。
 *
 * 舞台在中间（1–3 张卡一组，比例、整组宽、每张的高都能无级拖），其余卡斜着排在左侧栏，点一下换上舞台；
 * 「•••」菜单 / 拖动 / 拖边可以组合、拆开、调大小、全屏、收进侧栏。所有卡（含概要卡，原来的头图）都在这里。
 * 最上面一行：运动名（页面填 #title）+ 全局按钮（页面填 #actions：纠正、隐藏、问 AI）+ 「全部卡片」+「复原布局」。
 * 「全部卡片」= 老版两栏排法（实验性版本，老用户要能退回去，记住选择）。
 * 布局按运动大类记住（useWorkoutStage）。每张卡只有一个元素（StageWindow），位置全由 lib/stage/layout.ts 算，
 * 换位置时从此刻的样子飞过去（lib/motion/stageFlight.ts）。卡的内容由页面填进与卡 id 同名的插槽。
 *
 * 第三轮（同日用户录屏）：
 * - 拖动不画绿框、不蒙模糊：落点造成的布局当预演（useWorkoutStage.draft），舞台按预演排，邻居真的飞过去让位；
 *   拎着的那张钉在拎起时的位置、跟着指针。拖边的预演每帧直接排到位（不飞），松手提交同一份，零跳变。
 * - 换排法不再盖模糊板（录屏里像信封一样凸出来）：同一批窗口直接飞——侧栏的卡松开斜度、飞到两栏里各自的位置，
 *   回舞台时「从哪来回哪去」退回侧栏；起点在视口外的只从视口边缘滑进来，起止都在视口外的不飞。
 * - 侧栏没有名字胶囊了（压在卡上），全屏时叫出侧栏卡往右让开、不再盖在卡上。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRef, watch, type ComponentPublicInstance } from 'vue';
import GlyphTile from '../../GlyphTile.vue';
import Icon from '../../Icon.vue';
import StageWindow from './StageWindow.vue';
import StageMenu from './StageMenu.vue';
import { menuEnter, menuLeave } from './menuMorph';
import { ratioOf, ratioPresets, solve, STRIP_W, TAB_H, type Layout, type Placement } from '../../../lib/stage/layout';
import { FULL_SNAP, locate, type StageState } from '../../../lib/stage/state';
import type { SportClass, StageView } from '../../../lib/stage/prefs';
import { flyFrom, SETTLE_EASE, snapshotOf, stopFlight, STAGE_MS, type Snapshot } from '../../../lib/motion/stageFlight';
import { OPEN_EASE } from '../../../lib/motion/timing';
import { lessMotion } from '../../../lib/motion/lessMotion';
import { useWorkoutStage } from '../../../composables/useWorkoutStage';
import { useStageDrag } from '../../../composables/useStageDrag';
import { CLASSIC_COLUMNS, PIP_CARDS, type StageCard } from '../workoutCards';
import { useMessages } from '../../../i18n';
import { stageMessages } from './stage.i18n';

const props = defineProps<{ cards: StageCard[]; sport: SportClass }>();
const t = useMessages(stageMessages);
const ids = computed(() => props.cards.map((card) => card.id));
const stage = useWorkoutStage(ids, toRef(props, 'sport'));
const cardOf = (id: string) => props.cards.find((card) => card.id === id);
const titleOf = (id: string) => cardOf(id)?.title ?? id;

const shell = ref<HTMLElement | null>(null);
const canvas = ref<HTMLElement | null>(null);
const ruler = ref<HTMLElement | null>(null);
const size = reactive({ width: 0, height: 0 });
const contentH = reactive<Record<string, number>>({});
const lastW = reactive<Record<string, number>>({});
const solveWith = (state: StageState, view: StageView = stage.view.value): Layout => solve({
  width: size.width || 1200, height: size.height || 640, state, cards: ids.value, contentH, lastW,
  pip: PIP_CARDS, view, columns: CLASSIC_COLUMNS, stripOpen: stage.stripOpen.value, front: stage.front.value,
});
const classic = computed(() => stage.view.value === 'classic');
const isFull = computed(() => stage.state.value.stage.ids.length === 1 && stage.state.value.stage.snap === FULL_SNAP);

/* ── 每张卡的元素 ─────────────────────────────── */
const els = new Map<string, HTMLElement>();
const bind = (id: string) => (ref: Element | ComponentPublicInstance | null) => {
  const el = ref && '$el' in ref ? (ref.$el as HTMLElement) : (ref as HTMLElement | null);
  if (el) els.set(id, el);
  else els.delete(id);
};

/* ── 拖动 / 点击 / 菜单 ─────────────────────────────── */
const menu = ref<string | null>(null);
let reopenTimer = 0;
// 布局按预演排（拖动中）；拎着的那张钉在拎起时的位置。
const layout = computed<Layout>(() => {
  const out = solveWith(stage.draft.value ?? stage.state.value, stage.view.value);
  const pin = drag.pinned();
  if (pin) out.placements.set(pin.id, pin.p);
  return out;
});
const drag = useStageDrag({ stage, layout, canvas, size, element: (id) => els.get(id), solveWith, onStart: () => { closeMenu(); } });

/* ── FLIP ─────────────────────────────── */
/* 高也算（内容换了宽重新折行、高变了也要飞，不然全屏 / 退出全屏落地那一下会跳）。 */
const moved = (a: Placement | undefined, b: Placement) =>
  !a || a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h || a.scale !== b.scale || a.tilt !== b.tilt || a.opacity !== b.opacity || a.mode !== b.mode;
let ready = false;
let sizeKey = '';
/** 飞行途中画布高先撑在旧、新两者较高的那个（页脚不跳），落地再收。 */
const heldH = ref(0);
let holdTimer = 0;
/** 画布坐标里此刻看得见的竖直范围。 */
const viewSpan = () => {
  const top = canvas.value?.getBoundingClientRect().top ?? 0;
  return { top: -top, bottom: -top + window.innerHeight };
};
const visualBox = (p: Placement) => ({ y: p.y, h: p.h * p.scale });
watch(layout, (next, prev) => {
  const key = `${size.width}x${size.height}`;
  const resized = key !== sizeKey;
  sizeKey = key;
  if (!prev || !ready || resized || drag.isInstant()) return;
  const pin = drag.pinned()?.id;
  const view = viewSpan();
  const off = (y: number, h: number) => y + h < view.top - 40 || y > view.bottom + 40;
  const shots = new Map<string, Snapshot | 'slide'>();
  for (const [id, p] of next.placements) {
    const el = els.get(id);
    if (!el || id === pin || (!moved(prev.placements.get(id), p) && !el.style.translate && !el.style.scale)) continue;
    const shot = snapshotOf(el);
    stopFlight(el);
    const was = prev.placements.get(id);
    const from = shot.rect ?? (was ? { ...visualBox(was) } : null);
    const to = visualBox(p);
    // 起止都在视口外：不飞。只有起点在外面：从视口边缘滑进来（不从整页之外长途飞来）。
    if (from && off(from.y, from.h) && off(to.y, to.h)) continue;
    shots.set(id, from && off(from.y, from.h) && p.opacity > 0 ? 'slide' : shot);
  }
  if (!shots.size) return;
  heldH.value = Math.max(heldH.value, prev.canvasH, next.canvasH);
  clearTimeout(holdTimer);
  holdTimer = window.setTimeout(() => { heldH.value = 0; }, Math.round(STAGE_MS * 1.2) + 60);
  void nextTick(() => {
    for (const [id, shot] of shots) {
      const el = els.get(id);
      if (!el) continue;
      if (shot === 'slide') {
        if (!lessMotion()) el.animate([{ translate: '0 48px', opacity: 0 }, { translate: '0 0', opacity: Number(el.style.opacity || 1) }], { duration: STAGE_MS, easing: OPEN_EASE });
        continue;
      }
      flyFrom(el, shot, drag.releasing.has(id) ? SETTLE_EASE : undefined);
    }
  });
}, { flush: 'pre' });
/* 卡在舞台上的排版宽记下来：退到侧栏时沿用，回舞台少一次重排。 */
watch(layout, (next) => {
  for (const [id, p] of next.placements) if (p.mode === 'stage' && lastW[id] !== p.w) lastW[id] = p.w;
});

const activate = (id: string) => {
  if (drag.justDragged.value) return;
  const where = locate(stage.state.value, id);
  if (where?.at === 'strip') stage.bringGroup(where.group);
  stage.stripOpen.value = false;
};
const toggleMenu = (id: string) => {
  if (drag.justDragged.value) return;
  clearTimeout(reopenTimer);
  menu.value = menu.value === id ? null : id;
};
function closeMenu(focusGrip = false) {
  clearTimeout(reopenTimer);
  const id = menu.value;
  menu.value = null;
  if (focusGrip && id) void nextTick(() => els.get(id)?.querySelector<HTMLElement>('.window-grip')?.focus());
}
const MENU_W = 260;
const menuAt = computed(() => {
  const p = menu.value ? layout.value.placements.get(menu.value) : null;
  if (!p) return null;
  const grip = p.x + (p.w * p.scale) / 2;
  const x = Math.min(Math.max(8, grip - MENU_W / 2), size.width - MENU_W - 8);
  const y = p.y + 30;
  // 从「•••」那颗胶囊长出来、收回去（从哪来回哪去）：它相对菜单左上角的矩形。
  return { x, y, from: [Math.round(grip - 26 - x), p.y + 4 - y, 52, 18].join(',') };
});
/** 菜单里的档：最近的那档；拖边拖出来的比例 / 整组宽不正好在档上时 exact 为假（滑块画成未选）。 */
const menuSnap = computed(() => {
  const g = stage.state.value.stage;
  if (g.ids.length === 3) return { snap: g.snap, exact: true };
  const presets = ratioPresets(g.ids.length, g.snap).slice(0, g.ids.length === 1 ? 2 : 3);
  const ratio = ratioOf(g);
  let best = 0;
  presets.forEach((r, i) => { if (Math.abs(r - ratio) < Math.abs(presets[best] - ratio)) best = i; });
  return { snap: best, exact: Math.abs(presets[best] - ratio) < 0.002 && g.span == null };
});
const act = (kind: 'solo' | 'full' | 'exitFull' | 'tuck') => {
  const id = menu.value;
  if (!id) return;
  closeMenu();
  if (kind === 'solo') stage.solo(id);
  else if (kind === 'tuck') stage.removeFromStage(id);
  else if (kind === 'full') stage.fullscreen(id);
  else stage.setSnap(1);
};
/**
 * 挑档（2026-11-13 用户：切完别一下子消失，让人看看效果）：菜单里的滑块先滑过去，菜单收回「•••」、卡飞到新档，
 * 落地后菜单从「•••」的新位置长回来。
 */
const pickSnap = (snap: number) => {
  const id = menu.value;
  if (!id) return;
  clearTimeout(reopenTimer);
  const quick = lessMotion();
  reopenTimer = window.setTimeout(() => {
    menu.value = null;
    stage.setSnap(snap);
    if (quick) return;
    reopenTimer = window.setTimeout(() => {
      if (!menu.value && !drag.dragging.value && stage.state.value.stage.ids.includes(id)) menu.value = id;
    }, STAGE_MS + 140);
  }, quick ? 0 : 150);
};

/* ── 排法：台前调度 ↔ 老版两栏 ─────────────────────── */
/** 同一批窗口直接飞（FLIP），不盖模糊板；回舞台时页面平滑滚回舞台顶。 */
const switchView = (next: StageView) => {
  closeMenu();
  stage.setView(next);
  if (next !== 'stage') return;
  const top = shell.value?.getBoundingClientRect().top ?? 0;
  const sticky = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-top')) || 0;
  if (top < sticky) shell.value?.scrollIntoView({ behavior: lessMotion() ? 'auto' : 'smooth', block: 'start' });
};
const reset = () => { closeMenu(); stage.reset(); };

/* ── 自动收起的侧栏：指针靠到左边缘叫出来，离开侧栏那一条一会儿收回去 ─────────── */
let stripTimer = 0;
const peek = (open: boolean) => {
  clearTimeout(stripTimer);
  if (!layout.value.stripAuto) return;
  if (open) stage.stripOpen.value = true;
  else if (stage.stripOpen.value) stripTimer = window.setTimeout(() => { stage.stripOpen.value = false; }, 320);
};
const onCanvasMove = (event: PointerEvent) => {
  if (!layout.value.stripAuto || classic.value || drag.dragging.value) return;
  const x = event.clientX - (canvas.value?.getBoundingClientRect().left ?? 0);
  if (!stage.stripOpen.value && x < 14) peek(true);
  else if (stage.stripOpen.value) peek(x < STRIP_W + 24);
};

/* ── 键盘：← / → 轮换舞台，Esc 逐级退出 ─────────────────────── */
const onKey = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement;
  if (classic.value || target.closest('[data-stage-scroll], input, textarea, select, [role="menu"], .stage-head')) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    stage.cycle(event.key === 'ArrowRight' ? 1 : -1);
  } else if (event.key === 'Escape') {
    if (stage.stripOpen.value) stage.stripOpen.value = false;
    else if (isFull.value) stage.setSnap(1);
    else return;
    event.preventDefault();
  }
};
const onOutside = (event: PointerEvent) => {
  const target = event.target as HTMLElement;
  if (!target.closest('.stage-menu, .window-grip')) { if (menu.value) closeMenu(); else clearTimeout(reopenTimer); }
  if (hiddenOpen.value && !target.closest('.hidden-pop, .hidden-toggle')) hiddenOpen.value = false;
};
/* 落地页演示片要把某张卡请上舞台（views/landing/film）。老版两栏里每张卡本来就看得见，不动。 */
const onShow = (event: Event) => {
  const id = (event as CustomEvent<string>).detail;
  if (typeof id === 'string' && ids.value.includes(id) && !classic.value) stage.focusCard(id);
};

const hiddenOpen = ref(false);
const restore = (id: string) => { hiddenOpen.value = false; stage.focusCard(id); };

let observer: ResizeObserver | null = null;
onMounted(() => {
  observer = new ResizeObserver(() => {
    size.width = Math.round(canvas.value?.clientWidth ?? 0);
    size.height = Math.round(ruler.value?.clientHeight ?? 0);
    if (!ready && size.width) requestAnimationFrame(() => requestAnimationFrame(() => { ready = true; }));
  });
  if (canvas.value) observer.observe(canvas.value);
  if (ruler.value) observer.observe(ruler.value);
  document.addEventListener('pointerdown', onOutside, true);
  window.addEventListener('zb:stage-show', onShow);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  clearTimeout(stripTimer);
  clearTimeout(reopenTimer);
  clearTimeout(holdTimer);
  stage.draft.value = null;
  document.removeEventListener('pointerdown', onOutside, true);
  window.removeEventListener('zb:stage-show', onShow);
});
defineExpose({ focusCard: (id: string) => stage.focusCard(id) });
</script>

<template>
  <div
    ref="shell"
    class="stage-shell"
    :class="{ narrow: layout.narrow, classic }"
    :style="{ '--stage-ms': `${STAGE_MS}ms`, '--stage-ease': OPEN_EASE }"
    role="region"
    :aria-label="t.region"
    @keydown="onKey"
  >
    <!-- 最上面一行：运动名 + 全局按钮。不吸顶、不画底：曾是一条横贯的长工具条，用户很讨厌。 -->
    <header class="stage-head">
      <div class="head-title"><slot name="title" /></div>
      <div class="head-actions">
        <slot name="actions" />
        <span class="head-sep" aria-hidden="true"></span>
        <Transition name="head-fade">
          <div v-if="!classic && stage.state.value.hidden.length" class="hidden-wrap">
            <button class="head-button hidden-toggle" type="button" :aria-expanded="hiddenOpen" @click="hiddenOpen = !hiddenOpen">{{ t.hiddenCount(stage.state.value.hidden.length) }}</button>
            <Transition name="pop">
              <div v-if="hiddenOpen" class="hidden-pop" :title="t.restore">
                <button v-for="id in stage.state.value.hidden" :key="id" type="button" @click="restore(id)">
                  <GlyphTile :name="cardOf(id)?.icon ?? 'structured-data'" :tone="cardOf(id)?.tone" :size="18" />{{ titleOf(id) }}
                </button>
              </div>
            </Transition>
          </div>
        </Transition>
        <button class="head-button" type="button" :aria-pressed="classic" @click="switchView(classic ? 'stage' : 'classic')">
          {{ classic ? t.exposeExit : t.expose }}
        </button>
        <Transition name="head-fade">
          <button v-if="!classic" class="head-button" type="button" @click="reset">{{ t.reset }}</button>
        </Transition>
      </div>
    </header>

    <div class="stage-ruler" ref="ruler" aria-hidden="true"></div>
    <div ref="canvas" class="stage-canvas" :style="{ height: `${Math.max(layout.canvasH, heldH)}px` }" @pointermove="onCanvasMove" @pointerleave="peek(false)">
      <div v-if="layout.tabs.length" class="group-tabs" role="tablist" :aria-label="t.groupTabs" :style="{ height: `${TAB_H - 8}px` }">
        <button
          v-for="id in layout.tabs"
          :key="id"
          type="button"
          role="tab"
          :aria-selected="layout.placements.get(id)?.mode === 'stage'"
          @click="stage.setFront(id)"
        >{{ titleOf(id) }}</button>
      </div>

      <StageWindow
        v-for="card in cards"
        :key="card.id"
        :ref="bind(card.id)"
        :id="card.id"
        :title="card.title"
        :placement="layout.placements.get(card.id)!"
        :menu-open="menu === card.id"
        @grab="(event, kind, handle) => drag.grab(card.id, event, kind, handle)"
        @activate="activate(card.id)"
        @menu="toggleMenu(card.id)"
        @measure="(h) => { if (contentH[card.id] !== h) contentH[card.id] = h; }"
      >
        <slot :name="card.id" />
      </StageWindow>

      <!-- 全屏 / 窄窗口时侧栏让开了：左边缘一个小玻璃把手，点它或指针贴边都能把侧栏叫出来。 -->
      <Transition name="head-fade">
        <button
          v-if="layout.stripAuto && !layout.stripShown && !classic"
          type="button"
          class="strip-handle glass-control"
          :aria-label="t.showStrip"
          :title="t.showStrip"
          @click="peek(true)"
        ><Icon name="chevron-right" :size="16" /></button>
      </Transition>

      <Transition :css="false" @enter="menuEnter" @leave="menuLeave">
        <StageMenu
          v-if="menu && menuAt"
          :key="menu"
          :title="titleOf(menu)"
          :x="menuAt.x"
          :y="menuAt.y"
          :from="menuAt.from"
          :count="stage.state.value.stage.ids.length"
          :snap="menuSnap.snap"
          :exact="menuSnap.exact"
          :full="isFull"
          @act="act"
          @snap="pickSnap"
          @close="closeMenu(true)"
        />
      </Transition>
    </div>
  </div>
</template>

<style scoped src="./StageShell.css"></style>

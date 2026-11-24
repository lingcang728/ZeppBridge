<script setup lang="ts">
/**
 * 交给 AI 主面板上的「按问题发牌」：一枚胶囊，点开是四个问题（同距离 · 刷 PR、同一条路线、比赛复盘、恢复异常的夜）。
 *
 * - 打开时先取一次事实，四个问题各自试发一手：发不出牌的那个灰掉、写明为什么（不会点进去发一桌空牌）；
 * - 选一个：菜单缩回胶囊，同时起一份新任务（这手牌 + 模板问题），牌从胶囊里抽出来扇开（HandTable）；
 * - 首页建议卡点进来时，牌已经发好、写进了任务：等页面形变落地、帧稳了，再从这枚胶囊里发出来（`takeHandDeal`）。
 * 菜单只动 transform / opacity；Esc、点别处、再点胶囊都是从此刻原路缩回。
 */
import { computed, defineAsyncComponent, nextTick, onActivated, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import Icon from '../Icon.vue';
import { useHandsText } from './hands.i18n';
import { handQuestion, handSubtitle, takeHandDeal, useHandDeal } from '../../composables/useHandDeal';
import { QUESTION_KINDS, type Hand, type HandResult } from '../../lib/cards/hands';
import { animateFromNow, reducedMotion } from '../../lib/motion/cards';
import { CLOSE_EASE, OPEN_EASE, paced } from '../../lib/motion/timing';
import { onMotionEscape } from '../../lib/motion/interrupt';
import { whenFramesSteady } from '../../lib/motion/steady';
import { PAGE_WINDOW_MS } from '../../lib/motion/pageFlight';

const HandTable = defineAsyncComponent(() => import('./HandTable.vue'));
const t = useHandsText();
const deal = useHandDeal();
const pill = ref<HTMLElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const open = ref(false);
const menuId = `deal-menu-${Math.random().toString(36).slice(2, 8)}`;
const table = shallowRef<{ hand: Hand; title: string; subtitle: string | null } | null>(null);
const MENU_MS = paced(260);

const results = computed(() => {
  const facts = deal.facts.value;
  return QUESTION_KINDS.map((kind) => ({ kind, result: facts ? deal.dealHand(kind, facts) : null as HandResult | null }));
});

/* ---------- 菜单 ---------- */
let menuRun: Animation | null = null;
const showMenu = async () => {
  open.value = true;
  void deal.loadFacts();
  await nextTick();
  const el = menu.value;
  if (!el || reducedMotion()) return;
  menuRun = el.animate([{ opacity: 0, transform: 'translateY(-6px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: MENU_MS, easing: OPEN_EASE, fill: 'backwards' });
};
const hideMenu = async () => {
  const el = menu.value;
  if (!open.value) return;
  if (el && !reducedMotion()) {
    const run = animateFromNow(el, { opacity: 0, transform: 'translateY(-6px) scale(.96)' }, { duration: MENU_MS, easing: CLOSE_EASE, fill: 'forwards' });
    menuRun = run;
    try { await run.finished; } catch { return; }
    if (menuRun !== run) return;
  }
  open.value = false;
};
const toggle = () => { if (open.value) void hideMenu(); else void showMenu(); };
const onOutside = (event: PointerEvent) => {
  if (!open.value) return;
  const target = event.target as Node;
  if (menu.value?.contains(target) || pill.value?.contains(target)) return;
  void hideMenu();
};

/* ---------- 发牌 ---------- */
const openTable = (hand: Hand) => {
  table.value = { hand, title: t.value.kind[hand.kind], subtitle: handSubtitle(hand, t.value) };
  void deal.loadLines(hand);
};
const pick = async (result: HandResult | null) => {
  if (!result?.ok) return;
  void hideMenu();
  const refined = await deal.refineRoute(result);
  const hand = refined.ok ? refined.hand : result.hand;
  deal.startTask(hand, handQuestion(hand, t.value));
  openTable(hand);
};

/** 首页建议卡点进来：牌已经写进任务了，等页面落地再摆上桌。 */
const takePending = async () => {
  const pending = takeHandDeal();
  if (!pending) return;
  await new Promise((resolve) => window.setTimeout(resolve, reducedMotion() ? 0 : PAGE_WINDOW_MS));
  await whenFramesSteady();
  if (pill.value?.isConnected) openTable(pending.hand);
};

let releaseEscape: (() => void) | null = null;
onMounted(() => {
  document.addEventListener('pointerdown', onOutside, true);
  releaseEscape = onMotionEscape(() => {
    if (!open.value || table.value) return false;
    void hideMenu();
    return true;
  });
  void takePending();
});
onActivated(() => { void takePending(); });
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside, true);
  releaseEscape?.();
});
</script>

<template>
  <span class="deal-host">
    <button ref="pill" type="button" class="exchanges-pill deal-pill" :aria-expanded="open" :aria-controls="menuId" :title="t.dealByQuestionAria" @click="toggle">
      <Icon name="cards" :size="13" />{{ t.dealByQuestion }}<Icon name="chevron-down" :size="13" />
    </button>
    <div v-if="open" :id="menuId" ref="menu" class="deal-menu" role="menu" :aria-label="t.dealByQuestion">
      <p v-if="deal.loading.value && !deal.facts.value" class="deal-note">{{ t.dealing }}</p>
      <p v-else-if="deal.failed.value" class="deal-note">{{ t.failed }}</p>
      <template v-else>
        <button v-for="item in results" :key="item.kind" type="button" role="menuitem" class="deal-item" :disabled="!item.result?.ok" @click="pick(item.result)">
          <strong>{{ t.kind[item.kind] }}</strong>
          <small>{{ item.result && !item.result.ok ? t.empty[item.result.reason] : t.kindSub[item.kind] }}</small>
        </button>
      </template>
    </div>
    <HandTable v-if="table" :hand="table.hand" :title="table.title" :subtitle="table.subtitle" :lines="deal.lines.value" :anchor="pill"
      @change="deal.applyHand" @close="table = null" />
  </span>
</template>

<style scoped>
.deal-host { position: relative; display: inline-flex; }
.deal-pill { gap: 6px; }
.deal-menu { position: absolute; top: calc(100% + 8px); left: 0; z-index: 60; display: grid; gap: 4px; width: min(320px, calc(100vw - 32px)); padding: 6px;
  border: 1px solid var(--mat-glass-line); border-radius: 16px; background: var(--mat-glass-strong); -webkit-backdrop-filter: var(--mat-glass-blur); backdrop-filter: var(--mat-glass-blur);
  box-shadow: var(--mat-glass-shadow); transform-origin: 24px 0; }
.deal-item { display: grid; gap: 2px; padding: 9px 12px; border: 0; border-radius: 11px; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer;
  transition: background 140ms ease; }
.deal-item:hover:not(:disabled), .deal-item:focus-visible { background: color-mix(in srgb, var(--ink) 8%, transparent); outline: none; }
.deal-item strong { font-size: var(--fs-sm); font-weight: 650; }
.deal-item small { color: var(--muted); font-size: var(--fs-xs); line-height: 1.35; overflow-wrap: anywhere; }
.deal-item:disabled { cursor: default; }
.deal-item:disabled strong { color: var(--subtle); }
.deal-note { margin: 0; padding: 10px 12px; color: var(--muted); font-size: var(--fs-xs); }
</style>

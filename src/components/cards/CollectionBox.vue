<script setup lang="ts">
/**
 * 收集箱（精修批次 7.3）：右下角悬浮，叠着几张小牌、写着数量；空的时候不出现。
 *
 * 点箱子 → 牌从箱子里发出来，围成一圈、按项归拢（「睡眠 3 天」「HRV 5 天」）；悬停的牌往外抽出一截，
 * 点 × 把它拿出去。圈中间的箱子变成箭头 → 点箭头新开一个任务、只勾这些「类别 × 天」，去「交给 AI」。
 * 真交出去以后才清空（useCardCollection 的 clearAfterHandoff）。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '../Icon.vue';
import { useCardsText } from './cards.i18n';
import { useCardCollection } from '../../composables/useCardCollection';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { cutDeck, reducedMotion, SPRINGS, springCurve } from '../../lib/motion/cards';
import { onMotionEscape } from '../../lib/motion/interrupt';
import { AI_TASK_CATEGORY_META, categoryLabel } from '../../lib/aiTask/categories';
import { metricLabel } from '../../lib/aiTask/metrics';
import { dayKey } from '../../lib/aiTask/bridgeScale';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import type { AiTaskCategory } from '../../lib/bridge/types';

const t = useCardsText();
const box = useCardCollection();
const ctl = useAiTaskDraft();
const route = useRoute();
const router = useRouter();
const open = ref(false);
const busy = ref(false);
const boxButton = ref<HTMLElement | null>(null);
const ring = ref<HTMLElement | null>(null);
const MAX_SHOWN = 36;

const labelOf = (key: string) => (key.startsWith('cat:') ? t.value.categoryWhole(categoryLabel(key.slice(4) as AiTaskCategory)) : metricLabel(key));
const tintOf = (category: AiTaskCategory) => AI_TASK_CATEGORY_META[category]?.tint ?? 'var(--accent)';
const md = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
/* 「交给 AI」页底下有底栏：箱子往上让一让。 */
const lifted = computed(() => route.path === '/ai' || route.path.startsWith('/ai/'));

/** 圈上的牌：按项归拢，组与组之间空一格。 */
const layout = computed(() => {
  const cards: Array<{ id: string; key: string; date: string; tint: string; label: string; slot: number }> = [];
  const labels: Array<{ key: string; text: string; slot: number; tint: string }> = [];
  let slot = 0;
  for (const group of box.groups.value) {
    const first = slot;
    for (const date of group.dates) {
      if (cards.length >= MAX_SHOWN) break;
      cards.push({ id: `${group.key}@${date}`, key: group.key, date, tint: tintOf(group.category), label: labelOf(group.key), slot: slot++ });
    }
    if (slot > first) labels.push({ key: group.key, text: t.value.boxGroup(labelOf(group.key), group.dates.length), slot: (first + slot - 1) / 2, tint: tintOf(group.category) });
    slot += 1;
  }
  const slots = Math.max(slot - 1, 1);
  const radius = Math.min(300, 150 + slots * 5);
  const place = (s: number, r: number) => {
    const angle = (s / slots) * 360;
    const rad = (angle * Math.PI) / 180;
    // 牌面只朝圈外歪一点（最多 ±24°）：整圈转的话下半圈的牌是倒着的，字没法读。
    const signed = ((angle + 180) % 360) - 180;
    const tilt = Math.max(-24, Math.min(24, (Math.abs(signed) > 90 ? Math.sign(signed) * (180 - Math.abs(signed)) : signed) * 0.27));
    return { x: Math.sin(rad) * r, y: -Math.cos(rad) * r, angle: tilt, ox: Math.sin(rad), oy: -Math.cos(rad) };
  };
  return {
    radius,
    cards: cards.map((card) => {
      const p = place(card.slot, radius);
      return { ...card, transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) rotate(${p.angle.toFixed(1)}deg)`, ox: `${(p.ox * 18).toFixed(1)}px`, oy: `${(p.oy * 18).toFixed(1)}px` };
    }),
    labels: labels.map((label) => { const p = place(label.slot, radius + 92); return { ...label, style: { transform: `translate(calc(${p.x.toFixed(1)}px - 50%), calc(${p.y.toFixed(1)}px - 50%))` } }; }),
    more: box.count.value - cards.length,
  };
});

const ringCards = () => [...(ring.value?.querySelectorAll<HTMLElement>('.ring-card') ?? [])];

/* 圈上的牌各自已经带着「转到圈上」的 transform：发牌 / 收牌的关键帧直接写全，从箱子（圈的坐标里）到它的位置。 */
const boxPoint = () => {
  const from = boxButton.value?.getBoundingClientRect();
  const center = ring.value?.getBoundingClientRect();
  if (!from || !center) return 'translate(0px, 240px) scale(.3)';
  return `translate(${(from.left + from.width / 2 - center.left).toFixed(1)}px, ${(from.top + from.height / 2 - center.top).toFixed(1)}px) rotate(0deg) scale(.3)`;
};
const settle = (animations: Animation[]) => Promise.all(animations.map((a) => a.finished.catch(() => undefined)));
const dealRing = () => {
  const cards = ringCards();
  if (reducedMotion()) return settle(cards.map((card) => card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'backwards' })));
  const { easing, duration } = springCurve(SPRINGS.deal);
  const start = boxPoint();
  return settle(cards.map((card, i) => card.animate(
    [{ transform: start, opacity: 0 }, { opacity: 1, offset: 0.25 }, { transform: card.style.transform, opacity: 1 }],
    { duration, delay: i * 22, easing, fill: 'backwards' },
  )));
};
const collectRing = (toBox = true) => {
  const cards = ringCards();
  const end = toBox ? boxPoint() : null;
  return settle(cards.map((card, i) => card.animate(
    [{ transform: card.style.transform, opacity: 1 }, { transform: end ?? `${card.style.transform} scale(.6)`, opacity: 0 }],
    { duration: reducedMotion() ? 140 : 340, delay: reducedMotion() ? 0 : (cards.length - 1 - i) * 12, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' },
  )));
};

const show = async () => {
  if (busy.value || !box.count.value) return;
  busy.value = true;
  open.value = true;
  await nextTick();
  await dealRing();
  busy.value = false;
  ring.value?.querySelector<HTMLElement>('.ring-go')?.focus({ preventScroll: true });
};
const hide = async () => {
  if (busy.value || !open.value) return;
  busy.value = true;
  await collectRing();
  open.value = false;
  busy.value = false;
  boxButton.value?.focus({ preventScroll: true });
};
const removeCard = (event: Event, key: string, date: string) => {
  const card = (event.currentTarget as HTMLElement).closest<HTMLElement>('.ring-card');
  const out = card?.animate([{ opacity: 1 }, { opacity: 0, transform: `${card.style.transform} translateY(-40px)` }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
  void (out?.finished ?? Promise.resolve()).catch(() => undefined).then(() => {
    box.remove(key, [date]);
    if (!box.count.value) open.value = false;
  });
};
const removeGroup = async (key: string) => {
  const group = box.groups.value.find((g) => g.key === key);
  if (!group) return;
  box.remove(key, group.dates);
  if (!box.count.value) { open.value = false; return; }
  await nextTick();
  void cutDeck(ringCards());
};
/** 箭头：新开一个任务，只勾收集箱里的「类别 × 天」，去「交给 AI」。 */
const go = async () => {
  if (!box.count.value) return;
  ctl.resetDraft();
  ctl.applyPicks(box.byCategory(), dayKey());
  box.handedToTask.value = true;
  await hide();
  await router.push('/ai');
};
const clearAll = async () => { await collectRing(false); box.clear(); open.value = false; };

const releaseEscape = onMotionEscape(() => {
  if (!open.value) return false;
  void hide();
  return true;
});
onBeforeUnmount(releaseEscape);
watch(() => box.count.value, (count) => { if (!count) open.value = false; });
</script>

<template>
  <Teleport to="body">
    <Transition name="box-pop">
      <button v-show="box.count.value > 0" id="card-collection-box" ref="boxButton" type="button" :class="['collection-box', { lifted, open }]"
        :aria-label="t.boxAria(box.count.value)" :aria-expanded="open" @click="open ? hide() : show()">
        <span class="box-stack" aria-hidden="true"><i></i><i></i><i></i></span>
        <em>{{ box.count.value }}</em>
      </button>
    </Transition>
    <div v-if="open" class="box-spread" role="dialog" aria-modal="true" :aria-label="t.boxTitle" @click.self="hide">
      <div class="spread-backdrop" aria-hidden="true" @click="hide"></div>
      <div ref="ring" class="ring" :style="{ '--radius': `${layout.radius}px` }">
        <div v-for="card in layout.cards" :key="card.id" class="ring-card" :style="{ transform: card.transform, '--tint': card.tint, '--ox': card.ox, '--oy': card.oy }">
          <span class="ring-face">
            <small>{{ card.label }}</small>
            <strong>{{ md(card.date) }}</strong>
          </span>
          <button type="button" class="ring-remove" :aria-label="t.removeCard(card.label, md(card.date))" @click="removeCard($event, card.key, card.date)"><Icon name="x" :size="11" /></button>
        </div>
        <button v-for="label in layout.labels" :key="label.key" type="button" class="ring-label" :style="{ ...label.style, '--tint': label.tint }"
          :aria-label="t.removeCard(label.text, '')" @click="removeGroup(label.key)">{{ label.text }}<Icon name="x" :size="10" /></button>
        <button type="button" class="ring-go" :aria-label="t.boxGo" :title="t.boxGo" @click="go">
          <span class="go-box"><Icon name="box" :size="26" /></span>
          <span class="go-arrow"><Icon name="arrow-right" :size="26" /></span>
        </button>
        <p v-if="layout.more > 0" class="ring-more">{{ t.more(layout.more) }}</p>
      </div>
      <footer class="spread-foot">
        <p>{{ t.boxHint }}</p>
        <button type="button" class="foot-button" @click="clearAll"><Icon name="trash" :size="13" />{{ t.boxClear }}</button>
        <button type="button" class="foot-button" @click="hide">{{ t.boxClose }}</button>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped src="./CollectionBox.css"></style>

<script setup lang="ts">
/**
 * 首页「今日一问」：概览「我的指标」下面一张主角牌，问今天最该问 AI 的那一个问题——问题本身当标题，右边一把扇开的小牌。
 *
 * - 问什么：`rankSuggestions`（lib/cards/hands/rank.ts）按当天情况排好全部能问的模板，第一个是推荐；
 *   后端的触发码（刚练完、昨晚睡得差、很久没动）也参与排序，句子在这里按语言写。
 * - 右上角的刷新键：换下一问，一直点就一圈圈换，转完回到推荐那个；换到的那一问记到当天（useSuggestCards）。
 *   旧的一问往上走、由清变糊、淡出，新的从下面由糊变清、淡入（只动 transform / opacity / 小范围 filter）。展开着时不换。
 * - 点卡：卡面不动，整张卡往下长开（高度平滑过渡，下面的行跟着往下滑），牌桌（HandTable）：牌从卡面右边那把扇牌里抽出来排开 → 问题（文本框，直接改，改了就是交出去的那句；
 *   旁边「恢复默认」）→ 「换几张牌」「去交给 AI 细调」「按住交给 <所选 AI>」（和交给 AI 页门锁同一套蓄力发射）。
 *   再点卡面 / Esc：牌原路缩回那把扇牌，同时卡往回收（牌一开始往回飞，卡高就跟着收）。不在本地调用任何模型。
 *   卡面开着、收着是同一个样子（标题、扇牌都不挪）：牌从哪把扇牌飞出去就飞回哪里，不会落空。
 * - ×：卡沿弧线缩成「我的指标」标题右边一枚小胶囊（SuggestChip，当天有效；lib/motion/chipFlight.ts 的窗口形变，
 *   圆角不拉伸），同时卡原来占的地方收拢、下面的行滑上去；开着时不先收牌，摊着牌的整张卡一步缩进胶囊。
 *   点胶囊完全倒放。设置 → AI 里能整个关掉。
 *   没有能问的就整张不画。
 * - 去交给 AI 细调：从卡面这一块长成那一页，返回时落回这里（卡展开时整张几乎一屏高，从它长出来看不出在动）。
 *   离开概览时牌桌就地收掉，回来时卡是合上的：返回形变落回的就是整张卡，不会只落回上半截、牌还摊在下面。
 */
import { computed, defineAsyncComponent, nextTick, onDeactivated, onMounted, ref, shallowRef, watch, type ComponentPublicInstance } from 'vue';
import { useRouter } from 'vue-router';
import Icon, { type IconName } from '../Icon.vue';
import { useSuggestText } from './suggest.i18n';
import { useHandsText } from '../cards/hands.i18n';
import { handQuestion, handSport, handSubtitle, handWorkout, useHandDeal } from '../../composables/useHandDeal';
import { bucketOf, rankSuggestions, sportOf, type Hand, type RankedSuggestion, type Sport, type SuggestTemplate } from '../../lib/cards/hands';
import { afterMotion } from '../../lib/motion/budget';
import { suggestAvailable, suggestChip, suggestMorph, useSuggestCards } from '../../composables/useSuggestCards';
import { flyCardChip } from '../../lib/motion/chipFlight';
import HoldSendButton from './HoldSendButton.vue';
import { CLOSE_EASE, OPEN_EASE, paced } from '../../lib/motion/timing';
import { useRevisionReload } from '../../composables/useRevisionReload';
import LastNightStrip from '../sleepJournal/LastNightStrip.vue';
import BedtimeIcon from '../sleepJournal/BedtimeIcon.vue';
import MoodFace from '../sleepJournal/MoodFace.vue';
import { journalSentence } from '../sleepJournal/journalSentence';
import { useSleepJournalText } from '../sleepJournal/sleepJournal.i18n';
import { isBlank, useSleepJournal } from '../../composables/useSleepJournal';
import { dayKey as localDayKey } from '../../lib/aiTask/bridgeScale';
import { armPageMorph } from '../../composables/usePageMorph';
import { useStageSend } from '../../composables/ai/useStageSend';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { backend, isDesktop } from '../../lib/bridge';
import { formatDistance, formatDuration } from '../../lib/format';
import { workoutLabel } from '../../lib/labels';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { metricColor } from '../../lib/metricTone';
import { CARD_RETURN_MS, reducedMotion } from '../../lib/motion/cards';
import type { Suggestion } from '../../types/hands';

const loadTable = () => import('../cards/HandTable.vue');
const HandTable = defineAsyncComponent(loadTable);
const t = useSuggestText();
const ht = useHandsText();
const router = useRouter();
const deal = useHandDeal();
const prefs = useSuggestCards();
const stage = useStageSend();
const draft = useAiTaskDraft();
const desktop = isDesktop();
const signals = shallowRef<Suggestion[]>([]);

const load = async () => {
  try { signals.value = await backend.suggestionCards(); } catch { signals.value = []; }
};
/* 事实一天取一次、全局共用；等首屏动画放完再取。 */
onMounted(() => { void load(); afterMotion(() => { void deal.loadFacts(); }); });
useRevisionReload(() => { void load(); void deal.loadFacts(true); });

/* ---------- 今天能问的几问、现在是哪一问 ---------- */
const ranked = computed<RankedSuggestion[]>(() => {
  const facts = deal.facts.value;
  if (!facts || !prefs.showToday()) return [];
  return rankSuggestions(facts, signals.value.filter((s) => prefs.visible(s.code, s.key)));
});
/* 有没有能问的：胶囊据此决定出不出（缩小着时这张卡不画，但排序照算）。 */
watch(() => ranked.value.length > 0, (has) => { suggestAvailable.value = has; }, { immediate: true });
const mini = computed(() => prefs.minimized());
const index = computed(() => {
  const picked = prefs.picked();
  const at = picked ? ranked.value.findIndex((s) => s.template === picked) : -1;
  return Math.max(0, at);
});
const current = computed(() => ranked.value[index.value] ?? null);

/**
 * 每个模板的一簇小图标（卡面右边那叠小牌上各画一个）和色调。`sport` 是占位：画这一手牌那项运动的图标
 * （跑步小人、自行车、泳姿……），不默认是跑步。
 */
const LOOK: Record<SuggestTemplate, { icons: Array<IconName | 'sport'>; tone: string }> = {
  plan_tomorrow: { icons: ['sun', 'sport', 'heart'], tone: 'var(--accent)' },
  sleep_review: { icons: ['moon', 'heart'], tone: 'var(--sleep)' },
  review_workout: { icons: ['sport', 'clock'], tone: metricColor('training_load') },
  race_review: { icons: ['star', 'sport', 'moon'], tone: metricColor('training_load') },
  distance_best: { icons: ['star', 'pace'], tone: metricColor('training_load') },
  same_route: { icons: ['map', 'sport'], tone: metricColor('steps') },
  recovery_nights: { icons: ['hrv', 'moon', 'warning'], tone: metricColor('hrv') },
  comeback: { icons: ['timeline-flag', 'sport'], tone: metricColor('steps') },
  session_review: { icons: ['sport', 'heart', 'clock'], tone: metricColor('training_load') },
};
const SPORT_ICON: Record<Sport, IconName> = {
  run: 'run', ride: 'bike', swim: 'swim', hike: 'mountain', strength: 'training-load', mobility: 'activity', other: 'activity',
};
const iconsOf = (s: RankedSuggestion): IconName[] => {
  const sport = handSport(s.hand);
  const icons = LOOK[s.template].icons.map((icon) => (icon === 'sport' ? (sport ? SPORT_ICON[sport] : 'activity') : icon));
  return [...new Set(icons)];
};

const md = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const titleOf = (s: RankedSuggestion): string => {
  const tt = t.value;
  switch (s.template) {
    case 'review_workout': {
      const w = handWorkout(s.hand);
      if (!w) return ht.value.kind.review_workout;
      const amount = w.distance_m ? formatDistance(w.distance_m) : formatDuration(w.duration_s / 60);
      const what = workoutLabel(w.workout_type);
      return w.date === deal.facts.value?.today ? tt.reviewToday(amount, what) : tt.reviewOn(md(w.date), amount, what);
    }
    case 'race_review': {
      // 日期和项目取自同一次运动（比赛那张牌），不会写成「那天的骑行」而那天其实是跑步。
      const w = handWorkout(s.hand);
      if (!w) return ht.value.kind.race_review;
      const bucket = sportOf(w.workout_type) === 'run' ? bucketOf(w) : null;
      const what = bucket ? ht.value.bucket[bucket.key] : workoutLabel(w.workout_type);
      return tt.raceTitle(md(w.date), what);
    }
    case 'distance_best': return tt.bestTitle(handSubtitle(s.hand, ht.value) ?? '');
    case 'same_route': {
      const sport = handSport(s.hand);
      return sport === 'ride' ? tt.sameRouteRide : sport === 'hike' ? tt.sameRouteHike : tt.title.same_route;
    }
    case 'session_review': return tt.sessionTitle(workoutLabel(String(s.hand.params.type)));
    case 'comeback': return tt.comebackTitle(s.suggestion?.code === 'long_idle' ? s.suggestion.days : 0);
    default: return tt.title[s.template];
  }
};
/** 小字：和项目有关的两问按这一手牌的运动说（骑行、游泳、徒步各一句），其余照模板。 */
const subOf = (s: RankedSuggestion): string => {
  const tt = t.value;
  const sport = handSport(s.hand);
  if (s.template === 'distance_best' && sport === 'ride') return tt.sportSub.bestRide;
  if (s.template === 'distance_best' && sport === 'swim') return tt.sportSub.bestSwim;
  if (s.template === 'same_route' && sport === 'ride') return tt.sportSub.routeRide;
  if (s.template === 'same_route' && sport === 'hike') return tt.sportSub.routeHike;
  return tt.sub[s.template];
};
/* 「昨晚睡得怎么样」：昨晚记了睡前日志（醒来那天 = 今天）就接在问题后面一起交出去。 */
const jt = useSleepJournalText();
const sleepJournal = useSleepJournal();
const wakeToday = computed(() => deal.facts.value?.today ?? localDayKey());
const lastNight = computed(() => sleepJournal.entries.value.get(wakeToday.value) ?? null);
const sleepReviewQuestion = () => {
  const extra = journalSentence(lastNight.value, jt.value);
  return extra ? `${t.value.sleepReviewQuestion}${jt.value.sentenceGap}${extra}` : t.value.sleepReviewQuestion;
};
/* 卡面合着时也要知道昨晚记没记（扇形里那张睡前牌）：轮到这一问就读一下今天这条。 */
const isSleepReview = computed(() => current.value?.template === 'sleep_review');
watch([isSleepReview, wakeToday], ([on, day]) => { if (on) void sleepJournal.loadRange(day, day); }, { immediate: true });
/** 扇形最后那张睡前牌：画第一个睡前标签，只记了心情就画那张脸。 */
const journalMini = computed(() => {
  const entry = lastNight.value;
  if (!isSleepReview.value || isBlank(entry)) return null;
  return { tag: entry!.behaviors[0] ?? null, mood: entry!.mood };
});
const questionOf = (s: RankedSuggestion, hand: Hand) =>
  (s.template === 'sleep_review' ? sleepReviewQuestion() : handQuestion(hand, ht.value, s.suggestion));
const instant = reducedMotion();
const face = computed(() => {
  const s = current.value;
  if (!s) return null;
  return { key: s.template, title: titleOf(s), sub: `${subOf(s)} · ${ht.value.cardCount(s.hand.cards.length)}`, icons: iconsOf(s), tone: LOOK[s.template].tone };
});

/* ---------- 换一问 ---------- */
const spins = ref(0);
const open = ref(false);
const next = () => {
  if (open.value || ranked.value.length < 2) return;
  spins.value += 1;
  const to = ranked.value[(index.value + 1) % ranked.value.length]!;
  prefs.pick(to.template);
};

/* ---------- 展开：牌从卡面那叠小牌里抽出来 ---------- */
const root = ref<HTMLElement | null>(null);
const faceEl = ref<HTMLElement | null>(null);
const stack = ref<HTMLElement | null>(null);
const setStack = (el: Element | ComponentPublicInstance | null) => { stack.value = el instanceof HTMLElement ? el : null; };
const table = ref<{ close: (options?: { quiet?: boolean }) => Promise<void>; isClosing: () => boolean } | null>(null);
/** 展开时摊开的那一手（换牌后跟着变）。 */
const hand = shallowRef<Hand | null>(null);
const showBench = ref(false);
const sendState = ref<'idle' | 'sending' | 'sent' | 'failed'>('idle');

/* ---------- 卡高：开合时整张卡的高度平滑过渡，下面的行跟着滑（一张卡一个高度动画，开合各一次） ---------- */
const OPEN_MS = paced(460);
let sizing: Animation | null = null;
/** 卡高从 `from`（默认此刻看到的高度）平滑过渡到 `to`。 */
const resize = (to: number, duration: number, easing: string, start?: number) => {
  const el = root.value;
  if (!el) return null;
  const from = start ?? el.getBoundingClientRect().height;
  sizing?.cancel();
  el.style.height = '';
  if (instant || Math.abs(from - to) < 1) { sizing = null; return null; }
  sizing = el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration, easing, fill: 'forwards' });
  return sizing;
};
const releaseSize = () => { sizing?.cancel(); sizing = null; if (root.value) root.value.style.height = ''; };
/** 牌桌挂上了（异步组件，第一次要等它的代码块）。 */
const tableMounted = async () => {
  for (let i = 0; i < 12 && !table.value; i += 1) await nextTick();
};
/** 牌桌挂上后还要排一两帧（量台面宽度、排牌位）：等内容高度连着两帧不变再量终点，量早了长到一半会一下跳满。 */
const settledHeight = async (el: HTMLElement) => {
  let last = -1;
  for (let i = 0; i < 10; i += 1) {
    await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    const height = el.scrollHeight;
    if (height === last) return height;
    last = height;
  }
  return last;
};
let opening = false;
const toggle = async () => {
  if (open.value) { if (!table.value?.isClosing()) await table.value?.close(); return; }
  const s = current.value;
  if (!s || opening || suggestMorph.value !== 'idle') return;
  opening = true;
  try {
    const [refined] = await Promise.all([deal.refineRoute({ ok: true, hand: s.hand }), loadTable()]);
    hand.value = refined.ok ? refined.hand : s.hand;
    void deal.loadLines(hand.value);
    showBench.value = false;
    sendState.value = 'idle';
    // 先按住此刻的高度再挂牌桌：挂上的那几帧卡不会一下撑开，量好长开后的高度再平滑长过去。
    const el = root.value;
    const from = el?.getBoundingClientRect().height ?? 0;
    if (el && !instant) el.style.height = `${from}px`;
    open.value = true;
    await tableMounted();
    if (!el || instant) return;
    const to = await settledHeight(el);
    if (!open.value) { el.style.height = ''; return; }
    const grow = resize(to, OPEN_MS, OPEN_EASE, from);
    // 长到了就放开：之后换牌、改问题时卡跟着内容自己变高。
    void grow?.finished.then(() => { if (sizing === grow) releaseSize(); }, () => undefined);
  } finally {
    opening = false;
  }
};
/** 牌开始往回飞：卡同时收回卡面那么高。 */
const onReturning = () => { if (faceEl.value) resize(faceEl.value.offsetHeight, CARD_RETURN_MS, CLOSE_EASE); };
const onChange = (next: Hand) => { hand.value = next; };
const onClose = async () => {
  open.value = false;
  showBench.value = false;
  await nextTick();
  releaseSize();
};
/* 换到别的一问（或数据刷新后这一问没了）：先收起。 */
watch(() => current.value?.template, () => { if (open.value) onClose(); });

const question = computed(() => (current.value && hand.value ? questionOf(current.value, hand.value) : ''));
/* 问题可以直接改：没改过就跟着这一手牌重算（换牌后问题跟着变），改过就留着；换到别的一问时清掉（那是另一个问题了）。 */
const edited = ref<string | null>(null);
const prompt = computed({
  get: () => edited.value ?? question.value,
  set: (value: string) => { edited.value = value === question.value ? null : value; },
});
watch(() => current.value?.template, () => { edited.value = null; });
const resetPrompt = () => { edited.value = null; };
/** 问题里接上的睡前日志那句：用户改问题时只要那句还原样在，就照样标出来。 */
const promptMark = computed(() => {
  const extra = isSleepReview.value ? journalSentence(lastNight.value, jt.value) : '';
  const text = prompt.value;
  const at = extra ? text.lastIndexOf(extra) : -1;
  return at < 0 ? null : { before: text.slice(0, at), mark: extra, after: text.slice(at + extra.length) };
});
/** 把这一手和问题写进交给 AI 的任务；后端触发的那一问记成「这一次用过了」。 */
const commit = () => {
  const s = current.value;
  if (!s || !hand.value) return false;
  deal.startTask(hand.value, prompt.value.trim() || question.value);
  if (s.suggestion) prefs.close(s.suggestion.code, s.suggestion.key);
  return true;
};
const refine = async () => {
  if (!commit()) return;
  // 从卡面这一块长出去：展开的整张卡差不多一屏高，从它长成整页几乎看不出动（以前看着像硬切）。返回时落回这里。
  if (faceEl.value?.isConnected) armPageMorph(faceEl.value, '/ai');
  await router.push('/ai');
};
const providerName = computed(() => stage.provider.value.label);
const send = async () => {
  if (!desktop || sendState.value === 'sending' || !commit()) return;
  sendState.value = 'sending';
  await nextTick();
  sendState.value = (await stage.sendNow()) ? 'sent' : 'failed';
};
const sendNote = computed(() => {
  if (!desktop) return t.value.desktopOnly;
  if (sendState.value === 'sending') return t.value.sending;
  if (sendState.value === 'sent') return t.value.sent(providerName.value);
  if (sendState.value === 'failed') return draft.lastError.value ?? t.value.sendFailed;
  if (holdNudged.value) return t.value.holdHint;
  return '';
});
/** 只点了一下「按住交给」：提示一句要按住，过一会儿自己消失。 */
const holdNudged = ref(false);
let nudgeTimer = 0;
const onNudge = () => {
  holdNudged.value = true;
  window.clearTimeout(nudgeTimer);
  nudgeTimer = window.setTimeout(() => { holdNudged.value = false; }, 2400);
};

/* ---------- ×：缩成「我的指标」旁边的小胶囊；胶囊点开时从它长回来（lib/motion/chipFlight.ts） ---------- */
const FLY_MS = paced(520);
/** 卡的圆角（整段形变用它；胶囊那一端浏览器自动夹成半圆）。 */
const radiusOf = (el: HTMLElement) => Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 26;
/**
 * 卡在概览网格里占的那一格收拢 / 让开：卡高在原高和 0 之间过渡。网格的行距收不掉（0 高的一行照样夹着上下两道行距），
 * 所以下一行同时借走一道行距（负的上外边距）；收完卡撤掉、借的还回去，前后版面一样，下面的行一路平滑、最后不跳。
 */
const slotMotion = (el: HTMLElement, closing: boolean): Animation[] => {
  const gap = Number.parseFloat(getComputedStyle(el.parentElement ?? el).rowGap) || 0;
  const timing = { duration: FLY_MS, easing: OPEN_EASE, fill: 'forwards' as const };
  const order = <T,>(frames: [T, T]) => (closing ? frames : [frames[1], frames[0]]);
  const motions = [el.animate(order([{ height: `${el.getBoundingClientRect().height}px` }, { height: '0px' }]), timing)];
  const below = el.nextElementSibling;
  if (below instanceof HTMLElement && gap) motions.push(below.animate(order([{ marginTop: '0px' }, { marginTop: `${-gap}px` }]), timing));
  return motions;
};
const minimize = async () => {
  if (suggestMorph.value !== 'idle' || opening || table.value?.isClosing()) return;
  const el = root.value;
  const chip = suggestChip.value;
  if (instant || !el || !chip) {
    if (open.value) await table.value?.close({ quiet: true });
    prefs.minimize();
    return;
  }
  // 开着也不先收牌：摊着牌的整张卡就是起点，一步缩进胶囊（先收牌、再回扇牌、再缩，三段太拖）。
  suggestMorph.value = 'to-chip';
  releaseSize();
  const flight = flyCardChip({ from: el, to: chip, radius: radiusOf(el), duration: FLY_MS, easing: OPEN_EASE });
  el.style.visibility = 'hidden';
  const slot = slotMotion(el, true);
  await flight.finished;
  // 卡撤掉（顺手拆掉藏着的牌桌）、借走的行距还回去、胶囊亮出来、板撤掉：都落在同一帧。
  // 撤卡时形变还没回到 idle：过渡不走 CSS，当场就撤，不会多留两帧。
  open.value = false;
  showBench.value = false;
  prefs.minimize();
  await nextTick();
  for (const motion of slot) motion.cancel();
  suggestMorph.value = 'idle';
  await nextTick();
  flight.remove();
};
/* 点了胶囊：卡挂上的这一刻（还没画出来）拍下长开后的样子，藏起来让出位置，板从胶囊飞过来。 */
watch(root, (el) => {
  if (!el || suggestMorph.value !== 'from-chip') return;
  const chip = suggestChip.value;
  if (!chip) { suggestMorph.value = 'idle'; return; }
  const flight = flyCardChip({ from: chip, to: el, radius: radiusOf(el), duration: FLY_MS, easing: OPEN_EASE });
  el.style.visibility = 'hidden';
  const slot = slotMotion(el, false);
  void flight.finished.then(() => {
    for (const motion of slot) motion.cancel();
    el.style.visibility = '';
    suggestMorph.value = 'idle';
    flight.remove();
  });
}, { flush: 'post' });
/* 离开概览（去交给 AI 细调、切到别的页）：概览是缓存页，牌桌就地收掉，回来时卡是合上的。 */
onDeactivated(() => {
  if (!open.value) return;
  open.value = false;
  showBench.value = false;
  releaseSize();
});
</script>

<template>
  <Transition name="ask-card" :css="suggestMorph === 'idle'">
    <section v-if="face && !mini" ref="root" :class="['ask', { open }]" :style="{ '--ask-tone': face.tone }" role="group" :aria-label="t.aria">
      <div ref="faceEl" class="ask-face">
        <button type="button" class="ask-main" :aria-expanded="open" :aria-label="open ? t.collapse : t.expand" @click="toggle">
          <Transition :name="instant ? 'ask-fade' : 'ask-swap'" mode="out-in">
            <span :key="face.key" class="ask-body">
              <span class="ask-text">
                <span class="ask-eyebrow"><Icon :name="face.icons[0]!" :size="14" />{{ t.aria }}</span>
                <strong>{{ face.title }}</strong>
                <small>{{ face.sub }}</small>
              </span>
              <span :ref="setStack" class="ask-fan" aria-hidden="true" :style="{ '--n': face.icons.length + (journalMini ? 1 : 0) }">
                <span v-for="(icon, i) in face.icons" :key="icon" class="ask-mini" :style="{ '--i': i }"><Icon :name="icon" :size="18" /></span>
                <!-- 昨晚记了睡前日志：多一张睡前牌（蓝边、右上角一个小点），它那句话会接在问题后面。 -->
                <span v-if="journalMini" class="ask-mini journal" :style="{ '--i': face.icons.length }">
                  <BedtimeIcon v-if="journalMini.tag" :code="journalMini.tag" :size="20" /><MoodFace v-else-if="journalMini.mood" :code="journalMini.mood" :size="22" />
                </span>
              </span>
            </span>
          </Transition>
        </button>
        <div class="ask-tools">
          <button type="button" class="ask-tool" :disabled="open || ranked.length < 2" :aria-label="t.refresh" :title="t.refresh" @click="next">
            <span class="ask-refresh-icon" :style="{ rotate: `${-360 * spins}deg` }"><Icon name="refresh" :size="15" /></span>
          </button>
          <button type="button" class="ask-tool" :aria-label="t.minimize" :title="t.minimize" @click="minimize"><Icon name="x" :size="14" /></button>
        </div>
      </div>
      <div v-if="open && hand && current" class="ask-open">
        <HandTable ref="table" :hand="hand" :title="face.title" :lines="deal.lines.value" :anchor="stack" :show-bench="showBench"
          @change="onChange" @returning="onReturning" @close="onClose">
          <template #foot>
            <LastNightStrip v-if="current.template === 'sleep_review'" :date="wakeToday" />
            <div class="ask-prompt">
              <div class="ask-field">
                <div v-if="promptMark" class="ask-shadow" aria-hidden="true">{{ promptMark.before }}<mark :key="promptMark.mark">{{ promptMark.mark }}</mark>{{ promptMark.after }}&#8203;</div>
                <textarea v-model="prompt" class="ask-question" rows="3" :aria-label="t.promptLabel" spellcheck="false" />
              </div>
              <button v-if="edited !== null" type="button" class="ask-reset" @click="resetPrompt"><Icon name="undo" :size="13" />{{ t.reset }}</button>
            </div>
            <div class="ask-actions">
              <button type="button" :class="['ask-action', { on: showBench }]" :aria-pressed="showBench" @click="showBench = !showBench">
                <Icon name="cards" :size="15" /><span>{{ showBench ? t.swapDone : t.swap }}</span>
              </button>
              <button type="button" class="ask-action" @click="refine"><Icon name="sliders" :size="15" /><span>{{ t.refine }}</span></button>
              <HoldSendButton :label="t.holdTo(providerName)" :icon="stage.provider.value.localIcon" :title="t.holdHint"
                :disabled="!desktop || !hand.cards.length || sendState === 'sending'" @go="send" @nudge="onNudge" />
            </div>
            <p v-if="sendNote" :class="['ask-note', sendState]" role="status">{{ sendNote }}</p>
          </template>
        </HandTable>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
/* 主角牌：首页「我的指标」下面整行一张卡，问题当标题；右上角一抹这一问的色调。 */
.ask { position: relative; border-radius: var(--radius-lg); overflow: hidden;
  background: radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--ask-tone) 18%, transparent), transparent 62%), var(--mat-card);
  box-shadow: var(--mat-rim, inset 0 0 0 1px var(--mat-line)), var(--mat-shadow, 0 24px 40px -28px rgb(0 0 0 / .6)); }
.ask-face { position: relative; }
.ask-main { display: flex; width: 100%; min-height: 148px; padding: 22px 26px 22px 24px; border: 0; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
.ask-main:focus-visible { outline: 2px solid var(--focus); outline-offset: -4px; border-radius: var(--radius-lg); }
.ask-body { display: flex; flex: 1; align-items: center; gap: 20px; min-width: 0; }
.ask-text { display: grid; flex: 1; gap: 6px; align-content: center; min-width: 0; padding-right: 64px; }
.ask-eyebrow { display: inline-flex; align-items: center; gap: 7px; color: var(--ask-tone); font-size: var(--fs-xs); font-weight: 700; letter-spacing: .06em; }
.ask-text strong { color: var(--ink); font-size: var(--fs-3xl); font-weight: 700; line-height: 1.22; text-wrap: balance; overflow-wrap: anywhere; }
.ask-text small { color: var(--subtle); font-size: var(--fs-sm); font-weight: 600; overflow-wrap: anywhere; }
/* 右边一把扇开的小牌：这一手的缩影，每张画一个图标。展开时牌从这里抽出来、收起时缩回这里。 */
.ask-fan { position: relative; flex: none; width: calc(74px + (var(--n) - 1) * 26px); height: 104px; margin-top: 28px; }
.ask-mini { position: absolute; bottom: 0; left: calc(var(--i) * 26px); display: grid; place-items: start; padding: 9px; width: 74px; height: 98px; border-radius: 12px;
  background: var(--mat-raised); color: var(--ask-tone);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ask-tone) 28%, transparent), 0 14px 24px -16px rgb(0 0 0 / .7);
  transform-origin: 50% 120%; rotate: calc((var(--i) - (var(--n) - 1) / 2) * 8deg); }
/* 睡前牌：睡眠的蓝，右上角一个小点。 */
.ask-mini.journal { background: linear-gradient(160deg, var(--mat-raised), color-mix(in srgb, var(--sleep) 12%, var(--mat-raised)));
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--sleep) 70%, transparent), 0 14px 24px -16px rgb(0 0 0 / .7); }
.ask-mini.journal::after { content: ''; position: absolute; top: 7px; right: 7px; width: 7px; height: 7px; border-radius: 50%; background: var(--sleep); }
.ask-tools { position: absolute; top: 12px; right: 12px; display: flex; gap: 4px; }
.ask-tool { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 50%;
  background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--subtle); cursor: pointer; transition: background 140ms ease, color 140ms ease, opacity 160ms ease; }
.ask-tool:hover:not(:disabled) { background: color-mix(in srgb, var(--ask-tone) 16%, transparent); color: var(--ink); }
.ask-tool:disabled { cursor: default; opacity: .4; }
.ask-tool:focus-visible, .ask-action:focus-visible, .ask-reset:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
/* 每点一下逆时针转一圈（只动 rotate）。 */
.ask-refresh-icon { display: grid; transition: rotate 560ms cubic-bezier(.32, .72, .24, 1); }
.ask-open { padding: 0 20px 18px; }
.ask-prompt { position: relative; display: grid; }
/* 底色铺在外层：影子在 textarea 下面，textarea 本身透明。影子和 textarea 同字体、同内边距、同折行，字透明，只露出那句的下划线。 */
.ask-field { position: relative; display: grid; border-radius: 14px; background: color-mix(in srgb, var(--ink) 5%, transparent); }
.ask-question, .ask-shadow { padding: 12px 14px; font: var(--fs-sm) / 1.6 var(--font-sans); letter-spacing: normal; white-space: pre-wrap; overflow-wrap: break-word; }
.ask-question { position: relative; width: 100%; min-height: 5.2em; field-sizing: content; border: 0; border-radius: 14px; resize: none;
  background: transparent; box-shadow: inset 0 0 0 1px var(--mat-line); color: var(--ink); transition: box-shadow 160ms ease; }
.ask-shadow { position: absolute; inset: 0; overflow: hidden; color: transparent; pointer-events: none; user-select: none; }
.ask-shadow mark { border-radius: 3px; background: transparent; color: transparent;
  text-decoration: underline 2px var(--sleep); text-underline-offset: 4px; text-decoration-skip-ink: none; animation: ask-ink 700ms ease; }
/* 那句刚接上（或换了内容）：先泛一层淡蓝再褪掉。 */
@keyframes ask-ink { from { background: color-mix(in srgb, var(--sleep) 24%, transparent); } to { background: transparent; } }
.ask-question:hover { box-shadow: inset 0 0 0 1px var(--line-strong); }
.ask-question:focus-visible { outline: none; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 70%, transparent); }
.ask-reset { justify-self: start; display: inline-flex; align-items: center; gap: 5px; margin-top: 6px; padding: 2px 6px; border: 0; border-radius: 8px;
  background: none; color: var(--subtle); font: 650 var(--fs-xs) var(--font-sans); cursor: pointer; }
.ask-reset:hover { color: var(--ink); }
.ask-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 8px; }
.ask-action { display: inline-flex; align-items: center; gap: 7px; min-height: 38px; padding: 0 14px; border: 1px solid var(--line-strong); border-radius: 999px;
  background: transparent; color: var(--ink); font: 600 var(--fs-sm) var(--font-sans); cursor: pointer; transition: transform 160ms ease, background 140ms ease, opacity 160ms ease; }
.ask-action:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 6%, transparent); }
.ask-action:active:not(:disabled) { transform: scale(.97); }
.ask-action.on { border-color: var(--ask-tone); color: var(--ask-tone); }
.ask-action:disabled { cursor: default; opacity: .45; }
.ask-note { margin: 0; color: var(--subtle); font-size: var(--fs-xs); text-align: right; overflow-wrap: anywhere; }
.ask-note.sent { color: var(--good, var(--accent)); }
.ask-note.failed { color: var(--danger); }

/* 换一问：旧的往上走、由清变糊、淡出；新的从下面由糊变清、淡入，两段错开不叠影。 */
.ask-swap-leave-active { transition: opacity 200ms ease, transform 220ms cubic-bezier(.4, 0, .8, .6), filter 200ms ease; }
.ask-swap-leave-to { opacity: 0; transform: translateY(-12px); filter: blur(6px); }
.ask-swap-enter-active { transition: opacity 320ms ease 80ms, transform 440ms cubic-bezier(.2, .8, .2, 1) 80ms, filter 340ms ease 80ms; }
.ask-swap-enter-from { opacity: 0; transform: translateY(14px); filter: blur(6px); }
.ask-fade-enter-active, .ask-fade-leave-active { transition: opacity 160ms ease; }
.ask-fade-enter-from, .ask-fade-leave-to { opacity: 0; }
/* 整张卡头一次出现：原地淡入。缩成胶囊、从胶囊长回来走窗口形变（chipFlight），那时不加这层过渡。 */
.ask-card-enter-active { transition: opacity 360ms ease; }
.ask-card-enter-from { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .ask-refresh-icon { transition-duration: 1ms; } .ask-shadow mark { animation: none; } }
@container (max-width: 560px) {
  .ask-main { min-height: 0; padding: 18px 18px 16px; }
  .ask-fan { display: none; }
  .ask-text { padding-right: 70px; }
  .ask-text strong { font-size: var(--fs-2xl); }
  .ask-actions { justify-content: stretch; }
  .ask-action { flex: 1 1 auto; justify-content: center; }
}
</style>

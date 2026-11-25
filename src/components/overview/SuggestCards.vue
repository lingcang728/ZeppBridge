<script setup lang="ts">
/**
 * 首页「今日一问」：概览「我的指标」下面只有一张卡，问今天最该问 AI 的那一个问题。
 *
 * - 问什么：`rankSuggestions`（lib/cards/hands/rank.ts）按当天情况排好全部能问的模板，第一个是推荐；
 *   后端的触发码（刚练完、昨晚睡得差、很久没动）也参与排序，句子在这里按语言写。
 * - 左边的刷新键：换下一问，一直点就一圈圈换，转完回到推荐那个；换到的那一问记到当天（useSuggestCards）。
 *   旧的一问往上走、由清变糊、淡出，新的从下面由糊变清、淡入（只动 transform / opacity / 小范围 filter）。展开着时不换。
 * - 点卡：原地往下展开（HandTable）：牌从卡面左边那叠小牌里抽出来排开 → 完整的问题 → 「换几张牌」「去交给 AI 细调」
 *   「复制给 <所选 AI>」。再点一下 / Esc：牌原路缩回那叠小牌。不在本地调用任何模型。
 * - ×：今天不再出这张卡；设置 → AI 里能整个关掉。没有能问的就整张不画。
 */
import { computed, defineAsyncComponent, nextTick, onMounted, ref, shallowRef, watch, type ComponentPublicInstance } from 'vue';
import { useRouter } from 'vue-router';
import Icon, { type IconName } from '../Icon.vue';
import FoldTransition from '../FoldTransition.vue';
import { useSuggestText } from './suggest.i18n';
import { useHandsText } from '../cards/hands.i18n';
import { handQuestion, handSubtitle, useHandDeal } from '../../composables/useHandDeal';
import { bucketOf, rankSuggestions, type Hand, type RankedSuggestion, type SuggestTemplate } from '../../lib/cards/hands';
import { afterMotion } from '../../lib/motion/budget';
import { useSuggestCards } from '../../composables/useSuggestCards';
import { useRevisionReload } from '../../composables/useRevisionReload';
import LastNightStrip from '../sleepJournal/LastNightStrip.vue';
import { journalSentence } from '../sleepJournal/journalSentence';
import { useSleepJournalText } from '../sleepJournal/sleepJournal.i18n';
import { useSleepJournal } from '../../composables/useSleepJournal';
import { dayKey as localDayKey } from '../../lib/aiTask/bridgeScale';
import { armPageMorph } from '../../composables/usePageMorph';
import { useStageSend } from '../../composables/ai/useStageSend';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { backend, isDesktop } from '../../lib/bridge';
import { formatDistance, formatDuration } from '../../lib/format';
import { workoutLabel } from '../../lib/labels';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { metricColor } from '../../lib/metricTone';
import { reducedMotion } from '../../lib/motion/cards';
import type { Suggestion } from '../../types/hands';

const HandTable = defineAsyncComponent(() => import('../cards/HandTable.vue'));
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
const index = computed(() => {
  const picked = prefs.picked();
  const at = picked ? ranked.value.findIndex((s) => s.template === picked) : -1;
  return Math.max(0, at);
});
const current = computed(() => ranked.value[index.value] ?? null);

/** 每个模板的一簇小图标（卡面左边那叠小牌上各画一个）和色调。 */
const LOOK: Record<SuggestTemplate, { icons: IconName[]; tone: string }> = {
  plan_tomorrow: { icons: ['sun', 'run', 'heart'], tone: 'var(--accent)' },
  sleep_review: { icons: ['moon', 'heart'], tone: 'var(--sleep)' },
  review_workout: { icons: ['run', 'clock'], tone: metricColor('training_load') },
  race_review: { icons: ['star', 'run', 'moon'], tone: metricColor('training_load') },
  distance_best: { icons: ['star', 'pace'], tone: metricColor('training_load') },
  same_route: { icons: ['map', 'run'], tone: metricColor('steps') },
  recovery_nights: { icons: ['hrv', 'moon', 'warning'], tone: metricColor('hrv') },
  comeback: { icons: ['timeline-flag', 'run'], tone: metricColor('steps') },
};

const md = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const anchorWorkout = (hand: Hand) => {
  const card = hand.cards.find((c) => c.role === 'anchor' || c.role === 'race');
  return card?.kind === 'workout' ? card.workout : null;
};
const titleOf = (s: RankedSuggestion): string => {
  const tt = t.value;
  switch (s.template) {
    case 'review_workout': {
      const w = anchorWorkout(s.hand);
      if (!w) return ht.value.kind.review_workout;
      const amount = w.distance_m ? formatDistance(w.distance_m) : formatDuration(w.duration_s / 60);
      const what = workoutLabel(w.workout_type);
      return w.date === deal.facts.value?.today ? tt.reviewToday(amount, what) : tt.reviewOn(md(w.date), amount, what);
    }
    case 'race_review': {
      const w = anchorWorkout(s.hand);
      const bucket = w ? bucketOf(w) : null;
      const what = bucket ? ht.value.bucket[bucket.key] : workoutLabel(w?.workout_type ?? 'run');
      return tt.raceTitle(md(String(s.hand.params.date)), what);
    }
    case 'distance_best': return tt.bestTitle(handSubtitle(s.hand, ht.value) ?? '');
    case 'comeback': return tt.comebackTitle(s.suggestion?.code === 'long_idle' ? s.suggestion.days : 0);
    default: return tt.title[s.template];
  }
};
/* 「昨晚睡得怎么样」：昨晚记了睡前日志（醒来那天 = 今天）就接在问题后面一起交出去。 */
const jt = useSleepJournalText();
const sleepJournal = useSleepJournal();
const wakeToday = computed(() => deal.facts.value?.today ?? localDayKey());
const sleepReviewQuestion = () => {
  const extra = journalSentence(sleepJournal.entries.value.get(wakeToday.value) ?? null, jt.value);
  return extra ? `${t.value.sleepReviewQuestion}${jt.value.sentenceGap}${extra}` : t.value.sleepReviewQuestion;
};
const questionOf = (s: RankedSuggestion, hand: Hand) =>
  (s.template === 'sleep_review' ? sleepReviewQuestion() : handQuestion(hand, ht.value, s.suggestion));
const face = computed(() => {
  const s = current.value;
  if (!s) return null;
  return { key: s.template, title: titleOf(s), sub: `${t.value.sub[s.template]} · ${ht.value.cardCount(s.hand.cards.length)}`, ...LOOK[s.template] };
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
const stack = ref<HTMLElement | null>(null);
const setStack = (el: Element | ComponentPublicInstance | null) => { stack.value = el instanceof HTMLElement ? el : null; };
const table = ref<{ close: () => Promise<void>; isClosing: () => boolean } | null>(null);
/** 展开时摊开的那一手（换牌后跟着变）。 */
const hand = shallowRef<Hand | null>(null);
const showBench = ref(false);
const sendState = ref<'idle' | 'sending' | 'sent' | 'failed'>('idle');

const toggle = async () => {
  if (open.value) { if (!table.value?.isClosing()) await table.value?.close(); return; }
  const s = current.value;
  if (!s) return;
  const refined = await deal.refineRoute({ ok: true, hand: s.hand });
  hand.value = refined.ok ? refined.hand : s.hand;
  void deal.loadLines(hand.value);
  showBench.value = false;
  sendState.value = 'idle';
  open.value = true;
};
const onChange = (next: Hand) => { hand.value = next; };
const onClose = () => { open.value = false; showBench.value = false; };
/* 换到别的一问（或数据刷新后这一问没了）：先收起。 */
watch(() => current.value?.template, () => { if (open.value) onClose(); });

const question = computed(() => (current.value && hand.value ? questionOf(current.value, hand.value) : ''));
/** 把这一手和问题写进交给 AI 的任务；后端触发的那一问记成「这一次用过了」。 */
const commit = () => {
  const s = current.value;
  if (!s || !hand.value) return false;
  deal.startTask(hand.value, question.value);
  if (s.suggestion) prefs.close(s.suggestion.code, s.suggestion.key);
  return true;
};
const refine = async () => {
  if (!commit()) return;
  if (root.value?.isConnected) armPageMorph(root.value, '/ai', { anySize: true });
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
  return '';
});
const dismiss = () => { prefs.quietToday(); };
const instant = reducedMotion();
</script>

<template>
  <Transition name="ask-card">
    <section v-if="face" ref="root" :class="['ask', { open }]" :style="{ '--ask-tone': face.tone }" role="group" :aria-label="t.aria">
      <div class="ask-face">
        <button type="button" class="ask-refresh" :disabled="open || ranked.length < 2" :aria-label="t.refresh" :title="t.refresh" @click="next">
          <span class="ask-refresh-icon" :style="{ rotate: `${-360 * spins}deg` }"><Icon name="refresh" :size="16" /></span>
        </button>
        <button type="button" class="ask-main" :aria-expanded="open" :aria-label="open ? t.collapse : t.expand" @click="toggle">
          <Transition :name="instant ? 'ask-fade' : 'ask-swap'" mode="out-in">
            <span :key="face.key" class="ask-body">
              <span :ref="setStack" class="ask-stack" aria-hidden="true">
                <span v-for="(icon, i) in face.icons" :key="icon" class="ask-mini" :style="{ '--i': i, '--n': face.icons.length }"><Icon :name="icon" :size="13" /></span>
              </span>
              <span class="ask-text">
                <strong>{{ face.title }}</strong>
                <small>{{ face.sub }}</small>
              </span>
            </span>
          </Transition>
          <Icon class="ask-chevron" name="chevron-down" :size="16" />
        </button>
        <button v-if="!open" type="button" class="ask-close" :aria-label="t.dismiss" :title="t.dismiss" @click="dismiss"><Icon name="x" :size="14" /></button>
      </div>
      <FoldTransition :duration="380">
        <div v-if="open && hand && current" class="ask-open">
          <HandTable ref="table" :hand="hand" :title="face.title" :lines="deal.lines.value" :anchor="stack" :show-bench="showBench"
            @change="onChange" @close="onClose">
            <template #foot>
              <LastNightStrip v-if="current.template === 'sleep_review'" :date="wakeToday" />
              <p class="ask-question">{{ question }}</p>
              <div class="ask-actions">
                <button type="button" :class="['ask-action', { on: showBench }]" :aria-pressed="showBench" @click="showBench = !showBench">
                  <Icon name="cards" :size="15" /><span>{{ showBench ? t.swapDone : t.swap }}</span>
                </button>
                <button type="button" class="ask-action" @click="refine"><Icon name="sliders" :size="15" /><span>{{ t.refine }}</span></button>
                <button type="button" class="ask-action primary" :disabled="!desktop || !hand.cards.length || sendState === 'sending'" @click="send">
                  <img class="ask-provider" :src="stage.provider.value.localIcon" alt="" /><span>{{ t.sendTo(providerName) }}</span>
                </button>
              </div>
              <p v-if="sendNote" :class="['ask-note', sendState]" role="status">{{ sendNote }}</p>
            </template>
          </HandTable>
        </div>
      </FoldTransition>
    </section>
  </Transition>
</template>

<style scoped>
/* 和跑后打分那块同一种中性小板：不铺底色、不抬卡板，概览的主角仍是下面的卡。 */
.ask { position: relative; border-radius: var(--radius-md); background: color-mix(in srgb, var(--ink) 4%, transparent); box-shadow: inset 0 0 0 1px var(--mat-line); }
.ask-face { position: relative; display: flex; align-items: center; gap: 4px; padding: 8px 8px 8px 10px; }
.ask-refresh, .ask-close { display: grid; place-items: center; flex: none; border: 0; border-radius: 50%; background: transparent; color: var(--subtle); cursor: pointer;
  transition: background 140ms ease, color 140ms ease, opacity 160ms ease; }
.ask-refresh { width: 36px; height: 36px; background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--ink); }
.ask-refresh:hover:not(:disabled) { background: color-mix(in srgb, var(--ask-tone) 16%, transparent); color: var(--ask-tone); }
.ask-refresh:disabled { cursor: default; opacity: .4; }
/* 每点一下逆时针转一圈（只动 rotate）。 */
.ask-refresh-icon { display: grid; transition: rotate 560ms cubic-bezier(.32, .72, .24, 1); }
.ask-close { width: 28px; height: 28px; }
.ask-close:hover { background: var(--glass-press); color: var(--ink); }
.ask-refresh:focus-visible, .ask-close:focus-visible, .ask-main:focus-visible, .ask-action:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.ask-main { display: flex; flex: 1; align-items: center; gap: 10px; min-width: 0; padding: 4px 8px; border: 0; border-radius: 12px;
  background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; overflow: hidden; transition: background 140ms ease; }
.ask-main:hover { background: color-mix(in srgb, var(--ask-tone) 7%, transparent); }
.ask-body { display: flex; flex: 1; align-items: center; gap: 14px; min-width: 0; }
/* 卡面左边斜着叠的几张小牌：这一手的缩影，每张画一个图标。展开时牌从这里抽出来、收起时缩回这里。 */
.ask-stack { position: relative; flex: none; width: 60px; height: 40px; }
/* 叠着的牌只露出左边一截：图标靠左画，每张都看得见。 */
.ask-mini { position: absolute; top: 3px; left: calc(var(--i) * 15px); display: grid; place-items: center start; padding-left: 3px; width: 28px; height: 34px; border-radius: 6px;
  background: color-mix(in srgb, var(--ask-tone) 22%, var(--surface-raised)); color: var(--ask-tone);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ask-tone) 30%, transparent), 0 2px 6px rgb(0 0 0 / .18);
  rotate: calc((var(--i) - (var(--n) - 1) / 2) * 9deg); }
.ask-text { display: grid; flex: 1; gap: 2px; min-width: 0; }
.ask-text strong { color: var(--ink); font-size: var(--fs-md, 15px); font-weight: 650; line-height: 1.35; overflow-wrap: anywhere; }
.ask-text small { color: var(--subtle); font-size: var(--fs-xs); font-weight: 600; overflow-wrap: anywhere; }
.ask-chevron { flex: none; color: var(--subtle); transition: rotate 320ms cubic-bezier(.32, .72, .24, 1); }
.ask.open .ask-chevron { rotate: 180deg; }
.ask-open { padding: 0 14px 14px; }
.ask-question { margin: 0; color: var(--muted); font-size: var(--fs-sm); line-height: 1.55; overflow-wrap: anywhere; }
.ask-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.ask-action { display: inline-flex; align-items: center; gap: 7px; min-height: 36px; padding: 0 14px; border: 1px solid var(--line-strong); border-radius: 999px;
  background: transparent; color: var(--ink); font: 600 var(--fs-sm) var(--font-sans); cursor: pointer; transition: transform 160ms ease, background 140ms ease, opacity 160ms ease; }
.ask-action:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 6%, transparent); }
.ask-action:active:not(:disabled) { transform: scale(.97); }
.ask-action.on { border-color: var(--ask-tone); color: var(--ask-tone); }
.ask-action.primary { border-color: transparent; background: var(--accent); color: var(--accent-ink, #10140a); }
.ask-action.primary:hover:not(:disabled) { background: var(--accent); transform: scale(1.03); }
.ask-action:disabled { cursor: default; opacity: .45; }
.ask-provider { width: 16px; height: 16px; border-radius: 4px; }
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
/* 整张卡出现 / ×：原地淡入淡出、微缩。 */
.ask-card-enter-active { transition: opacity 360ms ease; }
.ask-card-enter-from { opacity: 0; }
.ask-card-leave-active { transition: opacity 280ms ease, transform 280ms cubic-bezier(.4, .6, .2, 1); }
.ask-card-leave-to { opacity: 0; transform: scale(.97); }
@media (prefers-reduced-motion: reduce) { .ask-refresh-icon, .ask-chevron, .ask-card-leave-active { transition-duration: 1ms; } }
@container (max-width: 520px) {
  .ask-actions { justify-content: stretch; }
  .ask-action { flex: 1 1 auto; justify-content: center; }
}
</style>

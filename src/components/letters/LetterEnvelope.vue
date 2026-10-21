<script setup lang="ts">
/**
 * 作者来信的信封（批次 6，想法 3；2026-10-21 按用户给的参考重做：要像信纸，不像卡片）。更新后弹出、或在信匣里重读：
 *
 *   正面（邮票、邮戳、致：用户）→ 点一下翻到背面，或者拖着信封像 3D 模型那样转（2026-10-21 用户：别斜放、要能拖着转）
 *   → 点一下 / 划一下火漆 → 火漆不规则地裂开（崩掉几粒碎屑），上半块跟着封盖翻上去
 *   → 一气呵成（2026-10-21 用户第三轮：原来抽出、闪到顶上、再折角闪一下，一顿一顿）：对折的信往上抽、信封往下沉，
 *     抽出信封口的那一刻外面那沓信纸原地接手、不停顿，顺着弧线放大落到位，下半页从后面翻下来；信封往后退远淡掉。
 *     路径和时间线见 lib/letters/unfold.ts。
 *   → 一页一页地读：① 来信（长信自动分页；跳版更新时几封按旧到新）② 更新说明 ③ 上期回音（有才放）④ 回信
 *
 * 点「知道了」：信纸从这颗按钮往左上角化成灰飞走（lib/motion/ashDissolve.ts）。
 * 减少动态效果 / 低特效：不放封盖和展开，火漆一点就开，翻页交叉淡入，「知道了」直接收起。重读（opened）时直接是信纸。
 */
import './paper.css';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef } from 'vue';
import ModalDialog from '../ModalDialog.vue';
import ReleaseNotesList from '../shell/ReleaseNotesList.vue';
import WaxSeal from './WaxSeal.vue';
import EnvelopeArt from './EnvelopeArt.vue';
import LetterPad from './LetterPad.vue';
import LetterFlow from './LetterFlow.vue';
import PagedLeaf from './PagedLeaf.vue';
import EchoSheet from './EchoSheet.vue';
import ReplySheet from './ReplySheet.vue';
import { useLetterText } from './letters.i18n';
import { useLetterEnvelope, type Sheet } from '../../composables/useLetterEnvelope';
import { lessMotion } from '../../lib/motion/lessMotion';
import { whenFramesSteady } from '../../lib/motion/steady';
import { playPaperSlide } from '../../lib/letters/sound';
import { planUnfold } from '../../lib/letters/unfold';
import { receivedDate, receivedOn } from '../../services/letters';
import type { NoteGroup } from '../../services/updateNotice';

const props = withDefaults(defineProps<{
  versions: string[];
  current: string;
  notes?: NoteGroup[] | null;
  opened?: boolean;
  origin?: HTMLElement | null;
}>(), { notes: null, opened: false, origin: null });
const emit = defineEmits<{ (event: 'done'): void }>();
const t = useLetterText();

const { sheets, loaded, span, draft, replyState, replyError, toggleAlsoHit, send, flushVotesOnClose } =
  useLetterEnvelope(toRef(props, 'versions'), toRef(props, 'current'), toRef(props, 'notes'));

type Phase = 'front' | 'sealed' | 'opening' | 'reading';
const phase = ref<Phase>(props.opened ? 'reading' : 'front');
const index = ref(0);
/*
 * 外面那沓信纸什么时候挂上去排版（透明度 0 藏着、不可操作）：信封出现后不久、人还在看信封的时候。
 * 第一次排要加载字体、找系统回退字体，降速 4× 量到主线程卡 0.35 秒——放在这时没东西在动；
 * 人拆得比这还快，拆信那一下也会挂上（那时只剩合成线程上的动画）。
 */
const staged = ref(props.opened);
/* 展开完成后字和按钮浮上来（只在第一次展开时，重读不放）。 */
const inked = ref(false);
const newest = computed(() => props.versions[props.versions.length - 1] ?? props.current);
/* 信头日期：第一次收到这封信的那天。重读时不再记新的。 */
const postmark = ref<string | null>(null);
onMounted(() => { postmark.value = props.opened ? receivedDate(newest.value) : receivedOn(newest.value); });

/* 长信分页：每封信的第 0 页量出总页数报上来。 */
const counts = ref<Record<number, number>>({});
const setCount = (sheetIndex: number, count: number) => {
  if (counts.value[sheetIndex] !== count) counts.value = { ...counts.value, [sheetIndex]: count };
};
type Page = { sheet: Sheet; sheetIndex: number; sub: number };
const pages = computed<Page[]>(() => sheets.value.flatMap((sheet, sheetIndex) => {
  const n = sheet.kind === 'reply' ? 1 : counts.value[sheetIndex] ?? 1;
  return Array.from({ length: n }, (_, sub) => ({ sheet, sheetIndex, sub }));
}));

const timers: number[] = [];
const later = (ms: number, run: () => void) => { timers.push(window.setTimeout(run, ms)); };
onBeforeUnmount(() => timers.forEach((id) => window.clearTimeout(id)));

const stage = ref<HTMLElement | null>(null);
const reader = ref<HTMLElement | null>(null);
onMounted(() => { if (!props.opened) later(lessMotion() ? 0 : 900, () => { staged.value = true; }); });

/* ── 信封：摆正放着，可以拖着转（像 3D 模型），松手落回最近的一面；点正面翻到背面 ── */
const flipper = ref<HTMLElement | null>(null);
const turn = ref({ x: 0, y: 0 });
const orbit = (x: number, y: number, z = 0) => `perspective(1400px) translateZ(${z}px) rotateX(${x}deg) rotateY(${y}deg)`;
const flipperStyle = computed(() => ({ transform: orbit(turn.value.x, turn.value.y) }));
const faceOf = (y: number): Phase => (((Math.round(y / 180) % 2) + 2) % 2 === 0 ? 'front' : 'sealed');
let motion: Animation | null = null;
/* 从现在的角度转到 (x, y)：先把终点写进样式，再用 WAAPI 从起点放过去（整段在合成线程上）。 */
const settle = (x: number, y: number, keyframes?: Keyframe[], duration = 480) => {
  const el = flipper.value;
  const from = orbit(turn.value.x, turn.value.y);
  motion?.cancel();
  turn.value = { x, y };
  phase.value = faceOf(y);
  if (!el || lessMotion()) return;
  motion = el.animate(keyframes ?? [{ transform: from }, { transform: orbit(x, y) }], { duration, easing: 'cubic-bezier(.2, .8, .2, 1)' });
};
type Drag = { x: number; y: number; id: number; base: { x: number; y: number }; moved: boolean; t: number; vx: number; lastX: number };
let drag: Drag | null = null;
let suppressClick = false;
const canTurn = () => phase.value === 'front' || phase.value === 'sealed';
const dragDown = (event: PointerEvent) => {
  if (!canTurn() || event.button !== 0) return;
  drag = { x: event.clientX, y: event.clientY, id: event.pointerId, base: { ...turn.value }, moved: false, t: performance.now(), vx: 0, lastX: event.clientX };
};
const dragMove = (event: PointerEvent) => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.moved) {
    if (Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    motion?.cancel();
    flipper.value?.setPointerCapture(event.pointerId);
  }
  const now = performance.now();
  drag.vx = (event.clientX - drag.lastX) / Math.max(1, now - drag.t);
  drag.t = now;
  drag.lastX = event.clientX;
  turn.value = { x: Math.max(-28, Math.min(28, drag.base.x - dy * 0.3)), y: drag.base.y + dx * 0.45 };
};
const dragUp = (event: PointerEvent) => {
  if (!drag || event.pointerId !== drag.id) return;
  const { moved, vx } = drag;
  drag = null;
  if (!moved) return;
  /* 拖过以后松手不算「点了一下」。 */
  suppressClick = true;
  window.setTimeout(() => { suppressClick = false; }, 0);
  const was = phase.value;
  /* 甩得快就多转一点再落：按松手前的速度往前推 140ms。 */
  settle(0, Math.round((turn.value.y + vx * 140 * 0.45) / 180) * 180);
  if (was === 'front' && phase.value === 'sealed') afterFlip();
};
const afterFlip = () => {
  if (!lessMotion()) later(40, playPaperSlide);
  later(lessMotion() ? 0 : 640, () => stage.value?.querySelector<HTMLElement>('.env-seal button')?.focus());
};
/* 点正面：翻半圈，中途往人这边抬一点。曲线一开始就走得快，点下去立刻有反应（2026-10-21 用户：翻面反应慢）。 */
const flip = () => {
  if (suppressClick || phase.value !== 'front') return;
  const from = turn.value;
  const y = from.y + 180;
  settle(0, y, [
    { transform: orbit(from.x, from.y, 0) },
    { transform: orbit(0, from.y + 90, 70), offset: 0.45 },
    { transform: orbit(0, y, 0) },
  ], 620);
  afterFlip();
};

/*
 * 拆信：火漆裂开后，先把整段动画按起点摆好、暂停着（画面上还是封着的信封，看不出在等），
 * 等帧节奏稳了（lib/motion/steady.ts）再让封盖、信纸、信封、下半页同一帧一起放——它们共用一个时钟，接手那一刻分毫不差。
 * 只动 transform / opacity。
 */
const foldH = ref(0);
const padH = ref(0);
let unfolding = false;
const open = async () => {
  if (phase.value !== 'sealed' || unfolding) return;
  if (lessMotion()) { phase.value = 'reading'; return; }
  unfolding = true;
  staged.value = true;
  await nextTick();
  const envelope = stage.value?.querySelector<HTMLElement>('.side-back .envelope');
  const wrap = stage.value?.querySelector<HTMLElement>('.envelope-wrap');
  const sheet = stage.value?.querySelector<HTMLElement>('.env-paper');
  const shell = reader.value?.querySelector<HTMLElement>('.pad-shell');
  if (!envelope || !wrap || !sheet || !shell || !shell.offsetWidth) { phase.value = 'reading'; inked.value = true; return; }
  const box = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
  const plan = planUnfold({ envelope: box(envelope), paper: box(sheet), shell: box(shell) });
  foldH.value = plan.foldH < shell.offsetHeight ? plan.foldH : 0;
  padH.value = shell.offsetHeight;
  await nextTick();
  const timing = { duration: plan.duration, fill: 'forwards' as const };
  const moves = [
    wrap.animate(plan.envelope, timing),
    sheet.animate(plan.paper, timing),
    shell.animate(plan.shell, { duration: plan.duration }),
  ];
  const flap = reader.value?.querySelector<HTMLElement>('.fold-flap');
  if (flap) moves.push(flap.animate(plan.flap.keyframes, { duration: plan.flap.duration, delay: plan.flap.delay, easing: 'cubic-bezier(.35, .1, .25, 1)', fill: 'backwards' }));
  moves.forEach((move) => move.pause());
  await whenFramesSteady(200);
  phase.value = 'opening';
  moves.forEach((move) => move.play());
  later(220, playPaperSlide);
  await Promise.all(moves.map((move) => move.finished.catch(() => undefined)));
  phase.value = 'reading';
  foldH.value = 0;
  inked.value = true;
  await nextTick();
  pad.value?.nudge();
};

const label = (sheet: Sheet) => (sheet.kind === 'letter' ? t.value.letterHead(sheet.version)
  : sheet.kind === 'notes' ? t.value.sheetNotes : sheet.kind === 'echo' ? t.value.sheetEcho : t.value.sheetReply);
/* 「附：」只放在最新那封信的末尾。 */
const postscriptFor = (sheet: Sheet) => (sheet.kind === 'letter' && sheet.version === newest.value && span.value ? t.value.postscript(span.value) : null);

const pad = ref<InstanceType<typeof LetterPad> | null>(null);
const go = (next: number) => { pad.value?.go(Math.max(0, Math.min(pages.value.length - 1, next))); };
const onKey = (event: KeyboardEvent) => {
  if (phase.value !== 'reading' || (event.target as HTMLElement).closest('textarea, input')) return;
  if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); go(index.value + 1); }
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); go(index.value - 1); }
};
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));

const closing = ref(false);
const acknowledge = async (event?: MouseEvent) => {
  if (closing.value) return;
  closing.value = true;
  await flushVotesOnClose();
  const button = event?.currentTarget as HTMLElement | undefined;
  const panel = button?.closest<HTMLElement>('[data-modal-dialog]');
  if (button && panel) {
    try {
      const rect = button.getBoundingClientRect();
      const { ashDissolve } = await import('../../lib/motion/ashDissolve');
      await ashDissolve(panel, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, panel.closest<HTMLElement>('.dialog-backdrop'));
    } catch { /* 动画出错不能卡住「知道了」 */ }
  }
  emit('done');
};
</script>

<template>
  <ModalDialog bare labelledby="letter-envelope-title" :origin="origin" :max-width="680" @close="acknowledge()">
    <h2 id="letter-envelope-title" class="sr-only">{{ t.letterHead(newest) }}</h2>
    <div ref="stage" :class="['letter-stage', `is-${phase}`, { reread: opened, inked, folded: foldH > 0 }]">
      <div v-if="phase !== 'reading'" class="envelope-wrap">
        <div ref="flipper" class="flipper" :style="flipperStyle"
          @pointerdown="dragDown" @pointermove="dragMove" @pointerup="dragUp" @pointercancel="dragUp">
          <button type="button" class="side side-front" :aria-label="t.flipAria" :disabled="phase !== 'front'" @click="flip">
            <EnvelopeArt :version="newest" face="front" :bundled="versions.length" :to="t.to" />
          </button>
          <div class="side side-back" :inert="phase === 'front' || undefined">
            <EnvelopeArt :version="newest" :state="phase === 'opening' ? 'opening' : 'sealed'"
              :bundled="versions.length">
              <template #seal><WaxSeal :label="t.sealAria(newest)" :size="96" @break="open" /></template>
            </EnvelopeArt>
          </div>
        </div>
        <p class="seal-hint">{{ versions.length > 1 ? `${t.bundle(versions.length)} · ` : '' }}{{ phase === 'front' ? t.flipHint : t.sealHint }}</p>
      </div>

      <!-- 信封出现后不久就挂上、排好版（藏着、不可操作），展开那一下不用现排。 -->
      <div v-if="loaded && (staged || phase === 'reading')" ref="reader" class="reader" :inert="phase !== 'reading' || undefined"
        @wheel="phase === 'reading' && pad?.wheel($event)"
        :style="foldH ? { '--fold-h': `${foldH}px`, '--pad-h': `${padH}px` } : undefined">
        <div class="pad-shell">
        <LetterPad ref="pad" v-model:index="index" :count="pages.length">
          <template #page="{ i, active }">
            <article v-if="pages[i]" class="leaf-paper paper" :lang="pages[i]!.sheet.kind === 'letter' ? (pages[i]!.sheet as { lang: string }).lang : undefined">
              <div class="leaf-body">
                <LetterFlow v-if="pages[i]!.sheet.kind === 'letter'" :text="(pages[i]!.sheet as { text: string }).text"
                  :lang="(pages[i]!.sheet as { lang: string }).lang" :head="postmark ?? ''" :postscript="postscriptFor(pages[i]!.sheet)"
                  :page="pages[i]!.sub" :active="active" @pages="setCount(pages[i]!.sheetIndex, $event)" />
                <PagedLeaf v-else-if="pages[i]!.sheet.kind === 'notes'" class="notes-leaf" :page="pages[i]!.sub" @pages="setCount(pages[i]!.sheetIndex, $event)">
                  <ReleaseNotesList :groups="notes ?? []" paper />
                </PagedLeaf>
                <PagedLeaf v-else-if="pages[i]!.sheet.kind === 'echo'" :page="pages[i]!.sub" @pages="setCount(pages[i]!.sheetIndex, $event)">
                  <EchoSheet :text="(pages[i]!.sheet as { text: string }).text" :lang="(pages[i]!.sheet as { lang: string }).lang"
                    :also-hit="draft.alsoHit" @toggle="toggleAlsoHit" />
                </PagedLeaf>
                <div v-else class="leaf-fixed paper-lines">
                  <ReplySheet v-model:draft="draft" :state="replyState" :error="replyError" @send="send()" />
                </div>
              </div>
              <footer class="leaf-foot">
                <span class="leaf-label">{{ label(pages[i]!.sheet) }}</span>
                <span class="leaf-number" :aria-label="t.page(i + 1, pages.length)"><b>{{ i + 1 }}</b> / {{ pages.length }}</span>
              </footer>
            </article>
          </template>
        </LetterPad>
        <!-- 展开时的下半页：先折在后面（背面朝人、看不见），再绕折痕翻下来。和信纸同一种纸，翻完就撤掉，换成信纸本身的下半页。 -->
        <span v-if="foldH" class="fold-flap paper" aria-hidden="true"></span>
        </div>
        <!-- 底下只有「知道了」，而且只在最后一页出现（2026-10-21 用户：静音、左右箭头都不要，翻页靠拖、滚轮、方向键）。 -->
        <footer class="letter-foot">
          <button type="button" :class="['button', 'primary', 'acknowledge', { shown: index === pages.length - 1 }]"
            :disabled="closing || index !== pages.length - 1" :tabindex="index === pages.length - 1 ? undefined : -1" @click="acknowledge">{{ t.acknowledge }}</button>
        </footer>
      </div>
    </div>
  </ModalDialog>
</template>

<style scoped src="./LetterEnvelope.css"></style>

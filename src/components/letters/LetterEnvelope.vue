<script setup lang="ts">
/**
 * 作者来信的信封（批次 6，想法 3；2026-10-21 按用户给的参考重做：要像信纸，不像卡片）。更新后弹出、或在信匣里重读：
 *
 *   正面（邮票、邮戳、致：用户）→ 点一下翻到背面，或者拖着信封像 3D 模型那样转（2026-10-21 用户：别斜放、要能拖着转）
 *   → 点一下 / 划一下火漆 → 火漆沿封盖边裂开，上半块跟着封盖翻上去 → 对折的信纸整张从信封口抽出来
 *   → 这张对折的信朝人飞近（带透视纵深），信封往后、往下退远淡掉 → 下半页从后面绕着折痕翻下来，展开成整页
 *   （2026-10-21 用户：原来「先开、再出、再慢慢拉伸」像纯平面；现在不拉伸，只有位移、纵深和折页。）
 *   → 一页一页地读：① 来信（长信自动分页；跳版更新时几封按旧到新）② 更新说明 ③ 上期回音（有才放）④ 回信
 *
 * 点「知道了」：信纸从这颗按钮往左上角化成灰飞走（lib/motion/ashDissolve.ts）。
 * 减少动态效果 / 低特效：不放封盖和展开，火漆一点就开，翻页交叉淡入，「知道了」直接收起。重读（opened）时直接是信纸。
 */
import './paper.css';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef } from 'vue';
import ModalDialog from '../ModalDialog.vue';
import Icon from '../Icon.vue';
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
import { letterSoundOn, playPaperSlide, setLetterSound } from '../../lib/letters/sound';
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

type Phase = 'front' | 'sealed' | 'opening' | 'unfolding' | 'reading';
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
/* 信纸真正开飞的那一刻才让信封往后退（展开第一帧要光栅化整页，CSS 动画先放会被吞掉一截）。 */
const receding = ref(false);
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
 * 拆信之后：信纸往上抽（EnvelopeArt 的 paper-rise）→ 抽完（等它的 animationend，不按时间猜，免得还没抽出来就接手、穿过信封）
 * → 外面那沓信纸接手：起点和抽出来的那张对折的信重合（只露上半页，下半页折在后面），
 *   一边飞近一边摆到位（往人这边抬起再落下：纵深）；信封同时往后、往下退远淡掉；
 * → 快到位时，下半页绕折痕从后面翻下来（转过 90° 时正对着人，透视下最显纵深）；翻完字浮上来。
 * 整段只有 transform / opacity；先停在起点等帧节奏稳了再放（lib/motion/steady.ts）。
 */
const foldH = ref(0);
const unfold = async () => {
  if (phase.value !== 'opening') return;
  staged.value = true;
  await nextTick();
  const sheet = stage.value?.querySelector<HTMLElement>('.env-paper');
  const paper = sheet?.getBoundingClientRect();
  const shell = reader.value?.querySelector<HTMLElement>('.pad-shell');
  const to = shell?.getBoundingClientRect();
  if (!shell || !sheet || !paper || !to?.width) { phase.value = 'reading'; inked.value = true; return; }
  const W = shell.offsetWidth;
  const H = shell.offsetHeight;
  /* 对折后露在外面的那一截：按信封里那张纸的比例，至少半页（不然折在后面的下半页会从顶上冒出来）。 */
  foldH.value = Math.round(Math.min(H, Math.max(H / 2, W / (sheet.offsetWidth / sheet.offsetHeight))));
  phase.value = 'unfolding';
  await nextTick();
  const dx = paper.left + paper.width / 2 - (to.left + to.width / 2);
  const dy = paper.top - to.top;
  const sx = paper.width / W;
  const sy = paper.height / foldH.value;
  const at = (x: number, y: number, z: number, a: number, kx: number, ky: number) =>
    `translate(${x}px, ${y}px) perspective(1400px) translateZ(${z}px) rotateX(${a}deg) scale(${kx}, ${ky})`;
  const fly = shell.animate([
    { transform: at(dx, dy, 0, 0, sx, sy), easing: 'cubic-bezier(.3, .5, .3, 1)' },
    { transform: at(dx * 0.22, dy * 0.22 - 24, 150, -9, (sx + 1) / 2, (sy + 1) / 2), offset: 0.55, easing: 'cubic-bezier(.3, .2, .25, 1)' },
    { transform: at(0, 0, 0, 0, 1, 1) },
  ], { duration: 680 });
  const flap = reader.value?.querySelector<HTMLElement>('.fold-flap');
  const swing = flap?.animate([
    { transform: 'perspective(1400px) rotateX(180deg)' },
    { transform: 'perspective(1400px) rotateX(0deg)' },
  ], { duration: 520, delay: 420, easing: 'cubic-bezier(.35, .1, .25, 1)', fill: 'backwards' });
  fly.pause();
  swing?.pause();
  await whenFramesSteady(220);
  receding.value = true;
  fly.play();
  swing?.play();
  await Promise.all([fly.finished, swing?.finished].map((p) => p?.catch(() => undefined)));
  phase.value = 'reading';
  inked.value = true;
};
/* scoped 样式会给关键帧名加哈希后缀（paper-rise-d5acf8d9），按前缀认；按全名比对曾经永远对不上，每次都是 1.8 秒兜底在推，抽出来干等 0.85 秒。 */
const onAnimationEnd = (event: AnimationEvent) => { if (event.animationName.startsWith('paper-rise')) void unfold(); };
const open = () => {
  if (phase.value !== 'sealed') return;
  if (lessMotion()) { phase.value = 'reading'; return; }
  phase.value = 'opening';
  later(360, playPaperSlide);
  later(560, () => { staged.value = true; });
  /* 兜底：animationend 没来（比如被系统暂停了动画）也要接着展开。 */
  later(1800, () => { void unfold(); });
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
    <div ref="stage" :class="['letter-stage', `is-${phase}`, { reread: opened, inked, receding }]" @animationend="onAnimationEnd">
      <div v-if="phase !== 'reading'" class="envelope-wrap">
        <div ref="flipper" class="flipper" :style="flipperStyle"
          @pointerdown="dragDown" @pointermove="dragMove" @pointerup="dragUp" @pointercancel="dragUp">
          <button type="button" class="side side-front" :aria-label="t.flipAria" :disabled="phase !== 'front'" @click="flip">
            <EnvelopeArt :version="newest" face="front" :bundled="versions.length" :date="postmark" :to="t.to" :from="t.from" />
          </button>
          <div class="side side-back" :inert="phase === 'front' || undefined">
            <EnvelopeArt :version="newest" :state="phase === 'opening' ? 'opening' : phase === 'unfolding' ? 'leaving' : 'sealed'"
              :bundled="versions.length" :from="t.from">
              <template #seal><WaxSeal :label="t.sealAria(newest)" :size="96" @break="open" /></template>
            </EnvelopeArt>
          </div>
        </div>
        <p class="seal-hint">{{ versions.length > 1 ? `${t.bundle(versions.length)} · ` : '' }}{{ phase === 'front' ? t.flipHint : t.sealHint }}</p>
      </div>

      <!-- 信封出现后不久就挂上、排好版（藏着、不可操作），展开那一下不用现排。 -->
      <div v-if="loaded && (staged || phase === 'reading')" ref="reader" class="reader" :inert="phase !== 'reading' || undefined"
        :style="foldH ? { '--fold-h': `${foldH}px` } : undefined">
        <div class="pad-shell">
        <LetterPad ref="pad" v-model:index="index" :count="pages.length">
          <template #page="{ i, active, live }">
            <!-- 压在下面看不见正文的纸只画空白纸；分页的几种（来信、更新说明、上期回音）第一页一直排着，好量出有几页。 -->
            <article v-if="pages[i] && !live && !(pages[i]!.sheet.kind !== 'reply' && pages[i]!.sub === 0)" class="leaf-paper paper"></article>
            <article v-else-if="pages[i]" class="leaf-paper paper" :lang="pages[i]!.sheet.kind === 'letter' ? (pages[i]!.sheet as { lang: string }).lang : undefined">
              <div class="leaf-body">
                <LetterFlow v-if="pages[i]!.sheet.kind === 'letter'" :text="(pages[i]!.sheet as { text: string }).text"
                  :lang="(pages[i]!.sheet as { lang: string }).lang" :head="postmark ?? ''" :postscript="postscriptFor(pages[i]!.sheet)"
                  :page="pages[i]!.sub" :active="active" @pages="setCount(pages[i]!.sheetIndex, $event)" />
                <PagedLeaf v-else-if="pages[i]!.sheet.kind === 'notes'" class="notes-leaf" :page="pages[i]!.sub" @pages="setCount(pages[i]!.sheetIndex, $event)">
                  <ReleaseNotesList :groups="notes ?? []" />
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
        <!-- 展开时的下半页：从折痕处绕到后面去，再翻下来。空白的纸，翻完就撤掉，换成信纸本身的下半页。 -->
        <span v-if="phase === 'unfolding'" class="fold-flap" aria-hidden="true"></span>
        </div>
        <footer class="letter-foot">
          <button type="button" class="icon-button" :aria-pressed="letterSoundOn" :title="letterSoundOn ? t.soundOn : t.soundOff"
            :aria-label="letterSoundOn ? t.soundOn : t.soundOff" @click="setLetterSound(!letterSoundOn)">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" /><path v-if="letterSoundOn" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /><path v-else d="M17 9l5 6M22 9l-5 6" /></svg>
          </button>
          <div class="pager">
            <button type="button" class="icon-button" :disabled="index === 0" :aria-label="t.prev" @click="go(index - 1)"><Icon name="arrow-left" :size="16" /></button>
            <button type="button" class="icon-button" :disabled="index === pages.length - 1" :aria-label="t.next" @click="go(index + 1)"><Icon name="arrow-right" :size="16" /></button>
          </div>
          <button type="button" class="button primary acknowledge" :disabled="closing" @click="acknowledge">{{ t.acknowledge }}</button>
        </footer>
      </div>
    </div>
  </ModalDialog>
</template>

<style scoped src="./LetterEnvelope.css"></style>

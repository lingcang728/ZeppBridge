<script setup lang="ts">
/**
 * 作者来信的信封（批次 6，想法 3；2026-10-21 按用户给的参考重做：要像信纸，不像卡片）。更新后弹出、或在信匣里重读：
 *
 *   正面（邮票、邮戳、致：你）→ 点一下翻到背面（2026-10-21 用户定：邮票和火漆分两面，拆信不会撕坏邮票）
 *   → 点一下 / 划一下火漆 → 封盖翻开、信纸整张从信封口抽出来（信封同时往下退）
 *   → 这张纸带着信封那样的斜放透视摆正、往下展开成一整张信纸，信封沉下去（2026-10-21 用户：抽出来穿模、透视不好）
 *   → 一页一页地读：① 来信（长信自动分页；跳版更新时几封按旧到新）② 更新说明 ③ 上期回音（有才放）④ 回信
 *
 * 点「知道了」：信纸从这颗按钮往左上角化成灰飞走（lib/motion/ashDissolve.ts）。
 * 减少动态效果 / 低特效：不放封盖和展开，火漆一点就开，翻页交叉淡入，「知道了」直接收起。重读（opened）时直接是信纸。
 */
import './paper.css';
import { computed, onBeforeUnmount, onMounted, ref, toRef } from 'vue';
import ModalDialog from '../ModalDialog.vue';
import Icon from '../Icon.vue';
import ReleaseNotesList from '../shell/ReleaseNotesList.vue';
import WaxSeal from './WaxSeal.vue';
import EnvelopeArt from './EnvelopeArt.vue';
import LetterPad from './LetterPad.vue';
import LetterFlow from './LetterFlow.vue';
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
 * 外面那沓信纸什么时候挂上去排版（透明度 0 藏着）：翻到背面、人还在看火漆的时候。第一次排要加载字体、找系统回退字体，
 * 降速 4× 量到主线程卡 0.35 秒，放在这时没人察觉；火漆拆得比这还快，就等封盖翻完——那时只剩合成线程上的位移动画。
 */
const staged = ref(props.opened);
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
  const n = sheet.kind === 'letter' ? counts.value[sheetIndex] ?? 1 : 1;
  return Array.from({ length: n }, (_, sub) => ({ sheet, sheetIndex, sub }));
}));

const timers: number[] = [];
const later = (ms: number, run: () => void) => { timers.push(window.setTimeout(run, ms)); };
onBeforeUnmount(() => timers.forEach((id) => window.clearTimeout(id)));

const stage = ref<HTMLElement | null>(null);
const reader = ref<HTMLElement | null>(null);
/*
 * 信纸从抽出来的那张纸长成一整张。外面那沓信纸在拆信时就已经挂好、排好版（藏着），这里只放动画：
 * 起点和信封里那张纸重合——同样的斜放透视（和 .flipper 的 --tilt 是同一组数，改一处要改两处）、同样大；
 * 先摆正、移到位、宽度长满（高度还是信封里那张的比例），再往下展开到整页，像把折着的信打开。
 * 动画先停在起点等帧节奏稳了再放（lib/motion/steady.ts）：第一次上屏要光栅化整页信纸。
 */
const TILT = 'perspective(1600px) rotateX(16deg) rotateZ(-3.5deg)';
const FLAT = 'perspective(1600px) rotateX(0deg) rotateZ(0deg)';
const unfold = async () => {
  const sheet = stage.value?.querySelector<HTMLElement>('.env-paper');
  const paper = sheet?.getBoundingClientRect();
  const pad = reader.value?.querySelector<HTMLElement>('.letter-pad');
  const to = pad?.getBoundingClientRect();
  phase.value = 'unfolding';
  if (!pad || !sheet || !paper || !to?.width) { later(0, () => { phase.value = 'reading'; }); return; }
  const dx = paper.left + paper.width / 2 - (to.left + to.width / 2);
  const dy = paper.top + paper.height / 2 - (to.top + to.height / 2);
  const sx = sheet.offsetWidth / pad.offsetWidth;
  const sy = sheet.offsetHeight / pad.offsetHeight;
  /* 宽度长满时，高度按信封里那张的比例；顶边对齐终点的顶边。 */
  const midY = Math.min(1, sy / sx);
  const lift = -(1 - midY) * pad.offsetHeight / 2;
  const motion = pad.animate([
    { transform: `translate(${dx}px, ${dy}px) ${TILT} scale(${sx}, ${sy})`, easing: 'cubic-bezier(.3, .55, .3, 1)' },
    { transform: `translate(0px, ${lift}px) ${FLAT} scale(1, ${midY})`, offset: .5, easing: 'cubic-bezier(.4, 0, .2, 1)' },
    { transform: `translate(0px, 0px) ${FLAT} scale(1, 1)` },
  ], { duration: 820 });
  motion.pause();
  await whenFramesSteady(220);
  motion.play();
  await motion.finished.catch(() => undefined);
  phase.value = 'reading';
};
/* 翻到背面：信封绕竖轴翻过来（中途微微抬起），翻完把焦点交给火漆。 */
const flip = () => {
  if (phase.value !== 'front') return;
  phase.value = 'sealed';
  /* 第一次出声要建 AudioContext，主线程会顿一下：等翻面动画交给合成线程以后再响。 */
  if (!lessMotion()) later(60, playPaperSlide);
  later(lessMotion() ? 0 : 900, () => stage.value?.querySelector<HTMLElement>('.env-seal button')?.focus());
  later(lessMotion() ? 0 : 1000, () => { staged.value = true; });
};
const open = () => {
  if (phase.value !== 'sealed') return;
  if (lessMotion()) { phase.value = 'reading'; return; }
  phase.value = 'opening';
  later(480, playPaperSlide);
  later(620, () => { staged.value = true; });
  later(1240, () => { void unfold(); });
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
    <div ref="stage" :class="['letter-stage', `is-${phase}`, { reread: opened }]">
      <div v-if="phase !== 'reading'" class="envelope-wrap">
        <div :class="['flipper', { flipped: phase !== 'front' }]">
          <button type="button" class="side side-front" :aria-label="t.flipAria" :disabled="phase !== 'front'" @click="flip">
            <EnvelopeArt :version="newest" face="front" :bundled="versions.length" :date="postmark" :to="t.to" :from="t.from" />
          </button>
          <div class="side side-back" :inert="phase === 'front' || undefined">
            <EnvelopeArt :version="newest" :state="phase === 'opening' ? 'opening' : phase === 'unfolding' ? 'leaving' : 'sealed'"
              :bundled="versions.length">
              <template #seal><WaxSeal :label="t.sealAria(newest)" :size="96" @break="open" /></template>
            </EnvelopeArt>
          </div>
        </div>
        <p class="seal-hint">{{ versions.length > 1 ? `${t.bundle(versions.length)} · ` : '' }}{{ phase === 'front' ? t.flipHint : t.sealHint }}</p>
      </div>

      <!-- 翻到背面后就挂上、排好版（藏着、不可操作），展开那一下不用现排。 -->
      <div v-if="loaded && (staged || phase === 'reading')" ref="reader" class="reader" :inert="phase === 'sealed' || phase === 'opening' || undefined">
        <LetterPad ref="pad" v-model:index="index" :count="pages.length">
          <template #page="{ i, active, live }">
            <!-- 压在下面看不见正文的纸只画空白纸；每封信的第一页一直排着，好量出这封信有几页。 -->
            <article v-if="pages[i] && !live && !(pages[i]!.sheet.kind === 'letter' && pages[i]!.sub === 0)" class="leaf-paper paper"></article>
            <article v-else-if="pages[i]" class="leaf-paper paper" :lang="pages[i]!.sheet.kind === 'letter' ? (pages[i]!.sheet as { lang: string }).lang : undefined">
              <div class="leaf-body">
                <LetterFlow v-if="pages[i]!.sheet.kind === 'letter'" :text="(pages[i]!.sheet as { text: string }).text"
                  :lang="(pages[i]!.sheet as { lang: string }).lang" :head="postmark ?? ''" :postscript="postscriptFor(pages[i]!.sheet)"
                  :page="pages[i]!.sub" :active="active" @pages="setCount(pages[i]!.sheetIndex, $event)" />
                <div v-else-if="pages[i]!.sheet.kind === 'notes'" class="leaf-scroll paper-lines notes-leaf">
                  <ReleaseNotesList :groups="notes ?? []" />
                </div>
                <div v-else-if="pages[i]!.sheet.kind === 'echo'" class="leaf-scroll paper-lines">
                  <EchoSheet :text="(pages[i]!.sheet as { text: string }).text" :lang="(pages[i]!.sheet as { lang: string }).lang"
                    :also-hit="draft.alsoHit" @toggle="toggleAlsoHit" />
                </div>
                <div v-else class="leaf-scroll paper-lines">
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

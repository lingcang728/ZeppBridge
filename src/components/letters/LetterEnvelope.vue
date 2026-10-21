<script setup lang="ts">
/**
 * 作者来信的信封（批次 6，想法 3）。更新后弹出、或在信匣里重读：
 *
 *   封着 → 按住 / 掰开刻着版本号的火漆 → 封盖翻开、信纸滑出 → 一叠信纸：
 *   ① 来信（跳版更新时几封捆成一叠，按旧到新）② 更新说明 ③ 上期回音（有才放）④ 回信
 *
 * 点「知道了」：信纸从这颗按钮往左上角化成灰飞走，背后的模糊退掉回到主页（lib/motion/ashDissolve.ts）。
 * 减少动态效果 / 低特效：不放封盖和滑出，火漆一点就开，翻页交叉淡入，「知道了」直接收起。
 * 重读（opened）时不再封口，直接是那叠信纸。
 */
import './paper.css';
import { computed, onBeforeUnmount, onMounted, ref, toRef } from 'vue';
import ModalDialog from '../ModalDialog.vue';
import Icon from '../Icon.vue';
import ReleaseNotesList from '../shell/ReleaseNotesList.vue';
import WaxSeal from './WaxSeal.vue';
import PostageStamp from './PostageStamp.vue';
import SheetDeck from './SheetDeck.vue';
import LetterSheet from './LetterSheet.vue';
import EchoSheet from './EchoSheet.vue';
import ReplySheet from './ReplySheet.vue';
import { useLetterText } from './letters.i18n';
import { useLetterEnvelope, type Sheet } from '../../composables/useLetterEnvelope';
import { lessMotion } from '../../lib/motion/lessMotion';
import { letterSoundOn, playPaperSlide, setLetterSound } from '../../lib/letters/sound';
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

type Phase = 'sealed' | 'opening' | 'reading';
const phase = ref<Phase>(props.opened ? 'reading' : 'sealed');
const index = ref(0);
const bundled = computed(() => props.versions.length > 1);
const newest = computed(() => props.versions[props.versions.length - 1] ?? props.current);

const timers: number[] = [];
const later = (ms: number, run: () => void) => { timers.push(window.setTimeout(run, ms)); };
onBeforeUnmount(() => timers.forEach((id) => window.clearTimeout(id)));

const open = () => {
  if (phase.value !== 'sealed') return;
  if (lessMotion()) { phase.value = 'reading'; return; }
  phase.value = 'opening';
  later(520, playPaperSlide);
  later(1180, () => { phase.value = 'reading'; });
};

const head = (sheet: Sheet) => (sheet.kind === 'letter' ? t.value.letterHead(sheet.version)
  : sheet.kind === 'notes' ? t.value.sheetNotes : sheet.kind === 'echo' ? t.value.sheetEcho : t.value.sheetReply);
/* 「附：」只放在最新那封信的末尾。 */
const postscriptFor = (sheet: Sheet) => (sheet.kind === 'letter' && sheet.version === newest.value && span.value ? t.value.postscript(span.value) : null);

const go = (next: number) => { index.value = Math.max(0, Math.min(sheets.value.length - 1, next)); };
const onKey = (event: KeyboardEvent) => {
  if (phase.value !== 'reading' || (event.target as HTMLElement).closest('textarea, input')) return;
  if (event.key === 'ArrowRight') { event.preventDefault(); go(index.value + 1); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); go(index.value - 1); }
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
  <ModalDialog bare labelledby="letter-envelope-title" :origin="origin" :max-width="640" @close="acknowledge()">
    <h2 id="letter-envelope-title" class="sr-only">{{ t.letterHead(newest) }}</h2>
    <div :class="['letter-stage', `is-${phase}`]">
      <div v-if="phase !== 'reading'" class="envelope-wrap">
        <div :class="['envelope', { bundled }]">
          <span v-if="bundled" class="env-ghost two" aria-hidden="true"></span>
          <span v-if="bundled" class="env-ghost one" aria-hidden="true"></span>
          <span class="env-back" aria-hidden="true"></span>
          <span class="env-paper paper" aria-hidden="true"></span>
          <span class="env-pocket" aria-hidden="true"></span>
          <span class="env-flap" aria-hidden="true"></span>
          <span v-if="bundled" class="env-twine" aria-hidden="true"></span>
          <div class="env-address" aria-hidden="true">
            <span class="env-to">{{ t.to }}</span>
            <span class="env-from">{{ t.from }}</span>
          </div>
          <div class="env-stamp"><PostageStamp :version="newest" :width="58" :tilt="-4" /></div>
          <div class="env-seal">
            <WaxSeal :version="newest" :label="t.sealAria(newest)" @break="open" />
          </div>
        </div>
        <p class="seal-hint">{{ bundled ? `${t.bundle(versions.length)} · ` : '' }}{{ t.sealHint }}</p>
      </div>

      <template v-else-if="loaded">
        <SheetDeck v-model:index="index" :sheets="sheets" class="deck-enter">
          <template #sheet="{ sheet, active }">
            <LetterSheet v-if="sheet.kind === 'letter'" :version="sheet.version" :text="sheet.text" :lang="sheet.lang"
              :head="head(sheet)" :postscript="postscriptFor(sheet)" :active="active" />
            <article v-else-if="sheet.kind === 'notes'" class="notes-sheet paper">
              <span class="sheet-kicker">{{ head(sheet) }}</span>
              <ReleaseNotesList :groups="notes ?? []" />
            </article>
            <EchoSheet v-else-if="sheet.kind === 'echo'" :text="sheet.text" :lang="sheet.lang" :head="head(sheet)"
              :also-hit="draft.alsoHit" @toggle="toggleAlsoHit" />
            <ReplySheet v-else v-model:draft="draft" :head="head(sheet)" :state="replyState" :error="replyError" @send="send()" />
          </template>
        </SheetDeck>
        <footer class="letter-foot">
          <button type="button" class="icon-button" :aria-pressed="letterSoundOn" :title="letterSoundOn ? t.soundOn : t.soundOff"
            :aria-label="letterSoundOn ? t.soundOn : t.soundOff" @click="setLetterSound(!letterSoundOn)">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" /><path v-if="letterSoundOn" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /><path v-else d="M17 9l5 6M22 9l-5 6" /></svg>
          </button>
          <div class="pager">
            <button type="button" class="icon-button" :disabled="index === 0" :aria-label="t.prev" @click="go(index - 1)"><Icon name="arrow-left" :size="16" /></button>
            <span class="dots" role="status" :aria-label="t.page(index + 1, sheets.length)">
              <button v-for="(sheet, i) in sheets" :key="i" type="button" :class="['dot', { on: i === index }]" :aria-label="head(sheet)" :aria-current="i === index || undefined" @click="go(i)"></button>
            </span>
            <button type="button" class="icon-button" :disabled="index === sheets.length - 1" :aria-label="t.next" @click="go(index + 1)"><Icon name="arrow-right" :size="16" /></button>
          </div>
          <button type="button" class="button primary acknowledge" :disabled="closing" @click="acknowledge">{{ t.acknowledge }}</button>
        </footer>
      </template>
    </div>
  </ModalDialog>
</template>

<style scoped src="./LetterEnvelope.css"></style>

<script setup lang="ts">
/**
 * 写给作者的那张信纸（2026-11-10「写信 = 反馈」：设置里那张单向的「反馈问题」卡并进信匣）。
 * 蓝墨水直接写在横线上（9 行）。附图像照片一样用回形针夹在纸的右边（ClippedPhotos：飞过去、被夹住、荡两下），
 * 有图时字让出右边那一列；也能直接 Ctrl+V 粘截图。最后一行左边是「附图」和「诊断报告」小标签，
 * 点「诊断报告」从标签里长出一块玻璃板，上面是液态玻璃胶囊挑类别（ReportPicker）。右边一直写着「已写 / 5000」和「寄出 →」。
 * 寄出时外面先交诊断报告拿编号，再把编号随信寄出——作者回信照样回到「我的回信」。
 * 草稿由外面存本机；寄出那一下整张信纸折成纸飞机飞走（外面的 AuthorComposeLayer 放）。
 */
import { computed, ref } from 'vue';
import { useMessages } from '../../i18n';
import { settingsMessages } from '../../views/Settings.i18n';
import { LETTER_REPLY_MAX, tidyTextarea } from '../../services/letterBox';
import CharCount from './CharCount.vue';
import { ATTACH_MAX, isImageFile, type ReplyImage } from '../../lib/letters/attachImage';
import AttachButton from './AttachButton.vue';
import ClippedPhotos from './ClippedPhotos.vue';
import ReportPicker from './ReportPicker.vue';
import SampleTag from './SampleTag.vue';
import type { SegmentItem } from '../SegmentTrack.vue';
import { useLetterText } from './letters.i18n';
import { stampMessages } from './stamps.i18n';
import { ownShort } from '../../lib/shortLabel';

export type ReportCategory = 'device' | 'workout' | 'data' | 'other';
const CATEGORIES: ReportCategory[] = ['device', 'workout', 'data', 'other'];

const props = withDefaults(defineProps<{
  text: string; attach: boolean; category: ReportCategory; busy: boolean; error: string;
  images?: ReplyImage[]; preparing?: boolean; attachFailed?: boolean;
  sample?: { workoutIds: string[] } | null;
}>(), { images: () => [], sample: null });
const emit = defineEmits<{
  (event: 'update:text', text: string): void;
  (event: 'update:attach', attach: boolean): void;
  (event: 'update:category', category: ReportCategory): void;
  (event: 'update:sample', sample: { workoutIds: string[] } | null): void;
  (event: 'send'): void;
  (event: 'addImages', files: File[]): void;
  (event: 'removeImage', id: string): void;
}>();
const t = useLetterText();
const s = useMessages(settingsMessages);

const canSend = computed(() => !props.busy && !props.preparing && props.text.trim().length > 0);
/** 类别名用短名（没翻的语言写全称）。 */
const kindLabel = (kind: ReportCategory) => ownShort(stampMessages, (tree) => tree.kind[kind]) ?? s.value.reportCategory[kind].label;

/** 胶囊上的四项：只写短名。不挂悬停提示——玻璃板是从标签里长出来的，光标正好落在第一项上，提示会立刻冒出来盖住胶囊。 */
const reportItems = computed<SegmentItem<ReportCategory>[]>(() => CATEGORIES.map((kind) => ({ value: kind, label: kindLabel(kind) })));
const reportLabel = computed(() => (props.attach ? `${t.value.reportShort} · ${kindLabel(props.category)}` : t.value.reportShort));

/** 照片从哪里飞过去：点「附图」就是那枚标签，粘贴就是写字区。按下那一刻量（满 3 张时标签会消失）。 */
const launch = ref<DOMRect | null>(null);
const attachEl = ref<HTMLElement | null>(null);
const addFromButton = (files: File[]) => {
  launch.value = attachEl.value?.getBoundingClientRect() ?? null;
  emit('addImages', files);
};

const textInput = ref<HTMLTextAreaElement | null>(null);
const focusInput = () => {
  textInput.value?.focus({ preventScroll: true });
};
defineExpose({ focusInput });

/* 截图直接 Ctrl+V 进信纸：剪贴板里有图就收成附图，文字照常粘贴。 */
const paste = (event: ClipboardEvent) => {
  const files = [...(event.clipboardData?.files ?? [])].filter(isImageFile);
  if (!files.length || props.busy) return;
  event.preventDefault();
  launch.value = textInput.value?.getBoundingClientRect() ?? null;
  emit('addImages', files);
};
/* 边写边收（services/letterBox.ts 的 tidyReplyInput）：开头不留空行、连按回车只留一个空行、连着的空格收成一个。 */
const input = (event: Event) => emit('update:text', tidyTextarea(event.target as HTMLTextAreaElement));
const snap = (event: Event) => {
  const el = event.target as HTMLTextAreaElement;
  const line = parseFloat(getComputedStyle(el).lineHeight) || 34;
  const top = Math.round(el.scrollTop / line) * line;
  if (Math.abs(top - el.scrollTop) > 0.5) el.scrollTop = top;
};
</script>

<template>
  <div class="compose">
    <label class="compose-label" for="author-text">{{ t.toDeveloper }}</label>
    <div class="written">
      <textarea id="author-text" ref="textInput" :class="['compose-text', { 'beside-photos': images.length }]" :value="text" :placeholder="t.authorPlaceholder"
        :maxlength="LETTER_REPLY_MAX" :readonly="busy" rows="9" @input="input" @scroll="snap" @paste="paste"></textarea>
      <p v-if="error || attachFailed" class="compose-error" role="alert">{{ error || t.attachFailed }}</p>
      <footer class="compose-foot">
        <div class="clips">
          <span v-if="images.length < ATTACH_MAX" ref="attachEl" class="clip"><AttachButton icon :count="images.length" :disabled="busy" :preparing="preparing" @add="addFromButton" /></span>
          <ReportPicker :attach="attach" :category="category" :busy="busy" :items="reportItems" :label="reportLabel" :group-label="s.reportCategoryAria"
            @update:attach="emit('update:attach', $event)" @update:category="emit('update:category', $event)" />
          <SampleTag :sample="sample" :busy="busy" @update:sample="emit('update:sample', $event)" />
        </div>
        <CharCount :text="text" />
        <button type="button" class="seal" :disabled="!canSend" @click="emit('send')">
          {{ busy ? t.sending : t.send }}<span aria-hidden="true"> →</span>
        </button>
      </footer>
    </div>
    <ClippedPhotos :images="images" :disabled="busy" :launch="launch" @remove="emit('removeImage', $event)" />
  </div>
</template>

<style scoped>
/* 每一块都是 --paper-line 的整数倍，字落在横线上。自己写的字用蓝墨水。 */
.compose { --letter-ink: #24467e; position: relative; }
.compose-label { display: block; font: 700 var(--paper-size) / var(--paper-line) var(--paper-font); }
.written { transform-origin: 50% 0; }
.compose-text {
  display: block; width: 100%; height: calc(var(--paper-line) * 9); margin: 0; padding: 0; border: 0; border-radius: 0; outline: none; box-shadow: none; resize: none;
  overflow-y: auto; scrollbar-width: none; background: transparent; color: var(--letter-ink); font: 400 var(--paper-size) / var(--paper-line) var(--paper-font); caret-color: var(--letter-ink);
}
/* 有附图时字让出右边那一列（照片 92px + 间隔）。 */
.compose-text.beside-photos { padding-inline-end: 108px; box-sizing: border-box; }
.compose-text::-webkit-scrollbar { display: none; }
.compose-text::placeholder { color: var(--paper-muted); opacity: .75; }
.compose-error { margin: 0; color: var(--danger); font: 400 var(--fs-xs) / var(--paper-line) var(--font-sans); }
.compose-foot { display: flex; align-items: center; gap: 12px 16px; min-height: var(--paper-line); margin-top: var(--paper-line); }
/* 左边两枚小标签：细框、墨水色，不压横线。「诊断报告」那枚和它的玻璃板在 ReportPicker 里。 */
.clips { display: flex; flex: 1 1 auto; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; }
.clip { display: inline-flex; }
.clip :deep(.attach-button) {
  display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border: 1px solid rgb(60 50 40 / .22); border-radius: 13px;
  background: none; cursor: pointer; white-space: nowrap; color: rgb(60 50 40 / .62); font: 500 var(--fs-xs) / 1 var(--font-sans); text-decoration: none;
  transition: color 160ms ease, border-color 160ms ease, background-color 160ms ease;
}
.clip :deep(.attach-button:hover:not(:disabled)) { color: var(--letter-ink); border-color: color-mix(in srgb, var(--letter-ink) 45%, transparent); }
.seal {
  flex: none; height: var(--paper-line); padding: 0 2px; border: 0; background: none; cursor: pointer;
  color: var(--letter-ink); font: 600 var(--paper-size) / var(--paper-line) var(--paper-font); transition: translate 160ms ease, opacity 160ms ease;
}
.seal:hover:not(:disabled) { translate: 3px 0; }
.seal:disabled { color: var(--paper-muted); opacity: .6; cursor: default; }
.seal:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 3px; }

</style>

<script setup lang="ts">
/**
 * 写给作者的那张信纸（2026-11-10「写信 = 反馈」：设置里那张单向的「反馈问题」卡并进信匣）。
 * 和写胶囊同一套：蓝墨水直接写在横线上、框固定 6 行高；底下一枚「附上脱敏诊断报告」的章，
 * 盖上了再挑一枚问题类型（和以前反馈卡的四类一样）；最后一行「寄出 →」。
 * 寄出时外面先交诊断报告拿编号，再把编号随信寄出——作者回信照样回到「我的回信」。
 * 草稿由外面存本机；寄出那一下这页对折起来，再由信封飞回去。
 */
import { computed, ref } from 'vue';
import { lessMotion } from '../../lib/motion/lessMotion';
import { useMessages } from '../../i18n';
import { settingsMessages } from '../../views/Settings.i18n';
import { LETTER_REPLY_MAX } from '../../services/letterBox';
import { useLetterText } from './letters.i18n';
import { stampMessages } from './stamps.i18n';
import { ownShort } from '../../lib/shortLabel';

export type ReportCategory = 'device' | 'workout' | 'data' | 'other';
const CATEGORIES: ReportCategory[] = ['device', 'workout', 'data', 'other'];

const props = defineProps<{ text: string; attach: boolean; category: ReportCategory; busy: boolean; error: string }>();
const emit = defineEmits<{
  (event: 'update:text', text: string): void;
  (event: 'update:attach', attach: boolean): void;
  (event: 'update:category', category: ReportCategory): void;
  (event: 'send'): void;
}>();
const t = useLetterText();
const s = useMessages(settingsMessages);

const canSend = computed(() => !props.busy && props.text.trim().length > 0);
/** 章上写短名（没翻的语言写全称），悬停提示是全称 + 说明。 */
const stamps = computed(() => Object.fromEntries(CATEGORIES.map((kind) => {
  const full = s.value.reportCategory[kind];
  const label = ownShort(stampMessages, (tree) => tree.kind[kind]) ?? full.label;
  return [kind, { label, title: label === full.label ? full.hint : `${full.label} — ${full.hint}` }];
})) as Record<ReportCategory, { label: string; title: string }>);

const press = (event: MouseEvent) => {
  if (lessMotion()) return;
  (event.currentTarget as HTMLElement).animate(
    [{ scale: '1.12' }, { scale: '.95', offset: 0.45 }, { scale: '1' }],
    { duration: 280, easing: 'cubic-bezier(.3, .7, .3, 1)' },
  );
};
const toggleAttach = (event: MouseEvent) => { emit('update:attach', !props.attach); press(event); };
const pick = (value: ReportCategory, event: MouseEvent) => { emit('update:category', value); press(event); };

const written = ref<HTMLElement | null>(null);
/** 寄出以后调用：把写好的那页对折起来，折完再交给信封飞回去。 */
const fold = async () => {
  const page = written.value;
  if (!page || lessMotion()) return;
  await page.animate([
    { transform: 'perspective(900px) rotateX(0deg) scale(1)', opacity: 1 },
    { transform: 'perspective(900px) rotateX(78deg) scale(.92, .5)', opacity: .85 },
  ], { duration: 360, easing: 'cubic-bezier(.45, .05, .55, .95)', fill: 'forwards' }).finished.catch(() => undefined);
};
defineExpose({ fold });

const input = (event: Event) => emit('update:text', Array.from((event.target as HTMLTextAreaElement).value).slice(0, LETTER_REPLY_MAX).join(''));
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
    <div ref="written" class="written">
      <textarea id="author-text" class="compose-text" :value="text" :placeholder="t.authorPlaceholder" :maxlength="LETTER_REPLY_MAX"
        :readonly="busy" rows="6" @input="input" @scroll="snap"></textarea>
      <div class="marks">
        <button type="button" role="switch" :aria-checked="attach" :class="['mark', 'attach', { picked: attach }]" :title="t.attachHint"
          :disabled="busy" @click="toggleAttach">
          <span class="mark-label">{{ t.attachReport }}</span>
        </button>
        <div v-if="attach" class="kinds" role="radiogroup" :aria-label="s.reportCategoryAria">
          <button v-for="kind in CATEGORIES" :key="kind" type="button" role="radio" :aria-checked="category === kind"
            :class="['mark', 'kind', { picked: category === kind }]" :title="stamps[kind].title" :aria-label="s.reportCategory[kind].label" :disabled="busy" @click="pick(kind, $event)">
            <span class="mark-label">{{ stamps[kind].label }}</span>
          </button>
        </div>
      </div>
      <footer class="compose-foot">
        <span class="compose-error" role="alert">{{ error }}</span>
        <button type="button" class="seal" :disabled="!canSend" @click="emit('send')">
          {{ busy ? t.sending : t.send }}<span aria-hidden="true"> →</span>
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* 每一块都是 --paper-line 的整数倍，字和章都落在横线上。自己写的字用蓝墨水。 */
.compose { --ink: #24467e; }
.compose-label { display: block; font: 700 var(--paper-size) / var(--paper-line) var(--paper-font); }
.written { transform-origin: 50% 0; }
.compose-text {
  display: block; width: 100%; height: calc(var(--paper-line) * 6); margin: 0; padding: 0; border: 0; border-radius: 0; outline: none; box-shadow: none; resize: none;
  overflow-y: auto; scrollbar-width: none; background: transparent; color: var(--ink); font: 400 var(--paper-size) / var(--paper-line) var(--paper-font); caret-color: var(--ink);
}
.compose-text::-webkit-scrollbar { display: none; }
.compose-text::placeholder { color: var(--paper-muted); opacity: .75; }
/* 章：双线圆角框、印泥色；没盖的淡、平放，盖上的墨色深、歪一点。占两行横线高。 */
.marks { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; min-height: calc(var(--paper-line) * 2); margin-top: var(--paper-line); }
/* 问题类型章自成一排，排在「附上报告」章下面；章名用短名，一排放得下。 */
.kinds { display: flex; flex: 1 0 100%; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
.mark {
  display: grid; justify-items: center; padding: 6px 14px 5px; border: 1.5px solid currentColor; border-radius: 12px; background: none; cursor: pointer;
  color: rgb(60 50 40 / .4); outline: 1px solid transparent; outline-offset: 2px;
  transition: color 200ms ease, rotate 260ms cubic-bezier(.3, .7, .3, 1), outline-color 200ms ease;
}
.mark.kind { padding: 4px 10px 3px; border-radius: 9px; }
.mark:hover:not(:disabled):not(.picked) { color: rgb(60 50 40 / .62); }
.mark.picked { color: var(--paper-rubric); rotate: -5deg; outline-color: currentColor; }
.mark.kind.picked { rotate: 4deg; }
.mark:focus-visible { box-shadow: 0 0 0 3px var(--focus); }
.mark-label { font: 700 var(--fs-xs) / 1.2 var(--font-sans); letter-spacing: .06em; }
.compose-foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: var(--paper-line); margin-top: var(--paper-line); }
.compose-error { min-width: 0; color: var(--danger); font: 400 var(--fs-xs) / 1.5 var(--font-sans); }
.seal {
  flex: none; height: var(--paper-line); padding: 0 2px; border: 0; background: none; cursor: pointer;
  color: var(--ink); font: 600 var(--paper-size) / var(--paper-line) var(--paper-font); transition: translate 160ms ease, opacity 160ms ease;
}
.seal:hover:not(:disabled) { translate: 3px 0; }
.seal:disabled { color: var(--paper-muted); opacity: .6; cursor: default; }
.seal:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 3px; }
@media (prefers-reduced-motion: reduce) { .mark { transition: none; } }
</style>

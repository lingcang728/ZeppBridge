<script setup lang="ts">
/**
 * 写时间胶囊的那张信纸（2026-10-29 用户定：空白信封里抽出一张空信纸来写；开封时间用三枚邮戳，不要系统下拉框）。
 * 和回信那张同一套：直接写在横线上、蓝墨水、框固定 6 行高不滚；底下并排三枚邮戳「半年后 / 一年后 / 三年后」，
 * 点哪枚就盖哪枚（墨色变深、歪一下、按下去弹一下），每枚下面印着那一天；最后是一行「封上 →」。
 * 封好的那一下：写好的那页对折起来（和回信寄出同一个折法），然后由外面把整沓纸飞回空信封。
 */
import { computed, ref } from 'vue';
import { lessMotion } from '../../lib/motion/lessMotion';
import { dayKey } from '../../lib/aiTask/bridgeScale';
import { useDataLetterText } from './dataLetters.i18n';

const props = defineProps<{ busy: boolean; error: string }>();
const emit = defineEmits<{ (event: 'seal', note: string, openOn: string): void }>();
const t = useDataLetterText();

const MAX = 1000;
const SPANS = [{ months: 6, key: 'spanHalfYear' }, { months: 12, key: 'spanOneYear' }, { months: 36, key: 'spanThreeYears' }] as const;
const note = ref('');
const months = ref<number>(12);
const dayAfter = (span: number) => {
  const date = new Date();
  date.setMonth(date.getMonth() + span);
  return dayKey(date);
};
const canSeal = computed(() => !props.busy && note.value.trim().length > 0);

const pick = (span: number, event: MouseEvent) => {
  months.value = span;
  if (lessMotion()) return;
  (event.currentTarget as HTMLElement).animate(
    [{ scale: '1.16' }, { scale: '.94', offset: 0.45 }, { scale: '1' }],
    { duration: 300, easing: 'cubic-bezier(.3, .7, .3, 1)' },
  );
};

const written = ref<HTMLElement | null>(null);
/** 外面封好以后调用：把写好的那页对折起来，折完再交给信封飞回去。 */
const fold = async () => {
  const page = written.value;
  if (!page || lessMotion()) return;
  await page.animate([
    { transform: 'perspective(900px) rotateX(0deg) scale(1)', opacity: 1 },
    { transform: 'perspective(900px) rotateX(78deg) scale(.92, .5)', opacity: .85 },
  ], { duration: 360, easing: 'cubic-bezier(.45, .05, .55, .95)', fill: 'forwards' }).finished.catch(() => undefined);
};
defineExpose({ fold });

const input = (event: Event) => { note.value = Array.from((event.target as HTMLTextAreaElement).value).slice(0, MAX).join(''); };
const snap = (event: Event) => {
  const el = event.target as HTMLTextAreaElement;
  const line = parseFloat(getComputedStyle(el).lineHeight) || 34;
  const top = Math.round(el.scrollTop / line) * line;
  if (Math.abs(top - el.scrollTop) > 0.5) el.scrollTop = top;
};
</script>

<template>
  <div class="compose">
    <label class="compose-label" for="capsule-text">{{ t.toFuture }}</label>
    <div ref="written" class="written">
      <textarea id="capsule-text" class="compose-text" :value="note" :placeholder="t.capsulePlaceholder" :maxlength="MAX"
        :readonly="busy" rows="6" @input="input" @scroll="snap"></textarea>
      <div class="marks" role="radiogroup" :aria-label="t.openAfter">
        <button v-for="span in SPANS" :key="span.months" type="button" role="radio" :aria-checked="months === span.months"
          :class="['mark', { picked: months === span.months }]" :disabled="busy" @click="pick(span.months, $event)">
          <span class="mark-label">{{ t[span.key] }}</span>
          <span class="mark-date">{{ dayAfter(span.months).replace(/-/g, '.') }}</span>
        </button>
      </div>
      <footer class="compose-foot">
        <span class="compose-error" role="alert">{{ error }}</span>
        <button type="button" class="seal" :disabled="!canSeal" @click="emit('seal', note.trim(), dayAfter(months))">
          {{ busy ? t.sealing : t.seal }}<span aria-hidden="true"> →</span>
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* 每一块都是 --paper-line 的整数倍，字和邮戳都落在横线上。自己写的字用蓝墨水。 */
.compose { --ink: #24467e; }
.compose-label { display: block; font: 700 var(--paper-size) / var(--paper-line) var(--paper-font); }
.written { transform-origin: 50% 0; }
.compose-text {
  display: block; width: 100%; height: calc(var(--paper-line) * 6); margin: 0; padding: 0; border: 0; border-radius: 0; outline: none; box-shadow: none; resize: none;
  overflow-y: auto; scrollbar-width: none; background: transparent; color: var(--ink); font: 400 var(--paper-size) / var(--paper-line) var(--paper-font); caret-color: var(--ink);
}
.compose-text::-webkit-scrollbar { display: none; }
.compose-text::placeholder { color: var(--paper-muted); opacity: .75; }
/* 三枚邮戳：双线圆角框、印泥色；没选的淡、平放，选中的墨色深、歪一点。占两行横线高。 */
.marks { display: flex; flex-wrap: wrap; align-items: center; gap: 0 14px; min-height: calc(var(--paper-line) * 2); margin-top: var(--paper-line); }
.mark {
  display: grid; justify-items: center; gap: 2px; padding: 6px 14px 5px; border: 1.5px solid currentColor; border-radius: 12px; background: none; cursor: pointer;
  color: rgb(60 50 40 / .4); outline: 1px solid transparent; outline-offset: 2px;
  transition: color 200ms ease, rotate 260ms cubic-bezier(.3, .7, .3, 1), outline-color 200ms ease;
}
.mark:hover:not(:disabled):not(.picked) { color: rgb(60 50 40 / .62); }
.mark.picked { color: var(--paper-rubric); rotate: -6deg; outline-color: currentColor; }
.mark:focus-visible { box-shadow: 0 0 0 3px var(--focus); }
.mark-label { font: 700 var(--fs-xs) / 1.2 var(--font-sans); letter-spacing: .08em; }
.mark-date { font: 600 10px / 1.2 var(--font-mono); letter-spacing: .02em; }
.compose-foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; height: var(--paper-line); margin-top: var(--paper-line); }
.compose-error { min-width: 0; color: var(--danger); font: 400 var(--fs-xs) / var(--paper-line) var(--font-sans); }
.seal {
  flex: none; height: var(--paper-line); padding: 0 2px; border: 0; background: none; cursor: pointer;
  color: var(--ink); font: 600 var(--paper-size) / var(--paper-line) var(--paper-font); transition: translate 160ms ease, opacity 160ms ease;
}
.seal:hover:not(:disabled) { translate: 3px 0; }
.seal:disabled { color: var(--paper-muted); opacity: .6; cursor: default; }
.seal:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 3px; }
@media (prefers-reduced-motion: reduce) { .mark { transition: none; } }
</style>

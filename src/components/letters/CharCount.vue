<script setup lang="ts">
/**
 * 信纸底下一直写着「已写 / 上限」（149 / 5000）。数字按界面语言的写法；快写满（剩不到 5%）变成印泥红。
 * 读屏读的是「已写 149 字，最多 5000 字」。
 */
import { computed } from 'vue';
import { locale } from '../../i18n';
import { LETTER_REPLY_MAX, replyCharCount } from '../../services/letterBox';
import { useLetterText } from './letters.i18n';

const props = defineProps<{ text: string }>();
const t = useLetterText();
const count = computed(() => replyCharCount(props.text));
const format = computed(() => new Intl.NumberFormat(locale.value));
const written = computed(() => format.value.format(count.value));
const max = computed(() => format.value.format(LETTER_REPLY_MAX));
const near = computed(() => count.value >= LETTER_REPLY_MAX * 0.95);
</script>

<template>
  <span :class="['char-count', { near }]" role="status" :aria-label="t.charsAria(written, max)"><b>{{ written }}</b> / {{ max }}</span>
</template>

<style scoped>
.char-count {
  flex: none; color: var(--paper-muted); font: 400 var(--fs-xs) / var(--paper-line) var(--font-sans);
  font-variant-numeric: tabular-nums; white-space: nowrap; transition: color 200ms ease;
}
.char-count b { font-weight: 600; color: color-mix(in srgb, var(--paper-muted) 60%, var(--paper-ink)); }
.char-count.near, .char-count.near b { color: var(--paper-rubric); }
</style>

<script setup lang="ts">
/**
 * 信纸底行的「附图」：一行蓝墨水写的字，点开选图（可多选）。满 3 张就不再出现。
 * 粘贴截图走信纸自己的 paste 事件，不经过这里。
 */
import { ref } from 'vue';
import Icon from '../Icon.vue';
import { ATTACH_MAX } from '../../lib/letters/attachImage';
import { useLetterText } from './letters.i18n';

/** icon：写给作者的信纸上做成带 + 的小夹子（AuthorCompose 的 .clip）；回信纸上照旧是一行字。 */
const props = defineProps<{ count: number; disabled?: boolean; preparing?: boolean; icon?: boolean }>();
const emit = defineEmits<{ (event: 'add', files: File[]): void }>();
const t = useLetterText();
const input = ref<HTMLInputElement | null>(null);

const pick = () => { if (!props.disabled && !props.preparing) input.value?.click(); };
const picked = (event: Event) => {
  const el = event.target as HTMLInputElement;
  const files = [...(el.files ?? [])];
  el.value = '';
  if (files.length) emit('add', files);
};
</script>

<template>
  <span v-if="count < ATTACH_MAX" class="attach">
    <button type="button" class="attach-button" :disabled="disabled || preparing" @click="pick">
      <Icon v-if="icon" name="plus" :size="14" />
      {{ preparing ? t.attachPreparing : t.attachImage }}
    </button>
    <input ref="input" class="attach-input" type="file" accept="image/png,image/jpeg,image/webp" multiple tabindex="-1" aria-hidden="true" @change="picked" />
  </span>
</template>

<style scoped>
.attach { flex: none; display: inline-flex; }
.attach-button {
  height: var(--paper-line); padding: 0 2px; border: 0; background: none; cursor: pointer; white-space: nowrap;
  color: var(--ink, #24467e); font: 400 var(--fs-xs) / var(--paper-line) var(--font-sans);
  text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); text-underline-offset: 4px;
}
.attach-button:disabled { color: var(--paper-muted); cursor: default; }
.attach-button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 3px; }
.attach-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
</style>

<script setup lang="ts">
/**
 * 「AI 给了训练计划？」——贴回 AI 回复的入口。
 *
 * 点「粘贴 AI 的回复」展开一块文本框，Ctrl+V 贴进来就自动检查（不用再点）；也可以手动敲、再点「检查计划」。
 * 不去读剪贴板：只有人自己贴进来的东西才会被读（Tauri 的 WebView 里读剪贴板要另外授权，也不该悄悄读）。
 * 整段回复照贴即可——取出 JSON 是 `extractPlan` 的事，人不用挑。
 */
import { nextTick, ref } from 'vue';
import Icon from '../Icon.vue';
import { usePlanText } from './usePlanText';

const props = defineProps<{ busy: boolean; error: string | null }>();
const emit = defineEmits<{ submit: [text: string] }>();
const { t } = usePlanText();

const open = ref(false);
const text = ref('');
const box = ref<HTMLTextAreaElement | null>(null);

const show = async () => {
  open.value = true;
  await nextTick();
  box.value?.focus();
};
const close = () => { open.value = false; text.value = ''; };
const submit = () => { if (!props.busy) emit('submit', text.value); };
/* 贴进来的那一刻就检查：先让文本框拿到内容（paste 事件时 v-model 还没更新）。 */
const onPaste = async () => {
  await nextTick();
  window.setTimeout(submit, 0);
};
defineExpose({ close });
</script>

<template>
  <section class="paste surface-card" :aria-label="t.pasteTitle">
    <div class="line">
      <span class="ic" aria-hidden="true"><Icon name="file" :size="20" /></span>
      <span class="copy"><b>{{ t.pasteTitle }}</b><span>{{ t.pasteSub }}</span></span>
      <button v-if="!open" type="button" class="pill-button" @click="show">{{ t.pasteButton }}</button>
    </div>
    <div v-if="open" class="area">
      <label class="sr-only" for="plan-paste">{{ t.pasteBoxLabel }}</label>
      <textarea id="plan-paste" ref="box" v-model="text" class="mat-field" rows="6" :placeholder="t.pasteBoxLabel" :aria-describedby="error ? 'plan-paste-err' : 'plan-paste-hint'"
        @paste="onPaste"></textarea>
      <p v-if="error" id="plan-paste-err" class="err" role="alert"><Icon name="warning" :size="14" />{{ error }}</p>
      <p v-else id="plan-paste-hint" class="hint">{{ t.pasteBoxHint }}</p>
      <div class="acts">
        <button type="button" class="pill-button quiet" @click="close">{{ t.pasteCancel }}</button>
        <button type="button" class="button primary check" :disabled="busy || !text.trim()" @click="submit">{{ t.pasteCheck }}</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.paste { display: grid; gap: 14px; padding: 16px 22px; border-radius: var(--radius-xl); }
.line { display: flex; align-items: center; gap: 16px; }
.ic { display: grid; width: 40px; height: 40px; flex: none; place-items: center; border-radius: 13px; background: var(--accent-soft); color: var(--accent); }
.copy { display: grid; min-width: 0; line-height: 1.35; }
.copy b { font-size: var(--fs-md); }
.copy span { color: var(--muted); font-size: var(--fs-xs); }
.line .pill-button { margin-left: auto; }
.area { display: grid; gap: 8px; }
textarea { resize: vertical; min-height: 120px; max-height: 320px; font-size: var(--fs-sm); line-height: 1.5; user-select: text; }
.hint, .err { display: flex; align-items: center; gap: 6px; margin: 0; font-size: var(--fs-2xs); color: var(--subtle); }
.err { color: var(--warning); }
.acts { display: flex; justify-content: flex-end; gap: 8px; }
.check { min-height: 38px; border-radius: 999px; padding-inline: 20px; }
</style>

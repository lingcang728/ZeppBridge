<script setup lang="ts">
/**
 * 「AI 给了训练计划？」——贴回 AI 回复的入口。
 *
 * 点「粘贴 AI 的回复」展开一块文本框，Ctrl+V 贴进来就自动检查（不用再点）；也可以手动敲、再点「检查计划」。
 * 不去读剪贴板：只有人自己贴进来的东西才会被读（Tauri 的 WebView 里读剪贴板要另外授权，也不该悄悄读）。
 * 整段回复照贴即可——取出 JSON 是 `extractPlan` 的事，人不用挑。
 *
 * 没贴之前是一条三步的流程（问 AI → 贴回来 → 发到手表），第二步就是按钮本身：
 * 新用户一眼知道这块是干什么的，老用户直接点中间那一步。
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
  <section :class="['paste', 'surface-card', { open }]" :aria-label="t.pasteTitle">
    <ol v-if="!open" class="flow">
      <li class="step">
        <span class="no">1</span>
        <span class="copy"><b>{{ t.flowAsk }}</b></span>
      </li>
      <li class="step main">
        <button type="button" class="paste-btn" @click="show">
          <span class="no"><Icon name="file" :size="15" /></span>
          <span class="copy"><b>{{ t.pasteButton }}</b><small>{{ t.flowPaste }}</small></span>
        </button>
      </li>
      <li class="step">
        <span class="no"><Icon name="watch" :size="15" /></span>
        <span class="copy"><b>{{ t.flowSend }}</b></span>
      </li>
    </ol>
    <div v-else class="area">
      <div class="area-head">
        <b>{{ t.pasteTitle }}</b>
        <span>{{ t.pasteSub }}</span>
      </div>
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
.paste { padding: 14px; border-radius: var(--radius-xl); }
.paste.open { padding: 20px 22px; }
/* 三步流程：两头是说明，中间那一步就是按钮。 */
.flow { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr); align-items: stretch; gap: 10px; margin: 0; padding: 0; list-style: none; }
.step { position: relative; display: flex; align-items: center; gap: 12px; min-width: 0; padding: 12px 14px; color: var(--muted); }
.step + .step::before { content: ''; position: absolute; top: 50%; left: -9px; width: 8px; height: 8px; border-top: 1.5px solid var(--line-strong); border-right: 1.5px solid var(--line-strong); rotate: 45deg; translate: 0 -50%; }
.no { display: grid; width: 30px; height: 30px; flex: none; place-items: center; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--line-strong); color: var(--subtle); font-size: var(--fs-xs); font-weight: 700; }
.copy { display: grid; min-width: 0; gap: 2px; line-height: 1.35; }
.copy b { font-size: var(--fs-sm); font-weight: 600; }
.copy small { color: var(--subtle); font-size: var(--fs-2xs); }
.step.main { padding: 0; }
.paste-btn { display: flex; width: 100%; align-items: center; gap: 12px; padding: 12px 16px; border: 0; border-radius: 20px; background: var(--mat-raised); box-shadow: var(--mat-raised-rim), 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
  color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: background var(--dur-fast) ease, translate var(--dur-fast) var(--ease-out); }
.paste-btn:hover { background: var(--mat-raised-hover, var(--mat-raised)); translate: 0 -1px; }
.paste-btn:active { translate: 0 1px; }
.paste-btn .no { background: var(--accent); box-shadow: none; color: var(--accent-ink); }
.area { display: grid; gap: 10px; }
.area-head { display: grid; gap: 2px; }
.area-head b { font-size: var(--fs-md); }
.area-head span { color: var(--muted); font-size: var(--fs-xs); }
textarea { resize: vertical; min-height: 120px; max-height: 320px; font-size: var(--fs-sm); line-height: 1.5; user-select: text; }
.hint, .err { display: flex; align-items: center; gap: 6px; margin: 0; font-size: var(--fs-2xs); color: var(--subtle); }
.err { color: var(--warning); }
.acts { display: flex; justify-content: flex-end; gap: 8px; }
.check { min-height: 38px; border-radius: 999px; padding-inline: 20px; }
@media (max-width: 860px) {
  .flow { grid-template-columns: minmax(0, 1fr); }
  .step + .step::before { display: none; }
}
</style>

<script setup lang="ts">
/* 履历里三种编辑弹窗（比赛、跑鞋、伤病）共用的壳：标题钉顶、按钮钉底、中间滚；删除先确认一次。
   版式照生活事件编辑器（LifeEventEditor.vue）。 */
import { ref, watch } from 'vue';
import ModalDialog from '../ModalDialog.vue';
import { useJournalText } from './journal.i18n';

/* origin：从哪个元素长出来、关的时候缩回哪里（卡头的按钮、被点的那一行）。三个编辑器都没声明它，
   写在编辑器上的 origin 会作为透传属性落到这里。 */
/* maxWidth：伤病编辑要把人形图放大，弹窗比另外两个宽（InjuryEditor.vue）。 */
const props = defineProps<{ title: string; busy: boolean; error: string | null; canDelete: boolean; origin?: HTMLElement | null; maxWidth?: number }>();
const emit = defineEmits<{ (event: 'save'): void; (event: 'close'): void; (event: 'remove'): void }>();
const t = useJournalText();
const id = `journal-editor-${Math.random().toString(36).slice(2, 8)}`;
const confirming = ref(false);
watch(() => props.title, () => { confirming.value = false; });
const close = () => { if (!props.busy) emit('close'); };
</script>

<template>
  <ModalDialog :labelledby="id" :origin="origin" :max-width="maxWidth" @close="close">
    <form class="journal-form" @submit.prevent="emit('save')">
      <h2 :id="id">{{ title }}</h2>
      <fieldset :disabled="busy"><slot /></fieldset>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div v-if="confirming" class="delete-confirm" role="alert">
        <strong>{{ t.removeConfirm }}</strong>
        <div class="row">
          <button type="button" class="button button-secondary" :disabled="busy" @click="confirming = false">{{ t.cancel }}</button>
          <button type="button" class="button button-danger" :disabled="busy" @click="emit('remove')">{{ t.remove }}</button>
        </div>
      </div>
      <footer v-else>
        <button v-if="canDelete" type="button" class="button button-danger" :disabled="busy" @click="confirming = true">{{ t.remove }}</button>
        <span class="spacer"></span>
        <button type="button" class="button button-secondary" :disabled="busy" @click="close">{{ t.cancel }}</button>
        <button type="submit" class="button button-primary" :disabled="busy">{{ t.save }}</button>
      </footer>
    </form>
  </ModalDialog>
</template>

<style scoped>
.journal-form { display: grid; gap: 12px; }
.journal-form h2, .journal-form p { margin: 0; }
.journal-form h2 { position: sticky; top: -20px; z-index: 2; margin: -20px -20px 0; padding: 18px 20px 8px; border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--mat-glass-strong); -webkit-backdrop-filter: var(--mat-glass-blur); backdrop-filter: var(--mat-glass-blur); font-size: var(--fs-xl); }
fieldset { display: grid; gap: 12px; min-width: 0; margin: 0; padding: 0; border: 0; }
.form-error { color: var(--warning); font-size: var(--fs-sm); }
.delete-confirm { display: grid; gap: 10px; }
.delete-confirm .row { display: flex; justify-content: flex-end; gap: 8px; }
footer { position: sticky; bottom: -20px; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; margin: 0 -20px -20px; padding: 12px 20px 18px;
  border-radius: 0 0 var(--radius-lg) var(--radius-lg); background: var(--mat-glass-strong); -webkit-backdrop-filter: var(--mat-glass-blur); backdrop-filter: var(--mat-glass-blur); }
.spacer { flex: 1; }
/* 插槽里的表单控件：和生活事件编辑器同一种凹槽输入框。 */
fieldset :deep(label), fieldset :deep(.field) { display: grid; gap: 6px; color: var(--muted); font-size: var(--fs-sm); }
fieldset :deep(input:not([type='checkbox'])), fieldset :deep(textarea) { box-sizing: border-box; width: 100%; min-width: 0; padding: 10px 14px; border: 0; border-radius: 14px;
  background: var(--cap-track); box-shadow: var(--cap-track-shadow); color: var(--ink); font: inherit; outline: none; }
fieldset :deep(input:focus), fieldset :deep(textarea:focus) { box-shadow: var(--cap-track-shadow), 0 0 0 2px var(--focus); }
fieldset :deep(textarea) { resize: vertical; }
fieldset :deep(.pair) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
fieldset :deep(.check) { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--ink); font-size: var(--fs-sm); }
fieldset :deep(.hint) { color: var(--subtle); font-size: var(--fs-xs); }
fieldset :deep(.num) { font-variant-numeric: tabular-nums; }
@media (max-width: 480px) { fieldset :deep(.pair) { grid-template-columns: 1fr; } }
</style>

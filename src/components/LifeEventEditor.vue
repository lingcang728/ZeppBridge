<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ModalDialog from './ModalDialog.vue';
import { useLifeEvents } from '../composables/useLifeEvents';
import { tauriApi } from '../composables/useTauriApi';
import { eventCategories, lifeEventMessages, validLifeEvent } from '../lib/lifeEvents';
import { useMessages } from '../i18n';
const t = useMessages(lifeEventMessages);
const { draft, reload } = useLifeEvents();
const busy = ref(false);
const error = ref('');
const confirmingDelete = ref(false);
watch(draft, () => { error.value = ''; confirmingDelete.value = false; });
const ongoing = computed({ get: () => draft.value?.endDate === null, set: value => {
  if (draft.value) draft.value.endDate = value ? null : draft.value.startDate;
} });
function close() { if (!busy.value) draft.value = null; }
async function save() {
  if (!draft.value || busy.value) return;
  if (!validLifeEvent(draft.value)) { error.value = 'invalid'; return; }
  busy.value = true; error.value = '';
  try { await tauriApi.saveLifeEvent({ ...draft.value }); await reload(); draft.value = null; }
  catch { error.value = 'failed'; }
  finally { busy.value = false; }
}
async function remove() {
  if (!draft.value?.id || busy.value) return;
  busy.value = true; error.value = '';
  try { await tauriApi.deleteLifeEvent(draft.value.id); await reload(); draft.value = null; }
  catch { error.value = 'failed'; }
  finally { busy.value = false; }
}
</script>
<template>
  <ModalDialog v-if="draft" labelledby="life-event-editor-title" @close="close">
    <form class="event-form" @submit.prevent="save">
      <h2 id="life-event-editor-title">{{ draft.id ? t.edit : t.add }}</h2>
      <fieldset :disabled="busy">
        <label>{{ t.name }}<input v-model="draft.title" required maxlength="120" :placeholder="t.placeholder" data-event-title></label>
        <label>{{ t.category }}<select v-model="draft.category"><option v-for="category in eventCategories" :key="category" :value="category">{{ t.categories[category] }}</option></select></label>
        <div class="event-dates">
          <label>{{ t.start }}<input v-model="draft.startDate" type="date" required data-event-start></label>
          <label v-if="!ongoing">{{ t.end }}<input v-model="draft.endDate" type="date" :min="draft.startDate" required data-event-end></label>
        </div>
        <label class="check"><input v-model="ongoing" type="checkbox">{{ t.ongoing }}</label>
        <label>{{ t.notes }}<textarea v-model="draft.notes" maxlength="4000" rows="4" data-event-notes /></label>
      </fieldset>
      <p class="event-hint">{{ t.local }}</p>
      <p v-if="error" role="alert">{{ error === 'invalid' ? t.invalid : t.failed }}</p>
      <div v-if="confirmingDelete" class="delete-confirm" role="alert">
        <strong>{{ t.deleteTitle }}</strong><p>{{ t.deleteHint }}</p>
        <button type="button" class="button button-secondary" :disabled="busy" @click="confirmingDelete = false">{{ t.cancel }}</button>
        <button type="button" class="button button-secondary" :disabled="busy" @click="remove">{{ t.remove }}</button>
      </div>
      <footer v-else>
        <button v-if="draft.id" type="button" class="button button-ghost" :disabled="busy" @click="confirmingDelete = true">{{ t.remove }}</button>
        <span />
        <button type="button" class="button button-secondary" :disabled="busy" @click="close">{{ t.cancel }}</button>
        <button type="submit" class="button button-primary" :disabled="busy">{{ t.save }}</button>
      </footer>
    </form>
  </ModalDialog>
</template>
<style scoped>
.event-form { display:grid; gap:16px; }.event-form h2,.event-form p { margin:0; }
fieldset { border:0; padding:0; margin:0; min-width:0; display:grid; gap:14px; }
label { display:grid; gap:6px; font-size:var(--fs-sm); color:var(--muted); }
input,select,textarea { min-width:0; width:100%; box-sizing:border-box; padding:10px; border:1px solid var(--line-control); border-radius:8px; background:var(--surface); color:var(--ink); font:inherit; }
textarea { resize:vertical; }.event-dates { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.check { display:flex; align-items:center; gap:8px; }.check input { width:auto; }
.event-hint { color:var(--subtle); font-size:var(--fs-xs); line-height:1.6; }
footer { display:flex; flex-wrap:wrap; gap:8px; }footer span { flex:1; }.delete-confirm { display:grid; gap:10px; }
@media(max-width:480px) { .event-dates { grid-template-columns:1fr; } }
</style>

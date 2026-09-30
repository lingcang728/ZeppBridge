<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import WheelDatePicker from './WheelDatePicker.vue';
import ModalDialog from './ModalDialog.vue';
import SegmentTrack from './SegmentTrack.vue';
import { useLifeEvents } from '../composables/useLifeEvents';
import { backend } from '../lib/bridge';
import { eventCategories, lifeEventMessages, validLifeEvent } from '../lib/lifeEvents';
import { localDateString } from '../lib/format';
import { useMessages } from '../i18n';
const t = useMessages(lifeEventMessages);
const { draft, reload } = useLifeEvents();
const busy = ref(false);
const error = ref('');
const confirmingDelete = ref(false);
const categoryOptions = computed(() =>
  eventCategories.map((category) => ({ value: category, label: t.value.categories[category] })),
);
watch(draft, () => { error.value = ''; confirmingDelete.value = false; });
// 开始日期滚过了结束日期：结束日期跟着走，不让两者倒挂（保存时才报错太晚了）。
watch(() => draft.value?.startDate, (start) => {
  if (draft.value && start && draft.value.endDate && draft.value.endDate < start) draft.value.endDate = start;
});
const ongoing = computed({ get: () => draft.value?.endDate === null, set: value => {
  if (draft.value) draft.value.endDate = value ? null : draft.value.startDate;
} });
/* 日期默认是能直接敲的日期框（带日历），外加「今天 / 昨天 / 同开始日期」快捷项（U15）；
   滚轮留作可选方式。键盘一次就能输完整日期。 */
const wheels = ref(false);
const dayOffset = (days: number) => { const date = new Date(); date.setDate(date.getDate() - days); return localDateString(date); };
const today = () => dayOffset(0);
function setStart(value: string) { if (draft.value && value) draft.value.startDate = value; }
function setEnd(value: string) { if (draft.value && value) draft.value.endDate = value; }
function close() { if (!busy.value) draft.value = null; }
function setCategory(value: string | number) {
  if (!draft.value) return;
  const next = String(value);
  if ((eventCategories as readonly string[]).includes(next)) {
    draft.value.category = next as (typeof eventCategories)[number];
  }
}
async function save() {
  if (!draft.value || busy.value) return;
  if (!validLifeEvent(draft.value)) { error.value = 'invalid'; return; }
  busy.value = true; error.value = '';
  try { await backend.saveLifeEvent({ ...draft.value }); await reload(); draft.value = null; }
  catch { error.value = 'failed'; }
  finally { busy.value = false; }
}
async function remove() {
  if (!draft.value?.id || busy.value) return;
  busy.value = true; error.value = '';
  try { await backend.deleteLifeEvent(draft.value.id); await reload(); draft.value = null; }
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
        <div class="field">
          <span>{{ t.category }}</span>
          <SegmentTrack
            compact
            :model-value="draft.category"
            :items="categoryOptions"
            :aria-label="t.category"
            @update:model-value="setCategory"
          />
        </div>
        <div class="event-dates">
          <div class="field">
            <label for="life-event-start">{{ t.start }}</label>
            <WheelDatePicker v-if="wheels" v-model="draft.startDate" :aria-label="t.start" data-event-start />
            <input v-else id="life-event-start" type="date" :value="draft.startDate" min="2000-01-01" max="2099-12-31" required data-event-start
              @change="setStart(($event.target as HTMLInputElement).value)">
            <span class="date-quick">
              <button type="button" class="quick" @click="setStart(today())">{{ t.today }}</button>
              <button type="button" class="quick" @click="setStart(dayOffset(1))">{{ t.yesterday }}</button>
            </span>
          </div>
          <div v-if="!ongoing" class="field">
            <label for="life-event-end">{{ t.end }}</label>
            <WheelDatePicker v-if="wheels" v-model="draft.endDate" :min="draft.startDate" :aria-label="t.end" data-event-end />
            <input v-else id="life-event-end" type="date" :value="draft.endDate ?? ''" :min="draft.startDate" max="2099-12-31" required data-event-end
              @change="setEnd(($event.target as HTMLInputElement).value)">
            <span class="date-quick">
              <button type="button" class="quick" @click="setEnd(draft.startDate)">{{ t.sameAsStart }}</button>
              <button type="button" class="quick" @click="setEnd(today())">{{ t.today }}</button>
            </span>
          </div>
        </div>
        <button type="button" class="quick date-mode" @click="wheels = !wheels">{{ wheels ? t.useTyping : t.useWheels }}</button>
        <div class="check">
          <span>{{ t.ongoing }}</span>
          <button type="button" class="mat-switch" role="switch" :aria-checked="ongoing" :aria-label="t.ongoing" @click="ongoing = !ongoing"></button>
        </div>
        <label>{{ t.notes }}<textarea v-model="draft.notes" maxlength="4000" rows="4" data-event-notes /></label>
      </fieldset>
      <p class="event-hint">{{ t.local }}</p>
      <p v-if="error" role="alert">{{ error === 'invalid' ? t.invalid : t.failed }}</p>
      <div v-if="confirmingDelete" class="delete-confirm" role="alert">
        <strong>{{ t.deleteTitle }}</strong><p>{{ t.deleteHint }}</p>
        <button type="button" class="button button-secondary" :disabled="busy" @click="confirmingDelete = false">{{ t.cancel }}</button>
        <button type="button" class="button button-danger" :disabled="busy" @click="remove">{{ t.remove }}</button>
      </div>
      <footer v-else>
        <button v-if="draft.id" type="button" class="button button-danger" :disabled="busy" @click="confirmingDelete = true">{{ t.remove }}</button>
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
label, .field { display:grid; gap:6px; font-size:var(--fs-sm); color:var(--muted); }
/* 输入框和页面上的胶囊同一种凹槽：没有描边，焦点时一圈品牌色。 */
input,textarea { min-width:0; width:100%; box-sizing:border-box; padding:10px 14px; border:0; border-radius:14px; background: var(--cap-track); box-shadow: var(--cap-track-shadow); color:var(--ink); font:inherit; outline:none; }
input:focus,textarea:focus { box-shadow: var(--cap-track-shadow), 0 0 0 2px var(--focus); }
textarea { resize:vertical; }.event-dates { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
input[type='date'] { min-height:42px; font-variant-numeric:tabular-nums; }
.date-quick { display:flex; flex-wrap:wrap; gap:6px; }
.quick { min-height:28px; padding:0 10px; border:0; border-radius:999px; background:color-mix(in srgb, var(--ink) 7%, transparent); color:var(--muted); font:inherit; font-size:var(--fs-xs); cursor:pointer; }
.quick:hover { background:color-mix(in srgb, var(--accent) 16%, transparent); color:var(--ink); }
.quick:focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
.date-mode { justify-self:start; background:transparent; padding:0; text-decoration:underline dotted; text-underline-offset:3px; }
.check { display:flex; align-items:center; justify-content:space-between; gap:12px; color:var(--ink); font-size:var(--fs-sm); }
.event-hint { color:var(--subtle); font-size:var(--fs-xs); line-height:1.6; }
footer { display:flex; flex-wrap:wrap; gap:8px; }footer span { flex:1; }.delete-confirm { display:grid; gap:10px; }
@media(max-width:480px) { .event-dates { grid-template-columns:1fr; } }
</style>

<script setup lang="ts">
import GlassSwitch from './GlassSwitch.vue';
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
  // 胶囊上写短名（五项一行放得下才能拖），全名进悬停提示；两者一样（中文）时不重复提示。
  eventCategories.map((category) => {
    const label = t.value.categoryShort[category];
    const full = t.value.categories[category];
    return { value: category, label, title: full !== label ? full : undefined };
  }),
);
watch(draft, () => { error.value = ''; confirmingDelete.value = false; });
// 开始日期滚过了结束日期：结束日期跟着走，不让两者倒挂（保存时才报错太晚了）。
watch(() => draft.value?.startDate, (start) => {
  if (draft.value && start && draft.value.endDate && draft.value.endDate < start) draft.value.endDate = start;
});
const ongoing = computed({ get: () => draft.value?.endDate === null, set: value => {
  if (draft.value) draft.value.endDate = value ? null : draft.value.startDate;
} });
/* 日期只用滚轮选（用户 2026-09-30 定：不要日历托盘），外加「今天 / 昨天 / 同开始日期」快捷项（U15）。
   滚轮本身支持键盘上下键和直接滚动。 */
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
          <!-- 快捷日期放在标签同一行的右边：以前单独占一行，整张弹窗高出一截，底部的保存被挤出窗口。 -->
          <div class="field">
            <span class="field-head">
              <span class="field-label">{{ t.start }}</span>
              <span class="date-quick">
                <button type="button" class="quick" @click="setStart(today())">{{ t.today }}</button>
                <button type="button" class="quick" @click="setStart(dayOffset(1))">{{ t.yesterday }}</button>
              </span>
            </span>
            <WheelDatePicker v-model="draft.startDate" :aria-label="t.start" data-event-start />
          </div>
          <div v-if="!ongoing" class="field">
            <span class="field-head">
              <span class="field-label">{{ t.end }}</span>
              <span class="date-quick">
                <button type="button" class="quick" @click="setEnd(draft.startDate)">{{ t.sameAsStart }}</button>
                <button type="button" class="quick" @click="setEnd(today())">{{ t.today }}</button>
              </span>
            </span>
            <WheelDatePicker v-model="draft.endDate" :min="draft.startDate" :aria-label="t.end" data-event-end />
          </div>
        </div>
        <div class="check">
          <span>{{ t.ongoing }}</span>
          <GlassSwitch :model-value="ongoing" :aria-label="t.ongoing" @update:model-value="ongoing = !ongoing" />
        </div>
        <label>{{ t.notes }}<textarea v-model="draft.notes" maxlength="4000" rows="2" data-event-notes /></label>
      </fieldset>
      <p v-if="error" role="alert">{{ error === 'invalid' ? t.invalid : t.failed }}</p>
      <div v-if="confirmingDelete" class="delete-confirm" role="alert">
        <strong>{{ t.deleteTitle }}</strong><p>{{ t.deleteHint }}</p>
        <button type="button" class="button button-secondary" :disabled="busy" @click="confirmingDelete = false">{{ t.cancel }}</button>
        <button type="button" class="button button-danger" :disabled="busy" @click="remove">{{ t.remove }}</button>
      </div>
      <footer v-else>
        <button v-if="draft.id" type="button" class="button button-danger" :disabled="busy" @click="confirmingDelete = true">{{ t.remove }}</button>
        <p class="event-hint">{{ t.local }}</p>
        <button type="button" class="button button-secondary" :disabled="busy" @click="close">{{ t.cancel }}</button>
        <button type="submit" class="button button-primary" :disabled="busy">{{ t.save }}</button>
      </footer>
    </form>
  </ModalDialog>
</template>
<style scoped>
/* 标题钉在顶上、按钮钉在底下，中间那段才滚：窗口矮的时候也是「顾头又顾尾」——以前整张一起滚，
   往下滑露出保存，标题就被顶出去了。两条钉住的边各带一层和面板同色的底，滚过去的内容不会透出来。 */
.event-form { display:grid; gap:12px; }.event-form h2,.event-form p { margin:0; }
.event-form h2 { position:sticky; top:-20px; z-index:2; margin:-20px -20px 0; padding:18px 20px 8px; border-radius:var(--radius-lg) var(--radius-lg) 0 0; background:var(--mat-glass-strong); -webkit-backdrop-filter:var(--mat-glass-blur); backdrop-filter:var(--mat-glass-blur); font-size:var(--fs-xl); }
fieldset { border:0; padding:0; margin:0; min-width:0; display:grid; gap:12px; }
.field-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:6px; }
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
.check { display:flex; align-items:center; justify-content:space-between; gap:12px; color:var(--ink); font-size:var(--fs-sm); }
.event-hint { color:var(--subtle); font-size:var(--fs-xs); line-height:1.6; }
footer { position:sticky; bottom:-20px; z-index:2; display:flex; flex-wrap:wrap; align-items:center; gap:8px 10px; margin:0 -20px -20px; padding:12px 20px 18px; border-radius:0 0 var(--radius-lg) var(--radius-lg); background:var(--mat-glass-strong); -webkit-backdrop-filter:var(--mat-glass-blur); backdrop-filter:var(--mat-glass-blur); }
footer .event-hint { flex:1 1 180px; min-width:0; }
.delete-confirm { display:grid; gap:10px; }
@media(max-width:480px) { .event-dates { grid-template-columns:1fr; } }
</style>

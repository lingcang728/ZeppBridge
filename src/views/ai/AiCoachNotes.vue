<script setup lang="ts">
/**
 * 教练档案（/ai/memory，批次 7，AI 记忆收件箱）。
 *
 * 上面是等你确认的（AI 经 MCP 提议的），每条「记住 / 不要」，不放心可以先改了再记；
 * 下面是记住的，旧的在前，每条写明谁写的、哪天记下，能改能删；最下面自己加一条。
 * 只有记住的会交给 AI（MCP 的 get_athlete_profile、交给 AI 的 .md）。右上角导出一份 Markdown。
 */
import { onActivated, onMounted, ref } from 'vue';
import PageHeader from '../../components/PageHeader.vue';
import { useCoachNotes } from '../../composables/useCoachNotes';
import { useCoachNotesText } from '../../components/coachNotes/coachNotes.i18n';
import { noteDay } from '../../lib/coachNotes/markdown';
import type { CoachNote } from '../../types/coachNotes';

defineOptions({ name: 'AiCoachNotes' });
const t = useCoachNotesText();
const store = useCoachNotes();
const { notes, busy, error } = store;

onMounted(() => { void store.load(); });
onActivated(() => { void store.load(); });

/** 正在改的那一条（id）和草稿。 */
const editing = ref<number | null>(null);
const editText = ref('');
const draft = ref('');
const notice = ref<string | null>(null);

const by = (note: CoachNote) => (note.source === 'mcp' ? t.value.byAi(note.source_name) : t.value.byUser);
const startEdit = (note: CoachNote) => { editing.value = note.id; editText.value = note.text; };
const saveEdit = async (note: CoachNote, thenAccept = false) => {
  if (editText.value.trim() !== note.text && !(await store.edit(note.id, editText.value))) return;
  if (thenAccept && !(await store.decide(note.id, true))) return;
  editing.value = null;
};
const remove = async (note: CoachNote) => {
  if (!window.confirm(t.value.removeConfirm)) return;
  await store.remove(note.id);
};
const add = async () => {
  if (!draft.value.trim()) return;
  if (await store.add(draft.value)) draft.value = '';
};
const exportFile = async () => {
  notice.value = null;
  if (await store.exportMarkdown()) notice.value = t.value.exported;
};
</script>

<template>
  <section class="page ai-sub-page story" aria-labelledby="coach-notes-title">
    <PageHeader title-id="coach-notes-title" :title="t.title" :intro="t.lead">
      <button type="button" class="pill-button quiet" :disabled="busy || !notes?.accepted.length" @click="exportFile">{{ t.export }}</button>
    </PageHeader>
    <p v-if="error" class="ai-panel ai-empty" role="alert">{{ error }}</p>
    <p v-if="notice" class="cn-notice" role="status">{{ notice }}</p>

    <article v-if="notes?.proposed.length" class="ai-panel cn-panel">
      <header class="cn-head"><strong>{{ t.inbox }}</strong><span>{{ t.inboxHint }}</span></header>
      <ul class="cn-list">
        <li v-for="note in notes.proposed" :key="note.id" class="cn-row is-proposed">
          <template v-if="editing === note.id">
            <textarea v-model="editText" rows="3" maxlength="500" :aria-label="t.edit"></textarea>
            <div class="cn-actions">
              <button type="button" class="pill-button quiet" @click="editing = null">{{ t.cancel }}</button>
              <button type="button" class="pill-button" :disabled="busy" @click="saveEdit(note, true)">{{ t.remember }}</button>
            </div>
          </template>
          <template v-else>
            <p class="cn-text">{{ note.text }}</p>
            <div class="cn-actions">
              <small class="cn-meta">{{ by(note) }}</small>
              <button type="button" class="cn-link" @click="startEdit(note)">{{ t.edit }}</button>
              <button type="button" class="pill-button quiet" :disabled="busy" @click="store.decide(note.id, false)">{{ t.reject }}</button>
              <button type="button" class="pill-button" :disabled="busy" @click="store.decide(note.id, true)">{{ t.remember }}</button>
            </div>
          </template>
        </li>
      </ul>
    </article>

    <article class="ai-panel cn-panel">
      <header class="cn-head"><strong>{{ t.kept }}</strong></header>
      <p v-if="notes && !notes.accepted.length" class="cn-empty">{{ t.keptEmpty }}</p>
      <ul v-else class="cn-list">
        <li v-for="note in notes?.accepted ?? []" :key="note.id" class="cn-row">
          <template v-if="editing === note.id">
            <textarea v-model="editText" rows="3" maxlength="500" :aria-label="t.edit"></textarea>
            <div class="cn-actions">
              <button type="button" class="pill-button quiet" @click="editing = null">{{ t.cancel }}</button>
              <button type="button" class="pill-button" :disabled="busy" @click="saveEdit(note)">{{ t.save }}</button>
            </div>
          </template>
          <template v-else>
            <p class="cn-text">{{ note.text }}</p>
            <div class="cn-actions">
              <small class="cn-meta">{{ by(note) }} · {{ t.since(noteDay(note)) }}</small>
              <button type="button" class="cn-link" @click="startEdit(note)">{{ t.edit }}</button>
              <button type="button" class="cn-link is-danger" :disabled="busy" @click="remove(note)">{{ t.remove }}</button>
            </div>
          </template>
        </li>
      </ul>
      <form class="cn-add" @submit.prevent="add">
        <textarea v-model="draft" rows="2" maxlength="500" :aria-label="t.add" :placeholder="t.addPlaceholder"></textarea>
        <button type="submit" class="pill-button" :disabled="busy || !draft.trim()">{{ t.add }}</button>
      </form>
    </article>
  </section>
</template>

<style scoped src="./aiPage.css"></style>
<style scoped>
.cn-notice { margin: 0; color: var(--accent); font-size: var(--fs-sm); }
.cn-panel { gap: 12px; }
.cn-head { display: grid; gap: 4px; }
.cn-head strong { color: var(--ink); font-size: var(--fs-md); font-weight: 600; }
.cn-head span, .cn-empty { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.6; }
.cn-list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.cn-row { display: grid; gap: 6px; padding: 10px 0; border-top: 1px solid var(--mat-line); }
.cn-row:first-child { border-top: 0; padding-top: 2px; }
.cn-text { margin: 0; color: var(--ink); font-size: var(--fs-md); line-height: 1.55; overflow-wrap: anywhere; white-space: pre-wrap; }
.cn-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.cn-meta { flex: 1; min-width: 0; color: var(--subtle); font-size: var(--fs-xs); }
.cn-link { padding: 2px 4px; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.cn-link:hover { color: var(--ink); }
.cn-link.is-danger:hover { color: var(--danger, var(--warning)); }
.cn-row textarea, .cn-add textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--mat-inset); color: var(--ink); font: var(--fs-sm)/1.6 var(--font-sans); resize: vertical; }
.cn-add { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 10px; padding-top: 8px; }
</style>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import ModalDialog from '../ModalDialog.vue';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { backend, toUserMessage } from '../../lib/bridge';
import { useBridgeText } from './bridge/bridge.i18n';
const emit = defineEmits<{ close: [] }>();
const t = useBridgeText(), ctl = useAiTaskDraft(), note = ref(ctl.draft.value.personal_note), busy = ref(false), error = ref<string | null>(null);
onMounted(async () => { try { const prefs = await backend.getUserPrefs(); if (!note.value) note.value = prefs.ai_profile_note ?? ''; } catch(e) { error.value = toUserMessage(e,''); } });
const save = async () => { busy.value = true; error.value = null; try { await backend.aiProfileSave(note.value); ctl.setPersonalNote(note.value); emit('close'); } catch(e) { error.value = toUserMessage(e,''); } finally { busy.value = false; } };
</script>
<template>
  <ModalDialog labelledby="bridge-profile-title" @close="emit('close')"><div class="profile-tray"><h2 id="bridge-profile-title">{{ t.profileTitle }}</h2><p>{{ t.profileHint }}</p><textarea v-model="note" rows="6" :aria-label="t.profile" :placeholder="t.profilePlaceholder"></textarea><p v-if="error" role="status">{{ error }}</p><footer><button class="pill-button quiet" type="button" @click="emit('close')">{{ t.close }}</button><button class="pill-button" type="button" :disabled="busy" @click="save">{{ busy ? t.saving : t.save }}</button></footer></div></ModalDialog>
</template>
<style scoped src="./ProfileTray.css"></style>

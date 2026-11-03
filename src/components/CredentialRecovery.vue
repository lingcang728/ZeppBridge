<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { useMessages } from '../i18n';
import { credentialRecoveryMessages } from './CredentialRecovery.i18n';

const props = defineProps<{
  recovery: { platform: string; can_save_file: boolean };
  busy: boolean;
  kind?: 'official' | 'advanced';
}>();
const emit = defineEmits<{
  retry: [storage: 'system' | 'file'];
  discard: [];
}>();
const t = useMessages(credentialRecoveryMessages);
const id = useId();
const choice = ref<'system' | 'file'>('system');
const consent = ref(false);
watch(choice, () => { consent.value = false; });
watch(() => props.recovery.can_save_file, (allowed) => {
  if (!allowed) choice.value = 'system';
});
const repairGuide = computed(() => props.recovery.platform === 'linux' ? t.value.repairLinux
  : props.recovery.platform === 'macos' ? t.value.repairMac : t.value.repairWindows);
const submit = () => {
  if (props.busy || (choice.value === 'file' && (!props.recovery.can_save_file || !consent.value))) return;
  emit('retry', choice.value);
};
</script>

<template>
  <form class="credential-recovery" :aria-labelledby="`${id}-title`" @submit.prevent="submit">
    <h4 :id="`${id}-title`">{{ t.title }}</h4>
    <p>{{ kind === 'advanced' ? t.advancedDescription : t.description }}</p>
    <fieldset :disabled="busy">
      <legend class="sr-only">{{ t.title }}</legend>
      <label class="storage-choice"><input v-model="choice" type="radio" :name="id" value="system" />{{ t.systemOption }}</label>
      <label class="storage-choice"><input v-model="choice" type="radio" :name="id" value="file" :disabled="!recovery.can_save_file" />{{ t.fileOption }}</label>
      <p v-if="!recovery.can_save_file">{{ t.fileUnavailable }}</p>
      <p v-if="choice === 'system'">{{ repairGuide }}</p>
      <template v-else>
        <p :id="`${id}-warning`">{{ kind === 'advanced' ? t.advancedFileWarning : t.fileWarning }}</p>
        <label class="storage-choice"><input v-model="consent" type="checkbox" :aria-describedby="`${id}-warning`" />{{ t.consent }}</label>
      </template>
      <div class="recovery-actions">
        <button class="button primary" type="submit" :disabled="busy || (choice === 'file' && !consent)">{{ choice === 'file' ? t.saveFile : t.retrySystem }}</button>
        <button class="button secondary" type="button" :disabled="busy" @click="emit('discard')">{{ kind === 'advanced' ? t.advancedDiscard : t.discard }}</button>
      </div>
    </fieldset>
  </form>
</template>

<style scoped>
.credential-recovery { margin-top: 14px; padding: 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--mat-inset); }
h4 { margin: 0 0 10px; font-size: var(--fs-md); }
p { color: var(--muted); line-height: 1.65; margin: 10px 0; overflow-wrap: anywhere; }
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.storage-choice { display: flex; align-items: baseline; gap: 10px; margin: 12px 0; line-height: 1.55; }
input { flex: none; accent-color: var(--accent); }
.recovery-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
</style>

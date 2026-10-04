<script setup lang="ts">
import { nextTick, ref } from 'vue';
import Icon from '../Icon.vue';
import ProfileTray from './ProfileTray.vue';
import { useBridgeText } from './bridge/bridge.i18n';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import type { AiTaskTemplate } from '../../lib/bridge/types';
const props = defineProps<{ templates: AiTaskTemplate[]; disabled?: boolean }>();
const emit = defineEmits<{ workout: [] }>();
const t = useBridgeText(), ctl = useAiTaskDraft(), box = ref<HTMLTextAreaElement | null>(null), profile = ref(false);
const intents = ['sleep','week','workout','next'] as const;
type Intent = typeof intents[number];
const labels = () => ({ sleep: t.value.sleepIntent, week: t.value.weekIntent, workout: t.value.workoutIntent, next: t.value.nextIntent });
const pick = async (intent: Intent) => {
  if (props.disabled) return;
  const id = {sleep:'sleep_review',week:'week_review',workout:'recovery_run',next:'next_week'}[intent];
  ctl.setTemplate(props.templates.find(p => p.id === id) ?? null);
  ctl.setWindowDays(({sleep:14,week:7,workout:14,next:30}[intent]) - 1);
  ctl.setPrompt({sleep:t.value.sleepQuestion,week:t.value.weekQuestion,workout:t.value.workoutQuestion,next:t.value.nextQuestion}[intent]);
  if (intent === 'workout') emit('workout');
  await nextTick(); box.value?.focus();
};
</script>
<template>
  <section class="compose-line">
    <div class="intent-row"><button v-for="intent in intents" :key="intent" type="button" class="intent" :disabled="disabled" @click="pick(intent)"><Icon :name="({ sleep:'moon',week:'clock',workout:'run',next:'grid' } as const)[intent]" :size="13"/>{{ labels()[intent] }}</button><button type="button" class="profile-entry" :class="{ filled: ctl.draft.value.personal_note.trim() }" :disabled="disabled" @click="profile = true"><Icon name="user" :size="13"/>{{ t.profile }}</button></div>
    <label class="compose-box"><span>{{ t.composer }}</span><textarea ref="box" :value="ctl.draft.value.prompt" :placeholder="t.placeholder" :disabled="disabled" rows="2" @input="ctl.setPrompt(($event.target as HTMLTextAreaElement).value)"></textarea></label>
    <ProfileTray v-if="profile" @close="profile = false"/>
  </section>
</template>
<style scoped src="./ComposeLine.css"></style>

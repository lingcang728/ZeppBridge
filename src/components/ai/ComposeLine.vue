<script setup lang="ts">
import { nextTick, ref } from 'vue';
import Icon from '../Icon.vue';
import TintIcon from './TintIcon.vue';
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
/* 模板胶囊点一下做什么：悬停写清楚（新手看名字猜不出「排下周」会带上 30 天的数据、等你说定稿才出计划）。 */
const hints = () => ({ sleep: t.value.sleepIntentHint, week: t.value.weekIntentHint, workout: t.value.workoutIntentHint, next: t.value.nextIntentHint });
/* 每个模板胶囊一种颜色、一枚有底座的图标；正在用的那个亮起来（以前四枚长得一样，看不出点了哪个）。 */
const look: Record<Intent, { icon: 'moon' | 'bars' | 'run' | 'compass'; tint: string; id: string }> = {
  sleep: { icon: 'moon', tint: 'var(--sleep-light)', id: 'sleep_review' },
  week: { icon: 'bars', tint: 'var(--training)', id: 'week_review' },
  workout: { icon: 'run', tint: 'var(--activity)', id: 'recovery_run' },
  next: { icon: 'compass', tint: 'var(--accent)', id: 'next_week' },
};
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
    <div class="intent-row"><button v-for="intent in intents" :key="intent" type="button" :class="['intent', { on: ctl.draft.value.template_id === look[intent].id }]" :style="{ '--tint': look[intent].tint }"
      :aria-pressed="ctl.draft.value.template_id === look[intent].id" :disabled="disabled" :title="hints()[intent]" @click="pick(intent)"><TintIcon :name="look[intent].icon" :tint="look[intent].tint" :size="24" />{{ labels()[intent] }}</button><button type="button" class="profile-entry" :class="{ filled: ctl.draft.value.personal_note.trim() }" :disabled="disabled" @click="profile = true"><Icon name="user" :size="13"/>{{ t.profile }}</button></div>
    <label class="compose-box"><span>{{ t.composer }}</span><textarea ref="box" :value="ctl.draft.value.prompt" :placeholder="t.placeholder" :disabled="disabled" rows="2" @input="ctl.setPrompt(($event.target as HTMLTextAreaElement).value)"></textarea></label>
    <ProfileTray v-if="profile" @close="profile = false"/>
  </section>
</template>
<style scoped src="./ComposeLine.css"></style>

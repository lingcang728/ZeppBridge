<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { locale } from '../i18n';
import { JOURNEY } from '../views/landing/journeyCopy';
import Icon from '../components/Icon.vue';
import GlassRim from '../components/shell/GlassRim.vue';
import { useTrainingPlan } from '../composables/useTrainingPlan';
const emit = defineEmits<{ review: [] }>();
const dialog = ref<HTMLDialogElement | null>(null), answered = ref(false);
const copy = computed(() => JOURNEY[locale.value]);
let timer = 0;
const open = () => { if (dialog.value?.open) return; answered.value = false; dialog.value?.showModal(); timer = window.setTimeout(() => { answered.value = true; }, 1400); };
const review = async () => {
  const api = (window as unknown as { __ZB_DEMO_API__: { receivePlan(): void } }).__ZB_DEMO_API__;
  api.receivePlan(); await useTrainingPlan().receiveFromClipboard(); dialog.value?.close(); emit('review');
};
onMounted(() => window.addEventListener('demo-handoff', open));
onBeforeUnmount(() => { window.removeEventListener('demo-handoff', open); clearTimeout(timer); });
</script>
<template>
  <dialog ref="dialog" class="demo-conversation glass-control is-lens-host has-rim" aria-labelledby="sample-response-title">
    <GlassRim /><header><Icon name="spark" :size="28" /><h2 id="sample-response-title">{{ copy.response[0] }}</h2><button class="icon-button" type="button" aria-label="Close" @click="dialog?.close()"><Icon name="x" /></button></header>
    <div v-if="!answered" class="response-skeleton" role="status" :aria-label="copy.response[0]"><i></i><i></i><i></i></div>
    <template v-else><p>{{ copy.response[1] }}</p><button class="pill-button" type="button" @click="review"><Icon name="send" />{{ copy.response[2] }}</button></template>
  </dialog>
</template>
<style scoped>
.demo-conversation { width: min(620px, calc(100% - 32px)); padding: 32px; border-radius: 28px; color: var(--ink); }
.demo-conversation::backdrop { background: rgba(10,14,20,.35); backdrop-filter: blur(8px); }
header { display: flex; gap: 14px; align-items: center; } h2 { font-size: 22px; margin: 0; flex: 1; }
p { font-size: 18px; line-height: 1.9; margin: 28px 0; } .pill-button { min-height: 48px; font-size: 16px; }
.icon-button { border: 0; background: none; color: inherit; cursor: pointer; padding: 8px; }
.response-skeleton { display: grid; gap: 15px; margin: 40px 0; }
.response-skeleton i { height: 15px; border-radius: 9px; background: var(--line); animation: breathe 1s ease alternate infinite; } .response-skeleton i:last-child { width: 60%; }
@keyframes breathe { to { opacity: .3; } }
</style>

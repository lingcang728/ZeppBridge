<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useTrainingPlan } from '../../../composables/useTrainingPlan';
import { useBridgeText } from './bridge.i18n';
import { isDesktop } from '../../../lib/bridge';
import Icon from '../../Icon.vue';
const props = defineProps<{ compact?: boolean }>();
const emit = defineEmits<{ received: [] }>();
const t = useBridgeText(), plan = useTrainingPlan();
const webOpen = ref(false), reply = ref(''), scattering = ref(false);
let timer = 0;
const receive = async () => { if (!isDesktop()) { webOpen.value = true; return; } if (await plan.receiveFromClipboard()) emit('received'); };
const paste = async () => { if (await plan.paste(reply.value)) { reply.value = ''; webOpen.value = false; emit('received'); } };
watch(plan.transcript, (value) => { if (!value) return; scattering.value = true; window.clearTimeout(timer); timer = window.setTimeout(() => { scattering.value = false; plan.transcript.value = null; }, 1100); });
onBeforeUnmount(() => { window.clearTimeout(timer); plan.transcript.value = null; });
</script>
<template>
  <div class="receive" :class="{ compact: props.compact, scattering }">
    <div v-if="plan.transcript.value" class="glass-paper" aria-hidden="true"><span v-for="(line,i) in plan.transcript.value.lines" :key="i" :style="{ '--i': i }">{{ line }}</span><small>{{ t.transcript(plan.transcript.value.total) }}</small></div>
    <button type="button" class="receive-capsule" :disabled="plan.busy.value" @click="receive"><Icon name="copy" :size="16"/><span>{{ plan.busy.value ? t.receiving : compact ? t.receiveAnother : t.receive }}</span><Icon name="chevron-down" :size="13"/></button>
    <p v-if="!compact">{{ t.receiveHint }}</p>
    <div v-if="webOpen" class="web-paste"><label>{{ t.previewPaste }}<textarea v-model="reply" rows="4"></textarea></label><button type="button" class="pill-button" :disabled="!reply.trim() || plan.busy.value" @click="paste">{{ t.inspect }}</button><button class="pill-button quiet" @click="webOpen = false">{{ t.close }}</button></div>
  </div>
</template>
<style scoped src="./ReceiveCapsule.css"></style>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { locale } from '../i18n';
import { JOURNEY } from '../views/landing/journeyCopy';
import { PlaybackClock } from '../views/landing/playback';
import { dialogueCopy } from './dialogueCopy';
import Icon from '../components/Icon.vue';
import { useTrainingPlan } from '../composables/useTrainingPlan';
import type { DemoPlan } from './plan';
const emit = defineEmits<{ review: [] }>();
const dialog = ref<HTMLDialogElement | null>(null), feed = ref<HTMLElement | null>(null);
const copy = computed(() => JOURNEY[locale.value]);
const labels = computed(() => dialogueCopy(locale.value));
const turns = computed(() => [...copy.value.turns.slice(0, 2), labels.value.finalTurn]);
const shown = ref(0), answered = ref(0), thinking = ref(false), status = ref('ready');
let controller: AbortController | undefined, clock: PlaybackClock | undefined;
let parentPaused = false;
const sync = () => clock?.setPaused(document.hidden || parentPaused);
const playback = (event: Event) => { parentPaused = (event as CustomEvent<boolean>).detail; sync(); };
const stop = () => { controller?.abort(); clock?.dispose(); thinking.value = false; };
const close = () => { stop(); dialog.value?.close(); };
const open = () => {
  if (dialog.value?.open) return;
  stop(); shown.value = 0; answered.value = 0; status.value = 'ready'; dialog.value?.showModal();
};
const scroll = async (reply = false) => {
  await nextTick();
  const el = feed.value;
  if (!el) return;
  const last = reply ? el.querySelector<HTMLElement>('.message-pair:last-child .answer') : null;
  el.scrollTo({ top: last ? el.scrollTop + last.getBoundingClientRect().top - el.getBoundingClientRect().top - 20 : el.scrollHeight,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
};
const review = async () => {
  const api = (window as unknown as { __ZB_DEMO_API__: { receivePlan(): void; plan: DemoPlan } }).__ZB_DEMO_API__;
  // The same local draft supplies the final view. Keep the demonstrated edit in that document.
  {
    const draft = api.plan.state().drafts[0]?.document;
    if (draft) {
      const document = structuredClone(draft);
      const first = document.workouts[0];
      if (first) first.steps = [{ kind: 'warmup', duration: '6min' }, { kind: 'active', duration: '28min' }, { kind: 'cooldown', duration: '6min' }];
      api.plan.saveDraft(document);
    }
  }
  api.receivePlan(); await useTrainingPlan().receiveFromClipboard();
  dialog.value?.close(); emit('review');
};
const send = async () => {
  if (status.value !== 'ready') return;
  controller = new AbortController(); const signal = controller.signal;
  clock = new PlaybackClock(signal); const timeline = clock; sync();
  status.value = 'chat';
  try {
    for (let index = 0; index < 3; index++) {
      shown.value = index + 1; thinking.value = true; await scroll();
      await timeline.wait(1600);
      answered.value = index + 1; thinking.value = false; await scroll(true);
      await timeline.wait(index === 0 ? 8500 : index === 1 ? 8000 : 6500);
      if (index < 2) await timeline.wait(700);
    }
    status.value = 'plan'; await scroll(); await timeline.wait(2600);
    status.value = 'copy'; await timeline.wait(1400);
    status.value = 'return'; await timeline.wait(900); await review();
  } catch (error) { if (!signal.aborted) { status.value = 'ready'; console.error(error); } }
};
onMounted(() => {
  window.addEventListener('demo-handoff', open);
  window.addEventListener('showcase-playback', playback);
  document.addEventListener('visibilitychange', sync);
});
onBeforeUnmount(() => {
  stop(); window.removeEventListener('demo-handoff', open); window.removeEventListener('showcase-playback', playback);
  document.removeEventListener('visibilitychange', sync);
});
</script>

<template>
  <dialog ref="dialog" class="demo-conversation" :data-turn="shown" :data-state="status" aria-labelledby="sample-response-title" @cancel="stop" @close="stop">
    <header><span class="assistant-avatar"><Icon name="spark" :size="22" /></span><div><h2 id="sample-response-title">{{ copy.aiTitle }}</h2><small>{{ labels.example }}</small></div><button class="icon-button" type="button" :aria-label="labels.back" @click="close"><Icon name="x" /></button></header>
    <div ref="feed" class="chat-feed" :class="{ empty: status === 'ready' }" aria-live="off">
      <div v-if="status === 'ready'" class="chat-intro"><Icon name="spark" :size="38" /><p>{{ copy.aiTitle }}</p><span>{{ labels.example }}</span></div>
      <div v-for="(turn, index) in turns.slice(0, shown)" :key="index" class="message-pair">
        <div class="message user"><span class="user-avatar">{{ copy.you }}</span><div><div v-if="index === 0" class="attachment"><Icon name="file" :size="22" /><span>ZeppBridge.md<small>Markdown · 14 KB</small></span></div><p>{{ turn.prompt }}</p></div></div>
        <div v-if="answered > index" class="message answer"><span class="assistant-avatar"><Icon name="spark" :size="20" /></span><div><p v-for="paragraph in turn.answer.split('\n\n')" :key="paragraph">{{ paragraph }}</p></div></div>
      </div>
      <div v-if="thinking" class="thinking"><span class="assistant-avatar"><Icon name="spark" :size="20" /></span><span>{{ labels.thinking }}</span><i></i><i></i><i></i></div>
      <div v-if="['plan', 'copy', 'return'].includes(status)" class="plan-result" :class="{ copying: status !== 'plan' }"><Icon name="file" :size="30" /><div><strong>{{ labels.ready }}</strong><span>ZeppBridge.plan.json</span></div><span class="copy-state"><Icon :name="status === 'plan' ? 'copy' : 'check'" :size="18" />{{ status === 'plan' ? labels.copy : labels.returning }}</span></div>
    </div>
    <footer v-if="status === 'ready'" class="chat-compose"><div class="attachment"><Icon name="file" :size="20" /><span>ZeppBridge.md<small>Markdown · 14 KB</small></span></div><p>{{ turns[0].prompt }}</p><button class="conversation-send" type="button" @click="send"><Icon name="send" :size="18" />{{ labels.send }}</button></footer>
    <footer v-else class="chat-progress"><span v-for="n in 3" :key="n" :class="{ done: answered >= n, active: shown === n }">0{{ n }}</span><small>{{ labels.example }}</small></footer>
  </dialog>
</template>

<style scoped>
.demo-conversation { width: min(940px, calc(100% - 40px)); height: min(700px, calc(100dvh - 40px)); max-height: none; padding: 0; border: 1px solid var(--line); border-radius: 26px; color: var(--ink); background: var(--bg); box-shadow: 0 35px 100px -20px rgba(0,0,0,.5); overflow: hidden; }
.demo-conversation[open] { display: flex; flex-direction: column; animation: appear 550ms cubic-bezier(.2,1,.3,1) both; }
.demo-conversation::backdrop { background: rgba(10,14,20,.4); backdrop-filter: blur(16px); }
header { display: flex; align-items: center; gap: 12px; padding: 18px 26px; border-bottom: 1px solid var(--line); }
header > div { flex: 1; } h2 { font-size: 16px; margin: 0 0 2px; } header small { font-size: 11px; color: var(--subtle); }
.icon-button { border: 0; background: transparent; color: inherit; cursor: pointer; padding: 8px; }
.assistant-avatar, .user-avatar { display: grid; place-items: center; width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%; background: var(--surface); color: var(--accent); }
.user-avatar { font-size: 10px; color: var(--ink); background: var(--accent-soft); }
.chat-feed { flex: 1; min-height: 0; overflow-y: auto; padding: 24px 32px; overscroll-behavior: contain; }
.chat-feed.empty { display: grid; place-items: center; }
.chat-intro { text-align: center; color: var(--subtle); } .chat-intro > svg { margin: auto; color: var(--accent); }
.chat-intro p { margin: 12px 0 4px; color: var(--ink); font-size: 24px; } .chat-intro span { font-size: 12px; }
.message { display: flex; align-items: start; gap: 12px; margin-bottom: 24px; animation: appear 420ms cubic-bezier(.2,1,.3,1) both; }
.message > div { min-width: 0; max-width: 88%; }
.message.user { flex-direction: row-reverse; margin-left: 12%; } .message.user > div { background: var(--surface); padding: 14px 18px; border-radius: 18px 4px 18px 18px; }
.message p, .chat-compose p { margin: 0 0 12px; font-size: 17px; line-height: 1.8; } .message p:last-child { margin-bottom: 0; }
.attachment { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; color: var(--ink); font-size: 13px; }
.attachment svg { color: var(--accent); } .attachment small { display: block; color: var(--subtle); font-size: 10px; margin-top: 2px; }
.thinking { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; }
.thinking > span:nth-child(2) { margin: 0 10px 0 6px; } .thinking i { width: 4px; height: 4px; background: var(--subtle); border-radius: 50%; animation: breathe 800ms ease alternate infinite; } .thinking i:nth-last-child(2) { animation-delay: 150ms; } .thinking i:last-child { animation-delay: 300ms; }
.plan-result { display: flex; align-items: center; gap: 14px; margin: 20px 0 4px 44px; padding: 20px; border: 1px solid var(--line); background: var(--surface); border-radius: 16px; animation: appear 500ms ease both; transition: transform 800ms ease, opacity 800ms ease; }
.plan-result > svg { color: var(--accent); } .plan-result > div { flex: 1; } .plan-result strong { display: block; font-size: 15px; } .plan-result div span { font-size: 12px; color: var(--subtle); }
.copy-state { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--accent); } .plan-result.copying { transform: translateY(8px) scale(.97); opacity: .7; }
.chat-compose { position: relative; margin: 0 26px 24px; padding: 18px 22px 54px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); }
.conversation-send { position: absolute; bottom: 14px; right: 18px; display: flex; align-items: center; gap: 8px; padding: 8px 18px; border: 0; border-radius: 999px; background: var(--accent); color: var(--accent-ink); font: inherit; cursor: pointer; }
.chat-progress { display: flex; align-items: center; gap: 10px; padding: 14px 32px; border-top: 1px solid var(--line); color: var(--subtle); font-size: 11px; }
.chat-progress > span { padding: 4px 8px; border-radius: 999px; } .chat-progress > span.active { background: var(--surface); } .chat-progress > span.done { color: var(--accent); } .chat-progress small { margin-left: auto; }
@keyframes appear { from { opacity: 0; transform: translateY(12px) scale(.98); } }
@keyframes breathe { to { opacity: .25; } }
@media(max-width:600px) { header { padding: 12px 16px; } .chat-feed { padding: 16px; } .message p, .chat-compose p { font-size: 15px; } .chat-compose { margin: 0 12px 12px; } .plan-result { margin-left: 0; } .copy-state { max-width: 85px; } }
@media(prefers-reduced-motion:reduce) { .demo-conversation[open], .message, .plan-result, .thinking i { animation: none; transition: none; } }
</style>

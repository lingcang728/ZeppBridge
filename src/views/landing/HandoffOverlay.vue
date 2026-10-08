<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import LandingIcon from './LandingIcon.vue';
import type { LandingCopy } from './types';
const props = defineProps<{ open: boolean; copy: LandingCopy['handoff']; sample: string }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
let previousFocus: HTMLElement | null = null;
let background: HTMLElement | null = null;
let previousInert = false;
let previousOverflow = '';
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); return; }
  if (event.key !== 'Tab') return;
  const nodes = dialog.value?.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]');
  if (!nodes?.length) return;
  const first = nodes[0]; const last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
};
const restore = () => {
  if (background) background.inert = previousInert;
  document.body.style.overflow = previousOverflow;
  window.removeEventListener('keydown', onKeydown, true);
  if (previousFocus?.isConnected && !previousFocus.inert) previousFocus.focus({ preventScroll: true });
  background = null;
};
watch(() => props.open, async (open) => {
  if (!open) { restore(); return; }
  previousFocus = document.activeElement as HTMLElement | null;
  background = document.querySelector<HTMLElement>('.lp');
  previousInert = background?.inert ?? false;
  previousOverflow = document.body.style.overflow;
  if (background) background.inert = true;
  document.body.style.overflow = 'hidden';
  window.addEventListener('keydown', onKeydown, true);
  await nextTick();
  closeButton.value?.focus();
});
onBeforeUnmount(() => { if (background) restore(); });
</script>

<template>
  <Teleport to="body">
    <Transition name="handoff">
      <div v-if="open" class="handoff-backdrop" @click.self="emit('close')">
        <section ref="dialog" class="handoff-chat" role="dialog" aria-modal="true" :aria-label="copy.chat" aria-describedby="handoff-note">
          <header class="handoff-header"><LandingIcon name="file" :size="22" /><div><strong>{{ copy.chat }}</strong><span>{{ sample }}</span></div><button ref="closeButton" type="button" :aria-label="copy.close" @click="emit('close')"><LandingIcon name="x" :size="20" /></button></header>
          <div class="handoff-thread">
            <article class="handoff-request"><p class="handoff-speaker">{{ copy.you }}</p><p class="handoff-file"><LandingIcon name="file" :size="16" />{{ copy.file }}</p><p>{{ copy.prompt }}</p></article>
            <article class="handoff-answer"><p class="handoff-speaker">AI · {{ sample }}</p><p>{{ copy.answer }}</p></article>
          </div>
          <p id="handoff-note" class="handoff-note">{{ copy.note }}</p>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.handoff-backdrop { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 24px; background: rgba(10,15,12,.52); font-family: var(--font-sans); }
.handoff-chat { --chat-panel: #fbfaf5; --chat-ink: #1b2118; --chat-muted: #5b6757; --chat-line: rgba(30,36,26,.14); --chat-green: #2f6b4f; --chat-paper: #f0f1e7; display: grid; grid-template-rows: auto minmax(0,1fr) auto; width: min(640px,100%); max-height: min(780px,calc(100dvh - 48px)); overflow: hidden; border: 1px solid var(--chat-line); border-radius: 24px; background: var(--chat-panel); color: var(--chat-ink); box-shadow: 0 28px 90px -30px rgba(0,0,0,.45); }
:root[data-theme='dark'] .handoff-chat { --chat-panel: #16191e; --chat-ink: #f2f4ee; --chat-muted: #b4bbc3; --chat-line: rgba(226,234,242,.14); --chat-green: #93b952; --chat-paper: #20252b; }
.handoff-header { display: flex; align-items: center; gap: 12px; padding: 20px 24px; border-bottom: 1px solid var(--chat-line); }
.handoff-header > svg { color: var(--chat-green); }
.handoff-header div { display: grid; gap: 3px; flex: 1; }
.handoff-header strong { font-size: 15px; }
.handoff-header span { color: var(--chat-muted); font-size: 11px; }
.handoff-header button { display: grid; place-items: center; width: 40px; height: 40px; padding: 0; border: 1px solid var(--chat-line); border-radius: 50%; background: transparent; color: var(--chat-ink); cursor: pointer; }
.handoff-header button:focus-visible { outline: 2px solid var(--chat-green); outline-offset: 3px; }
.handoff-thread { overflow: auto; padding: 24px; font-size: 14px; line-height: 1.8; overscroll-behavior: contain; }
.handoff-thread p { margin: 0; white-space: pre-line; overflow-wrap: anywhere; }
.handoff-request { margin-left: 32px; padding: 18px 20px; border-radius: 16px; background: var(--chat-paper); }
.handoff-thread .handoff-speaker { margin-bottom: 10px; color: var(--chat-muted); font-size: 11px; font-weight: 650; }
.handoff-thread .handoff-file { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: var(--chat-green); font-size: 12px; }
.handoff-answer { padding: 28px 0 4px; }
.handoff-note { margin: 0; padding: 16px 24px; border-top: 1px solid var(--chat-line); color: var(--chat-muted); font-size: 11px; line-height: 1.6; }
.handoff-enter-active, .handoff-leave-active { transition: opacity .18s ease; }
.handoff-enter-active .handoff-chat, .handoff-leave-active .handoff-chat { transition: transform .25s ease; }
.handoff-enter-from, .handoff-leave-to { opacity: 0; }
.handoff-enter-from .handoff-chat, .handoff-leave-to .handoff-chat { transform: translateY(14px); }
@media (max-width: 520px) { .handoff-backdrop { padding: 12px; } .handoff-chat { max-height: calc(100dvh - 24px); border-radius: 18px; } .handoff-header, .handoff-thread, .handoff-note { padding: 18px; } .handoff-request { margin-left: 12px; padding: 15px; } }
@media (prefers-reduced-motion: reduce) { .handoff-enter-active, .handoff-leave-active, .handoff-enter-active .handoff-chat, .handoff-leave-active .handoff-chat { transition: none; } }
</style>

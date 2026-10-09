<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import LandingIcon from './LandingIcon.vue';
import { LANDING_LOCALES, LOCALE_LABELS, type LandingLocale } from '../../composables/useLandingLocale';
const props = defineProps<{ modelValue: LandingLocale; label: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: LandingLocale] }>();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const popupLeft = ref(0);
const position = () => {
 const box=root.value?.getBoundingClientRect();
 if (!box) return;
 const width=Math.min(248,innerWidth-36);
 popupLeft.value=Math.max(18,Math.min(box.right-width,innerWidth-width-18))-box.left;
};
const close = (focus = false) => { open.value = false; if (focus) trigger.value?.focus({ preventScroll: true }); };
const focusItem = (index: number) => menu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')[(index + LANDING_LOCALES.length) % LANDING_LOCALES.length]?.focus();
const toggle = async () => { if (open.value) { close(); return; } position(); open.value = true; await nextTick(); focusItem(LANDING_LOCALES.indexOf(props.modelValue)); };
const choose = (locale: LandingLocale) => { emit('update:modelValue', locale); close(true); };
const keydown = (event: KeyboardEvent) => {
 if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
 if (!open.value) { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); void toggle(); } return; }
 const nodes = [...(menu.value?.querySelectorAll('[role="menuitemradio"]') ?? [])];
 const index = nodes.indexOf(document.activeElement as Element);
 if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); focusItem(event.key === 'Home' ? 0 : event.key === 'End' ? LANDING_LOCALES.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1)); }
};
const outside = (event: Event) => { if (open.value && !root.value?.contains(event.target as Node)) close(); };
onMounted(() => { document.addEventListener('pointerdown', outside); document.addEventListener('focusin', outside); window.addEventListener('resize',position); });
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); window.removeEventListener('resize',position); });
</script>
<template>
<div ref="root" class="language-menu" @keydown="keydown">
<button ref="trigger" class="language-trigger" type="button" :aria-label="`${label}: ${LOCALE_LABELS[modelValue]}`" aria-haspopup="menu" :aria-expanded="open" aria-controls="landing-languages" @click="toggle">
<LandingIcon name="globe" :size="18" /><span>{{ LOCALE_LABELS[modelValue] }}</span><LandingIcon name="chevron-down" :size="12" />
</button>
<div v-if="open" id="landing-languages" ref="menu" role="menu" :aria-label="label" class="language-popup" :style="{left:popupLeft+'px'}">
<button v-for="value in LANDING_LOCALES" :key="value" type="button" role="menuitemradio" :aria-checked="value === modelValue" :lang="value === 'zh' ? 'zh-CN' : value" :tabindex="value === modelValue ? 0 : -1" @click="choose(value)">
<span>{{ LOCALE_LABELS[value] }}</span><LandingIcon v-if="value === modelValue" name="check" :size="16" />
</button></div></div>
</template>
<style scoped>
.language-menu { position: relative; }
.language-trigger { display: flex; align-items: center; gap: 8px; min-height: 44px; max-width: 190px; padding: 0 10px; border: 0; border-radius: 9px; background: transparent; color: var(--lp-ink); font: inherit; font-size: 12px; cursor: pointer; }
.language-trigger span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.language-trigger:hover, .language-trigger[aria-expanded='true'] { background: var(--lp-bg-2); }
.language-popup { position: absolute; top: calc(100% + 12px); width: 248px; max-width: calc(100vw - 36px); max-height:calc(100dvh - 120px); overflow:auto; padding: 8px; border: 1px solid var(--lp-line-2); border-radius: 16px; background: var(--lp-panel); box-shadow: var(--lp-shadow); }
.language-popup button { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 42px; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--lp-ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.language-popup button:hover, .language-popup button:focus-visible { background: var(--lp-bg-2); }
.language-popup button[aria-checked='true'] { color: var(--lp-green); }
@media(max-width:600px) { .language-trigger { max-width: 106px; gap: 5px; padding: 0 5px; font-size: 11px; } }
</style>

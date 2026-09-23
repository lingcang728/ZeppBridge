<script setup lang="ts">
/**
 * Language dropdown for the landing page.
 *
 * Same keyboard/a11y contract as the app's SelectMenu — combobox trigger,
 * teleported listbox, arrow keys + Home/End, Enter/Space to choose, Esc or
 * outside pointerdown to close — but deliberately self-contained: SelectMenu
 * depends on the app's i18n layer, and pulling that into the landing chunk
 * would defeat the point of this page staying tiny. Styling mirrors the
 * landing nav pill (the old .lang-toggle look).
 */
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import DesignIcon from '../../components/DesignIcon.vue';
import {
  LANDING_LOCALES,
  LOCALE_LABELS,
  type LandingLocale,
} from '../../composables/useLandingLocale';
import { popoverStyle } from '../../lib/popoverPosition';

const props = defineProps<{
  modelValue: LandingLocale;
  ariaLabel?: string;
}>();

const emit = defineEmits<{ (event: 'update:modelValue', value: LandingLocale): void }>();

const options = LANDING_LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] }));

const open = ref(false);
const activeIndex = ref(-1);
const root = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const listId = `landing-locale-${useId()}`;
const optionId = (index: number) => `${listId}-option-${index}`;
const activeOptionId = computed(() =>
  open.value && options[activeIndex.value] ? optionId(activeIndex.value) : undefined);

/*
 * The panel is teleported to body and positioned from the trigger's rect:
 * fixed positioning plus teleport means no ancestor overflow or stacking
 * context can clip it or paint over it — the same fix SelectMenu needed.
 * The math is shared with it via lib/popoverPosition.
 */
const menuStyle = ref<Record<string, string>>({});
const MENU_MAX_HEIGHT = 340;
// Wider than the pill trigger so 'Português (Brasil)' doesn't wrap.
const MENU_MIN_WIDTH = 184;

const measure = () => {
  const trigger = triggerRef.value;
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  menuStyle.value = popoverStyle(
    { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
    { width: window.innerWidth, height: window.innerHeight },
    { maxHeight: MENU_MAX_HEIGHT, width: Math.max(rect.width, MENU_MIN_WIDTH) },
  ) as unknown as Record<string, string>;
};

const selectedIndex = computed(() =>
  options.findIndex((option) => option.value === props.modelValue));

const scrollActiveIntoView = () => {
  void nextTick(() => {
    const list = listRef.value;
    if (!list) return;
    const item = list.children[activeIndex.value] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  });
};

const openMenu = () => {
  measure();
  open.value = true;
  activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : 0;
  scrollActiveIntoView();
};

const closeMenu = () => {
  open.value = false;
  activeIndex.value = -1;
};

const toggle = () => (open.value ? closeMenu() : openMenu());

const choose = (index: number) => {
  const option = options[index];
  if (!option) return;
  emit('update:modelValue', option.value);
  closeMenu();
};

const move = (delta: number) => {
  if (!open.value) {
    openMenu();
    return;
  }
  activeIndex.value = Math.min(options.length - 1, Math.max(0, activeIndex.value + delta));
  scrollActiveIntoView();
};

const onKeydown = (event: KeyboardEvent) => {
  switch (event.key) {
    case 'ArrowDown': event.preventDefault(); move(1); break;
    case 'ArrowUp': event.preventDefault(); move(-1); break;
    case 'Home': if (open.value) { event.preventDefault(); activeIndex.value = 0; scrollActiveIntoView(); } break;
    case 'End': if (open.value) { event.preventDefault(); activeIndex.value = options.length - 1; scrollActiveIntoView(); } break;
    case 'Enter':
    case ' ':
      event.preventDefault();
      if (open.value) choose(activeIndex.value);
      else openMenu();
      break;
    case 'Escape': if (open.value) { event.preventDefault(); closeMenu(); } break;
    case 'Tab': closeMenu(); break;
    default: break;
  }
};

const onPointerDown = (event: PointerEvent) => {
  if (!open.value) return;
  const target = event.target as Node;
  // The list is teleported to body, so it is outside `root` — both must pass.
  if (root.value?.contains(target)) return;
  if (listRef.value?.contains(target)) return;
  closeMenu();
};

// Focus stays on the combobox while its teleported options are navigated.
const onFocusOut = (event: FocusEvent) => {
  if (!root.value?.contains(event.relatedTarget as Node | null)) closeMenu();
};

/* A teleported panel does not scroll with the trigger's container — re-measure
   instead of closing, so a scroll doesn't yank the menu away mid-gesture. */
const reposition = () => {
  if (!open.value) return;
  measure();
};

watch(open, (isOpen) => {
  if (isOpen) {
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
  } else {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointerDown, true);
  window.removeEventListener('scroll', reposition, true);
  window.removeEventListener('resize', reposition);
});
</script>

<template>
  <div ref="root" :class="['locale-menu', { 'is-open': open }]" @focusout="onFocusOut">
    <button
      type="button"
      class="locale-trigger"
      role="combobox"
      :aria-expanded="open"
      :aria-label="ariaLabel"
      :aria-controls="open ? listId : undefined"
      :aria-activedescendant="activeOptionId"
      aria-haspopup="listbox"
      ref="triggerRef"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="locale-value">{{ LOCALE_LABELS[modelValue] }}</span>
      <DesignIcon name="chevron-down" :size="15" class="locale-caret" />
    </button>

    <Teleport to="body">
      <ul
        v-if="open"
        ref="listRef"
        :id="listId"
        class="landing-locale-list"
        :style="menuStyle"
        role="listbox"
        :aria-label="ariaLabel"
        @pointerdown.stop
        @mousedown.prevent
      >
        <li
          v-for="(option, index) in options"
          :key="option.value"
          :id="optionId(index)"
          role="option"
          :aria-selected="option.value === modelValue"
          :class="['landing-locale-option', {
            'is-active': index === activeIndex,
            'is-selected': option.value === modelValue,
          }]"
          @pointermove="activeIndex = index"
          @click="choose(index)"
        >
          <span class="option-label">{{ option.label }}</span>
          <svg v-if="option.value === modelValue" class="option-tick" viewBox="0 0 16 16" aria-hidden="true">
            <path d="m3.2 8.6 3 3 6.6-6.9" />
          </svg>
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<!--
  The list is teleported to body, outside this component's scope *and* outside
  .landing-page — so the --site-* custom properties are out of reach here and
  the landing palette is repeated literally. --fs-* live on :root and still
  resolve. Prefixed class names keep the global rules from colliding.
-->
<style>
.landing-locale-list {
  z-index: 2300;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  border: 1px solid rgba(211, 231, 171, .18);
  border-radius: 12px;
  background: #151a16;
  box-shadow: 0 18px 44px rgba(0, 0, 0, .55);
  list-style: none;
}
.landing-locale-list .landing-locale-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 10px;
  min-height: 32px;
  border-radius: 8px;
  color: #9ca892;
  font-size: var(--fs-sm);
  white-space: nowrap;
  cursor: pointer;
}
.landing-locale-list .landing-locale-option.is-active {
  background: rgba(185, 220, 112, .09);
  color: #e8f0da;
}
.landing-locale-list .landing-locale-option.is-selected { color: #d6e99e; font-weight: 700; }
.landing-locale-list .option-label { overflow-wrap: anywhere; }
.landing-locale-list .option-tick {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  fill: none;
  stroke: #b9dc70;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>

<style scoped>
.locale-menu { position: relative; }

/* Same pill as the nav-github link: 11px radius, hairline border, muted ink. */
.locale-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 11px;
  border: 1px solid var(--site-line);
  border-radius: 11px;
  background: rgba(255, 255, 255, .02);
  color: #9ca892;
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: transform .2s ease, border-color .2s ease, color .2s ease;
}
.locale-trigger:hover, .is-open .locale-trigger { color: #d6e99e; border-color: rgba(185, 220, 112, .5); }
.locale-trigger:active { transform: translateY(1px) scale(.99); }
.locale-trigger:focus-visible { outline: 2px solid rgba(185, 220, 112, .7); outline-offset: 2px; }
.locale-caret { flex: 0 0 auto; transition: transform 160ms ease; }
.is-open .locale-caret { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) { .locale-trigger, .locale-caret { transition: none; } }
</style>

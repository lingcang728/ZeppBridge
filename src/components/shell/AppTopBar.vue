<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import BrandMark from '../BrandMark.vue';
import Icon, { type IconName } from '../Icon.vue';
import SelectMenu from '../SelectMenu.vue';
import { useSyncController } from '../../composables/useSyncController';
import { useTheme } from '../../composables/useTheme';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { defineMessages, locale, LOCALES, LOCALE_LABELS, setLocale, useMessages } from '../../i18n';
import type { Locale } from '../../i18n';
import type { ThemeMode } from '../../composables/useTheme';

const messages = defineMessages(
  {
    mainNav: '主导航',
    brandHome: 'ZeppBridge 3 · 概览',
    connectionTitle: '云端连接状态',
    lastSyncPrefix: '上次同步：',
    notFetchedYet: '尚未获取',
    timeUnknown: '时间未知',
    syncNow: '立即同步',
    verifyFirst: '请先完成连接验证',
    syncing: '同步中…',
    syncFailed: '同步失败',
    syncPartial: '部分未完成',
    cancel: '取消',
    themeTitle: '切换主题',
    themeLight: '浅色',
    themeDark: '深色',
    themeSystem: '跟随系统',
    localeLabel: '界面语言',
  },
  {
    mainNav: 'Main navigation',
    brandHome: 'ZeppBridge 3 · Overview',
    connectionTitle: 'Cloud connection state',
    lastSyncPrefix: 'Last sync: ',
    notFetchedYet: 'Not fetched yet',
    timeUnknown: 'Time unknown',
    syncNow: 'Sync now',
    verifyFirst: 'Verify the connection first',
    syncing: 'Syncing…',
    syncFailed: 'Sync failed',
    syncPartial: 'Partly synced',
    cancel: 'Cancel',
    themeTitle: 'Switch theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    localeLabel: 'Interface language',
  },
  {
    mainNav: 'Navegación principal',
    brandHome: 'ZeppBridge 3 · Resumen',
    connectionTitle: 'Estado de la conexión con la nube',
    lastSyncPrefix: 'Última sincronización: ',
    notFetchedYet: 'Aún sin datos',
    timeUnknown: 'Hora desconocida',
    syncNow: 'Sincronizar ahora',
    verifyFirst: 'Primero verifica la conexión',
    syncing: 'Sincronizando…',
    syncFailed: 'La sincronización falló',
    syncPartial: 'Sincronización parcial',
    cancel: 'Cancelar',
    themeTitle: 'Cambiar tema',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    themeSystem: 'Sistema',
    localeLabel: 'Idioma de la interfaz',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'components/shell/AppTopBar',
);
const t = useMessages(messages);

defineOptions({ name: 'AppTopBar' });

const props = defineProps<{
  items: { to: string; label: string }[];
  navAriaLabel?: string;
  versionTitle?: string;
}>();
const route = useRoute();
const router = useRouter();
const nav = ref<HTMLElement | null>(null);
const thumb = ref({ left: 0, width: 0, visible: false });
let navObserver: ResizeObserver | null = null;
let pending: { id: number; x: number; link: HTMLElement } | null = null;
let dragging: { id: number; x: number; left: number; width: number } | null = null;
let suppressClick = false;

const navLinks = () => Array.from(nav.value?.querySelectorAll<HTMLElement>('.pill-link') ?? []);
/* 滑块的位置用布局坐标（offsetLeft/offsetWidth，相对 nav），不用
   getBoundingClientRect：后者在任何缩放下都是屏幕像素，再写回 translateX
   会被缩放第二次，80% 时滑块就会偏到链接左边、比链接窄。 */
const activeLink = () => navLinks().find((item) => item.dataset.to === route.path);
const linkCenter = (link: HTMLElement) => link.offsetLeft + link.offsetWidth / 2;
/** 屏幕像素 → 布局像素（CSS zoom 回退路径下两者不同）。 */
const layoutScale = () => {
  const el = nav.value;
  if (!el || !el.offsetWidth) return 1;
  return el.getBoundingClientRect().width / el.offsetWidth || 1;
};
const measureThumb = () => {
  if (dragging || !nav.value) return;
  const link = activeLink();
  if (!link) { thumb.value = { ...thumb.value, visible: false }; return; }
  thumb.value = { left: link.offsetLeft, width: link.offsetWidth, visible: true };
};
const onNavDown = (event: PointerEvent) => {
  const link = (event.target as Element).closest<HTMLElement>('.pill-link');
  if (!link || event.pointerType !== 'mouse' || event.button !== 0 || !event.isPrimary) return;
  pending = { id: event.pointerId, x: event.clientX, link };
  link.setPointerCapture(event.pointerId);
};
const onNavMove = (event: PointerEvent) => {
  if (pending?.id === event.pointerId && Math.abs(event.clientX - pending.x) > 6) {
    const current = activeLink() ?? pending.link;
    dragging = { id: event.pointerId, x: pending.x, left: current.offsetLeft, width: current.offsetWidth };
    pending = null;
    suppressClick = true;
    thumb.value = { left: dragging.left, width: dragging.width, visible: true };
  }
  if (!dragging || dragging.id !== event.pointerId || !nav.value) return;
  const links = navLinks();
  const max = Math.max(0, Math.max(...links.map((link) => link.offsetLeft + link.offsetWidth)) - dragging.width);
  const dx = (event.clientX - dragging.x) / layoutScale();
  thumb.value = { left: Math.min(max, Math.max(0, dragging.left + dx)), width: dragging.width, visible: true };
  event.preventDefault();
};
const onNavEnd = (event: PointerEvent) => {
  if (pending?.id === event.pointerId) pending = null;
  if (!dragging || dragging.id !== event.pointerId) return;
  const wasCancelled = event.type === 'pointercancel';
  dragging = null;
  if (wasCancelled) { measureThumb(); return; }
  const center = thumb.value.left + thumb.value.width / 2;
  const target = navLinks().reduce<HTMLElement | null>((best, link) =>
    !best || Math.abs(linkCenter(link) - center) < Math.abs(linkCenter(best) - center) ? link : best, null);
  if (target?.dataset.to) void router.push(target.dataset.to).finally(() => nextTick(measureThumb));
  else measureThumb();
};
const onNavClick = (event: MouseEvent) => {
  if (!suppressClick) return;
  suppressClick = false;
  event.preventDefault();
  event.stopPropagation();
};
watch(() => route.path, () => nextTick(measureThumb));
watch(() => props.items, () => nextTick(measureThumb), { deep: true });
onMounted(() => {
  nextTick(measureThumb);
  if (nav.value) { navObserver = new ResizeObserver(measureThumb); navObserver.observe(nav.value); }
  document.fonts?.ready.then(measureThumb).catch(() => {});
  window.addEventListener('resize', measureThumb);
});
onBeforeUnmount(() => { navObserver?.disconnect(); window.removeEventListener('resize', measureThumb); });

const {
  appStatus, statusError, syncState, syncProgress,
  isSyncing, canIncrementalSync, runSync, cancelSync,
} = useSyncController();
const { themeMode, setTheme } = useTheme();

const accountRecognized = computed(() =>
  ['connected', 'configured'].includes(String(appStatus.value?.connection_state || '')));

/* 状态点的语义和旧顶栏的连接芯片一致：连接问题或同步失败=红，
   部分失败=黄，已连接=绿，其余=灰。 */
const statusTone = computed(() => {
  if (appStatus.value?.connection_state === 'needs_reauth' || syncState.value === 'failed') return 'danger';
  if (syncState.value === 'partial') return 'warning';
  if (accountRecognized.value) return 'success';
  return 'neutral';
});

const lastSyncClock = computed(() => {
  const raw = appStatus.value?.last_cloud_sync_at;
  if (!raw) return t.value.notFetchedYet;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return t.value.timeUnknown;
  return displayDateTimeFormatter({
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date).replace(/\//g, '-');
});

/* 胶囊里只放一行短文字：同步中给进度，失败给结果，空闲给上次同步时间。 */
const syncText = computed(() => {
  if (isSyncing.value) {
    return syncProgress.value
      ? `${syncProgress.value.current}/${syncProgress.value.total}`
      : t.value.syncing;
  }
  if (syncState.value === 'failed') return t.value.syncFailed;
  if (syncState.value === 'partial') return t.value.syncPartial;
  return lastSyncClock.value;
});

const syncTitle = computed(() => {
  if (isSyncing.value) return t.value.cancel;
  return `${t.value.connectionTitle} · ${t.value.lastSyncPrefix}${lastSyncClock.value}`
    + ` — ${canIncrementalSync.value ? t.value.syncNow : t.value.verifyFirst}`;
});

/* 点击行为和旧的同步按钮相同：能增量同步就发起；同步中点击则是取消。 */
const onSyncClick = () => {
  if (isSyncing.value) {
    cancelSync();
  } else if (canIncrementalSync.value) {
    void runSync('incremental');
  }
};

const themeOptions = computed<{ value: ThemeMode; label: string; icon: IconName }[]>(() => [
  { value: 'system', label: t.value.themeSystem, icon: 'monitor' },
  { value: 'dark', label: t.value.themeDark, icon: 'moon' },
  { value: 'light', label: t.value.themeLight, icon: 'sun' },
]);
const onThemeChange = (value: string | number) => setTheme(value as ThemeMode);

/* 语言列表跟着 LOCALES 注册表走——S6 扩到十种语言时这里自动变长。 */
const localeOptions = computed(() =>
  LOCALES.map((code) => ({ value: code, label: LOCALE_LABELS[code] })));
const onLocaleChange = (value: string | number) => setLocale(String(value) as Locale);
</script>

<template>
  <header class="app-topbar">
    <RouterLink to="/" class="brand" :title="versionTitle || t.brandHome">
      <BrandMark :size="30" />
      <span class="wordmark">ZeppBridge&nbsp;<b>3</b></span>
    </RouterLink>

    <nav ref="nav" class="pill-nav" :class="{ 'is-dragging': dragging }" :aria-label="navAriaLabel || t.mainNav"
      @pointerdown="onNavDown" @pointermove="onNavMove" @pointerup="onNavEnd" @pointercancel="onNavEnd"
      @click.capture="onNavClick" @dragstart.prevent>
      <span class="pill-thumb" aria-hidden="true" :style="{ transform: `translateX(${thumb.left}px)`, width: `${thumb.width}px`, opacity: thumb.visible ? 1 : 0 }" />
      <RouterLink
        v-for="item in props.items"
        :key="item.to"
        :to="item.to"
        :data-to="item.to"
        draggable="false"
        class="pill-link"
        active-class="is-active"
        exact-active-class="is-active"
      >{{ item.label }}</RouterLink>
    </nav>

    <div class="topbar-actions">
      <span v-if="statusError" class="sr-only" role="status">{{ statusError }}</span>
      <button
        :class="['sync-pill', `tone-${statusTone}`, { syncing: isSyncing }]"
        type="button"
        :disabled="!isSyncing && !canIncrementalSync"
        :title="syncTitle"
        :aria-label="syncTitle"
        @click="onSyncClick"
      >
        <i class="dot" :class="{ spinning: isSyncing }" aria-hidden="true"></i>
        <span class="sync-text" aria-live="polite">{{ syncText }}</span>
        <Icon v-if="isSyncing" name="x" :size="13" class="sync-cancel" />
      </button>

      <SelectMenu class="theme-menu" :model-value="themeMode" :options="themeOptions"
        :aria-label="t.themeTitle" :menu-min-width="156" @update:model-value="onThemeChange" />

      <SelectMenu
        class="locale-menu"
        :model-value="locale"
        :options="localeOptions"
        :aria-label="t.localeLabel"
        :menu-min-width="224"
        @update:model-value="onLocaleChange"
      />
    </div>
  </header>
</template>

<style scoped>
.app-topbar {
  position: relative;
  display: flex;
  height: 60px;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 20px;
  background: var(--canvas);
  border-bottom: 1px solid var(--line);
}

.brand {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  color: var(--ink);
  text-decoration: none;
}
.brand :deep(svg) { display: block; }
.wordmark {
  font-size: var(--fs-lg);
  font-weight: 600;
  letter-spacing: .01em;
  white-space: nowrap;
}
.wordmark b { font-weight: 700; color: var(--accent); }

/* 胶囊导航：相对顶栏水平居中，左右两组宽度不对称也不偏。 */
.pill-nav {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ink) 10%, transparent), 0 5px 18px rgba(0, 0, 0, .14);
  user-select: none;
}
.pill-thumb { position: absolute; left: 0; top: 3px; bottom: 3px; border-radius: 999px; background: var(--accent); box-shadow: inset 0 1px 0 rgba(255,255,255,.28), 0 2px 8px color-mix(in srgb, var(--accent) 22%, transparent); transition: transform 340ms cubic-bezier(.18,1.35,.3,1), width 280ms cubic-bezier(.2,.9,.3,1); pointer-events: none; }
.pill-nav.is-dragging .pill-thumb { transition: none; }
.pill-link {
  position: relative;
  z-index: 1;
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  padding: 5px 16px;
  border-radius: 999px;
  color: var(--muted);
  font-size: var(--fs-sm);
  text-decoration: none;
  white-space: nowrap;
  transition: color 150ms ease;
  cursor: grab;
}
.pill-link:hover { color: var(--ink); }
.pill-nav.is-dragging .pill-link { cursor: grabbing; }
.pill-link.is-active {
  color: var(--accent-ink);
  font-weight: 600;
}
@media (prefers-reduced-motion: reduce) { .pill-thumb { transition: none; } }

.topbar-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
}

.sync-pill {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 7px;
  padding: 5px 13px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: var(--fs-sm);
  cursor: pointer;
  white-space: nowrap;
}
.sync-pill:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.sync-pill:disabled { cursor: not-allowed; opacity: .6; }
.sync-pill .dot {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: var(--subtle);
}
.sync-pill.tone-success .dot { background: var(--accent); }
.sync-pill.tone-warning .dot { background: var(--warning); }
.sync-pill.tone-danger .dot { background: var(--danger); }
.sync-pill.tone-danger { color: var(--danger); }
.sync-pill.tone-warning { color: var(--warning); }
/* 同步中的点不做整圆旋转（dot 没有旋转轴心可看），改成呼吸闪烁。 */
.sync-pill .dot.spinning { animation: dotPulse 900ms ease-in-out infinite; }
@keyframes dotPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .3; }
}
.sync-text { font-variant-numeric: tabular-nums; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
.sync-cancel { color: var(--subtle); }

.theme-menu { width: 136px; }
.locale-menu { width: 100px; }
.theme-menu :deep(.select-trigger), .locale-menu :deep(.select-trigger) {
  min-height: 34px;
  border-radius: 999px;
  font-size: var(--fs-sm);
}
.theme-menu :deep(.select-trigger) { padding-inline: 10px; }
.theme-menu :deep(.select-value), .locale-menu :deep(.select-value) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 窄屏降级：先让胶囊回到文档流避免和按钮组重叠，再小到手机上藏掉
   （底部 tabbar 已经覆盖同一组导航）。语言选择在 520px 以下也让位给
   设置页里的同一个开关。 */
@media (max-width: 1100px) {
  .brand .wordmark { display: none; }
}
@media (max-width: 980px) {
  .pill-nav { position: static; transform: none; }
}
@media (max-width: 760px) {
  .app-topbar { height: 56px; padding: 0 14px; gap: 10px; }
  .pill-nav { display: none; }
  .sync-text { max-width: 92px; }
  .theme-menu :deep(.select-icon) { display: none; }
}
@media (max-width: 520px) {
  .locale-menu { width: 100px; }
  .theme-menu { width: 110px; }
  .topbar-actions { gap: 5px; }
  .sync-text { display: none; }
  .sync-pill { padding-inline: 10px; }
  .wordmark { font-size: var(--fs-md); }
}
@media (max-width: 380px) {
  .brand { display: none; }
}
</style>

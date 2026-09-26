<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import BrandMark from '../BrandMark.vue';
import Icon, { type IconName } from '../Icon.vue';
import SelectMenu from '../SelectMenu.vue';
import SegmentTrack from '../SegmentTrack.vue';
import { useSyncController } from '../../composables/useSyncController';
import { useTheme } from '../../composables/useTheme';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { defineMessages, locale, LOCALES, LOCALE_LABELS, setLocale, useMessages } from '../../i18n';
import { navigationBranch } from '../../lib/navigation';
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
  backTo?: string;
  backLabel?: string;
}>();
const route = useRoute();
const router = useRouter();
const activeBranch = computed(() => navigationBranch(route.path));
const navItems = computed(() => props.items.map((item) => ({ value: item.to, label: item.label })));
const goTo = (to: string | number) => { void router.push(String(to)); };

const {
  appStatus, statusError, syncState, syncProgress, syncMessage,
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
  if (isSyncing.value) return `${syncMessage.value} · ${t.value.cancel}`;
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
    <RouterLink v-if="backTo" class="quick-back" :to="backTo" :title="backLabel" :aria-label="backLabel">
      <Icon name="arrow-left" :size="20" />
    </RouterLink>
    <RouterLink v-else to="/" class="brand" :title="versionTitle || t.brandHome">
      <BrandMark :size="30" />
      <span class="wordmark">ZeppBridge&nbsp;<b>3</b></span>
    </RouterLink>

    <SegmentTrack
      class="pill-nav"
      :items="navItems"
      :model-value="activeBranch"
      :aria-label="navAriaLabel || t.mainNav"
      @update:model-value="goTo"
    />

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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  height: 60px;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  gap: 12px;
  padding: 0 20px;
  background: var(--canvas);
  border-bottom: 1px solid var(--line);
}

.quick-back { display: inline-flex; width: 38px; height: 38px; align-items: center; justify-content: center; justify-self: start; flex: 0 0 38px;
  border: 1px solid color-mix(in srgb, var(--ink) 16%, transparent); border-radius: 50%; color: var(--ink); text-decoration: none;
  background: color-mix(in srgb, var(--surface) 72%, transparent); backdrop-filter: blur(16px) saturate(1.4);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ink) 18%, transparent), 0 4px 14px rgba(0,0,0,.22); }
.quick-back:hover { border-color: color-mix(in srgb, var(--ink) 32%, transparent); }
.brand {
  display: inline-flex;
  min-width: 0;
  justify-self: start;
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

.pill-nav { justify-self: center; max-width: 100%; }

.topbar-actions {
  display: flex;
  min-width: 0;
  justify-self: end;
  align-items: center;
  gap: 8px;
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
.sync-text { font-variant-numeric: tabular-nums; max-width: 132px; overflow: hidden; text-overflow: ellipsis; }
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
  .app-topbar { grid-template-columns: auto minmax(0, 1fr) auto; }
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

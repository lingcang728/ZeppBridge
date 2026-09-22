<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
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
);
const t = useMessages(messages);

defineOptions({ name: 'AppTopBar' });

const props = defineProps<{
  items: { to: string; label: string }[];
  navAriaLabel?: string;
  versionTitle?: string;
}>();

const {
  appStatus, statusError, syncState, syncProgress,
  isSyncing, canIncrementalSync, runSync, cancelSync,
} = useSyncController();
const { themeMode, resolvedTheme, cycleTheme } = useTheme();

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

const themeIcon = computed<IconName>(() => {
  if (themeMode.value === 'system') return 'monitor';
  return resolvedTheme.value === 'dark' ? 'moon' : 'sun';
});
const themeLabel = computed(() => {
  const names: Record<ThemeMode, string> = {
    light: t.value.themeLight,
    dark: t.value.themeDark,
    system: t.value.themeSystem,
  };
  return `${t.value.themeTitle} · ${names[themeMode.value]}`;
});

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

    <nav class="pill-nav" :aria-label="navAriaLabel || t.mainNav">
      <RouterLink
        v-for="item in props.items"
        :key="item.to"
        :to="item.to"
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

      <button
        class="icon-btn"
        type="button"
        :title="themeLabel"
        :aria-label="themeLabel"
        @click="cycleTheme"
      >
        <Icon :name="themeIcon" :size="17" />
      </button>

      <SelectMenu
        class="locale-menu"
        :model-value="locale"
        :options="localeOptions"
        :aria-label="t.localeLabel"
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
}
.pill-link {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  padding: 5px 16px;
  border-radius: 999px;
  color: var(--muted);
  font-size: var(--fs-sm);
  text-decoration: none;
  white-space: nowrap;
  transition: color 150ms ease, background-color 150ms ease;
}
.pill-link:hover { color: var(--ink); background: var(--surface-hover); }
.pill-link.is-active {
  color: var(--accent-ink);
  background: var(--accent);
  font-weight: 600;
}

.topbar-actions {
  display: flex;
  min-width: 0;
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

.icon-btn {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}
.icon-btn:hover { border-color: var(--accent); color: var(--accent); }

.locale-menu :deep(.select-trigger) {
  min-height: 34px;
  border-radius: 999px;
  font-size: var(--fs-sm);
}

/* 窄屏降级：先让胶囊回到文档流避免和按钮组重叠，再小到手机上藏掉
   （底部 tabbar 已经覆盖同一组导航）。语言选择在 520px 以下也让位给
   设置页里的同一个开关。 */
@media (max-width: 980px) {
  .pill-nav { position: static; transform: none; }
}
@media (max-width: 760px) {
  .app-topbar { height: 56px; padding: 0 14px; gap: 10px; }
  .pill-nav { display: none; }
  .sync-text { max-width: 92px; }
}
@media (max-width: 520px) {
  .locale-menu { display: none; }
  .wordmark { font-size: var(--fs-md); }
}
</style>

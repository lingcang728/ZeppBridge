<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import BrandMark from '../BrandMark.vue';
import Icon, { type IconName } from '../Icon.vue';
import CapsuleWheel from '../CapsuleWheel.vue';
import SegmentTrack from '../SegmentTrack.vue';
import { useSyncController } from '../../composables/useSyncController';
import { useTheme } from '../../composables/useTheme';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { defineMessages, locale, LOCALES, LOCALE_LABELS, setLocale, useMessages } from '../../i18n';
import { navigationBranch } from '../../lib/navigation';
import type { Locale } from '../../i18n';
import type { ResolvedTheme } from '../../composables/useTheme';

const messages = defineMessages(
  {
    mainNav: '主导航',
    brandHome: 'ZeppBridge 3 · 概览',
    connectionTitle: '云端连接状态',
    lastSyncPrefix: '上次同步：',
    notFetchedYet: '尚未获取',
    timeUnknown: '时间未知',
    today: '今天',
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
    readyPill: '数据已备好 · 交给 AI',
    readyTitle: '同步完成，本机数据已是最新。点一下去交给 AI。',
  },
  {
    mainNav: 'Main navigation',
    brandHome: 'ZeppBridge 3 · Overview',
    connectionTitle: 'Cloud connection state',
    lastSyncPrefix: 'Last sync: ',
    notFetchedYet: 'Not fetched yet',
    timeUnknown: 'Time unknown',
    today: 'Today',
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
    readyPill: 'Data ready · hand to AI',
    readyTitle: 'Sync finished and the local data is current. Click to hand it to the AI.',
  },
  {
    mainNav: 'Navegación principal',
    brandHome: 'ZeppBridge 3 · Resumen',
    connectionTitle: 'Estado de la conexión con la nube',
    lastSyncPrefix: 'Última sincronización: ',
    notFetchedYet: 'Aún sin datos',
    timeUnknown: 'Hora desconocida',
    today: 'Hoy',
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
    readyPill: 'Datos listos · pasar a la IA',
    readyTitle: 'Sincronización terminada: los datos locales están al día. Haz clic para pasarlos a la IA.',
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
  isSyncing, canIncrementalSync, runSync, cancelSync, dataReady,
} = useSyncController();

/* 用户在等的那次同步落地了：同步胶囊变成发光的「数据已备好 · 交给 AI」，
   点一下去取。又开始同步时让位给进度；进了交给 AI 就恢复成上次同步时间。 */
const readyToHand = computed(() => dataReady.value.phase === 'ready' && !isSyncing.value);
const { resolvedTheme, pickTheme } = useTheme();

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

const lastSyncDate = computed(() => {
  const raw = appStatus.value?.last_cloud_sync_at;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
});
/** 完整时间：放在 title / aria-label 里。 */
const lastSyncClock = computed(() => {
  const date = lastSyncDate.value;
  if (date === null) return t.value.notFetchedYet;
  if (!date) return t.value.timeUnknown;
  return displayDateTimeFormatter({
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date).replace(/\//g, '-');
});
/* 胶囊里放短格式：今天只写「今天 15:22」，别的日子写「09-26 15:22」。
   完整的年月日时分放不下，以前会被截成「2026-09-26 15:…」。 */
const lastSyncShort = computed(() => {
  const date = lastSyncDate.value;
  if (!date) return lastSyncClock.value;
  const time = displayDateTimeFormatter({ hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  if (sameDay) return `${t.value.today} ${time}`;
  const day = displayDateTimeFormatter({ month: '2-digit', day: '2-digit' }).format(date).replace(/\//g, '-');
  return `${day} ${time}`;
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
  return lastSyncShort.value;
});

const syncTitle = computed(() => {
  if (readyToHand.value) return t.value.readyTitle;
  if (isSyncing.value) return `${syncMessage.value} · ${t.value.cancel}`;
  return `${t.value.connectionTitle} · ${t.value.lastSyncPrefix}${lastSyncClock.value}`
    + ` — ${canIncrementalSync.value ? t.value.syncNow : t.value.verifyFirst}`;
});

/* 点击行为和旧的同步按钮相同：能增量同步就发起；同步中点击则是取消。 */
const onSyncClick = () => {
  if (readyToHand.value) {
    void router.push('/ai');
  } else if (isSyncing.value) {
    cancelSync();
  } else if (canIncrementalSync.value) {
    void runSync('incremental');
  }
};

/* 主题只有深 / 浅两格：默认跟随系统，拨到和系统一致的那一格就又回到跟随系统。 */
const themeOptions = computed<{ value: ResolvedTheme; label: string; icon: IconName }[]>(() => [
  { value: 'dark', label: t.value.themeDark, icon: 'moon' },
  { value: 'light', label: t.value.themeLight, icon: 'sun' },
]);
const onThemeChange = (value: ResolvedTheme) => pickTheme(value);

/* 语言列表跟着 LOCALES 注册表走——S6 扩到十种语言时这里自动变长。 */
const localeOptions = computed(() =>
  LOCALES.map((code) => ({ value: code, label: LOCALE_LABELS[code] })));
const onLocaleChange = (value: string | number) => setLocale(String(value) as Locale);
</script>

<template>
  <header class="app-topbar">
    <RouterLink v-if="backTo" class="quick-back glass-control" :to="backTo" :title="backLabel" :aria-label="backLabel">
      <Icon name="arrow-left" :size="20" />
    </RouterLink>
    <RouterLink v-else to="/" class="brand" :title="versionTitle || t.brandHome">
      <BrandMark :size="30" />
      <span class="wordmark">ZeppBridge&nbsp;<b>3</b></span>
    </RouterLink>

    <SegmentTrack
      class="pill-nav"
      variant="glass"
      :items="navItems"
      :model-value="activeBranch"
      :aria-label="navAriaLabel || t.mainNav"
      @update:model-value="goTo"
    />

    <div class="topbar-actions">
      <span v-if="statusError" class="sr-only" role="status">{{ statusError }}</span>
      <button
        :class="['sync-pill', 'glass-control', `tone-${statusTone}`, { syncing: isSyncing, 'is-ready': readyToHand, 'ready-glow': readyToHand }]"
        type="button"
        :disabled="!readyToHand && !isSyncing && !canIncrementalSync"
        :title="syncTitle"
        :aria-label="syncTitle"
        @click="onSyncClick"
      >
        <i class="dot" :class="{ spinning: isSyncing }" aria-hidden="true"></i>
        <span class="sync-text" aria-live="polite">{{ readyToHand ? t.readyPill : syncText }}</span>
        <Icon v-if="isSyncing" name="x" :size="13" class="sync-cancel" />
        <Icon v-else-if="readyToHand" name="arrow-right" :size="14" class="ready-arrow" />
      </button>

      <!-- 主题和语言都是拖着转的胶囊传送带，共用一个玻璃底座；不再弹下拉。 -->
      <div class="icon-group glass-control">
        <CapsuleWheel class="theme-wheel" icon-only :span="92" :items="themeOptions" :model-value="resolvedTheme"
          :aria-label="t.themeTitle" @update:model-value="onThemeChange" />
        <span class="group-divider" aria-hidden="true"></span>
        <Icon name="globe" :size="15" class="locale-glyph" />
        <CapsuleWheel class="locale-wheel" :span="176" :items="localeOptions" :model-value="locale"
          :aria-label="t.localeLabel" @update:model-value="onLocaleChange" />
      </div>
    </div>
  </header>
</template>

<style scoped>
/* 顶栏本身透明、没有分界线：浮在内容上的是一个个玻璃控件（返回、导航胶囊、
   同步状态、图标组），内容滚到下面时由 .shell-head 的滚动边缘效果负责可读性。
   整条再套一层玻璃就成了「玻璃叠玻璃」。 */
.app-topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  height: 60px;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  gap: 12px;
  padding: 0 20px;
}

.quick-back { display: inline-flex; width: 40px; height: 40px; align-items: center; justify-content: center; justify-self: start; flex: 0 0 40px;
  border-radius: 50%; color: var(--ink); text-decoration: none; transition: scale var(--dur-fast, 140ms) var(--ease-out, ease); }
.quick-back:hover { background-color: var(--glass-press); }
.quick-back:active { scale: .94; }
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
  min-height: 36px;
  align-items: center;
  gap: 7px;
  padding: 5px 14px;
  border-radius: 999px;
  color: var(--muted);
  font-size: var(--fs-sm);
  cursor: pointer;
  white-space: nowrap;
}
.sync-pill:hover:not(:disabled) { color: var(--ink); }
.sync-pill:active:not(:disabled) { scale: .97; }
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
.sync-text { font-variant-numeric: tabular-nums; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.sync-pill.is-ready { color: var(--ink); font-weight: 600; }
.sync-pill.is-ready .dot { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
.ready-arrow { color: var(--accent); }
.sync-cancel { color: var(--subtle); }

.icon-group { display: inline-flex; align-items: center; gap: 2px; padding: 2px 4px 2px 2px; border-radius: 999px; }
.group-divider { width: 1px; height: 18px; margin: 0 4px; background: color-mix(in srgb, var(--ink) 14%, transparent); }
.locale-glyph { flex: 0 0 auto; color: var(--subtle); }

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
  .sync-text { max-width: 120px; }
}
@media (max-width: 640px) {
  .locale-wheel, .locale-glyph, .group-divider { display: none; }
}
@media (max-width: 520px) {
  .topbar-actions { gap: 5px; }
  .sync-text { display: none; }
  .sync-pill { padding-inline: 10px; }
  .wordmark { font-size: var(--fs-md); }
}
@media (max-width: 380px) {
  .brand { display: none; }
}
</style>

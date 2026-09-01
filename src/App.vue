<script setup lang="ts">
import { getVersion } from '@tauri-apps/api/app';
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import BrandMark from './components/BrandMark.vue';
import DesignIcon, { type DesignIconName } from './components/DesignIcon.vue';
import DeviceVisual from './components/DeviceVisual.vue';
import Icon from './components/Icon.vue';
import { useSyncController } from './composables/useSyncController';
import { deviceStateLabel, useDevices } from './composables/useDevices';
import { useUiScale } from './composables/useUiScale';
import { backend, isDesktop } from './lib/bridge';
import { checkForDesktopUpdate } from './services/updateService';
import { defineMessages, intlLocale, locale, useMessages } from './i18n';

const messages = defineMessages(
  {
    skipToContent: '跳到主要内容',
    mainNav: '主导航',
    mobileNav: '移动导航',
    bottomNav: '移动主导航',
    openNav: '打开导航',
    navOverview: '概览',
    navHandoff: '交给 AI',
    navSettings: '设置',
    dataSources: '数据来源',
    identifyingDevices: '正在识别实体设备…',
    identifyFailed: (reason: string) => `设备识别暂不可用：${reason}`,
    noDevicesYet: '尚未识别实体设备。',
    accountPrefix: '账户：',
    manage: '管理',
    privacyLink: '安全与隐私设置',
    connectionTitle: '云端连接状态',
    lastSyncPrefix: '上次同步：',
    notFetchedYet: '尚未获取',
    timeUnknown: '时间未知',
    noAccount: '未识别账户',
    syncNow: '立即同步',
    verifyFirst: '请先完成连接验证',
    syncing: '同步中…',
    cancel: '取消',
    compacting: (pending: number) =>
      `正在压缩历史报文（${pending} 条），压完会自动消失。这期间同步会稍等一下。`,
    compacted: (saved: string) => `历史报文已压缩，省下约 ${saved} 磁盘空间。`,
    trayHint: '关闭窗口后 ZeppBridge 仍在托盘运行，可继续自动同步。',
    browserPreview: '请使用桌面应用。浏览器预览不会读取账户数据。',
    routeNotFound: '页面不存在，已返回概览。',
  },
  {
    skipToContent: 'Skip to main content',
    mainNav: 'Main navigation',
    mobileNav: 'Mobile navigation',
    bottomNav: 'Mobile main navigation',
    openNav: 'Open navigation',
    navOverview: 'Overview',
    navHandoff: 'Hand to AI',
    navSettings: 'Settings',
    dataSources: 'Data sources',
    identifyingDevices: 'Identifying your devices…',
    identifyFailed: (reason: string) => `Device identification is unavailable: ${reason}`,
    noDevicesYet: 'No device identified yet.',
    accountPrefix: 'Account: ',
    manage: 'Manage',
    privacyLink: 'Security and privacy settings',
    connectionTitle: 'Cloud connection state',
    lastSyncPrefix: 'Last sync: ',
    notFetchedYet: 'Not fetched yet',
    timeUnknown: 'Time unknown',
    noAccount: 'No account identified',
    syncNow: 'Sync now',
    verifyFirst: 'Verify the connection first',
    syncing: 'Syncing…',
    cancel: 'Cancel',
    compacting: (pending: number) =>
      `Compacting stored payloads (${pending} to go). This clears itself; syncing waits its turn.`,
    compacted: (saved: string) => `Stored payloads compacted, about ${saved} of disk reclaimed.`,
    trayHint: 'Closing the window keeps ZeppBridge in the tray, so auto-sync carries on.',
    browserPreview: 'Use the desktop app. This browser preview reads no account data.',
    routeNotFound: 'That page does not exist, so you are back on the overview.',
  },
);
const t = useMessages(messages);

// 桌面端从 Tauri 运行时读取版本（与 tauri.conf.json 单一来源），
// 浏览器预览环境回退到下面的常量（与 package.json 保持同步）。
const FALLBACK_APP_VERSION = '2.0.0';
/* 构建标识。同一个版本号会构建很多次，光看版本号分不清手上是哪一个。 */
const BUILD_STAMP = __BUILD_STAMP__;
const APP_VERSION = ref(FALLBACK_APP_VERSION);
const desktopRuntime = isDesktop();
// 落地页只在非桌面环境渲染（Cloudflare Pages 部署的就是这个分支），
// 静态 import 会把它连同两份文案一起塞进桌面应用的首屏 chunk。懒加载后
// 桌面端根本不会下载它。
const LandingPage = defineAsyncComponent(() => import('./views/LandingPage.vue'));
const showLanding = !desktopRuntime && !new URLSearchParams(window.location.search).has('app-preview');
if (desktopRuntime) {
  void getVersion()
    .then((version) => {
      APP_VERSION.value = version;
    })
    .catch(() => {
      // Keep the fallback when the runtime version is unavailable.
    });
}

const route = useRoute();
const router = useRouter();
const mobileMenuOpen = ref(false);
const trayHint = ref(false);
const {
  appStatus, statusError, syncState, syncMessage, syncProgress, isSyncing, canIncrementalSync,
  compacting, compactionPending, compactionSaved,
  dataRevision, initialize, runSync, cancelSync, dispose: disposeSyncController,
} = useSyncController();
/* 这个组件自己注册的 Tauri 监听器的解绑函数。

   `backend.listen` 返回的是一个 unlisten——以前这里直接 `void` 掉了。单次
   启动感觉不到，但 HMR 和窗口重建会让同一个事件挂上第二个监听器，托盘提示
   就会连着弹两次。 */
const ownUnlisteners: Array<() => void> = [];
const { initializeScale, bumpScale, resetScale } = useUiScale();
const {
  models: deviceModels,
  loading: devicesLoading,
  error: devicesError,
  load: loadDevices,
} = useDevices();

/* 「数据健康」不在主导航里。
 *
 * 它回答的是「这条数据流为什么没同步过来」，属于出问题时才找的排查工具，
 * 而不是日常四个入口之一。路由 /health-check 仍然有效，入口挪到
 * 「设置 → 高级与维护」，需要的人找得到，不需要的人不用天天看见它。 */
const navigation = computed(() => [
  { to: '/', label: t.value.navOverview, icon: 'overview' as DesignIconName },
  { to: '/explore', label: t.value.navHandoff, icon: 'handoff' as DesignIconName },
  { to: '/settings', label: t.value.navSettings, icon: 'settings' as DesignIconName },
]);

/* 组件名要和 defineOptions({ name }) 对得上，KeepAlive 才认得出来。 */
const CACHED_PAGES = [
  'Overview',
  'RecentRecords',
  'Explore',
  'BodyStatus',
  'TrainingStatus',
  'SleepList',
  'WorkoutList',
];

const formatSavedBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1048576).toFixed(0)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
};

const connected = computed(() => appStatus.value?.connection_state === 'connected');
const accountRecognized = computed(() => ['connected', 'configured'].includes(String(appStatus.value?.connection_state || '')));

const dataSources = computed(() => [
  ...deviceModels.value.map((model) => ({
    kind: 'device' as const,
    name: model.canonicalName,
    model,
    state: model.state,
  })),
  {
    kind: 'cloud' as const,
    name: 'Zepp Cloud',
    state: accountRecognized.value ? ('account' as const) : ('unknown' as const),
  },
]);

const statusLabel = computed(() => {
  // Keep the chip within the same four account/device states used elsewhere.
  // The browser-preview banner separately explains that no account data is read.
  if (!isDesktop()) return 'unknown' as const;
  if (!appStatus.value) return 'unknown' as const;
  if (appStatus.value.connection_state === 'connected' || appStatus.value.connection_state === 'configured') return 'account' as const;
  return 'unknown' as const;
});
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
  return new Intl.DateTimeFormat(intlLocale(), {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date).replace(/\//g, '-');
});
const accountLabel = computed(() => appStatus.value?.masked_user_id || t.value.noAccount);
const browserPreview = computed(() => !desktopRuntime);
const routeNotice = computed(() => route.query.notice === 'not-found');

const onDocumentKeydown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  if (target && target.closest('input, textarea, select, [contenteditable]')) return;
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.key === '=' || event.key === '+' || event.code === 'NumpadAdd') {
    event.preventDefault();
    bumpScale(1);
  } else if (event.key === '-' || event.code === 'NumpadSubtract') {
    event.preventDefault();
    bumpScale(-1);
  } else if (event.key === '0' || event.code === 'Numpad0') {
    event.preventDefault();
    resetScale();
  }
};
const closeMobileMenu = () => { mobileMenuOpen.value = false; };

/* 托盘菜单是原生的，建起来的时候前端还没加载，只能先按系统语言猜一次。
   界面语言一确定（以及之后每次切换）就把它校正过来——不然英文用户右键
   托盘看到的还是中文。 */
const syncTrayLocale = () => {
  if (!desktopRuntime) return;
  void backend.setTrayLocale(locale.value).catch(() => {
    // 托盘文案不是关键路径，失败就算了，不该弹错给用户。
  });
};

watch(locale, syncTrayLocale);

onMounted(() => {
  if (showLanding) return;
  syncTrayLocale();
  initializeScale();
  void initialize();
  void loadDevices();
  void checkForDesktopUpdate(false);
  document.addEventListener('keydown', onDocumentKeydown);
  if (route.query.notice === 'not-found') {
    window.setTimeout(() => {
      const query = { ...route.query };
      delete query.notice;
      void router.replace({ path: route.path, query });
    }, 8000);
  }
  if (desktopRuntime) {
    void backend.listen('app://hidden-to-tray', () => {
      if (window.localStorage.getItem('zeppbridge-tray-hint') === '1') return;
      window.localStorage.setItem('zeppbridge-tray-hint', '1');
      trayHint.value = true;
      window.setTimeout(() => { trayHint.value = false; }, 6000);
    }).then((unlisten) => {
      if (typeof unlisten === 'function') ownUnlisteners.push(unlisten);
    }).catch(() => {
      // 托盘提示不是关键路径。
    });
  }
});
watch(dataRevision, () => {
  if (!showLanding) void loadDevices();
});
onUnmounted(() => {
  document.removeEventListener('keydown', onDocumentKeydown);
  for (const unlisten of ownUnlisteners.splice(0)) unlisten();
  // 同步控制器是模块级单例，它的监听器和那个每分钟一跳的定时器都挂在
  // `initialize()` 上。这个组件卸载时不放，下一次挂载就会多出一份。
  disposeSyncController();
});
</script>

<template>
  <LandingPage v-if="showLanding" />
  <template v-else>
    <a class="skip-link" href="#main-content">{{ t.skipToContent }}</a>

    <div class="app-shell">
    <aside class="sidebar" :aria-label="t.mainNav">
      <div class="brand-lockup">
        <span class="brand-badge"><BrandMark /></span>
        <span class="brand-text">
          <span class="brand-name">ZeppBridge</span>
          <span class="brand-sub">Amazfit Data Bridge</span>
        </span>
      </div>

      <nav class="desktop-nav" :aria-label="t.mainNav">
        <RouterLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          active-class="is-active"
          exact-active-class="is-active"
          @click="closeMobileMenu"
        >
          <DesignIcon :name="item.icon" :size="25" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sources">
        <div class="sources-head">
          <span>{{ t.dataSources }}</span>
        </div>
        <div v-if="devicesLoading" class="sources-feedback" role="status">{{ t.identifyingDevices }}</div>
        <div v-else-if="devicesError" class="sources-feedback error" role="alert">{{ t.identifyFailed(devicesError) }}</div>
        <div v-else-if="!deviceModels.length" class="sources-feedback" role="status">{{ t.noDevicesYet }}</div>
        <RouterLink v-for="source in dataSources" :key="source.name" class="source-card" to="/settings">
          <span class="source-icon">
            <DeviceVisual v-if="source.kind === 'device'" :src="source.model.image" :alt="source.name" :kind="source.model.kind" compact />
            <DesignIcon v-else name="zepp-cloud" :size="38" />
          </span>
          <span class="source-copy">
            <strong>{{ source.name }}</strong>
            <span :class="['source-state', { on: source.state !== 'unknown' }]">
              <i class="dot"></i>{{ deviceStateLabel(source.state) }}
            </span>
          </span>
          <Icon name="chevron-down" :size="14" class="source-chevron" />
        </RouterLink>
      </div>

      <div class="sidebar-footer">
        <div class="cloud-card">
          <div class="cloud-row">
            <DesignIcon name="zepp-cloud" :size="24" />
            <span>Zepp Cloud · {{ deviceStateLabel(accountRecognized ? 'account' : 'unknown') }}</span>
            <Icon name="circle-check" :size="15" :class="['cloud-check', { on: connected }]" />
          </div>
          <div class="cloud-account">
            <span>{{ t.accountPrefix }}{{ accountLabel }}</span>
            <RouterLink to="/settings" class="manage-btn">{{ t.manage }}</RouterLink>
          </div>
        </div>
        <div class="version-row">
          <span class="version-brand"><BrandMark :size="20" /></span>
          <span :title="`build ${BUILD_STAMP}`">ZeppBridge　v{{ APP_VERSION }}</span>
          <RouterLink :to="{ path: '/settings', hash: '#privacy-section' }" class="shield-link" :title="t.privacyLink">
            <DesignIcon name="secure" :size="20" />
          </RouterLink>
        </div>
      </div>
    </aside>

    <div class="app-body">
      <header class="topbar">
        <div class="topbar-leading">
          <button class="mobile-menu-button" type="button" :aria-label="t.openNav" :aria-expanded="mobileMenuOpen" @click="mobileMenuOpen = !mobileMenuOpen">
            <Icon :name="mobileMenuOpen ? 'x' : 'sliders'" :size="19" />
          </button>
          <span v-if="statusError" class="sr-only" role="status">{{ statusError }}</span>
          <span :class="['connection-chip', `tone-${statusTone}`]" :title="t.connectionTitle" aria-live="polite">
            <Icon name="circle-check" :size="14" /><span>{{ deviceStateLabel(statusLabel) }}</span>
          </span>
          <span class="sync-time">{{ t.lastSyncPrefix }}{{ lastSyncClock }}</span>
          <button
            class="refresh-btn"
            type="button"
            :disabled="isSyncing || !canIncrementalSync"
            :title="canIncrementalSync ? t.syncNow : t.verifyFirst"
            @click="runSync('incremental')"
          >
            <DesignIcon name="sync" :size="20" :class="{ spinning: isSyncing }" /><span>{{ t.syncNow }}</span>
          </button>
          <span v-if="isSyncing" class="sync-progress-text">
            {{ syncProgress ? `${syncProgress.current}/${syncProgress.total}` : t.syncing }}
            <button class="cancel-link" type="button" @click="cancelSync">{{ t.cancel }}</button>
          </span>
        </div>
      </header>

      <div v-if="statusError" class="sync-feedback tone-failed" role="alert">
        <Icon name="warning" :size="14" />
        <span>{{ statusError }}</span>
      </div>
      <div v-if="syncState !== 'idle'" :class="['sync-feedback', `tone-${syncState}`]" role="status" aria-live="polite">
        <Icon :name="syncState === 'failed' ? 'warning' : syncState === 'updated' ? 'circle-check' : 'info'" :size="14" :class="{ spinning: isSyncing || syncState === 'deferred' }" />
        <span>{{ syncMessage }}</span>
      </div>
      <!-- 装完新版本第一次启动时的一次性后台维护。压的时候说一声，压完自己走。 -->
      <div v-if="compacting" class="sync-feedback" role="status" aria-live="polite">
        <Icon name="database" :size="14" class="spinning" />
        <span>{{ t.compacting(compactionPending) }}</span>
      </div>
      <div v-else-if="compactionSaved" class="sync-feedback tone-updated" role="status">
        <Icon name="circle-check" :size="14" />
        <span>{{ t.compacted(formatSavedBytes(compactionSaved)) }}</span>
      </div>
      <div v-if="trayHint" class="sync-feedback" role="status">{{ t.trayHint }}</div>

      <div v-if="mobileMenuOpen" class="mobile-menu" :aria-label="t.mobileNav">
        <nav class="mobile-menu-links">
          <RouterLink v-for="item in navigation" :key="item.to" :to="item.to" class="nav-link" active-class="is-active" exact-active-class="is-active" @click="closeMobileMenu">
            <DesignIcon :name="item.icon" :size="25" /><span>{{ item.label }}</span>
          </RouterLink>
        </nav>
      </div>

      <div v-if="browserPreview" class="preview-banner" role="status">
        <Icon name="terminal" :size="16" />
        <span>{{ t.browserPreview }}</span>
      </div>
      <div v-if="routeNotice" class="route-notice" role="status">
        <Icon name="info" :size="16" />{{ t.routeNotFound }}
      </div>

      <main id="main-content" class="main-content" tabindex="-1">
        <!-- 主要页面缓存起来，切回去不再重新查库。
             以前每次切页都重新挂载一遍组件，于是每次都把那一页的全部查询重跑
             一遍——首页一次就是六条命令，而命令侧共用一把数据库锁，它们只能
             排队。缓存之后，页面只在首次进入和同步产生新数据（dataRevision
             变化，各页都在监听）时才重新读库。

             详情页不缓存：它们按 URL 参数取数，缓存一堆实例既没收益又占内存。 -->
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <KeepAlive :include="CACHED_PAGES" :max="6">
              <component :is="Component" />
            </KeepAlive>
          </Transition>
        </RouterView>
      </main>

      <nav class="bottom-nav" :aria-label="t.bottomNav">
        <RouterLink v-for="item in navigation" :key="item.to" :to="item.to" class="bottom-nav-link" active-class="is-active" exact-active-class="is-active">
          <DesignIcon :name="item.icon" :size="26" /><span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </div>
    </div>
  </template>
</template>

<style>
:root {
  color-scheme: dark;
  --bg: #131519;
  --sidebar: #0F1114;
  --canvas: #14161A;
  --surface: #1D2026;
  --surface-raised: #24272F;
  --surface-hover: #2C3039;
  --ink: #F2F4EE;
  --muted: #9AA1A9;
  --subtle: #6E757D;
  --faint: #4B5158;
  --line: rgba(226, 234, 242, .07);
  --line-strong: rgba(226, 234, 242, .14);
  --brand: #7DA33E;
  --accent: var(--brand);
  --accent-hover: #93B952;
  --accent-strong: #7DA33E;
  --accent-ink: #12170A;
  --accent-soft: rgba(125, 163, 62, .12);
  --action-green: #55702A;
  --action-green-hover: #668539;
  --icon-mint: #2FA96B;
  --heart: #F0616A;
  --heart-wash: rgba(240, 97, 106, .12);
  --pace: #4AA8E8;
  --pace-wash: rgba(74, 168, 232, .12);
  --calories: #F5860B;
  --calories-wash: rgba(245, 134, 11, .12);
  --altitude: #F5C33B;
  --altitude-wash: rgba(245, 195, 59, .12);
  --cadence: #4AA8E8;
  --training: #3DD84C;
  --readiness: #3DD84C;
  --sleep-deep: #4458B8;
  --sleep-light: #7C8FF0;
  --sleep-rem: #8B5CF6;
  --sleep-awake: #E8833A;
  --sleep: var(--sleep-light);
  --sleep-wash: rgba(124, 143, 240, .12);
  --activity: #2BB3C0;
  --activity-wash: rgba(43, 179, 192, .12);
  --distance: var(--pace);
  --danger: #F0616A;
  --warning: #F5C33B;
  --focus: #7DA33E;
  --route-neutral: #9AA1A9;
  --route-mint: #2FA96B;
  --route-cyan: #4AA8E8;
  --route-amber: #F5C33B;
  --route-coral: #F0616A;
  --font-sans: 'MiSans', 'Segoe UI', 'Microsoft YaHei UI', sans-serif;
  --font-mono: 'Cascadia Code', 'SFMono-Regular', Consolas, monospace;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 18px;
}

/* ── 全局自定义细滚动条（覆盖原生灰条） ─────── */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--surface-hover);
  border-radius: 999px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--subtle);
}
::-webkit-scrollbar-corner {
  background: transparent;
}
* {
  scrollbar-width: thin;
  scrollbar-color: var(--surface-hover) transparent;
}

* { box-sizing: border-box; }
html, body, #app { height: 100%; min-height: 100%; margin: 0; overflow: hidden; }
body {
  min-width: 320px;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
button, input, select, textarea { font: inherit; }
button, select, a { -webkit-tap-highlight-color: transparent; }
button { color: inherit; }
a { color: inherit; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.skip-link {
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 100;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-ink);
  transform: translateY(-150%);
  transition: transform 150ms ease;
}
.skip-link:focus { transform: translateY(0); }
.app-shell { display: flex; height: 100%; min-height: 0; min-width: 0; overflow: hidden; background: var(--bg); }
.app-shell > * { min-width: 0; }

/* ── 侧边栏 ─────────────────────────────── */
.sidebar {
  width: 236px;
  flex: 0 0 236px;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden auto;
  padding: 20px 12px 14px;
  background: var(--sidebar);
  border-right: 1px solid var(--line);
}
.brand-lockup { display: flex; align-items: center; gap: 10px; padding: 0 6px 22px; min-width: 0; }
.brand-badge {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: 12px;
  background: transparent;
  border: 0;
  color: var(--accent);
}
.brand-text { display: grid; gap: 1px; min-width: 0; }
.brand-name { font-size: 16px; font-weight: 700; letter-spacing: .01em; }
.brand-sub { color: var(--subtle); font-size: 11px; }
.desktop-nav { display: grid; gap: 4px; min-width: 0; }
.nav-link {
  display: flex;
  min-height: 40px;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 11px;
  color: var(--muted);
  font-size: 13px;
  text-decoration: none;
  transition: color 150ms ease, background-color 150ms ease, border-color 150ms ease, transform 150ms ease;
}
.nav-link:hover { color: var(--ink); background: var(--surface-hover); }
.nav-link:active { transform: translateY(1px); }
.nav-link svg { color: var(--subtle); }
.nav-link .design-icon { opacity: .7; filter: saturate(.78); transition: opacity 220ms ease, filter 220ms ease, transform 220ms cubic-bezier(.16, 1, .3, 1); }
.nav-link:hover .design-icon { opacity: .94; transform: translateY(-1px) scale(1.04); }
.nav-link.is-active {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
}
.nav-link.is-active svg { color: var(--accent); }
.nav-link.is-active .design-icon { opacity: 1; filter: saturate(1.05); }

.sources { margin-top: 20px; min-width: 0; display: grid; gap: 8px; }
.sources-feedback { padding: 8px 10px; border: 1px dashed var(--line-strong); border-radius: 9px; color: var(--muted); font-size: 11px; line-height: 1.45; }
.sources-feedback.error { color: var(--danger); border-color: rgba(240, 97, 106, .28); }
.sources-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;
  color: var(--subtle);
  font-size: 12px;
}
.sources-head button {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--subtle);
  cursor: pointer;
}
.sources-head button:hover { background: var(--surface-hover); color: var(--ink); }
.source-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  text-decoration: none;
  color: inherit;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.source-card:hover { background: var(--surface-raised); border-color: var(--line-strong); }
.source-card:hover .source-chevron { color: var(--muted); }
.source-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  border-radius: 11px;
  background: var(--surface-raised);
  border: 1px solid var(--line);
  color: var(--muted);
}
.source-icon :deep(.device-visual) { width: 42px; max-width: 100%; height: 42px; max-height: 100%; min-width: 0; min-height: 0; flex: 0 0 42px; border: 0; border-radius: 11px; background: transparent; }
.source-icon :deep(.device-visual img) { padding: 3px; }
.source-copy { display: grid; gap: 2px; min-width: 0; flex: 1; }
.source-copy strong { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source-state { display: inline-flex; align-items: center; gap: 5px; color: var(--subtle); font-size: 11px; }
.source-state .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--subtle); }
.source-state.on { color: var(--accent); }
.source-state.on .dot { background: var(--accent); }
.source-chevron { transform: rotate(-90deg); color: var(--subtle); }

.sidebar-footer { margin-top: auto; padding-top: 16px; min-width: 0; display: grid; gap: 12px; }
.cloud-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  padding: 10px 12px;
  display: grid;
  gap: 8px;
}
.cloud-row { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; color: var(--ink); }
.cloud-row svg:first-child { color: var(--muted); }
.cloud-row span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cloud-check { color: var(--faint); }
.cloud-check.on { color: var(--accent); }
.cloud-account {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  color: var(--subtle);
  font-size: 11px;
}
.cloud-account span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.manage-btn {
  flex: 0 0 auto;
  padding: 2px 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--muted);
  font-size: 11px;
  text-decoration: none;
}
.manage-btn:hover { color: var(--accent); border-color: var(--accent); }
.version-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 6px;
  color: var(--subtle);
  font-size: 11px;
}
.version-row span:nth-child(2) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.version-brand { display: grid; place-items: center; width: 18px; height: 18px; opacity: .8; }
.version-brand svg { width: 18px; height: 18px; }
.shield-link {
  display: inline-flex;
  align-items: center;
  color: var(--subtle);
  text-decoration: none;
  transition: color 150ms ease;
}
.shield-link:hover { color: var(--accent); }

/* ── 顶栏 ───────────────────────────────── */
.app-body { display: flex; min-width: 0; min-height: 0; flex: 1; flex-direction: column; height: 100%; overflow: hidden; }
.topbar {
  display: flex;
  height: 60px;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 28px;
  background: var(--canvas);
  border-bottom: 1px solid var(--line);
}
.topbar-leading { display: flex; min-width: 0; align-items: center; gap: 10px; }
.mobile-menu-button { display: none; }
.connection-chip {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  gap: 6px;
  padding: 4px 13px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.connection-chip.tone-success { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 34%, transparent); background: var(--accent-soft); }
.connection-chip.tone-warning { color: var(--warning); }
.connection-chip.tone-danger { color: var(--danger); }
.sync-time { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 4px 13px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.refresh-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.refresh-btn:disabled { opacity: .5; cursor: not-allowed; }
.sync-progress-text { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
.cancel-link { border: 0; background: transparent; color: var(--accent); font-size: 12px; cursor: pointer; padding: 0; }
.icon-round {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.icon-round:hover { background: var(--surface-hover); color: var(--ink); }

.sync-feedback { display: flex; min-height: 32px; min-width: 0; align-items: center; gap: 7px; padding: 6px 28px; border-bottom: 1px solid var(--line); background: var(--surface); color: var(--muted); font-size: 12px; }
.sync-feedback.tone-updated { color: var(--accent); }
.sync-feedback.tone-partial { color: var(--warning); }
.sync-feedback.tone-no_new_data { color: var(--muted); }
.sync-feedback.tone-cancelled { color: var(--muted); }
.sync-feedback.tone-deferred { color: var(--muted); }
.sync-feedback.tone-failed { color: var(--danger); }
.sync-feedback a { color: inherit; }
.spinning { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.preview-banner, .route-notice { display: flex; align-items: center; gap: 8px; padding: 9px 28px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; }
.preview-banner { background: var(--accent-soft); }
.preview-banner svg { color: var(--accent); }
.route-notice { background: var(--surface); color: var(--warning); }
.main-content { width: 100%; min-width: 0; min-height: 0; flex: 1; overflow: auto; background: var(--canvas); }
.bottom-nav, .mobile-menu { display: none; }
.page-enter-active, .page-leave-active { transition: opacity 150ms ease, transform 150ms ease; }
.page-enter-from, .page-leave-to { opacity: 0; transform: translateY(4px); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
}

@media (max-width: 760px) {
  .sidebar { display: none; }
  .topbar { height: 56px; padding: 0 16px; }
  .mobile-menu-button { display: inline-flex; width: 44px; height: 44px; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: var(--radius-sm); background: transparent; cursor: pointer; }
  .sync-time { display: none; }
  .connection-chip { padding-inline: 8px; }
  .connection-chip span { display: none; }
  .sync-feedback { padding-inline: 16px; }
  .mobile-menu { display: block; padding: 8px 12px 12px; background: var(--bg); border-bottom: 1px solid var(--line); }
  .mobile-menu-links { display: grid; gap: 3px; }
  .preview-banner, .route-notice { padding-inline: 16px; }
  .main-content { padding-bottom: 64px; }
  .bottom-nav { position: fixed; right: 0; bottom: 0; left: 0; z-index: 20; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); height: 60px; padding: 5px 8px calc(5px + env(safe-area-inset-bottom)); background: var(--canvas); border-top: 1px solid var(--line); }
  .bottom-nav-link { display: flex; min-width: 0; min-height: 44px; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-radius: var(--radius-sm); color: var(--muted); font-size: 11px; text-decoration: none; }
  .bottom-nav-link.is-active { color: var(--accent); background: var(--accent-soft); }
}

/* ── 页面通用 ───────────────────────────── */
.page { width: 100%; max-width: none; min-width: 0; margin: 0; padding: 20px 28px 24px; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 16px; min-width: 0; }
.eyebrow { margin: 0 0 6px; color: var(--muted); font-size: 12px; letter-spacing: .06em; }
h1, h2, p { margin-top: 0; }
.page h1 { margin-bottom: 6px; font-size: 26px; font-weight: 700; letter-spacing: -.02em; line-height: 1.2; }
.page-intro { margin-bottom: 0; color: var(--muted); font-size: 13px; }
.button { display: inline-flex; min-height: 34px; align-items: center; justify-content: center; gap: 6px; padding: 6px 14px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; font-size: 12px; text-decoration: none; cursor: pointer; }
.button:disabled { opacity: .5; cursor: not-allowed; }
.button-primary, .button.primary { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.button-primary:hover:not(:disabled), .button.primary:hover:not(:disabled) { background: var(--accent-hover); }
.button-secondary, .button.secondary, .button-quiet, .button.quiet { border-color: var(--line-strong); color: var(--muted); background: var(--surface-raised); }
.button-secondary:hover:not(:disabled), .button.secondary:hover:not(:disabled), .button-quiet:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.button-danger, .button.danger-button { border-color: rgba(240, 97, 106, .35); color: var(--danger); }
.surface-card { border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); overflow: hidden; min-width: 0; }
.section-label { margin: 0 0 8px; padding: 0 2px; color: var(--ink); font-size: 13px; font-weight: 700; }
@media (max-width: 760px) {
  .page { padding: 24px 16px 38px; }
}
</style>

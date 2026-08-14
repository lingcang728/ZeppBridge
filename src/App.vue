<script setup lang="ts">
import { getVersion } from '@tauri-apps/api/app';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import BrandMark from './components/BrandMark.vue';
import Icon from './components/Icon.vue';
import { useSyncController } from './composables/useSyncController';
import { useUiScale } from './composables/useUiScale';
import { backend, isDesktop } from './lib/bridge';

// 桌面端从 Tauri 运行时读取版本（与 tauri.conf.json 单一来源），
// 浏览器预览环境回退到下面的常量（与 package.json 保持同步）。
const FALLBACK_APP_VERSION = '0.8.0';
const APP_VERSION = ref(FALLBACK_APP_VERSION);
if (isDesktop()) {
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
const userMenuOpen = ref(false);
const userControl = ref<HTMLElement | null>(null);
const {
  appStatus, statusError, syncState, syncMessage, syncProgress, isSyncing, canIncrementalSync,
  initialize, runSync, cancelSync,
} = useSyncController();
const { initializeScale, bumpScale, resetScale } = useUiScale();

const navigation = [
  { to: '/', label: '探索', icon: 'compass' as const },
  { to: '/explore', label: '导出与提示词', icon: 'edit' as const },
  { to: '/recent', label: '历史记录', icon: 'clock' as const },
  { to: '/settings', label: '设置', icon: 'gear' as const },
];

const connected = computed(() => appStatus.value?.connection_state === 'connected');

const dataSources = computed(() => [
  { name: 'T-Rex 3', icon: 'watch' as const, connected: connected.value },
  { name: 'Helio Ring', icon: 'ring' as const, connected: connected.value },
  { name: 'MSV Cloud', icon: 'cloud' as const, connected: connected.value },
]);

const statusLabel = computed(() => {
  if (!isDesktop()) return '桌面预览';
  if (!appStatus.value) return '检查连接';
  if (appStatus.value.connection_state === 'needs_reauth') return '需要重新连接';
  if (appStatus.value.connection_state === 'connected') return '已连接';
  if (appStatus.value.connection_state === 'configured') return '待验证';
  return '未连接';
});
const statusTone = computed(() => {
  if (appStatus.value?.connection_state === 'needs_reauth' || syncState.value === 'failed') return 'danger';
  if (syncState.value === 'partial') return 'warning';
  if (appStatus.value?.connection_state === 'connected') return 'success';
  return 'neutral';
});
const lastSyncClock = computed(() => {
  const raw = appStatus.value?.last_cloud_sync_at;
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date).replace(/\//g, '-');
});
const accountLabel = computed(() => appStatus.value?.masked_user_id || 'user@example.com');
const browserPreview = computed(() => !isDesktop());
const routeNotice = computed(() => route.query.notice === 'not-found');

const onDocumentPointerDown = (event: PointerEvent) => {
  if (!userControl.value?.contains(event.target as Node)) userMenuOpen.value = false;
};
const onDocumentKeydown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  if (target && target.closest('input, textarea, select, [contenteditable]')) return;
  if (event.key === 'Escape') userMenuOpen.value = false;
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

onMounted(() => {
  initializeScale();
  void initialize();
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onDocumentKeydown);
  if (route.query.notice === 'not-found') {
    window.setTimeout(() => {
      const query = { ...route.query };
      delete query.notice;
      void router.replace({ path: route.path, query });
    }, 8000);
  }
  if (isDesktop()) {
    void backend.listen('app://hidden-to-tray', () => {
      if (window.localStorage.getItem('zeppbridge-tray-hint') === '1') return;
      window.localStorage.setItem('zeppbridge-tray-hint', '1');
      trayHint.value = true;
      window.setTimeout(() => { trayHint.value = false; }, 6000);
    });
  }
});
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  document.removeEventListener('keydown', onDocumentKeydown);
});
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>

  <div class="app-shell">
    <aside class="sidebar" aria-label="主导航">
      <div class="brand-lockup">
        <span class="brand-badge"><BrandMark /></span>
        <span class="brand-text">
          <span class="brand-name">Z-Bridge</span>
          <span class="brand-sub">Amazfit Data Bridge</span>
        </span>
      </div>

      <nav class="desktop-nav" aria-label="主导航">
        <RouterLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          active-class="is-active"
          exact-active-class="is-active"
          @click="closeMobileMenu"
        >
          <Icon :name="item.icon" :size="17" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sources">
        <div class="sources-head">
          <span>数据来源</span>
          <button type="button" aria-label="添加数据来源" title="添加数据来源"><Icon name="plus" :size="14" /></button>
        </div>
        <RouterLink v-for="source in dataSources" :key="source.name" class="source-card" to="/settings">
          <span class="source-icon"><Icon :name="source.icon" :size="22" /></span>
          <span class="source-copy">
            <strong>{{ source.name }}</strong>
            <span :class="['source-state', { on: source.connected }]">
              <i class="dot"></i>{{ source.connected ? '已连接' : '未连接' }}
            </span>
          </span>
          <Icon name="chevron-down" :size="14" class="source-chevron" />
        </RouterLink>
      </div>

      <div class="sidebar-footer">
        <div class="cloud-card">
          <div class="cloud-row">
            <Icon name="cloud" :size="16" />
            <span>{{ connected ? '云服务已连接' : '云服务未连接' }}</span>
            <Icon name="circle-check" :size="15" :class="['cloud-check', { on: connected }]" />
          </div>
          <div class="cloud-account">
            <span>账户：{{ accountLabel }}</span>
            <RouterLink to="/settings" class="manage-btn">管理</RouterLink>
          </div>
        </div>
        <div class="version-row">
          <span class="version-brand"><BrandMark /></span>
          <span>Z-Bridge　v{{ APP_VERSION }}</span>
          <Icon name="shield" :size="14" />
        </div>
      </div>
    </aside>

    <div class="app-body">
      <header class="topbar">
        <div class="topbar-leading">
          <button class="mobile-menu-button" type="button" aria-label="打开导航" :aria-expanded="mobileMenuOpen" @click="mobileMenuOpen = !mobileMenuOpen">
            <Icon :name="mobileMenuOpen ? 'x' : 'sliders'" :size="19" />
          </button>
          <span v-if="statusError" class="sr-only" role="status">{{ statusError }}</span>
          <span :class="['connection-chip', `tone-${statusTone}`]" title="云端连接状态" aria-live="polite">
            <Icon name="circle-check" :size="14" /><span>{{ statusLabel }}</span>
          </span>
          <span class="sync-time">上次同步：{{ lastSyncClock }}</span>
          <button
            class="refresh-btn"
            type="button"
            :disabled="isSyncing || !canIncrementalSync"
            :title="canIncrementalSync ? '立即同步' : '请先完成连接验证'"
            aria-label="立即同步"
            @click="runSync('incremental')"
          >
            <Icon name="sync" :size="15" :class="{ spinning: isSyncing }" />
          </button>
          <span v-if="isSyncing" class="sync-progress-text">
            {{ syncProgress ? `${syncProgress.current}/${syncProgress.total}` : '同步中…' }}
            <button class="cancel-link" type="button" @click="cancelSync">取消</button>
          </span>
        </div>
        <div class="topbar-actions">
          <button class="icon-round" type="button" aria-label="通知"><Icon name="bell" :size="17" /></button>
          <button class="icon-round" type="button" aria-label="帮助"><Icon name="help" :size="17" /></button>
          <div ref="userControl" class="user-control">
            <button class="user-trigger" type="button" aria-haspopup="menu" :aria-expanded="userMenuOpen" @click="userMenuOpen = !userMenuOpen">
              <span class="avatar">U</span>
              <span class="user-name">User</span>
              <Icon name="chevron-down" :size="14" />
            </button>
            <div v-if="userMenuOpen" class="user-menu" role="menu" aria-label="用户菜单">
              <RouterLink to="/settings" role="menuitem" @click="userMenuOpen = false"><Icon name="gear" :size="15" /><span>设置</span></RouterLink>
              <RouterLink to="/settings" role="menuitem" @click="userMenuOpen = false"><Icon name="user" :size="15" /><span>账户与区域</span></RouterLink>
            </div>
          </div>
        </div>
      </header>

      <div v-if="statusError" class="sync-feedback tone-failed" role="alert">
        <Icon name="warning" :size="14" />
        <span>{{ statusError }}</span>
      </div>
      <div v-if="syncState !== 'idle'" :class="['sync-feedback', `tone-${syncState}`]" role="status" aria-live="polite">
        <Icon :name="syncState === 'failed' ? 'warning' : syncState === 'updated' ? 'circle-check' : 'info'" :size="14" :class="{ spinning: isSyncing }" />
        <span>{{ syncMessage }}</span>
      </div>
      <div v-if="trayHint" class="sync-feedback" role="status">关闭窗口后 Z-Bridge 仍在托盘运行，可继续自动同步。</div>

      <div v-if="mobileMenuOpen" class="mobile-menu" aria-label="移动导航">
        <nav class="mobile-menu-links">
          <RouterLink v-for="item in navigation" :key="item.to" :to="item.to" class="nav-link" active-class="is-active" exact-active-class="is-active" @click="closeMobileMenu">
            <Icon :name="item.icon" :size="17" /><span>{{ item.label }}</span>
          </RouterLink>
        </nav>
      </div>

      <div v-if="browserPreview" class="preview-banner" role="status">
        <Icon name="terminal" :size="16" />
        <span>请使用桌面应用。浏览器预览不会读取账户数据。</span>
      </div>
      <div v-if="routeNotice" class="route-notice" role="status">
        <Icon name="info" :size="16" />页面不存在，已返回探索。
      </div>

      <main id="main-content" class="main-content" tabindex="-1">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>

      <nav class="bottom-nav" aria-label="移动主导航">
        <RouterLink v-for="item in navigation" :key="item.to" :to="item.to" class="bottom-nav-link" active-class="is-active" exact-active-class="is-active">
          <Icon :name="item.icon" :size="18" /><span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </div>
  </div>
</template>

<style>
:root {
  color-scheme: dark;
  --bg: #14160C;
  --sidebar: #101207;
  --canvas: #14160C;
  --surface: #1C1F11;
  --surface-raised: #242819;
  --surface-hover: #2B3020;
  --ink: #EEF0E1;
  --muted: #A9AD92;
  --subtle: #7C8166;
  --faint: #5C6148;
  --line: rgba(226, 232, 180, .09);
  --line-strong: rgba(226, 232, 180, .16);
  --accent: #CDDC7C;
  --accent-hover: #DCE896;
  --accent-strong: #B9C964;
  --accent-ink: #171A0A;
  --accent-soft: rgba(205, 220, 124, .12);
  --icon-mint: #CDDC7C;
  --heart: #EF6E6E;
  --heart-wash: rgba(239, 110, 110, .10);
  --sleep: #9BA3F5;
  --sleep-wash: rgba(155, 163, 245, .10);
  --activity: #A4CB8F;
  --activity-wash: rgba(164, 203, 143, .10);
  --calories: #EF9F27;
  --distance: #64A8E8;
  --danger: #F0616A;
  --warning: #D9A556;
  --focus: #CDDC7C;
  --sleep-deep: #6B6FD4;
  --sleep-light: #7E8AE8;
  --sleep-rem: #B07AD4;
  --sleep-awake: #D9A556;
  --font-sans: 'Inter', 'MiSans', 'Segoe UI', 'Microsoft YaHei UI', sans-serif;
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
  background: var(--surface-raised);
  border: 1px solid var(--line);
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
.nav-link.is-active {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: rgba(205, 220, 124, .18);
}
.nav-link.is-active svg { color: var(--accent); }

.sources { margin-top: 20px; min-width: 0; display: grid; gap: 8px; }
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
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  text-decoration: none;
  color: inherit;
}
.source-card:hover { background: var(--surface-raised); border-color: var(--line-strong); }
.source-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 10px;
  background: var(--surface-raised);
  border: 1px solid var(--line);
  color: var(--muted);
}
.source-copy { display: grid; gap: 2px; min-width: 0; flex: 1; }
.source-copy strong { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source-state { display: inline-flex; align-items: center; gap: 5px; color: var(--subtle); font-size: 11px; }
.source-state .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--subtle); }
.source-state.on { color: var(--accent); }
.source-state.on .dot { background: var(--accent); }
.source-chevron { transform: rotate(-90deg); color: var(--subtle); }

.sidebar-footer { margin-top: auto; padding-top: 16px; min-width: 0; display: grid; gap: 12px; }
.cloud-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  padding: 10px 12px;
  display: grid;
  gap: 8px;
}
.cloud-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ink); }
.cloud-row svg:first-child { color: var(--muted); }
.cloud-row span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cloud-check { color: var(--faint); }
.cloud-check.on { color: var(--accent); }
.cloud-account {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  color: var(--subtle);
  font-size: 11px;
}
.cloud-account span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
  padding: 0 6px;
  color: var(--subtle);
  font-size: 11px;
}
.version-row span:nth-child(2) { flex: 1; }
.version-brand { display: grid; place-items: center; width: 18px; height: 18px; opacity: .8; }
.version-brand svg { width: 18px; height: 18px; }

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
.topbar-leading, .topbar-actions { display: flex; min-width: 0; align-items: center; gap: 10px; }
.topbar-actions { flex-wrap: wrap; justify-content: flex-end; }
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
.connection-chip.tone-success { color: var(--accent); border-color: rgba(205, 220, 124, .25); background: var(--accent-soft); }
.connection-chip.tone-warning { color: var(--warning); }
.connection-chip.tone-danger { color: var(--danger); }
.sync-time { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.refresh-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.refresh-btn:hover:not(:disabled) { background: var(--surface-hover); color: var(--ink); }
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
.user-control { position: relative; }
.user-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 3px 6px 3px 3px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.user-trigger:hover { background: var(--surface-hover); }
.avatar {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--surface-raised);
  border: 1px solid var(--line-strong);
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
}
.user-name { color: var(--ink); font-size: 13px; }
.user-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 40;
  width: 168px;
  padding: 5px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.user-menu a {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 36px;
  padding: 7px 9px;
  border-radius: 7px;
  color: var(--muted);
  font-size: 12px;
  text-decoration: none;
}
.user-menu a span { color: var(--ink); }
.user-menu a:hover { background: var(--accent-soft); color: var(--accent); }

.sync-feedback { display: flex; min-height: 32px; min-width: 0; align-items: center; gap: 7px; padding: 6px 28px; border-bottom: 1px solid var(--line); background: var(--surface); color: var(--muted); font-size: 12px; }
.sync-feedback.tone-updated { color: var(--accent); }
.sync-feedback.tone-partial { color: var(--warning); }
.sync-feedback.tone-no_new_data { color: var(--muted); }
.sync-feedback.tone-cancelled { color: var(--muted); }
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
  .topbar-actions { gap: 6px; }
  .connection-chip { padding-inline: 8px; }
  .connection-chip span { display: none; }
  .user-name { display: none; }
  .sync-feedback { padding-inline: 16px; }
  .mobile-menu { display: block; padding: 8px 12px 12px; background: var(--bg); border-bottom: 1px solid var(--line); }
  .mobile-menu-links { display: grid; gap: 3px; }
  .preview-banner, .route-notice { padding-inline: 16px; }
  .main-content { padding-bottom: 64px; }
  .bottom-nav { position: fixed; right: 0; bottom: 0; left: 0; z-index: 20; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); height: 60px; padding: 5px 8px calc(5px + env(safe-area-inset-bottom)); background: var(--canvas); border-top: 1px solid var(--line); }
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

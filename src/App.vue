<script setup lang="ts">
import { getVersion } from '@tauri-apps/api/app';
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import BrandMark from './components/BrandMark.vue';
import Icon from './components/Icon.vue';
import { useSyncController } from './composables/useSyncController';
import { useTheme, type ThemeMode } from './composables/useTheme';
import { useUiScale } from './composables/useUiScale';
import { backend, isDesktop } from './lib/bridge';

// 桌面端从 Tauri 运行时读取版本（与 tauri.conf.json 单一来源），
// 浏览器预览环境回退到下面的常量（与 package.json 保持同步）。
const FALLBACK_APP_VERSION = '0.6.0';
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
const themeMenuOpen = ref(false);
const themeControl = ref<HTMLElement | null>(null);
const trayHint = ref(false);
const {
  appStatus, statusError, syncState, syncMessage, syncProgress, isSyncing, canIncrementalSync,
  lastCloudSyncLabel, initialize, runSync, cancelSync,
} = useSyncController();
const { theme, themeLabel, initializeTheme, setTheme } = useTheme();
const { initializeScale, bumpScale, resetScale } = useUiScale();

const navigation = [
  { to: '/', label: '概览', icon: 'grid' as const },
  { to: '/recent', label: '最近记录', icon: 'clock' as const },
  { to: '/ai', label: '交给 AI', icon: 'spark' as const },
  { to: '/settings', label: '设置', icon: 'gear' as const },
];
const themeOptions: { value: ThemeMode; label: string; icon: 'monitor' | 'sun' | 'moon' }[] = [
  { value: 'system', label: '跟随系统', icon: 'monitor' },
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' },
];

const pageTitle = computed(() => {
  if (route.path === '/recent') return '最近记录';
  if (route.path === '/sleep') return '睡眠';
  if (route.path === '/workouts') return '运动';
  if (route.path.startsWith('/sleep/')) return '睡眠详情';
  if (route.path.startsWith('/workouts/')) return '运动详情';
  return navigation.find((item) => item.to === route.path)?.label ?? '概览';
});
const statusLabel = computed(() => {
  if (!isDesktop()) return '请使用桌面应用';
  if (!appStatus.value) return '检查连接';
  if (appStatus.value.connection_state === 'needs_reauth') return '需要重新连接';
  if (appStatus.value.connection_state === 'connected') return '已连接';
  if (appStatus.value.connection_state === 'configured') return '待验证';
  return '未连接';
});
const statusTone = computed(() => {
  if (appStatus.value?.connection_state === 'needs_reauth' || syncState.value === 'failed') return 'danger';
  if (syncState.value === 'partial') return 'warning';
  if (syncState.value === 'cancelled') return 'neutral';
  if (appStatus.value?.connection_state === 'connected') return 'success';
  return 'neutral';
});
const browserPreview = computed(() => !isDesktop());
const routeNotice = computed(() => route.query.notice === 'not-found');

const chooseTheme = (mode: ThemeMode) => {
  setTheme(mode);
  themeMenuOpen.value = false;
};
const toggleThemeMenu = async () => {
  themeMenuOpen.value = !themeMenuOpen.value;
  if (themeMenuOpen.value) {
    await nextTick();
    themeControl.value?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();
  }
};
const onThemeMenuKeydown = (event: KeyboardEvent) => {
  const items = Array.from(themeControl.value?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
  const current = items.indexOf(document.activeElement as HTMLElement);
  let next = current;
  if (event.key === 'ArrowDown') next = (current + 1) % items.length;
  else if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = items.length - 1;
  else return;
  event.preventDefault();
  items[next]?.focus();
};
const onDocumentPointerDown = (event: PointerEvent) => {
  if (!themeControl.value?.contains(event.target as Node)) themeMenuOpen.value = false;
};
const onDocumentKeydown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  if (target && target.closest('input, textarea, select, [contenteditable]')) return;
  if (event.key === 'Escape') themeMenuOpen.value = false;
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
  initializeTheme();
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
        <BrandMark />
        <span class="brand-name">ZeppBridge</span>
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

      <div class="sidebar-footer">
        <div class="local-note"><Icon name="shield" :size="13" /><span>数据只保存在本机</span></div>
        <span class="app-version">v{{ APP_VERSION }}</span>
      </div>
    </aside>

    <div class="app-body">
      <header class="topbar">
        <div class="topbar-leading">
          <button class="mobile-menu-button" type="button" aria-label="打开导航" :aria-expanded="mobileMenuOpen" @click="mobileMenuOpen = !mobileMenuOpen">
            <Icon :name="mobileMenuOpen ? 'x' : 'sliders'" :size="19" />
          </button>
          <span class="mobile-brand">ZeppBridge</span>
          <span class="topbar-context">{{ pageTitle }}</span>
        </div>
        <div class="topbar-actions">
          <span v-if="statusError" class="sr-only" role="status">{{ statusError }}</span>
          <span :class="['connection-chip', `tone-${statusTone}`]" title="Zepp 云端连接状态" aria-live="polite">
            <Icon name="link" :size="13" /><span>{{ statusLabel }}</span>
          </span>
          <span class="sync-chip" :title="lastCloudSyncLabel">
            <Icon name="cloud" :size="13" /><span>{{ lastCloudSyncLabel }}</span><Icon name="info" :size="12" />
          </span>
          <button class="sync-button" type="button" :disabled="isSyncing || !canIncrementalSync" :title="canIncrementalSync ? syncMessage : '请先完成连接验证'" @click="runSync('incremental')">
            <Icon name="sync" :size="15" :class="{ spinning: isSyncing }" />
            <span>{{ isSyncing ? (syncProgress ? `${syncProgress.current}/${syncProgress.total}` : '同步中') : '立即同步' }}</span>
          </button>
          <button v-if="isSyncing" class="theme-trigger" type="button" @click="cancelSync">取消</button>
          <div ref="themeControl" class="theme-control">
            <button class="theme-trigger" type="button" aria-haspopup="menu" :aria-expanded="themeMenuOpen" @click="toggleThemeMenu">
              <Icon :name="theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'monitor'" :size="15" />
              <span>{{ themeLabel }}</span>
              <Icon name="chevron-down" :size="13" />
            </button>
            <div v-if="themeMenuOpen" class="theme-menu" role="menu" aria-label="选择主题" @keydown="onThemeMenuKeydown">
              <button v-for="option in themeOptions" :key="option.value" type="button" role="menuitemradio" :aria-checked="theme === option.value" @click="chooseTheme(option.value)">
                <Icon :name="option.icon" :size="15" /><span>{{ option.label }}</span><Icon v-if="theme === option.value" name="check" :size="14" />
              </button>
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
      <div v-if="trayHint" class="sync-feedback" role="status">关闭窗口后 ZeppBridge 仍在托盘运行，可继续自动同步。</div>

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
        <Icon name="info" :size="16" />页面不存在，已返回概览。
      </div>

      <main id="main-content" class="main-content" tabindex="-1">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
        <footer class="content-footer">
          <p><Icon name="shield" :size="13" />所有展示的数据均来自 Zepp 云端，已安全同步并仅保存在你的本机设备中。</p>
          <RouterLink to="/settings">数据与隐私说明 <Icon name="arrow-right" :size="12" /></RouterLink>
        </footer>
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
  --bg: #0E0F11;
  --sidebar: #0B0C0E;
  --canvas: #0E0F11;
  --surface: #15161A;
  --surface-raised: #1C1E22;
  --surface-hover: #232529;
  --ink: #EDEFF2;
  --muted: #A0A6AE;
  --subtle: #6E757E;
  --faint: #525862;
  --line: rgba(255, 255, 255, .07);
  --line-strong: rgba(255, 255, 255, .12);
  --accent: #72C994;
  --accent-hover: #8FD9AC;
  --accent-strong: #5CB37E;
  --accent-ink: #0A1F12;
  --accent-soft: rgba(114, 201, 148, .12);
  --icon-mint: #72C994;
  --heart: #EF6E6E;
  --heart-wash: rgba(239, 110, 110, .10);
  --sleep: #9BA3F5;
  --sleep-wash: rgba(155, 163, 245, .10);
  --activity: #8FCB9B;
  --activity-wash: rgba(143, 203, 155, .10);
  --calories: #EF9F27;
  --distance: #378ADD;
  --danger: #F0616A;
  --warning: #D9A556;
  --focus: #72C994;
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
  --radius-sm: 8px;
  --radius-md: 12px;
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme]) {
    color-scheme: light;
    --bg: #F2F4F6;
    --sidebar: #EEF0F3;
    --canvas: #F7F8FA;
    --surface: #FFFFFF;
    --surface-raised: #ECEFF2;
    --ink: #14171C;
    --muted: #5C636C;
    --subtle: #8A9098;
    --line: #D8DCE1;
    --line-strong: #C5CBD2;
    --accent: #3E8A5E;
    --accent-strong: #347852;
    --accent-ink: #FFFFFF;
    --accent-soft: #D7F6E5;
    --icon-mint: #3E8A5E;
    --heart: #C45F64;
    --heart-wash: #F6E6E7;
    --sleep: #6B72C8;
    --sleep-wash: #E8E9F6;
    --activity: #4E9A70;
    --activity-wash: #E4F3EA;
    --danger: #C45F64;
    --warning: #B8842A;
    --focus: #4E9A70;
    --sleep-deep: #5856D6;
    --sleep-light: #5E5CE6;
    --sleep-rem: #AF52DE;
    --sleep-awake: #C48A12;
  }
}

:root[data-theme='light'] {
  color-scheme: light;
  --bg: #F2F4F6;
  --sidebar: #EEF0F3;
  --canvas: #F7F8FA;
  --surface: #FFFFFF;
  --surface-raised: #ECEFF2;
  --ink: #14171C;
  --muted: #5C636C;
  --subtle: #8A9098;
  --line: #D8DCE1;
  --line-strong: #C5CBD2;
  --accent: #3E8A5E;
  --accent-strong: #347852;
  --accent-ink: #FFFFFF;
  --accent-soft: #D7F6E5;
  --icon-mint: #3E8A5E;
  --heart: #C45F64;
  --heart-wash: #F6E6E7;
  --sleep: #6B72C8;
  --sleep-wash: #E8E9F6;
  --activity: #4E9A70;
  --activity-wash: #E4F3EA;
  --danger: #C45F64;
  --warning: #B8842A;
  --focus: #4E9A70;
  --sleep-deep: #5856D6;
  --sleep-light: #5E5CE6;
  --sleep-rem: #AF52DE;
  --sleep-awake: #C48A12;
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
button, input, select { font: inherit; }
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
.sidebar {
  width: 224px;
  flex: 0 0 224px;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  padding: 20px 12px 16px;
  background: var(--sidebar);
  border-right: 1px solid var(--line);
}
.brand-lockup { display: flex; align-items: center; gap: 9px; padding: 0 8px 24px; min-width: 0; }
.brand-name { display: block; font-size: 15px; font-weight: 700; letter-spacing: .01em; }
.desktop-nav { display: grid; gap: 4px; min-width: 0; }
.nav-link {
  display: flex;
  min-height: 40px;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--muted);
  font-size: 13px;
  text-decoration: none;
  transition: color 150ms ease, background-color 150ms ease, border-color 150ms ease, transform 150ms ease;
}
.nav-link:hover { color: var(--ink); background: var(--surface-hover); }
.nav-link:active { transform: translateY(1px); }
.nav-link svg { color: var(--subtle); }
.nav-link.is-active {
  color: var(--icon-mint);
  background: var(--accent-soft);
  border-color: transparent;
}
.nav-link.is-active svg { color: var(--icon-mint); }
.sidebar-footer { margin-top: auto; padding: 0 8px; min-width: 0; display: grid; gap: 8px; }
.local-note { display: flex; align-items: center; gap: 6px; color: var(--accent); font-size: 12px; }
.app-version { display: block; color: var(--subtle); font-family: var(--font-mono); font-size: 11px; }
.app-body { display: flex; min-width: 0; min-height: 0; flex: 1; flex-direction: column; height: 100%; overflow: hidden; }
.topbar {
  display: flex;
  height: 56px;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 24px;
  background: var(--canvas);
  border-bottom: 1px solid var(--line);
}
.topbar-leading, .topbar-actions { display: flex; min-width: 0; align-items: center; gap: 8px; }
.topbar-actions { flex-wrap: wrap; justify-content: flex-end; }
.topbar-context { color: var(--ink); font-size: 14px; font-weight: 700; }
.mobile-brand, .mobile-menu-button { display: none; }
.connection-chip, .sync-chip {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.connection-chip.tone-success { color: var(--icon-mint); border-color: var(--accent-soft); background: var(--accent-soft); }
.content-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  margin: 0;
  padding: 8px 24px 20px;
  color: var(--muted);
  font-size: 12px;
}
.content-footer p { display: flex; align-items: center; gap: 6px; margin: 0; }
.content-footer a { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); text-decoration: none; }
.content-footer svg { color: var(--icon-mint); }
.connection-chip.tone-warning { color: var(--warning); }
.connection-chip.tone-danger { color: var(--danger); }
.sync-button, .theme-trigger {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font-size: 12px;
  cursor: pointer;
}
.sync-button {
  border: 0;
  background: var(--accent);
  color: var(--accent-ink);
}
.sync-button:hover:not(:disabled) { background: var(--accent-hover); }
.theme-trigger:hover { background: var(--surface-hover); border-color: var(--line-strong); }
.sync-button:disabled { color: var(--subtle); background: var(--surface-raised); cursor: not-allowed; opacity: .7; }
.theme-control { position: relative; display: inline-flex; color: var(--muted); }
.theme-trigger { min-width: 108px; justify-content: flex-start; color: var(--muted); }
.theme-trigger span { flex: 1; color: var(--ink); text-align: left; }
.theme-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 40; width: 156px; padding: 5px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface-raised); }
.theme-menu button { display: flex; width: 100%; min-height: 36px; align-items: center; gap: 9px; padding: 7px 9px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font-size: 12px; text-align: left; cursor: pointer; }
.theme-menu button span { flex: 1; color: var(--ink); }
.theme-menu button:hover, .theme-menu button[aria-checked='true'] { background: var(--accent-soft); color: var(--accent); }
.sync-feedback { display: flex; min-height: 32px; min-width: 0; align-items: center; gap: 7px; padding: 6px 24px; border-bottom: 1px solid var(--line); background: var(--surface); color: var(--muted); font-size: 12px; }
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
  .mobile-brand { display: inline; font-size: 13px; font-weight: 700; }
  .topbar-context { padding-left: 4px; border-left: 1px solid var(--line); font-size: 12px; }
  .topbar-actions { gap: 6px; }
  .connection-chip, .sync-chip { padding-inline: 8px; }
  .connection-chip span, .sync-chip span { display: none; }
  .sync-button, .theme-trigger { width: 38px; min-width: 38px; padding: 0; }
  .sync-button span, .theme-trigger span, .theme-trigger > svg:last-child { display: none; }
  .theme-menu { right: 0; }
  .theme-menu button { width: 100%; min-width: 0; padding-inline: 9px; }
  .theme-menu button span { display: block; }
  .sync-feedback { padding-inline: 16px; }
  .mobile-menu { display: block; padding: 8px 12px 12px; background: var(--bg); border-bottom: 1px solid var(--line); }
  .mobile-menu-links { display: grid; gap: 3px; }
  .preview-banner, .route-notice { padding-inline: 16px; }
  .main-content { padding-bottom: 64px; }
  .bottom-nav { position: fixed; right: 0; bottom: 0; left: 0; z-index: 20; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); height: 60px; padding: 5px 8px calc(5px + env(safe-area-inset-bottom)); background: var(--canvas); border-top: 1px solid var(--line); }
  .bottom-nav-link { display: flex; min-width: 0; min-height: 44px; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-radius: var(--radius-sm); color: var(--muted); font-size: 11px; text-decoration: none; }
  .bottom-nav-link.is-active { color: var(--accent); background: var(--accent-soft); }
}

.page { width: 100%; max-width: none; min-width: 0; margin: 0; padding: 16px 24px 20px; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 14px; min-width: 0; }
.eyebrow { margin: 0 0 6px; color: var(--muted); font-size: 12px; letter-spacing: .06em; }
h1, h2, p { margin-top: 0; }
.page h1 { margin-bottom: 6px; font-size: 22px; font-weight: 700; letter-spacing: -.02em; line-height: 1.2; }
.page-intro { margin-bottom: 0; color: var(--muted); font-size: 12px; }
.button { display: inline-flex; min-height: 34px; align-items: center; justify-content: center; gap: 6px; padding: 6px 12px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; font-size: 12px; text-decoration: none; cursor: pointer; }
.button:disabled { opacity: .5; cursor: not-allowed; }
.button-primary, .button.primary { background: var(--accent); color: var(--accent-ink); }
.button-secondary, .button.secondary, .button-quiet, .button.quiet { border-color: var(--line); color: var(--muted); }
.button-secondary:hover:not(:disabled), .button.secondary:hover:not(:disabled), .button-quiet:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.button-danger, .button.danger-button { border-color: rgba(240, 97, 106, .35); color: var(--danger); }
.surface-card { border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); overflow: hidden; min-width: 0; }
.section-label { margin: 0 0 8px; padding: 0 2px; color: var(--ink); font-size: 13px; font-weight: 700; }
@media (max-width: 760px) {
  .page { padding: 24px 16px 38px; }
}
</style>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { listen } from '@tauri-apps/api/event';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import Icon from './components/Icon.vue';
import { useSyncController } from './composables/useSyncController';
import { useTheme, type ThemeMode } from './composables/useTheme';
import { isTauri } from './composables/useTauriApi';

const route = useRoute();
const router = useRouter();
const mobileMenuOpen = ref(false);
const themeMenuOpen = ref(false);
const themeControl = ref<HTMLElement | null>(null);
const trayHint = ref(false);
const {
  appStatus, statusError, syncState, syncMessage, syncProgress, isSyncing, canIncrementalSync,
  captureActive, proxyRestored, initialize, runSync, cancelSync,
} = useSyncController();
const { theme, themeLabel, initializeTheme, setTheme } = useTheme();

const navigation = [
  { to: '/', label: '概览', icon: 'activity' as const },
  { to: '/sleep', label: '睡眠', icon: 'moon' as const },
  { to: '/workouts', label: '运动', icon: 'steps' as const },
  { to: '/settings', label: '设置', icon: 'sliders' as const },
];
const themeOptions: { value: ThemeMode; label: string; icon: 'spark' | 'sun' | 'moon' }[] = [
  { value: 'system', label: '跟随系统', icon: 'spark' },
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' },
];

const pageTitle = computed(() => {
  if (route.path.startsWith('/sleep/')) return '睡眠详情';
  if (route.path.startsWith('/workouts/')) return '运动详情';
  return navigation.find((item) => item.to === route.path)?.label ?? '概览';
});
const statusLabel = computed(() => {
  if (!isTauri()) return '浏览器预览';
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
const browserPreview = computed(() => !isTauri());
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
  if (event.key === 'Escape') themeMenuOpen.value = false;
};
const closeMobileMenu = () => { mobileMenuOpen.value = false; };

onMounted(() => {
  initializeTheme();
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
  if (isTauri()) {
    void listen('app://hidden-to-tray', () => {
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
        <div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
        <div>
          <span class="brand-name">ZeppBridge</span>
          <span class="brand-version">本地健康数据</span>
        </div>
      </div>

      <nav class="desktop-nav" aria-label="主导航">
        <span class="nav-heading">工作区</span>
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
        <div class="sidebar-rule"></div>
        <div class="local-note"><Icon name="shield" :size="15" /><span>数据只保存在本机</span></div>
        <span class="app-version">v0.2.2 · 桌面版</span>
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
            <span class="status-dot" aria-hidden="true"></span>{{ statusLabel }}
          </span>
          <button class="sync-button" type="button" :disabled="isSyncing || !canIncrementalSync" :title="canIncrementalSync ? syncMessage : '请先完成连接验证'" @click="runSync('incremental')">
            <Icon name="sync" :size="15" :class="{ spinning: isSyncing }" />
            <span>{{ isSyncing ? (syncProgress ? `${syncProgress.current}/${syncProgress.total}` : '同步中') : '立即同步' }}</span>
          </button>
          <button v-if="isSyncing" class="theme-trigger" type="button" @click="cancelSync">取消</button>
          <div ref="themeControl" class="theme-control">
            <button class="theme-trigger" type="button" aria-haspopup="menu" :aria-expanded="themeMenuOpen" @click="toggleThemeMenu">
              <Icon :name="theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'spark'" :size="15" />
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
      <div v-if="captureActive && !route.path.startsWith('/settings')" class="sync-feedback tone-partial" role="status">
        <Icon name="wifi" :size="14" />
        <RouterLink to="/settings">正在连接手机 · 返回设置继续</RouterLink>
      </div>
      <div v-if="!proxyRestored && appStatus?.connection_state === 'connected'" class="sync-feedback tone-failed" role="alert">
        <Icon name="warning" :size="14" />
        <RouterLink to="/settings">请先把手机 Wi‑Fi 代理改回「无」</RouterLink>
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
        <span>请从 ZeppBridge 桌面应用打开，浏览器预览不会读取账户数据。</span>
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
  --bg: #000000;
  --canvas: #1c1c1e;
  --surface: #2c2c2e;
  --surface-raised: #3a3a3c;
  --ink: #ffffff;
  --muted: #98989d;
  --subtle: #636366;
  --line: rgba(255, 255, 255, 0.12);
  --line-strong: rgba(255, 255, 255, 0.2);
  --accent: #0A84FF;
  --accent-strong: #409CFF;
  --accent-ink: #000000;
  --heart: #FF453A;
  --sleep: #5E5CE6;
  --activity: #FF9F0A;
  --danger: #FF453A;
  --warning: #FFD60A;
  --focus: #0A84FF;
  --sleep-deep: #5856D6;
  --sleep-light: #5E5CE6;
  --sleep-rem: #AF52DE;
  --sleep-awake: #FF9F0A;
  --font-sans: 'Segoe UI Variable', 'Segoe UI', Geist, system-ui, -apple-system, sans-serif;
  --font-mono: 'Cascadia Code', 'SFMono-Regular', Consolas, monospace;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 32px;
  --space-8: 40px;
  --radius-sm: 8px;
  --radius-md: 12px;
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme]) {
    color-scheme: light;
    --bg: #f2f2f7;
    --canvas: #f2f2f7;
    --surface: #ffffff;
    --surface-raised: #f6f6fa;
    --ink: #1c1c1e;
    --muted: #6c6c70;
    --subtle: #8e8e93;
    --line: rgba(28, 28, 30, 0.1);
    --line-strong: rgba(28, 28, 30, 0.18);
    --accent: #007AFF;
    --accent-strong: #0051D5;
    --accent-ink: #ffffff;
    --heart: #FF3B30;
    --sleep: #5E5CE6;
    --activity: #FF9500;
    --danger: #FF3B30;
    --warning: #FF9500;
    --focus: #007AFF;
    --sleep-deep: #5856D6;
    --sleep-light: #5E5CE6;
    --sleep-rem: #AF52DE;
    --sleep-awake: #FF9500;
  }
}

:root[data-theme='light'] {
  color-scheme: light;
  --bg: #f2f2f7;
  --canvas: #f2f2f7;
  --surface: #ffffff;
  --surface-raised: #f6f6fa;
  --ink: #1c1c1e;
  --muted: #6c6c70;
  --subtle: #8e8e93;
  --line: rgba(28, 28, 30, 0.1);
  --line-strong: rgba(28, 28, 30, 0.18);
  --accent: #007AFF;
  --accent-strong: #0051D5;
  --accent-ink: #ffffff;
  --heart: #FF3B30;
  --sleep: #5E5CE6;
  --activity: #FF9500;
  --danger: #FF3B30;
  --warning: #FF9500;
  --focus: #007AFF;
  --sleep-deep: #5856D6;
  --sleep-light: #5E5CE6;
  --sleep-rem: #AF52DE;
  --sleep-awake: #FF9500;
}

* { box-sizing: border-box; }
html, body, #app { min-height: 100%; margin: 0; }
body {
  min-width: 320px;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 14px;
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
.app-shell { display: flex; min-height: 100vh; background: var(--bg); }
.sidebar {
  width: 216px;
  flex: 0 0 216px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 24px 12px 16px;
  background: var(--bg);
  border-right: 1px solid var(--line);
}
.brand-lockup { display: flex; align-items: center; gap: 10px; padding: 0 10px 28px; }
.brand-mark { display: grid; grid-template-columns: repeat(3, 4px); align-items: end; gap: 2px; height: 18px; }
.brand-mark span { display: block; width: 4px; border-radius: 2px; background: var(--accent); }
.brand-mark span:nth-child(1) { height: 9px; opacity: .65; }
.brand-mark span:nth-child(2) { height: 14px; }
.brand-mark span:nth-child(3) { height: 18px; opacity: .8; }
.brand-name { display: block; font-size: 13px; font-weight: 700; letter-spacing: .02em; }
.brand-version { display: block; margin-top: 1px; color: var(--muted); font-size: 10px; }
.desktop-nav { display: grid; gap: 3px; }
.nav-heading { padding: 0 12px 8px; color: var(--subtle); font-size: 10px; font-weight: 700; letter-spacing: .12em; }
.nav-link {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: 13px;
  text-decoration: none;
  transition: color 150ms ease, background-color 150ms ease, border-color 150ms ease, transform 150ms ease;
}
.nav-link:hover { color: var(--ink); background: var(--surface); border-color: var(--line); }
.nav-link:active { transform: translateY(1px); }
.nav-link.is-active { color: var(--ink); background: var(--surface); border-color: var(--line-strong); box-shadow: inset 2px 0 0 var(--accent); }
.nav-link.is-active svg { color: var(--accent); }
.sidebar-footer { margin-top: auto; padding: 0 10px; }
.sidebar-rule { height: 1px; margin: 14px 0; background: var(--line); }
.local-note { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 11px; }
.app-version { display: block; margin-top: 8px; color: var(--subtle); font-family: var(--font-mono); font-size: 10px; }
.app-body { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.topbar {
  display: flex;
  height: 64px;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  background: var(--canvas);
  border-bottom: 1px solid var(--line);
}
.topbar-leading, .topbar-actions { display: flex; align-items: center; gap: 12px; }
.topbar-context { color: var(--muted); font-size: 13px; }
.mobile-brand, .mobile-menu-button { display: none; }
.connection-chip { display: inline-flex; min-height: 30px; align-items: center; gap: 7px; padding: 5px 10px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 12px; white-space: nowrap; }
.connection-chip.tone-success { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 35%, var(--line)); }
.connection-chip.tone-warning { color: var(--warning); }
.connection-chip.tone-danger { color: var(--danger); }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.sync-button, .theme-trigger { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; gap: 7px; padding: 7px 11px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: transparent; color: var(--ink); font-size: 12px; cursor: pointer; }
.sync-button { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); color: var(--accent); }
.sync-button:hover:not(:disabled), .theme-trigger:hover { background: var(--surface); border-color: var(--line-strong); }
.sync-button:disabled { color: var(--subtle); cursor: not-allowed; opacity: .65; }
.theme-control { position: relative; display: inline-flex; color: var(--muted); }
.theme-trigger { min-width: 112px; justify-content: flex-start; color: var(--muted); }
.theme-trigger span { flex: 1; color: var(--ink); text-align: left; }
.theme-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 40; width: 156px; padding: 5px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface); box-shadow: 0 14px 35px rgba(0, 0, 0, .26); }
.theme-menu button { display: flex; width: 100%; min-height: 38px; align-items: center; gap: 9px; padding: 7px 9px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font-size: 12px; text-align: left; cursor: pointer; }
.theme-menu button span { flex: 1; color: var(--ink); }
.theme-menu button:hover, .theme-menu button[aria-checked='true'] { background: color-mix(in srgb, var(--accent) 10%, var(--surface)); color: var(--accent); }
.sync-feedback { display: flex; min-height: 34px; align-items: center; gap: 7px; padding: 7px 28px; border-bottom: 1px solid var(--line); background: var(--surface); color: var(--muted); font-size: 11px; }
.sync-feedback.tone-updated { color: var(--accent); }
.sync-feedback.tone-partial { color: var(--warning); }
.sync-feedback.tone-no_new_data { color: var(--muted); }
.sync-feedback.tone-failed { color: var(--danger); }
.sync-feedback a { color: inherit; }
.spinning { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.preview-banner, .route-notice { display: flex; align-items: center; gap: 8px; padding: 9px 28px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; }
.preview-banner { background: color-mix(in srgb, var(--accent) 7%, var(--canvas)); }
.preview-banner svg { color: var(--accent); }
.route-notice { background: color-mix(in srgb, var(--warning) 7%, var(--canvas)); color: var(--warning); }
.main-content { width: 100%; min-width: 0; flex: 1; background: var(--canvas); }
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
  .connection-chip { padding-inline: 8px; }
  .connection-chip { font-size: 0; }
  .connection-chip .status-dot { width: 7px; height: 7px; }
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
  .bottom-nav { position: fixed; right: 0; bottom: 0; left: 0; z-index: 20; display: grid; grid-template-columns: repeat(4, 1fr); height: 60px; padding: 5px 8px calc(5px + env(safe-area-inset-bottom)); background: color-mix(in srgb, var(--canvas) 94%, transparent); border-top: 1px solid var(--line); backdrop-filter: blur(12px); }
  .bottom-nav-link { display: flex; min-width: 44px; min-height: 44px; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-radius: var(--radius-sm); color: var(--muted); font-size: 10px; text-decoration: none; }
  .bottom-nav-link.is-active { color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
}
</style>

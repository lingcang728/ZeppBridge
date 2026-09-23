<script setup lang="ts">
import { getVersion } from '@tauri-apps/api/app';
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import DesignIcon, { type DesignIconName } from './components/DesignIcon.vue';
import Icon from './components/Icon.vue';
import AppTopBar from './components/shell/AppTopBar.vue';
import { useSyncController } from './composables/useSyncController';
import { useUiScale } from './composables/useUiScale';
import { backend, isDesktop, whenBackendReady } from './lib/bridge';
import { checkForDesktopUpdate } from './services/updateService';
import { defineMessages, locale, useMessages } from './i18n';

const LifeEventEditor = defineAsyncComponent(() => import('./components/LifeEventEditor.vue'));

const messages = defineMessages(
  {
    skipToContent: '跳到主要内容',
    mainNav: '主导航',
    bottomNav: '移动主导航',
    navOverview: '概览',
    navHandoff: '交给 AI',
    navSettings: '设置',
    preparingData: '正在打开本地数据库，升级后的第一次启动可能要十几秒…',
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
    bottomNav: 'Mobile main navigation',
    navOverview: 'Overview',
    navHandoff: 'Hand to AI',
    navSettings: 'Settings',
    preparingData: 'Opening your local database — the first launch after an update can take a few seconds…',
    compacting: (pending: number) =>
      `Compacting stored payloads (${pending} to go). This clears itself; syncing waits its turn.`,
    compacted: (saved: string) => `Stored payloads compacted, about ${saved} of disk reclaimed.`,
    trayHint: 'Closing the window keeps ZeppBridge in the tray, so auto-sync carries on.',
    browserPreview: 'Use the desktop app. This browser preview reads no account data.',
    routeNotFound: 'That page does not exist, so you are back on the overview.',
  },
  {
    skipToContent: 'Saltar al contenido principal',
    mainNav: 'Navegación principal',
    bottomNav: 'Navegación principal móvil',
    navOverview: 'Resumen',
    navHandoff: 'Pasar a la IA',
    navSettings: 'Configuración',
    preparingData: 'Abriendo tu base de datos local; el primer arranque tras una actualización puede tardar unos segundos…',
    compacting: (pending: number) =>
      `Compactando registros guardados (faltan ${pending}). Esto desaparece solo; la sincronización espera su turno.`,
    compacted: (saved: string) => `Registros guardados compactados: se liberaron unos ${saved} de disco.`,
    trayHint: 'Si cierras la ventana, ZeppBridge sigue en la barra de menú y continúa sincronizando automáticamente.',
    browserPreview: 'Usa la app de escritorio. Esta vista previa en el navegador no lee datos de la cuenta.',
    routeNotFound: 'Esa página no existe, así que volviste al resumen.',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'App',
);
const t = useMessages(messages);

// 桌面端从 Tauri 运行时读取版本（与 tauri.conf.json 单一来源），
// 浏览器预览环境回退到下面的常量（与 package.json 保持同步）。
const FALLBACK_APP_VERSION = '3.0.0-beta.1';
/* 构建标识。同一个版本号会构建很多次，光看版本号分不清手上是哪一个。 */
const BUILD_STAMP = __BUILD_STAMP__;
const APP_VERSION = ref(FALLBACK_APP_VERSION);
const desktopRuntime = isDesktop();
/* 后端就绪以前（迁移备份、排队恢复那一小段）顶栏挂一条说明，
   不然那几秒里窗口画了壳却所有数字都是空的，看起来像卡死。
   浏览器预览没有后端，直接当真就绪。 */
const backendReady = ref(!desktopRuntime);
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
const trayHint = ref(false);
const {
  statusError, syncState, syncMessage, isSyncing,
  compacting, compactionPending, compactionSaved,
  initialize, dispose: disposeSyncController,
} = useSyncController();
/* 这个组件自己注册的 Tauri 监听器的解绑函数。

   `backend.listen` 返回的是一个 unlisten——以前这里直接 `void` 掉了。单次
   启动感觉不到，但 HMR 和窗口重建会让同一个事件挂上第二个监听器，托盘提示
   就会连着弹两次。 */
const ownUnlisteners: Array<() => void> = [];
const { initializeScale, bumpScale, resetScale } = useUiScale();

/* 「数据健康」不在主导航里。
 *
 * 它回答的是「这条数据流为什么没同步过来」，属于出问题时才找的排查工具，
 * 而不是日常三个入口之一。路由 /health-check 仍然有效，入口在
 * 「设置 → 高级与维护」，需要的人找得到，不需要的人不用天天看见它。 */
const navigation = computed(() => [
  { to: '/', label: t.value.navOverview, icon: 'overview' as DesignIconName },
  { to: '/ai', label: t.value.navHandoff, icon: 'handoff' as DesignIconName },
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

const versionTitle = computed(() => `ZeppBridge v${APP_VERSION.value} · build ${BUILD_STAMP}`);
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
  void whenBackendReady().then(() => {
    backendReady.value = true;
    // 更新检查走裸 `invoke`（不过 bridge 的门），得等后端真的管事了再发。
    void checkForDesktopUpdate(false);
  });
  void initialize();
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
    <LifeEventEditor />
    <a class="skip-link" href="#main-content">{{ t.skipToContent }}</a>

    <div class="app-body">
      <AppTopBar :items="navigation" :nav-aria-label="t.mainNav" :version-title="versionTitle" />

      <div v-if="!backendReady" class="sync-feedback" role="status" aria-live="polite">
        <Icon name="database" :size="14" class="spinning" />
        <span>{{ t.preparingData }}</span>
      </div>
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
  </template>
</template>

<style>
/* 设计 token 搬到 src/styles/tokens.css——`:root` 是深色默认值，
   `html[data-theme="light"]` 覆写同一组变量。这里只留布局与组件无关的全局规则。 */

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
  font-size: var(--fs-md);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
button, input, select, textarea { font: inherit; }
input::placeholder, textarea::placeholder { color: var(--subtle); opacity: 1; }
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

/* ── 应用骨架：顶栏 + 内容 + 移动端底部导航（见 shell/AppTopBar.vue） ── */
.app-body { display: flex; min-width: 0; min-height: 0; flex: 1; flex-direction: column; height: 100%; overflow: hidden; background: var(--bg); }

.sync-feedback { display: flex; min-height: 32px; min-width: 0; align-items: center; gap: 7px; padding: 6px 28px; border-bottom: 1px solid var(--line); background: var(--surface); color: var(--muted); font-size: var(--fs-sm); }
.sync-feedback.tone-updated { color: var(--accent); }
.sync-feedback.tone-partial { color: var(--warning); }
.sync-feedback.tone-no_new_data { color: var(--muted); }
.sync-feedback.tone-cancelled { color: var(--muted); }
.sync-feedback.tone-deferred { color: var(--muted); }
.sync-feedback.tone-failed { color: var(--danger); }
.sync-feedback a { color: inherit; }
.spinning { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.preview-banner, .route-notice { display: flex; align-items: center; gap: 8px; padding: 9px 28px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: var(--fs-sm); }
.preview-banner { background: var(--accent-soft); }
.preview-banner svg { color: var(--accent); }
.route-notice { background: var(--surface); color: var(--warning); }
.main-content { width: 100%; min-width: 0; min-height: 0; flex: 1; overflow: auto; background: var(--canvas); }
.bottom-nav { display: none; }
.page-enter-active, .page-leave-active { transition: opacity 150ms ease, transform 150ms ease; }
.page-enter-from, .page-leave-to { opacity: 0; transform: translateY(4px); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
}

@media (max-width: 760px) {
  .sync-feedback { padding-inline: 16px; }
  .preview-banner, .route-notice { padding-inline: 16px; }
  .main-content { padding-bottom: 64px; }
  .bottom-nav { position: fixed; right: 0; bottom: 0; left: 0; z-index: 20; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); height: 60px; padding: 5px 8px calc(5px + env(safe-area-inset-bottom)); background: var(--canvas); border-top: 1px solid var(--line); }
  .bottom-nav-link { display: flex; min-width: 0; min-height: 44px; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-radius: var(--radius-sm); color: var(--muted); font-size: var(--fs-xs); text-decoration: none; }
  .bottom-nav-link.is-active { color: var(--accent); background: var(--accent-soft); }
}

/* ── 页面通用 ───────────────────────────── */
.page { width: 100%; max-width: none; min-width: 0; margin: 0; padding: 20px 28px 24px; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 16px; min-width: 0; }
.eyebrow { margin: 0 0 6px; color: var(--muted); font-size: var(--fs-sm); letter-spacing: .06em; }
h1, h2, p { margin-top: 0; }
.page h1 { margin-bottom: 6px; font-size: 28.5px; font-weight: 700; letter-spacing: -.02em; line-height: 1.2; }
.page-intro { margin-bottom: 0; color: var(--muted); font-size: var(--fs-md); }
.button { display: inline-flex; min-height: 34px; align-items: center; justify-content: center; gap: 6px; padding: 6px 14px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; font-size: var(--fs-sm); text-decoration: none; cursor: pointer; }
.button:disabled { opacity: .5; cursor: not-allowed; }
.button-primary, .button.primary { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.button-primary:hover:not(:disabled), .button.primary:hover:not(:disabled) { background: var(--accent-hover); }
.button-secondary, .button.secondary, .button-quiet, .button.quiet { border-color: var(--line-control); color: var(--muted); background: var(--surface-raised); }
.button-secondary:hover:not(:disabled), .button.secondary:hover:not(:disabled), .button-quiet:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.button-danger, .button.danger-button { border-color: rgba(240, 97, 106, .35); color: var(--danger); }
.surface-card { border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); overflow: hidden; min-width: 0; }
.section-label { margin: 0 0 8px; padding: 0 2px; color: var(--ink); font-size: var(--fs-md); font-weight: 700; }
@media (max-width: 760px) {
  .page { padding: 24px 16px 38px; }
}
</style>

<script setup lang="ts">
import { getVersion } from '@tauri-apps/api/app';
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import type { DesignIconName } from './components/DesignIcon.vue';
import GlyphTile from './components/GlyphTile.vue';
import Icon from './components/Icon.vue';
import { navigationBranch } from './lib/navigation';
import AppTopBar from './components/shell/AppTopBar.vue';
import SegmentTrack from './components/SegmentTrack.vue';
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
    quickReturn: (page: string) => `返回${page}`,
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
    quickReturn: (page: string) => `Back to ${page}`,
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
    quickReturn: (page: string) => `Volver a ${page}`,
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'App',
);
const t = useMessages(messages);

// 桌面端从 Tauri 运行时读取版本（与 tauri.conf.json 单一来源），
// 浏览器预览环境回退到下面的常量（与 package.json 保持同步）。
const FALLBACK_APP_VERSION = '3.0.0-beta.3';
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
  statusError,
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

/* 只在内容真的滚到顶栏下面时才显示滚动边缘效果。只在越过阈值时写一次 ref，
   滚动本身不触发渲染。 */
const contentUnderBar = ref(false);
const onMainScroll = (event: Event) => {
  const under = (event.target as HTMLElement).scrollTop > 2;
  if (under !== contentUnderBar.value) contentUnderBar.value = under;
};

/* 组件名要和 defineOptions({ name }) 对得上，KeepAlive 才认得出来。
   只缓存没有图表的页面：身体 / 训练页各有十几张 ECharts 画布，缓存着就一直占着
   内存，而它们从本机库重读只要几十毫秒。列表页缓存是为了返回时保住滚动位置。 */
const CACHED_PAGES = [
  'Overview',
  'RecentRecords',
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
      <main id="main-content" class="main-content" tabindex="-1" @scroll.passive="onMainScroll">
        <!-- 顶栏和提示条粘在滚动区顶上：页面内容从玻璃顶栏下面滚过去。 -->
        <div :class="['shell-head', { 'is-scrolled': contentUnderBar }]">
          <AppTopBar :items="navigation" :nav-aria-label="t.mainNav" :version-title="versionTitle" :back-to="!['/', '/ai', '/settings'].includes(route.path) ? navigationBranch(route.path) : undefined" :back-label="t.quickReturn(navigationBranch(route.path) === '/settings' ? t.navSettings : t.navOverview)" />

          <div v-if="!backendReady" class="sync-feedback" role="status" aria-live="polite">
            <Icon name="database" :size="14" class="spinning" />
            <span>{{ t.preparingData }}</span>
          </div>
          <div v-if="statusError" class="sync-feedback tone-failed" role="alert">
            <Icon name="warning" :size="14" />
            <span>{{ statusError }}</span>
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
        </div>

        <!-- 主要页面缓存起来，切回去不再重新查库。
             以前每次切页都重新挂载一遍组件，于是每次都把那一页的全部查询重跑
             一遍——首页一次就是六条命令，而命令侧共用一把数据库锁，它们只能
             排队。缓存之后，页面只在首次进入和同步产生新数据（dataRevision
             变化，各页都在监听）时才重新读库。

             详情页不缓存：它们按 URL 参数取数，缓存一堆实例既没收益又占内存。 -->
        <div class="page-host">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <KeepAlive :include="CACHED_PAGES" :max="4">
              <component :is="Component" />
            </KeepAlive>
          </Transition>
        </RouterView>
        </div>
      </main>

      <nav class="bottom-nav" :aria-label="t.bottomNav">
        <SegmentTrack
          class="bottom-track"
          variant="glass"
          fill
          :items="navigation.map((item) => ({ value: item.to, label: item.label }))"
          :model-value="navigationBranch(route.path)"
          :aria-label="t.bottomNav"
          @update:model-value="(to) => router.push(String(to))"
        >
          <template #default="{ item }">
            <GlyphTile :name="navigation.find((entry) => entry.to === String(item.value))?.icon ?? 'overview'" :size="22" />
            <span>{{ item.label }}</span>
          </template>
        </SegmentTrack>
      </nav>
    </div>
  </template>
</template>

<style src="./styles/shell.css"></style>

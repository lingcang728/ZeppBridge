<script setup lang="ts">
/* 桌面外壳：顶栏、导航、切页动效、同步控制器、更新检查。落地页不经过这里——
   App.vue 按落地模式二选一，浏览器访客因此不下载这一整块。 */
import { getVersion } from '@tauri-apps/api/app';
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import type { DesignIconName } from './components/DesignIcon.vue';
import GlyphTile from './components/GlyphTile.vue';
import Icon from './components/Icon.vue';
import { backDestination, historyBackPath, navigationBranch, pageMotion, TAB_ORDER, type PageMotion } from './lib/navigation';
import AppTopBar from './components/shell/AppTopBar.vue';
import SegmentTrack from './components/SegmentTrack.vue';
import { usePageMorph } from './composables/usePageMorph';
import { installMotionInterrupt, settleMotion } from './lib/motion/interrupt';
import { useSyncController } from './composables/useSyncController';
import { useUiScale } from './composables/useUiScale';
import { backend, backendLate, isDesktop, whenBackendReady } from './lib/bridge';
import { checkForDesktopUpdate } from './services/updateService';
import { locale, useMessages } from './i18n';
import { messages } from './App.i18n';
import { FALLBACK_APP_VERSION } from './lib/appVersion';
import { formatBytes } from './lib/format';

const LifeEventEditor = defineAsyncComponent(() => import('./components/LifeEventEditor.vue'));

const t = useMessages(messages);

// 桌面端从 Tauri 运行时读取版本（与 tauri.conf.json 单一来源），
// 浏览器预览环境回退到 lib/appVersion.ts 里的常量。
/* 构建标识。同一个版本号会构建很多次，光看版本号分不清手上是哪一个。 */
const BUILD_STAMP = __BUILD_STAMP__;
const APP_VERSION = ref(FALLBACK_APP_VERSION);
const desktopRuntime = isDesktop();
/* 后端就绪以前（迁移备份、排队恢复那一小段）顶栏挂一条说明，
   不然那几秒里窗口画了壳却所有数字都是空的，看起来像卡死。
   浏览器预览没有后端，直接当真就绪。 */
const backendReady = ref(!desktopRuntime);
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
  dataReady, pickUpReady,
  initialize, dispose: disposeSyncController, refreshStatus, markDataChanged,
} = useSyncController();

/* 「数据已备好」一进交给 AI 就算取走了：不管是点胶囊进来的、点导航进来的，
   还是同步落地时人本来就在这一页。 */
watch(
  () => [route.path, dataReady.value.phase] as const,
  ([path, phase]) => {
    if (phase === 'ready' && navigationBranch(path) === '/ai') pickUpReady('pickup');
  },
  { immediate: true },
);
/* 这个组件自己注册的 Tauri 监听器的解绑函数。

   `backend.listen` 返回的是一个 unlisten——以前这里直接 `void` 掉了。单次
   启动感觉不到，但 HMR 和窗口重建会让同一个事件挂上第二个监听器，托盘提示
   就会连着弹两次。 */
const ownUnlisteners: Array<() => void> = [];
let unmounted = false;
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

/* 左上角返回键：只在二级页出现；它回到来处（history 里的上一页），标签跟着说回哪儿。 */
const showBack = computed(() => !(TAB_ORDER as readonly string[]).includes(route.path));
const backLabel = computed(() => {
  void route.fullPath;
  const target = backDestination(route.fullPath, historyBackPath());
  const tab = navigation.value.find((item) => item.to === target.path);
  return t.value.quickReturn(tab ? tab.label : t.value.previousPage);
});

/* 切页动效。
 *
 * 新旧两页同时在场（不再 out-in）：out-in 中间那一拍空白就是更早以前的「闪一下」。
 * 也不再让两页各自变糊：整屏 blur 在 4K 高分屏上每帧重画，叠在一起的那几帧整个窗口
 * 发暗发糊，还是「闪一下」。现在只动 transform / clip-path / opacity：从一张卡点进去，
 * 新页从那张卡长成整页、返回时缩回去（usePageMorph）；没有来处的就轻轻浮上来。
 *
 * 旧页离场时会被绝对定位，而路由钩子紧接着把滚动区拉回顶部——不处理的话，
 * 旧页会在淡出的那一瞬跳回它自己的顶部。离场前把它按当时的滚动距离往上垫，
 * 画面就停在用户最后看到的那一帧上。 */
const motion = ref<PageMotion>('none');
const pageMorph = usePageMorph({ back: () => router.back() });
let leavingScroll = 0;
// 留着移除函数：HMR / 外壳重挂载时不卸掉，守卫会一层层叠上去。
const removeBeforeEach = router.beforeEach((to, from) => {
  // 上一段切页动效还没放完又切页：先让它收尾，免得旧的幽灵板压在新页上。
  settleMotion();
  motion.value = pageMorph.decide(from, to, pageMotion(from.path, to.path));
  leavingScroll = document.getElementById('main-content')?.scrollTop ?? 0;
});
const onPageBeforeLeave = (el: Element) => {
  (el as HTMLElement).style.top = `${-leavingScroll}px`;
};
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

const versionTitle = computed(() => `ZeppBridge v${APP_VERSION.value} · build ${BUILD_STAMP}`);
const browserPreview = computed(() => !desktopRuntime);
const routeNotice = computed(() => route.query.notice === 'not-found');

/* 动效放到一半按 Esc：快进收尾（lib/motion/interrupt.ts）。全局只装这一处。 */
let disposeMotionInterrupt: (() => void) | null = null;

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
  syncTrayLocale();
  initializeScale();
  void whenBackendReady().then(() => {
    backendReady.value = true;
    // 就绪晚于一分钟兜底：这期间各页和状态读取都以「还在准备」失败过，现在重读一遍。
    if (backendLate()) {
      void refreshStatus();
      markDataChanged();
    }
    // 更新检查走裸 `invoke`（不过 bridge 的门），得等后端真的管事了再发。
    void checkForDesktopUpdate(false);
  });
  void initialize();
  document.addEventListener('keydown', onDocumentKeydown);
  disposeMotionInterrupt = installMotionInterrupt();
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
      if (typeof unlisten !== 'function') return;
      // 卸载之后才回来的监听立刻撤掉，不留孤儿订阅。
      if (unmounted) unlisten();
      else ownUnlisteners.push(unlisten);
    }).catch(() => {
      // 托盘提示不是关键路径。
    });
  }
});
onUnmounted(() => {
  unmounted = true;
  removeBeforeEach();
  document.removeEventListener('keydown', onDocumentKeydown);
  disposeMotionInterrupt?.();
  pageMorph.dispose();
  for (const unlisten of ownUnlisteners.splice(0)) unlisten();
  // 同步控制器是模块级单例，它的监听器和那个每分钟一跳的定时器都挂在
  // `initialize()` 上。这个组件卸载时不放，下一次挂载就会多出一份。
  disposeSyncController();
});
</script>

<template>
  <LifeEventEditor />
  <a class="skip-link" href="#main-content">{{ t.skipToContent }}</a>

  <div class="app-body">
    <main id="main-content" class="main-content" tabindex="-1" @scroll.passive="onMainScroll">
      <!-- 顶栏和提示条粘在滚动区顶上：页面内容从玻璃顶栏下面滚过去。 -->
      <div :class="['shell-head', { 'is-scrolled': contentUnderBar }]">
        <AppTopBar :items="navigation" :nav-aria-label="t.mainNav" :version-title="versionTitle" :back-to="showBack ? navigationBranch(route.path) : undefined" :back-label="backLabel" />

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
          <span>{{ t.compacted(formatBytes(compactionSaved)) }}</span>
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
        <Transition :name="`page-${motion}`" @before-leave="onPageBeforeLeave" @enter="pageMorph.onEnter" @leave="pageMorph.onLeave" @after-leave="pageMorph.onAfterLeave">
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


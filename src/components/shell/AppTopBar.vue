<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { fontsReady } from '../../lib/fontsReady';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { revealWeeklyReport } from '../../lib/revealWeeklyReport';
import BrandMark from '../BrandMark.vue';
import Icon, { type IconName } from '../Icon.vue';
import CapsuleWheel from '../CapsuleWheel.vue';
import SegmentTrack from '../SegmentTrack.vue';
import GlassRim from './GlassRim.vue';
import { useSyncController } from '../../composables/useSyncController';
import { useTheme } from '../../composables/useTheme';
import { useWidthMorph } from '../../composables/useWidthMorph';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { defineMessages, locale, LOCALES, LOCALE_LABELS, useMessages } from '../../i18n';
import { backDestination, historyBackPath, navigationBranch } from '../../lib/navigation';
import { shownLocale } from '../../lib/motion/localeTarget';
import type { Locale } from '../../i18n';
import type { ThemeMode } from '../../composables/useTheme';
import { backend } from '../../lib/bridge';
import { useBridgeText } from '../ai/bridge/bridge.i18n';
import { syncControllerMessages } from '../../composables/useSyncController.i18n';
const demoLibrary = ref(false), bridgeText = useBridgeText();

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
    verifyFirst: '先完成连接验证',
    connectPill: '连接账号',
    syncing: '同步中…',
    syncingProgress: (current: number, total: number) => `同步中 ${current}/${total}`,
    syncFailed: '同步失败',
    syncPartial: '部分未完成',
    syncWait: '同步完成前请稍候',
    themeTitle: '切换主题',
    themeLight: '浅色',
    themeDark: '深色',
    themeSystem: '跟随系统',
    localeLabel: '界面语言',
    readyPill: '数据已备好 · 交给 AI',
    readyTitle: '同步完成，本机数据最新。点一下交给 AI。',
    readyFirstPill: '第一批数据到了 · 看这一周',
    readyFirstTitle: '第一次同步完成。点一下回概览，看这一周和平时比哪里变了。',
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
    connectPill: 'Connect account',
    syncing: 'Syncing…',
    syncFailed: 'Sync failed',
    syncPartial: 'Partly synced',
    syncWait: 'Please wait for the sync to finish',
    syncingProgress: (current: number, total: number) => `Syncing ${current}/${total}`,
    themeTitle: 'Switch theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    localeLabel: 'Interface language',
    readyPill: 'Data ready · send to AI',
    readyTitle: 'Sync done — local data is current. Click to send it to AI.',
    readyFirstPill: 'First data is in · see this week',
    readyFirstTitle: 'First sync done. Click to go to the overview and see how this week compares with usual.',
  },
  {
    mainNav: 'Navegación principal',
    brandHome: 'ZeppBridge 3 · Resumen',
    connectionTitle: 'Estado de conexión con la nube',
    lastSyncPrefix: 'Última sincronización: ',
    notFetchedYet: 'Aún sin datos',
    timeUnknown: 'Hora desconocida',
    today: 'Hoy',
    syncNow: 'Sincronizar ahora',
    verifyFirst: 'Verifica la conexión primero',
    connectPill: 'Conectar cuenta',
    syncing: 'Sincronizando…',
    syncFailed: 'Sincronización fallida',
    syncPartial: 'Sincronización parcial',
    syncWait: 'Espera a que termine la sincronización',
    syncingProgress: (current: number, total: number) => `Sincronizando ${current}/${total}`,
    themeTitle: 'Cambiar tema',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    themeSystem: 'Sistema',
    localeLabel: 'Idioma de la interfaz',
    readyPill: 'Datos listos · pasar a la IA',
    readyTitle: 'Sincronización completada: datos al día. Clic para pasar a la IA.',
    readyFirstPill: 'Ya llegaron tus datos · ver esta semana',
    readyFirstTitle: 'Primera sincronización completada. Haz clic para ir al resumen y ver cómo va esta semana frente a lo habitual.',
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
/* 在详情页里点顶栏已经亮着的那一项（比如睡眠详情里点「概览」）：回到这个入口的首页。
   分段控件重选当前项本来什么都不做，可这里它是导航——新用户第一反应就是点它。
   上一页正好是首页就退一格历史，这样和左上角返回一样缩回原卡、回到原来的滚动位置。 */
const onNavReselect = (to: string | number) => {
  const root = String(to);
  if (route.path === root) return;
  if (historyBackPath() === root) router.back();
  else void router.push(root);
};
/* 左上角返回：从哪里来回哪里去（见 lib/navigation.ts#backDestination）。 */
const goBack = () => {
  const target = backDestination(route.fullPath, historyBackPath());
  if (target.viaHistory) router.back();
  else void router.push(props.backTo ?? target.path);
};
/* Esc 也能返回（和左上角返回键同一条路）。挂在 window 的冒泡阶段：弹窗、设置卡叠、图上的
   浮层都在 document 上先处理 Esc 并 preventDefault，它们用掉了就不算返回；动效放到一半
   按的 Esc 已被 lib/motion/interrupt.ts 在捕获阶段吞掉（先打断，再按一次才返回）。 */
const ESC_SKIP = 'input, textarea, select, [contenteditable], [role="combobox"], [role="listbox"]';
const onEscapeBack = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || event.defaultPrevented || event.repeat || event.isComposing) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !props.backTo) return;
  if (document.querySelector('[data-modal-dialog], [role="dialog"][aria-modal="true"]')) return;
  if ((event.target as Element | null)?.closest?.(ESC_SKIP)) return;
  event.preventDefault();
  goBack();
};

const {
  appStatus, statusError, syncState, syncProgress, syncMessage,
  isSyncing, canIncrementalSync, runSync, dataReady, pickUpReady, cloudStaleText, dismissCloudStale,
} = useSyncController();
const syncCopy = useMessages(syncControllerMessages);

/* 用户在等的那次同步落地了：同步胶囊变成发光的「数据已备好 · 交给 AI」，
   点一下去取。又开始同步时让位给进度；进了交给 AI 就恢复成上次同步时间。 */
const readyToHand = computed(() => dataReady.value.phase === 'ready' && !isSyncing.value);
/* 连上账号后的第一次同步：先带人去概览看「这一周」，而不是直接喊「交给 AI」（体验评估 #1）。 */
const readyFirst = computed(() => readyToHand.value && dataReady.value.phase === 'ready' && dataReady.value.firstRun);
const readyText = computed(() => (readyFirst.value ? t.value.readyFirstPill : t.value.readyPill));
const { themeMode, pickTheme } = useTheme();

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

/* 还没连上（或要重新验证）：胶囊这时候唯一有用的动作是去连账号。以前它显示「同步失败」
   却点不动——用户最需要出路的状态恰好没有出路。状态还没读回来时不算，免得启动时闪一下。 */
const needsConnection = computed(() => !!appStatus.value && !canIncrementalSync.value);

/* 胶囊里只放一行短文字：同步中给进度，未连接给「连接账号」，失败给结果，空闲给上次同步时间。 */
const syncText = computed(() => {
  if (demoLibrary.value) return bridgeText.value.fullDemo;
  if (isSyncing.value) {
    return syncProgress.value
      ? t.value.syncingProgress(syncProgress.value.current, syncProgress.value.total)
      : t.value.syncing;
  }
  if (needsConnection.value) return t.value.connectPill;
  if (syncState.value === 'failed') return t.value.syncFailed;
  if (syncState.value === 'partial') return t.value.syncPartial;
  return lastSyncShort.value;
});

const syncTitle = computed(() => {
  if (readyToHand.value) return readyFirst.value ? t.value.readyFirstTitle : t.value.readyTitle;
  if (isSyncing.value) return `${syncMessage.value} · ${t.value.syncWait}`;
  return `${t.value.connectionTitle} · ${t.value.lastSyncPrefix}${lastSyncClock.value}`
    + ` — ${canIncrementalSync.value ? t.value.syncNow : t.value.verifyFirst}`;
});

/* 点击：能增量同步就发起；没连上就去「账号与设备」卡。同步中点了什么都不做——不给「取消」：
   半路停下会留下一部分流更新了、另一部分没更新的库（用户 2026-09-30 定），等它跑完就好。 */
const onSyncClick = () => {
  if (readyFirst.value) {
    pickUpReady('pickup');
    void router.push('/').then(() => revealWeeklyReport());
  } else if (readyToHand.value) {
    void router.push('/ai');
  } else if (isSyncing.value) {
    return;
  } else if (canIncrementalSync.value) {
    void runSync('incremental');
  } else if (needsConnection.value) {
    void router.push('/settings/account');
  }
};

/* 主题三格，和设置「显示与语言」里的一模一样：深色 / 浅色 / 跟随系统，点哪格就是哪条规则。 */
const themeOptions = computed<{ value: ThemeMode; label: string; icon: IconName }[]>(() => [
  { value: 'dark', label: t.value.themeDark, icon: 'moon' },
  { value: 'light', label: t.value.themeLight, icon: 'sun' },
  { value: 'system', label: t.value.themeSystem, icon: 'monitor' },
]);
/* 新主题从被点的那枚图标处扩散开：按钮中心就是扩散的圆心（键盘切换也一样）。 */
const themeTrack = ref<{ $el: HTMLElement } | null>(null);
const onThemeChange = (value: string | number) => {
  const index = themeOptions.value.findIndex((option) => option.value === value);
  const button = themeTrack.value?.$el.querySelectorAll<HTMLElement>('.segment-item')[index];
  const rect = button?.getBoundingClientRect();
  pickTheme(value as ThemeMode, rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined);
};

/* 语言列表跟着 LOCALES 注册表走，一律写全名，和设置页一致（不用「PT-BR」「中」这类缩写）。
   桌面宽度下不让位：语言是看不懂当前界面的人唯一的出口，藏起来他就找不到设置页了（2026-10-01 反馈）。 */
const localeOptions = computed(() => LOCALES.map((code) => ({ value: code, label: LOCALE_LABELS[code] })));
// 换语言放「响指」：从语言轮处扩散一圈涟漪，旧语言的字化成灰被吹走（lib/motion/ashSwitch.ts）。
// 模块第一次换语言时才取（带着 WebGL 着色器，不进首屏）。
const onLocaleChange = (value: string | number) => {
  const rect = localeWheel.value?.$el.getBoundingClientRect();
  const origin = rect?.width ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined;
  void import('../../lib/motion/ashSwitch').then(({ switchLocaleWithAsh }) => switchLocaleWithAsh(String(value) as Locale, origin));
};

/* 同步胶囊的字一变（「今天 10:30」→「数据已备好 · 交给 AI」），宽度平滑伸缩，不跳。 */
const syncPill = ref<HTMLElement | null>(null);
// 伸缩放完再量一次放不放得下（变窄时回到该有的档位），见下面 watch 的注释。
useWidthMorph(syncPill, () => (readyToHand.value ? readyText.value : syncText.value), undefined, () => scheduleFit());

/* —— 放不下时逐级回退（大原则：任何语言、任何宽度，顶栏的胶囊都不许盖住别的组件）——
   媒体查询只认窗口宽度，认不出「俄语导航比中文宽一倍」。这里量真实的包围盒：
   品牌、正中导航、右侧一簇两两之间留出间距、右簇不出窗口；放不下就升一档再量。
     1 藏字标 → 2 语言两侧少露一截 → 3 导航紧凑 → 4 导航离开窗口正中（用掉品牌右边那块空地）
     → 5 导航挪到底部（和手机宽度一样，导航本身一项不少）→ 6 同步胶囊只留圆点 → 7 实在放不下才藏语言。
   以前第 4 档就藏语言：导航钉在窗口正中，左边品牌旁空着一大块，右簇一挤就先牺牲语言——英文 1280 宽、
   中文 1180 宽语言就没了，看不懂当前语言的人只能自己摸到设置页（2026-10-01 反馈）。
   同步文字排在语言之前：同步进行到第几项（「同步中 3/8」）是用户在等的东西，但它至少还留着圆点，
   语言一藏就什么都没有了。以前第三档就先把同步文字藏了，于是自动同步时胶囊只剩一个点（2026-09-30 反馈）。
   每次宽度、语言、同步文字变化都从 0 档重来，宽了会自动退回完整形态。
   整轮量完都在同一个任务里（只 await nextTick，中间不出帧），画面上只看到最后那一档。

   以前这里还盯着右簇自己的尺寸，结果是个回路：档位一变，语言标签在全名和短码之间换，
   传送带晚一帧才量出新宽度，右簇一变宽又触发重量、又从 0 档来一遍——语言胶囊就在
   「PT-BR」和「Português (Brasil)」之间来回闪个不停，根本拖不动。现在只看顶栏本身
   （也就是窗口）的宽度，传送带的新宽度由这里同步量；语言胶囊拖动途中撑宽只留一小截（见 overlaps）。 */
const FIT_SHORT_LOCALE = 2; // 语言传送带两侧的露边收窄（不再换短码）
const FIT_MAX = 7;
/** 第 5 档起导航挪到底部：底部导航的样式在 shell.css，挂在 <html> 上。 */
const FIT_NAV_BOTTOM = 5;
const fit = ref(0);
watch(fit, (level) => document.documentElement.classList.toggle('nav-at-bottom', level >= FIT_NAV_BOTTOM));
onBeforeUnmount(() => document.documentElement.classList.remove('nav-at-bottom'));
const bar = ref<HTMLElement | null>(null);
const localeWheel = ref<{ $el: HTMLElement; measure: () => void; widestSpan: () => number } | null>(null);
const overlaps = (): boolean => {
  const root = bar.value;
  if (!root) return false;
  const gap = 8;
  const box = (selector: string) => {
    const el = root.querySelector<HTMLElement>(selector);
    if (!el || !el.offsetWidth) return null;
    return el.getBoundingClientRect();
  };
  const outer = root.getBoundingClientRect();
  // 返回键和品牌都常驻（见模板里的 .lead）：量看得见的那一个。
  const left = box('.lead > :not(.is-off)');
  const nav = box('.pill-nav');
  const actions = box('.topbar-actions');
  const wheelEl = localeWheel.value?.$el;
  // 右簇靠右对齐：同步胶囊正在伸缩（useWidthMorph）时，按它伸完以后的宽度算（动画期间溢出被裁掉，
  // scrollWidth 就是伸完的宽度）。语言传送带拖动途中会跟着中间那一项撑宽，只给它留一小截（最多 24px）：
  // 以前按「转到最宽那一项」整段留，1400 宽的窗口一亮「数据已备好 · 交给 AI」就判成放不下，导航离开正中、
  // 变紧凑，进了交给 AI 胶囊变回时间又回到正中——每次切页导航条都左右跳（2026-10-01 录屏）。
  // 真换了语言会重新量（watch locale），拖动途中多撑出来的那一截只是一瞬间。
  const pill = syncPill.value;
  const pillGrow = pill?.offsetWidth ? Math.max(0, pill.scrollWidth - pill.offsetWidth) : 0;
  const reserve = (wheelEl?.offsetWidth ? Math.min(24, Math.max(0, localeWheel.value!.widestSpan() - wheelEl.offsetWidth)) : 0) + pillGrow;
  // 导航胶囊自己被挤窄（窄窗口里中间那一列只剩这么宽）：框没有相交，里面的字却已经叠在一起了。
  const squeezed = [...root.querySelectorAll<HTMLElement>('.pill-nav .segment-item')].some((el) => el.scrollWidth > el.clientWidth + 1);
  if (squeezed) return true;
  const actionsLeft = actions ? actions.left - reserve : 0;
  if (actions && actions.right > outer.right + 0.5) return true;
  if (actions && actionsLeft < outer.left) return true;
  if (nav && actions && actionsLeft < nav.right + gap) return true;
  if (left && nav && left.right + gap > nav.left) return true;
  if (left && actions && left.right + gap > actionsLeft) return true;
  return false;
};
/** 等 DOM 换成新档位，再让传送带按新标签量一次宽度、把宽度也写进 DOM。
    只有标签真的变了（换语言、全名 ↔ 短码、字体刚加载完）才量：量一次要把整页强制排版一遍，
    拖窗口边框时每帧都在重排档位，每一档都量就是每帧好几次整页排版。 */
let measuredKey = '';
const settleLayout = async () => {
  await nextTick();
  const key = `${locale.value}:${fit.value >= FIT_SHORT_LOCALE}`;
  if (key !== measuredKey) {
    localeWheel.value?.measure();
    measuredKey = key;
  }
  await nextTick();
};
let fitting = false;
const refit = async () => {
  if (fitting) return;
  fitting = true;
  // 量的时候关掉宽度过渡：半路量到的是动画中间的宽度，会误判成「放得下」。
  bar.value?.classList.add('is-measuring');
  try {
    fit.value = 0;
    await settleLayout();
    while (fit.value < FIT_MAX && overlaps()) {
      fit.value += 1;
      await settleLayout();
    }
    // 在过渡关着的时候把最终宽度落定，撤掉 is-measuring 后不会再补一段宽度动画。
    void bar.value?.offsetWidth;
  } finally {
    bar.value?.classList.remove('is-measuring');
    fitting = false;
  }
};
let fitObserver: ResizeObserver | null = null;
let fitFrame = 0;
const scheduleFit = () => {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => { void refit(); });
};
onMounted(() => {
  void backend.getUserPrefs().then(prefs => { demoLibrary.value = !!prefs.demo_mode; }).catch(() => undefined);
  window.addEventListener('keydown', onEscapeBack);
  fitObserver = new ResizeObserver(scheduleFit);
  if (bar.value) fitObserver.observe(bar.value);
  void fontsReady().then(() => { measuredKey = ''; scheduleFit(); });
  scheduleFit();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscapeBack);
  fitObserver?.disconnect();
  cancelAnimationFrame(fitFrame);
});
watch(() => props.backTo, scheduleFit);
/* 换语言：新标签一上 DOM 就量（post flush），同一帧里定好档位，不等下一帧——
   语言轮在 rAF 里提交选择时，等一帧就会先画出一帧放不下的顶栏再收（「闪一下」）。 */
watch(locale, () => { cancelAnimationFrame(fitFrame); void refit(); }, { flush: 'post' });
/* 同步胶囊换字：马上按伸完的宽度量一次（变宽时不会半路压到导航）；伸缩放完的那一次由
   useWidthMorph 的 onSettled 触发，不再按写死的时长猜。 */
watch(() => (readyToHand.value ? readyText.value : syncText.value), scheduleFit);
</script>

<template>
  <header ref="bar" :class="['app-topbar', fit > 0 && `fit-${fit}`]">
    <!-- 返回键和品牌叠在同一格里、都常驻，换位时交叉淡入淡出。以前是 <Transition mode="out-in">：旧的淡完、
         下一帧才插进新的，切页挂载占着主线程时这中间空出一两百毫秒，新的再一下冒出来（2026-10-02 录屏的硬切）。
         现在只切类名，过渡在合成器上跑，主线程忙时最多晚一点开始，不会空着。 -->
    <div :class="['lead', { 'is-back': backTo }]">
      <button
        type="button"
        :class="['quick-back', 'glass-control', 'is-lens-host', 'has-rim', { 'is-off': !backTo }]"
        :title="backLabel"
        :aria-label="backLabel"
        :aria-hidden="backTo ? undefined : 'true'"
        :inert="backTo ? undefined : true"
        @click="goBack"
      >
        <GlassRim />
        <Icon name="arrow-left" :size="20" />
      </button>
      <RouterLink
        to="/"
        :class="['brand', { 'is-off': backTo }]"
        :title="versionTitle || t.brandHome"
        :aria-hidden="backTo ? 'true' : undefined"
        :inert="backTo ? true : undefined"
      >
        <!-- 只留标志（用户 2026-10-04）：以前旁边还有「ZeppBridge 3」字标，英文等标签长的语言里顶栏放不下，
             字标先画出来、量完再被收掉，切语言时闪一下。 -->
        <BrandMark :size="30" />
      </RouterLink>
    </div>

    <SegmentTrack
      class="pill-nav"
      :compact="fit >= 3"
      variant="glass"
      :items="navItems"
      :model-value="activeBranch"
      :aria-label="navAriaLabel || t.mainNav"
      @update:model-value="goTo"
      @reselect="onNavReselect"
    />

    <div class="topbar-actions">
      <span v-if="statusError" class="sr-only" role="status">{{ statusError }}</span>
      <button
        ref="syncPill"
        :class="['sync-pill', 'glass-control', 'is-lens-host', 'has-rim', `tone-${statusTone}`, { syncing: isSyncing, 'is-ready': readyToHand, 'ready-glow': readyToHand }]"
        type="button"
        :disabled="demoLibrary || (!readyToHand && !isSyncing && !canIncrementalSync && !needsConnection)"
        :title="syncTitle"
        :aria-label="syncTitle"
        @click="onSyncClick"
      >
        <!-- 前面一律是带色的小圆点（已连接绿、部分未完成黄、失败红、同步中呼吸）。U19 一度换成刷新图标，
             用户觉得不如圆点好看（2026-09-30），换回来。 -->
        <GlassRim />
        <i class="dot" :class="{ spinning: isSyncing }" aria-hidden="true"></i>
        <span :key="readyToHand ? 'ready' : isSyncing ? 'syncing' : 'idle'" class="sync-text" aria-live="polite">{{ readyToHand ? readyText : syncText }}</span>
        <Icon v-if="readyToHand" name="arrow-right" :size="14" class="ready-arrow" />
      </button>
      <!-- 手动同步时云端还没有新数据（1E）：教人去手机上下拉一下，带「再试」。下一次同步开始就收起。 -->
      <Transition name="stale-tip">
        <div v-if="cloudStaleText && !isSyncing" class="cloud-stale-tip glass-control" role="status">
          <p>{{ cloudStaleText }}</p>
          <div class="stale-actions">
            <button type="button" class="pill-button quiet" @click="dismissCloudStale()">{{ syncCopy.cloudStaleDismiss }}</button>
            <button type="button" class="pill-button" @click="runSync('incremental', undefined, { skipProbe: true })">{{ syncCopy.cloudStaleRetry }}</button>
          </div>
        </div>
      </Transition>

      <!-- 主题是平铺的两枚图标（月亮 / 太阳），点哪枚就从哪枚扩散开；
           语言是首尾相接的传送带，两端渐隐无硬边；放不下时由 compact 档位收成短码（见 fit）。 -->
      <div class="icon-group glass-control is-lens-host has-rim">
        <GlassRim />
        <SegmentTrack ref="themeTrack" class="theme-toggle" variant="bare" icon-only :items="themeOptions"
          :model-value="themeMode" :aria-label="t.themeTitle" @update:model-value="onThemeChange" @reselect="onThemeChange" />
        <span class="group-divider" aria-hidden="true"></span>
        <CapsuleWheel ref="localeWheel" class="locale-wheel" variant="bare" loop :span="168" :fit-peek="fit >= FIT_SHORT_LOCALE ? 12 : 26" :items="localeOptions"
          :model-value="shownLocale" :aria-label="t.localeLabel" @update:model-value="onLocaleChange" />
      </div>
    </div>
  </header>
</template>

<style scoped>
/* 顶栏本身透明、没有分界线：浮在内容上的是一个个玻璃控件（返回、导航胶囊、
   同步状态、图标组），内容滚到下面时由 .shell-head 的滚动边缘效果负责可读性。
   整条再套一层玻璃就成了「玻璃叠玻璃」。
   第四轮 1C（参考 iPadOS / macOS 26 App Store 的悬浮标签栏）：整条下沉、离窗口上沿 12px，左右再往里收，
   内容从上下都看得见地滚过去；每个控件的玻璃外圈一窄条折射（GlassRim），中间只模糊。 */
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
  margin-top: 12px;
  padding: 0 32px;
}

.quick-back { display: inline-flex; width: 40px; height: 40px; align-items: center; justify-content: center; justify-self: start; flex: 0 0 40px;
  padding: 0; border-radius: 50%; color: var(--ink); text-decoration: none; cursor: pointer; transition: scale var(--dur-fast, 140ms) var(--ease-out, ease); }
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
/* 左上角那一格：返回键和品牌叠在一起，看得见的那个占位置，另一个绝对定位叠在同一处、淡出。
   新的晚 60ms 开始淡入：旧的先让一让，两个不会同时以半透明叠成一团。只淡透明度：
   缩放留给返回键自己按下去的那一下（:active），不能被交接的延迟拖慢。 */
.lead { position: relative; display: grid; min-width: 0; justify-self: start; align-items: center; }
.lead > * {
  grid-area: 1 / 1;
  transition: opacity 180ms ease 60ms, visibility 0s linear 0s, scale var(--dur-fast, 140ms) var(--ease-out, ease);
}
.lead > .is-off {
  position: absolute;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 120ms ease, visibility 0s linear 120ms, scale var(--dur-fast, 140ms) var(--ease-out, ease);
}
@media (prefers-reduced-motion: reduce) {
  .lead > *, .lead > .is-off { transition: none; }
}

.pill-nav { justify-self: center; max-width: 100%; }

.topbar-actions {
  position: relative;
  display: flex;
  min-width: 0;
  justify-self: end;
  align-items: center;
  gap: 8px;
}

.sync-pill {
  display: inline-flex;
  flex: 0 0 auto;
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
.sync-pill:hover:not(:disabled):not(.syncing) { color: var(--ink); }
.sync-pill:active:not(:disabled):not(.syncing) { scale: .97; }
.sync-pill.syncing { cursor: progress; }
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
.sync-text { font-variant-numeric: tabular-nums; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  animation: sync-text-in var(--dur-slow) var(--ease-out); }
@keyframes sync-text-in { from { opacity: 0; } }
.sync-pill.is-ready { color: var(--ink); font-weight: 600; }
.sync-pill.is-ready .dot { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
.ready-arrow { color: var(--accent); }

.icon-group { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 999px; }
.theme-toggle { --seg-pad: 1px; }
.theme-toggle :deep(.segment-item) { min-height: 34px; }
.group-divider { width: 1px; height: 18px; margin: 0 3px; background: color-mix(in srgb, var(--ink) 14%, transparent); }

/* 回退档位（见 refit）：只有量出来放不下时才会升档。 */
.app-topbar.is-measuring :deep(.capsule-wheel) { transition: none !important; }
.app-topbar:is(.fit-4, .fit-5, .fit-6, .fit-7) { grid-template-columns: auto minmax(0, 1fr) auto; }
:is(.fit-5, .fit-6, .fit-7) .pill-nav { display: none; }
:is(.fit-6, .fit-7) .sync-text { display: none; }
:is(.fit-6, .fit-7) .sync-pill { padding-inline: 11px; }
.fit-7 .locale-wheel, .fit-7 .group-divider { display: none; }

/* 窄屏降级：先让胶囊回到文档流避免和按钮组重叠，再小到手机上藏掉
   （底部 tabbar 已经覆盖同一组导航）。语言选择不按宽度藏：由 refit 量，真放不下才让位（fit-6）。 */
@media (max-width: 980px) {
  .app-topbar { grid-template-columns: auto minmax(0, 1fr) auto; }
}
@media (max-width: 760px) {
  .app-topbar { height: 56px; margin-top: 8px; padding: 0 16px; gap: 10px; }
  .pill-nav { display: none; }
  .sync-text { max-width: 120px; }
}
@media (max-width: 520px) {
  .topbar-actions { gap: 5px; }
  .sync-text { display: none; }
  .sync-pill { padding-inline: 10px; }
}
@media (max-width: 380px) {
  .brand { display: none; }
}
/* 云端还没有新数据（1E）：挂在右边这组控件下面的一块玻璃，不盖住页面主体的控件；只动透明度和位移。 */
.cloud-stale-tip { position: absolute; top: calc(100% + 10px); right: 0; z-index: 40; display: grid; gap: 10px; width: min(380px, calc(100vw - 32px));
  padding: 12px 12px 10px 16px; border-radius: 20px; color: var(--ink); font-size: var(--fs-sm); line-height: 1.55; }
.cloud-stale-tip p { margin: 0; }
.stale-actions { display: flex; justify-content: flex-end; gap: 6px; }
.stale-tip-enter-active { transition: opacity 260ms ease, translate 360ms cubic-bezier(.2, .8, .2, 1); }
.stale-tip-leave-active { transition: opacity 180ms ease, translate 200ms ease-in; }
.stale-tip-enter-from, .stale-tip-leave-to { opacity: 0; translate: 0 -6px; }
@media (prefers-reduced-motion: reduce) { .stale-tip-enter-active, .stale-tip-leave-active { transition: none; } }
</style>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import BrandMark from '../BrandMark.vue';
import Icon, { type IconName } from '../Icon.vue';
import CapsuleWheel from '../CapsuleWheel.vue';
import SegmentTrack from '../SegmentTrack.vue';
import { useSyncController } from '../../composables/useSyncController';
import { useTheme } from '../../composables/useTheme';
import { useWidthMorph } from '../../composables/useWidthMorph';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { defineMessages, locale, LOCALES, LOCALE_LABELS, setLocale, useMessages } from '../../i18n';
import { backDestination, historyBackPath, navigationBranch } from '../../lib/navigation';
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
/* 新主题从被点的那枚图标处扩散开：按钮中心就是扩散的圆心（键盘切换也一样）。 */
const themeTrack = ref<{ $el: HTMLElement } | null>(null);
const onThemeChange = (value: string | number) => {
  const index = themeOptions.value.findIndex((option) => option.value === value);
  const button = themeTrack.value?.$el.querySelectorAll<HTMLElement>('.segment-item')[index];
  const rect = button?.getBoundingClientRect();
  pickTheme(value as ResolvedTheme, rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined);
};

/* 语言列表跟着 LOCALES 注册表走——S6 扩到十种语言时这里自动变长。 */
const LOCALE_SHORT: Record<Locale, string> = {
  zh: '中', en: 'EN', es: 'ES', nl: 'NL', 'pt-BR': 'PT-BR', 'pt-PT': 'PT', de: 'DE', ru: 'RU', 'hi-IN': 'HI', fr: 'FR',
};
const localeOptions = computed(() =>
  LOCALES.map((code) => ({ value: code, label: fit.value >= FIT_SHORT_LOCALE ? LOCALE_SHORT[code] : LOCALE_LABELS[code] })));
const onLocaleChange = (value: string | number) => setLocale(String(value) as Locale);

/* 同步胶囊的字一变（「今天 10:30」→「数据已备好 · 交给 AI」），宽度平滑伸缩，不跳。 */
const syncPill = ref<HTMLElement | null>(null);
useWidthMorph(syncPill, () => (readyToHand.value ? t.value.readyPill : syncText.value));

/* —— 放不下时逐级回退（大原则：任何语言、任何宽度，顶栏的胶囊都不许盖住别的组件）——
   媒体查询只认窗口宽度，认不出「俄语导航比中文宽一倍」。这里量真实的包围盒：
   品牌、正中导航、右侧一簇两两之间留出间距、右簇不出窗口；放不下就升一档再量。
     1 藏字标 → 2 语言改短码 → 3 同步胶囊只留圆点 → 4 导航紧凑 → 5 藏语言（设置里还有）。
   每次宽度、语言、同步文字变化都从 0 档重来，宽了会自动退回完整形态。
   整轮量完都在同一个任务里（只 await nextTick，中间不出帧），画面上只看到最后那一档。

   以前这里还盯着右簇自己的尺寸，结果是个回路：档位一变，语言标签在全名和短码之间换，
   传送带晚一帧才量出新宽度，右簇一变宽又触发重量、又从 0 档来一遍——语言胶囊就在
   「PT-BR」和「Português (Brasil)」之间来回闪个不停，根本拖不动。现在只看顶栏本身
   （也就是窗口）的宽度，传送带的新宽度由这里同步量；语言胶囊按「转到最宽那一项」
   的宽度留位置，拖动途中撑宽也不会压到导航。 */
const FIT_SHORT_LOCALE = 2;
const FIT_MAX = 5;
const fit = ref(0);
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
  const left = box('.brand, .quick-back');
  const nav = box('.pill-nav');
  const actions = box('.topbar-actions');
  const wheelEl = localeWheel.value?.$el;
  // 右簇靠右对齐：传送带撑到最宽时，右簇的左边沿往左多出这么多。同步胶囊正在伸缩（useWidthMorph）时，
  // 按它伸完以后的宽度算（动画期间溢出被裁掉，scrollWidth 就是伸完的宽度）。
  const pill = syncPill.value;
  const pillGrow = pill?.offsetWidth ? Math.max(0, pill.scrollWidth - pill.offsetWidth) : 0;
  const reserve = (wheelEl?.offsetWidth ? Math.max(0, localeWheel.value!.widestSpan() - wheelEl.offsetWidth) : 0) + pillGrow;
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
let fitTimer = 0;
const scheduleFit = () => {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => { void refit(); });
};
onMounted(() => {
  window.addEventListener('keydown', onEscapeBack);
  fitObserver = new ResizeObserver(scheduleFit);
  if (bar.value) fitObserver.observe(bar.value);
  void document.fonts?.ready.then(() => { measuredKey = ''; scheduleFit(); });
  scheduleFit();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscapeBack);
  fitObserver?.disconnect();
  cancelAnimationFrame(fitFrame);
  window.clearTimeout(fitTimer);
});
watch([locale, () => props.backTo], scheduleFit);
/* 同步胶囊换字：马上按伸完的宽度量一次（变宽时不会半路压到导航），420ms 的伸缩放完再量一次
   （变窄时回到该有的档位）。 */
watch(() => (readyToHand.value ? t.value.readyPill : syncText.value), () => {
  scheduleFit();
  window.clearTimeout(fitTimer);
  fitTimer = window.setTimeout(scheduleFit, 460);
});
</script>

<template>
  <header ref="bar" :class="['app-topbar', fit > 0 && `fit-${fit}`]">
    <!-- 返回键和品牌换位时轻轻交接，不再一帧之内硬换（切页时左上角「闪一下」）。 -->
    <Transition name="lead" mode="out-in">
      <button v-if="backTo" key="back" type="button" class="quick-back glass-control" :title="backLabel" :aria-label="backLabel" @click="goBack">
        <Icon name="arrow-left" :size="20" />
      </button>
      <RouterLink v-else key="brand" to="/" class="brand" :title="versionTitle || t.brandHome">
        <BrandMark :size="30" />
        <span class="wordmark">ZeppBridge&nbsp;<b>3</b></span>
      </RouterLink>
    </Transition>

    <SegmentTrack
      class="pill-nav"
      :compact="fit >= 4"
      variant="glass"
      :items="navItems"
      :model-value="activeBranch"
      :aria-label="navAriaLabel || t.mainNav"
      @update:model-value="goTo"
    />

    <div class="topbar-actions">
      <span v-if="statusError" class="sr-only" role="status">{{ statusError }}</span>
      <button
        ref="syncPill"
        :class="['sync-pill', 'glass-control', `tone-${statusTone}`, { syncing: isSyncing, 'is-ready': readyToHand, 'ready-glow': readyToHand }]"
        type="button"
        :disabled="!readyToHand && !isSyncing && !canIncrementalSync"
        :title="syncTitle"
        :aria-label="syncTitle"
        @click="onSyncClick"
      >
        <i class="dot" :class="{ spinning: isSyncing }" aria-hidden="true"></i>
        <span :key="readyToHand ? 'ready' : isSyncing ? 'syncing' : 'idle'" class="sync-text" aria-live="polite">{{ readyToHand ? t.readyPill : syncText }}</span>
        <Icon v-if="isSyncing" name="x" :size="13" class="sync-cancel" />
        <Icon v-else-if="readyToHand" name="arrow-right" :size="14" class="ready-arrow" />
      </button>

      <!-- 主题是平铺的两枚图标（月亮 / 太阳），点哪枚就从哪枚扩散开；
           语言是首尾相接的传送带，两端渐隐无硬边；放不下时由 compact 档位收成短码（见 fit）。 -->
      <div class="icon-group glass-control">
        <SegmentTrack ref="themeTrack" class="theme-toggle" variant="bare" icon-only :items="themeOptions"
          :model-value="resolvedTheme" :aria-label="t.themeTitle" @update:model-value="onThemeChange" />
        <span class="group-divider" aria-hidden="true"></span>
        <CapsuleWheel ref="localeWheel" class="locale-wheel" variant="bare" loop :span="168" :fit-peek="fit >= FIT_SHORT_LOCALE ? 12 : 26" :items="localeOptions"
          :model-value="locale" :aria-label="t.localeLabel" @update:model-value="onLocaleChange" />
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
.lead-enter-active { transition: opacity 160ms ease, scale 220ms var(--ease-out, ease); }
.lead-leave-active { transition: opacity 90ms ease; }
.lead-enter-from { opacity: 0; scale: .9; }
.lead-leave-to { opacity: 0; }
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
.sync-text { font-variant-numeric: tabular-nums; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  animation: sync-text-in var(--dur-slow) var(--ease-out); }
@keyframes sync-text-in { from { opacity: 0; filter: blur(4px); } }
.sync-pill.is-ready { color: var(--ink); font-weight: 600; }
.sync-pill.is-ready .dot { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
.ready-arrow { color: var(--accent); }
.sync-cancel { color: var(--subtle); }

.icon-group { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 999px; }
.theme-toggle { --seg-pad: 1px; }
.theme-toggle :deep(.segment-item) { min-height: 34px; }
.group-divider { width: 1px; height: 18px; margin: 0 3px; background: color-mix(in srgb, var(--ink) 14%, transparent); }

/* 回退档位（见 refit）：只有量出来放不下时才会升档。 */
.app-topbar.is-measuring :deep(.capsule-wheel) { transition: none !important; }
.app-topbar[class*='fit-'] .wordmark { display: none; }
.fit-3 .sync-text, .fit-4 .sync-text, .fit-5 .sync-text { display: none; }
.fit-3 .sync-pill, .fit-4 .sync-pill, .fit-5 .sync-pill { padding-inline: 11px; }
.fit-5 .locale-wheel, .fit-5 .group-divider { display: none; }

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
  .locale-wheel, .group-divider { display: none; }
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

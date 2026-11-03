<script setup lang="ts">
/*
 * 新手引导挂在外壳上的那一层：聚光框与说明卡、沙盒第一屏，以及启动时决定要不要进总览。
 * AppShell 在后端就绪后异步挂它。
 *
 * 首次启动（只判断一次，记在真实 localStorage）：
 *   - 新装（没连过账号、也没同步过）→ 进示例沙盒，先选语言，再走总览，看完回到「账号与设备」卡去连接；
 *   - 有数据的库（从 2.x 或早期 beta 升上来、从没见过引导的）→ 同样先选语言再走总览，看完回到概览。
 *     本机 AI 客户端里还登记着旧版 zeppbridge-mcp 时，引导前先记下，回到真实应用后浮一张卡，
 *     请用户去「交给 AI 工具」卡重新连一次。
 * 老安装、引导版本落后（3.1.1 重写引导，lib/tour/progress.ts 的 TOUR_VERSION）：清空看过，
 *   **等这一版的作者来信收好**再进总览，不走选语言那一屏；各板块第一次打开时也会重新就地讲。
 */
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import TourOverlay from './TourOverlay.vue';
import TourWelcome from './TourWelcome.vue';
import { launchSandbox, startTour, useTour } from '../../composables/useTour';
import { useSyncController } from '../../composables/useSyncController';
import { INTRO } from '../../lib/tour/chapters';
import {
  firstLaunchHandled, leaveSandbox, markFirstLaunchHandled, markSeen, markToolsReminder, markTourVersion, retourDue, sandboxFlags, takeToolsReminder,
} from '../../lib/tour/sandbox';
import { backend, isDesktop } from '../../lib/bridge';
import { pendingUpdateNotice, updateNotice } from '../../services/updateNotice';
import { useTourText } from './tour.i18n';

const t = useTourText();
const { welcomeOpen } = useTour();
const { appStatus, refreshStatus } = useSyncController();
const toolsStale = ref(false);
const router = useRouter();
const flags = sandboxFlags();

const startFromWelcome = () => {
  welcomeOpen.value = false;
  if (flags) startTour(flags.chapters, 'sandbox');
};
/* 第一屏就跳过：只算总览看过，各板块第一次打开时照样就地讲。 */
const skipFromWelcome = () => {
  welcomeOpen.value = false;
  markSeen([INTRO]);
  leaveSandbox(flags?.ret ?? '/');
};

const openTools = () => {
  toolsStale.value = false;
  void router.push('/settings/ai');
};

/** 这一版的作者来信（更新弹窗里的信封）收好了。启动时说明还在后台读版本号，等它出现；
    根本没有待显示的说明就不等。 */
const letterPutAway = (): Promise<void> => new Promise((resolve) => {
  let seen = updateNotice.receipt !== null;
  let stop: (() => void) | null = null;
  const done = () => { stop?.(); window.clearTimeout(timer); resolve(); };
  // 有存着的说明却迟迟没显示（版本对不上，restoreUpdateNotice 不会出它）：别一直等下去。
  const timer = window.setTimeout(() => { if (!seen) done(); }, pendingUpdateNotice() ? 15000 : 0);
  stop = watch(() => updateNotice.receipt, (receipt) => {
    if (receipt) { seen = true; return; }
    // 「知道了」之后信封化灰飞走：等它放完再进沙盒。
    if (seen) window.setTimeout(done, 700);
  }, { immediate: true });
});

const decideRetour = async () => {
  if (!isDesktop() || window.__ZB_DEMO__?.demo || !retourDue()) return;
  await letterPutAway();
  if (!retourDue()) return;
  markTourVersion(true);
  launchSandbox([INTRO], { ret: router.currentRoute.value.fullPath });
};

const decideFirstLaunch = async () => {
  if (!isDesktop() || window.__ZB_DEMO__?.demo) return;
  if (firstLaunchHandled()) { await decideRetour(); return; }
  if (!appStatus.value) await refreshStatus().catch(() => undefined);
  const status = appStatus.value;
  if (!status) return;
  markFirstLaunchHandled();
  markTourVersion(true);
  const fresh = !status.configured && !status.last_sync && !status.streams.some((stream) => (stream.records ?? 0) > 0);
  if (!fresh) {
    // 引导是整页载入进沙盒，回来时这里已经不再走首次启动：旧版 MCP 的提醒先记在真实 localStorage 里。
    const sidecar = await Promise.race([
      backend.getMcpSidecar().catch(() => null),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1500)),
    ]);
    if (sidecar?.stale_clients?.length) markToolsReminder();
  }
  launchSandbox([INTRO], { welcome: true, ret: fresh ? '/settings/account' : '/' });
};

onMounted(() => {
  if (flags) {
    if (flags.welcome) welcomeOpen.value = true;
    else startTour(flags.chapters, 'sandbox');
    return;
  }
  if (takeToolsReminder()) toolsStale.value = true;
  void decideFirstLaunch();
});
</script>

<template>
  <TourOverlay />
  <TourWelcome v-if="welcomeOpen" @start="startFromWelcome" @skip="skipFromWelcome" />
  <Transition name="tour-invite">
    <div v-if="toolsStale" class="tour-invite" role="dialog" aria-labelledby="tour-tools-text">
      <span id="tour-tools-text">{{ t.toolsText }}</span>
      <button type="button" class="button primary" @click="openTools">{{ t.toolsGo }}</button>
      <button type="button" class="tour-invite-later" @click="toolsStale = false">{{ t.inviteLater }}</button>
    </div>
  </Transition>
</template>

<style scoped>
.tour-invite {
  position: fixed; left: 50%; bottom: 24px; z-index: 8000;
  display: flex; align-items: center; gap: 10px;
  max-width: calc(100vw - 32px);
  padding: 8px 8px 8px 16px;
  border: 1px solid var(--mat-glass-line); border-radius: 999px;
  background: var(--mat-glass-strong); box-shadow: var(--mat-glass-shadow);
  backdrop-filter: blur(18px) saturate(1.2);
  color: var(--ink); font-size: var(--fs-sm);
  transform: translateX(-50%);
}
.tour-invite .button { min-height: 32px; padding: 0 14px; }
.tour-invite-later { padding: 6px 10px; border: 0; background: none; color: var(--muted); font: inherit; cursor: pointer; }
.tour-invite-later:hover { color: var(--ink); }
.tour-invite-later:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 6px; }
.tour-invite-enter-active { transition: opacity 360ms ease 600ms, transform 420ms cubic-bezier(.2, .8, .2, 1) 600ms; }
.tour-invite-leave-active { transition: opacity 200ms ease, transform 220ms ease; }
.tour-invite-enter-from, .tour-invite-leave-to { opacity: 0; transform: translate(-50%, 14px); }
@media (max-width: 760px) { .tour-invite { bottom: 86px; border-radius: 18px; flex-wrap: wrap; } }
@media (prefers-reduced-motion: reduce) { .tour-invite-enter-active, .tour-invite-leave-active { transition: none; } }
</style>

<script setup lang="ts">
/* 设置页：钱包式卡叠。
 *
 * 总览（/settings）是八张叠着的卡，每张只露出卡头和一句实时状态；点开（/settings/:card）
 * 那张升到最上面摊开，展开后可以左右拖、按按钮或方向键翻到相邻的一张，Esc 回到总览。
 * 各区块的界面和逻辑在 views/settings/sections/，共享状态在 composables/settings/context.ts。 */
import GlassSwitch from '../components/GlassSwitch.vue';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CardDeck from '../components/deck/CardDeck.vue';
import CardBody from './settings/CardBody.vue';
import GlyphTile from '../components/GlyphTile.vue';
import Icon from '../components/Icon.vue';
import { provideSettingsContext } from '../composables/settings/context';
import { useDevices } from '../composables/useDevices';
import { useSyncController } from '../composables/useSyncController';
import { useUiScale } from '../composables/useUiScale';
import { cardCloseDestination, historyBackPath } from '../lib/navigation';
import { readDefaultExportFormat } from '../lib/exportScope';
import { distanceUnit, distanceUnitOptionLabel } from '../lib/units';
import { locale, LOCALE_LABELS, useMessages } from '../i18n';
import { settingsMessages } from './Settings.i18n';
import { deckMessages } from './settings/deck.i18n';
import { syncCardMessages } from './settings/sections/sync.i18n';
import {
  SETTINGS_CARD_ICONS,
  SETTINGS_CARD_TONES,
  SETTINGS_CARD_IDS,
  isSettingsCardId,
  legacySettingsTarget,
  type SettingsCardId,
} from './settings/cards';

defineOptions({ name: 'Settings' });

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);
const syncCard = useMessages(syncCardMessages);
const route = useRoute();
const router = useRouter();
const { statusError, refreshStatus, autoSyncEnabled, autoSyncInterval, setAutoSyncEnabled } = useSyncController();
const { feedback, auth, official, prefs, capability } = provideSettingsContext();
const { dataMessage, dataError } = feedback;
const { loginError, accountRecognized, connectionLabel } = auth;
const { userPrefs, retentionDays, applyPrefsChange } = prefs;
const { models: deviceModels, load: loadDevices } = useDevices();
const { scale } = useUiScale();

const activeId = computed<SettingsCardId | null>(() =>
  (isSettingsCardId(route.params.card) ? route.params.card : null));

const exportFormat = ref(readDefaultExportFormat());
watch(activeId, () => { exportFormat.value = readDefaultExportFormat(); });

const titles = computed<Record<SettingsCardId, string>>(() => ({
  account: d.value.cardAccount,
  sync: syncCard.value.cardTitle,
  archive: d.value.cardArchive,
  data: d.value.cardData,
  ai: d.value.cardAi,
  display: d.value.cardDisplay,
  privacy: d.value.cardPrivacy,
  advanced: d.value.cardAdvanced,
}));

/* 卡头上那一句状态：不点开也能看出每一块现在是什么样。 */
const summaries = computed<Record<SettingsCardId, string>>(() => {
  const overview = capability.capabilityOverview.value;
  return {
    account: accountRecognized.value
      ? d.value.sumAccount(connectionLabel.value, deviceModels.value.length)
      : official.connected.value
        ? d.value.sumAccount(t.value.officialConnected, deviceModels.value.length)
        : d.value.sumAccountOff,
    sync: autoSyncEnabled.value ? d.value.sumSyncOn(autoSyncInterval.value) : d.value.sumSyncOff,
    archive: userPrefs.value?.archive_enabled ? d.value.sumArchiveOn : d.value.sumArchiveOff(retentionDays.value),
    data: overview ? d.value.sumData(capability.capabilityAvailable.value.length, overview.items.length) : d.value.sumDataLoading,
    ai: d.value.sumAi(exportFormat.value.toUpperCase()),
    display: d.value.sumDisplay(LOCALE_LABELS[locale.value], distanceUnitOptionLabel(distanceUnit.value), scale.value),
    privacy: d.value.sumPrivacy,
    advanced: d.value.sumAdvanced,
  };
});

const toneColor = (tone: string) => (tone === 'neutral' ? 'var(--glyph-neutral)' : `var(--${tone})`);
const cards = computed(() => SETTINGS_CARD_IDS.map((id) => ({
  id,
  icon: SETTINGS_CARD_ICONS[id],
  glyphTone: SETTINGS_CARD_TONES[id],
  tone: toneColor(SETTINGS_CARD_TONES[id]),
  title: titles.value[id],
  summary: summaries.value[id],
})));

const openCard = (id: string) => { void router.push(`/settings/${id}`); };
/* 关卡：从卡组打开的回卡组，从别处（概览的「管理」）打开的回那一处。 */
const closeDeck = () => {
  const target = cardCloseDestination(historyBackPath());
  if (target.viaHistory) router.back();
  else void router.push(target.path);
};
const changeCard = async (id: string, done: () => void) => {
  await router.replace(`/settings/${id}`);
  await nextTick();
  done();
};

/* 旧链接（数据健康页的「去重新连接」等）指向 #connection，现在它在「账号与设备」卡里。 */
const redirectLegacy = () => {
  const target = legacySettingsTarget(route.hash, route.query.focus);
  if (target) void router.replace(`/settings/${target}`);
  else if (route.params.card && !activeId.value) void router.replace('/settings');
};
watch(() => [route.hash, route.query.focus, route.params.card], redirectLegacy);

/* 读偏好要等一会儿：等回来时页面可能已经卸载了，那就别再挂监听（R16）。 */
let disposed = false;
onMounted(async () => {
  redirectLegacy();
  void capability.loadCapabilityOverview();
  void loadDevices();
  await prefs.load();
  if (disposed) return;
  await Promise.all([auth.attach(), official.attach()]);
});
/** 卡组总览当前的形态（CardDeck 报上来）：页头说明按它换一句。 */
const deckLayout = ref<'cover' | 'list'>('list');

onUnmounted(() => {
  disposed = true;
  auth.detach();
  official.detach();
});
</script>

<template>
  <section class="page settings-page" aria-labelledby="settings-title">
    <header class="page-header">
      <div>
        <h1 id="settings-title">{{ t.title }}</h1>
        <p class="page-intro">{{ deckLayout === 'list' ? d.pageIntro : d.pageIntroDeck }}</p>
      </div>
    </header>

    <div v-if="statusError" class="alert danger" role="alert">
      <Icon name="warning" :size="15" />{{ statusError }}
      <button type="button" @click="() => refreshStatus()">{{ t.retry }}</button>
    </div>
    <div v-if="loginError" class="alert danger" role="alert"><Icon name="warning" :size="15" />{{ loginError }}</div>
    <div v-if="dataMessage" class="alert success"><Icon name="circle-check" :size="15" />{{ dataMessage }}</div>
    <div v-if="dataError" class="alert danger" role="alert"><Icon name="warning" :size="15" />{{ dataError }}</div>

    <CardDeck :cards="cards" :active-id="activeId" @open="openCard" @close="closeDeck" @change="changeCard" @layout="deckLayout = $event">
      <template #face="{ card, centered }">
        <div :class="['face', { centered }]">
          <GlyphTile :name="card.icon" :tone="card.glyphTone" :size="60" />
          <div class="face-copy">
            <strong class="face-title">{{ card.title }}</strong>
            <span class="face-summary">{{ card.summary }}</span>
          </div>
          <span class="face-open" aria-hidden="true">{{ d.openCard }}<Icon name="arrow-right" :size="14" /></span>
        </div>
      </template>
      <template #head="{ card, expanded }">
        <GlyphTile :name="card.icon" :tone="card.glyphTone" :size="expanded ? 44 : 46" />
        <div class="card-copy">
          <component :is="expanded ? 'h2' : 'strong'" class="card-title">{{ card.title }}</component>
          <span class="card-summary">{{ card.summary }}</span>
        </div>
      </template>

      <template #quick="{ card }">
        <GlassSwitch
          v-if="card.id === 'sync'"
          :aria-label="d.autoSyncToggle"
          :model-value="autoSyncEnabled"
          @update:model-value="setAutoSyncEnabled(!autoSyncEnabled)"
        />
      </template>

      <template #body="{ card }">
        <KeepAlive :max="8">
          <CardBody :key="card.id" :id="card.id" :prefs="userPrefs" @prefs-changed="applyPrefsChange" />
        </KeepAlive>
      </template>
    </CardDeck>
  </section>
</template>

<!-- 各区块共用的 s-* 排版基元：全局、随设置页 chunk 加载一次（见文件头注释）。 -->
<style src="./settings/settings-base.css"></style>
<style scoped>
/* 行宽收在 1000px 以内：设置是一行一行的「标签 — 控件」，拉满 1400px 时标签和
   控件隔着半个屏幕，就是之前那种「留白过多」。 */
.page { display: grid; width: 100%; max-width: 1120px; min-width: 0; margin: 0 auto; gap: 18px; }
/* 设置页不裁横向溢出：拖着大卡往外甩、coverflow 两侧的卡都会越过页面的左右边，全局的 overflow-x: clip
   会在页面边上切出一条竖直的硬边（限宽居中以后，这条边就落在窗口中间）。窗口本身（#main-content）仍然裁。 */
.page { overflow-x: visible; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; min-width: 0; }
h1, p { margin-top: 0; }
h1 { font-size: 26.5px; font-weight: 700; color: var(--ink); }
.page-intro { margin-bottom: 0; color: var(--muted); font-size: var(--fs-sm); }
.alert { display: flex; align-items: flex-start; gap: 7px; padding: 9px 12px; border: 1px solid var(--mat-line); border-radius: var(--radius-sm); background: var(--mat-card); color: var(--muted); font-size: var(--fs-sm); }
.alert.success { color: var(--accent); }
.alert.danger { color: var(--danger); }
.alert button { margin-left: auto; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: var(--fs-sm); }

.card-copy { display: grid; flex: 1 1 auto; min-width: 0; gap: 2px; }
.card-title { margin: 0; color: var(--ink); font-size: var(--fs-lg); font-weight: 650; line-height: 1.3; }
.card-summary { overflow: hidden; color: var(--subtle); font-size: var(--fs-sm); text-overflow: ellipsis; white-space: nowrap; }
.card-body { display: grid; gap: 22px; min-width: 0; }

/* coverflow 里立着的那张卡的正面：图标在上，标题和状态压在下半部。 */
.face { display: flex; height: 100%; flex-direction: column; justify-content: space-between; gap: 12px; }
.face-copy { display: grid; gap: 6px; min-width: 0; }
.face-title { color: var(--ink); font-size: 25px; font-weight: 700; letter-spacing: -.01em; line-height: 1.2; }
.face-summary { color: var(--muted); font-size: var(--fs-sm); line-height: 1.45; }
.face-open { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; padding: 5px 12px; border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 9%, transparent); color: var(--ink); font-size: var(--fs-xs); font-weight: 600;
  opacity: 0; translate: 0 6px; transition: opacity var(--dur-base) ease, translate var(--dur-base) var(--ease-out); }
.face.centered .face-open { opacity: 1; translate: 0 0; }
.card-body > :deep(.s-section + .s-section) { margin-top: 0; }
</style>

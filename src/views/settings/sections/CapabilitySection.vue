<script setup lang="ts">
/* 数据内容：每条数据流一项，勾 = 本机已有，钟 = 云端有、本机还没收，叉 = 还没拿到。
   全部排在同一块列表里，不再一格一块小板（卡里套卡）；细节放在每项的提示里。
   接口诊断和运动编号命名在高级卡，这里只在有没认出的编号时提示一行。 */
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../../../components/Icon.vue';
import FoldTransition from '../../../components/FoldTransition.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useUnknownCodes } from '../../../composables/settings/useUnknownCodes';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';
import { dataCardMessages } from './data.i18n';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);
const m = useMessages(dataCardMessages);
const router = useRouter();
const {
  capabilityOverview,
  capabilityError,
  capabilityAvailable,
  capabilityNotIngested,
  capabilityMissing,
  capabilityBoard,
  capabilityCheckedAt,
} = useSettingsContext().capability;

const { unknownCodes, loadCorrections } = useUnknownCodes();
onMounted(() => { void loadCorrections(); });
const openCodes = () => { void router.push({ path: '/settings/advanced', hash: '#codes' }); };

const ICONS = { on: 'check', pending: 'clock', off: 'x' } as const;
const iconFor = (state: string) => ICONS[state as keyof typeof ICONS] ?? 'x';
</script>

<template>
  <section class="s-section" aria-labelledby="capability-title">
    <div class="s-section-head">
      <h3 id="capability-title">{{ d.secCapability }}</h3>
      <span v-if="capabilityCheckedAt" class="s-meta">{{ capabilityCheckedAt }}</span>
    </div>
    <FoldTransition>
    <div v-if="capabilityError" class="alert danger" role="alert">
      <Icon name="warning" :size="14" />{{ capabilityError }}
    </div>
    </FoldTransition>

    <div class="s-list">
      <div v-if="unknownCodes.length" class="s-row">
        <div class="s-row-main"><span class="s-row-title">{{ m.codesHint(unknownCodes.length) }}</span></div>
        <div class="s-row-control">
          <button class="button secondary" type="button" @click="openCodes">{{ m.codesFix }}</button>
        </div>
      </div>
      <div class="s-row is-block">
        <p class="cap-legend">
          <span>{{ t.lampOn(capabilityAvailable.length) }}</span>
          <span v-if="capabilityNotIngested.length">{{ t.lampPending(capabilityNotIngested.length) }}</span>
          <span>{{ t.lampOff(capabilityMissing.length) }}</span>
          <span class="cap-intro">{{ m.intro }}</span>
        </p>
        <ul v-if="capabilityOverview && capabilityBoard.length" class="cap-items">
          <li v-for="row in capabilityBoard" :key="row.key" :class="['cap-item', row.state]" :title="[row.detail, row.note].filter(Boolean).join(' · ')">
            <Icon :name="iconFor(row.state)" :size="14" class="cap-mark" />
            <span class="cap-label">{{ row.label }}</span>
          </li>
        </ul>
        <p v-else-if="capabilityOverview" class="s-row-sub">{{ t.capabilityEmptyTitle }} · {{ t.capabilityEmptyBody }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.cap-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; color: var(--muted); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.cap-intro { color: var(--subtle); font-size: var(--fs-xs); align-self: center; }
.cap-items { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 2px 16px; margin: 4px 0 0; padding: 0; list-style: none; }
.cap-item { display: flex; min-width: 0; align-items: flex-start; gap: 8px; padding: 6px 0; cursor: default; }
.cap-label { min-width: 0; color: var(--ink); font-size: var(--fs-sm); line-height: 1.35; overflow-wrap: anywhere; }
.cap-mark { margin-top: 2px; }
.cap-mark { flex: 0 0 auto; }
.cap-item.on .cap-mark { color: var(--accent); }
.cap-item.pending .cap-mark { color: var(--warning); }
.cap-item.off .cap-mark { color: var(--subtle); }
.cap-item.off .cap-label { color: var(--subtle); }
</style>

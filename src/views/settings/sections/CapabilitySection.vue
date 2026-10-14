<script setup lang="ts">
/* 数据内容：一格一条数据流的指示灯卡片——亮 = 本机已有，琥珀 = 云端有、本机还没收，暗 = 还没拿到。
   横向铺开，多少条流都能把宽度用满，也一眼看得出「亮了几个」；细节直接写在格子里，不藏进悬停提示。
   （有一版改成了一列打钩的清单，用户反馈「效果很差」，恢复成卡片。）
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
</script>

<template>
  <section class="s-section" aria-labelledby="capability-title">
    <div class="s-section-head">
      <h3 id="capability-title">{{ d.secCapability }}</h3>
      <span v-if="capabilityCheckedAt" class="s-meta">{{ capabilityCheckedAt }}</span>
    </div>
    <p class="s-note">{{ m.intro }}</p>
    <FoldTransition>
    <div v-if="capabilityError" class="alert danger" role="alert">
      <Icon name="warning" :size="14" />{{ capabilityError }}
    </div>
    </FoldTransition>

    <div v-if="unknownCodes.length" class="s-list">
      <div class="s-row">
        <div class="s-row-main"><span class="s-row-title">{{ m.codesHint(unknownCodes.length) }}</span></div>
        <div class="s-row-control">
          <button class="button secondary" type="button" @click="openCodes">{{ m.codesFix }}</button>
        </div>
      </div>
    </div>

    <div v-if="capabilityOverview" class="capability-board">
      <p class="capability-legend">
        <span class="legend-item"><i class="lamp on"></i>{{ t.lampOn(capabilityAvailable.length) }}</span>
        <span v-if="capabilityNotIngested.length" class="legend-item"><i class="lamp pending"></i>{{ t.lampPending(capabilityNotIngested.length) }}</span>
        <span class="legend-item"><i class="lamp off"></i>{{ t.lampOff(capabilityMissing.length) }}</span>
      </p>

      <ul class="capability-grid">
        <li
          v-for="row in capabilityBoard"
          :key="row.key"
          :class="['capability-cell', 's-tile', row.state, { 'is-sunken': row.state === 'off' }]"
        >
          <span class="cell-head">
            <i :class="['lamp', row.lamp]" aria-hidden="true"></i>
            <strong>{{ row.label }}</strong>
          </span>
          <span v-if="row.detail" class="cell-detail">{{ row.detail }}</span>
          <span v-if="row.note" class="cell-note">{{ row.note }}</span>
        </li>
        <li v-if="!capabilityBoard.length" class="capability-cell s-tile is-sunken off">
          <span class="cell-head"><i class="lamp off" aria-hidden="true"></i><strong>{{ t.capabilityEmptyTitle }}</strong></span>
          <span class="cell-detail">{{ t.capabilityEmptyBody }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.capability-board { display: grid; gap: var(--space-3); }
.capability-legend { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; color: var(--muted); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.legend-item { display: inline-flex; min-height: 28px; align-items: center; gap: 7px; padding: 0 12px; border-radius: 999px; background: var(--cap-track); box-shadow: var(--cap-track-shadow); }
.lamp { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: var(--subtle); }
.lamp.on { background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.lamp.pending { background: var(--warning); box-shadow: 0 0 0 3px color-mix(in srgb, var(--warning) 16%, transparent); }
.lamp.off { background: color-mix(in srgb, var(--ink) 18%, transparent); }

.capability-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.capability-cell {
  display: grid;
  align-content: start;
  gap: 3px;
  padding: 12px 14px;
  min-width: 0;
}
.cell-head { display: flex; align-items: center; gap: 7px; min-width: 0; }
.cell-head strong { min-width: 0; color: var(--ink); font-size: var(--fs-md); font-weight: 600; overflow-wrap: anywhere; }
.capability-cell.off .cell-head strong { color: var(--muted); }
.cell-detail { color: var(--muted); font-size: var(--fs-xs); }
.cell-note { color: var(--subtle); font-size: var(--fs-xs); line-height: 1.5; }
@media (max-width: 720px) { .capability-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); } }
</style>

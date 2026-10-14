<script setup lang="ts">
/**
 * 「加一类」（2026-10-08）：从那张虚位牌长出来，摊开被关掉的类别，各一张牌；点一张就加回左边。
 * 90 天都没有记录的类别也列出来，牌面写「没有记录」——加上了照样交，导出如实标缺失。
 */
import ModalDialog from '../../ModalDialog.vue';
import StageCard from './StageCard.vue';
import type { AiTaskCategory } from '../../../lib/bridge/types';
import type { StageCardModel } from '../../../composables/ai/useStageCards';
import { useAiTaskDraft } from '../../../composables/useAiTaskDraft';
import { useBridgeText } from '../bridge/bridge.i18n';
import { useStageText } from './stage.i18n';

const props = defineProps<{ cards: StageCardModel[]; empty: Set<AiTaskCategory> }>();
const emit = defineEmits<{ close: [] }>();
const ctl = useAiTaskDraft();
const b = useBridgeText();
const s = useStageText();
const add = (category: AiTaskCategory) => { ctl.setCategoryEnabled(category, true); if (props.cards.length <= 1) emit('close'); };
</script>

<template>
  <ModalDialog labelledby="stage-add-title" @close="emit('close')">
    <div class="add">
      <h2 id="stage-add-title">{{ s.addTitle }}</h2>
      <p v-if="!cards.length">{{ s.addEmpty }}</p>
      <ul>
        <li v-for="card in cards" :key="card.id">
          <button type="button" @click="add(card.category!)"><StageCard :card="empty.has(card.category!) ? { ...card, sub: s.noRecord, have: null, total: null } : card" /></button>
        </li>
      </ul>
      <footer><button type="button" class="pill-button" @click="emit('close')">{{ b.close }}</button></footer>
    </div>
  </ModalDialog>
</template>

<style scoped>
.add { display: grid; gap: 16px; }
h2 { margin: 0; font-size: var(--fs-lg); font-weight: 700; }
p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
ul { display: flex; flex-wrap: wrap; gap: 14px; margin: 0; padding: 4px 0; list-style: none; --card-w: 116px; }
li button { padding: 0; border: 0; border-radius: 14px; background: none; cursor: pointer; transition: translate 220ms cubic-bezier(.3, 1.3, .5, 1); }
li button:hover { translate: 0 -6px; }
li button:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
footer { display: flex; justify-content: flex-end; }
</style>

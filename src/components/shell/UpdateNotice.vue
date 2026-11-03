<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ModalDialog from '../ModalDialog.vue';
import BrandMark from '../BrandMark.vue';
import WhyHalfData from '../WhyHalfData.vue';
import ReleaseNotesList from './ReleaseNotesList.vue';
import LetterEnvelope from '../letters/LetterEnvelope.vue';
import { letterVersions } from '../../services/letters';
import { baseVersion, lettersBetween } from '../../lib/letters/parse';
import {
  acknowledgeUpdate, groupRows, leadsWithWhyHalfData, loadBundledNotes, notesForLocale, releaseRows, updateNotice,
} from '../../services/updateNotice';
import { locale } from '../../i18n';
import { useUpdateNoticeText } from './UpdateNotice.i18n';

const t = useUpdateNoticeText();
const receipt = computed(() => updateNotice.receipt);

/* 本版说明随应用打包、按界面语言取；不是本版（或没打包）才用更新清单里带来的那份。 */
const bundled = ref<string | null>(null);
watch([() => receipt.value?.version, locale], async ([version, language]) => {
  bundled.value = null;
  if (!version) return;
  const notes = await loadBundledNotes(version, language);
  if (receipt.value?.version === version && locale.value === language) bundled.value = notes;
}, { immediate: true });
const rows = computed(() => releaseRows(bundled.value ?? notesForLocale(receipt.value?.notes ?? '', locale.value)));
/* 按新增 / 改进 / 修复分组列出，不再每行前面挂一个小标签（用户 2026-10-19：「很难读」）。 */
const groups = computed(() => groupRows(rows.value));

/* 3.0.7 起每一版都有作者来信：有信就用信封（更新说明是其中一张信纸），跳过几版才更新的人几封捆成一叠。没有信的老版本仍用这张卡。 */
const letters = computed(() => (receipt.value ? lettersBetween(letterVersions(), receipt.value.from, receipt.value.version) : []));

/* 3.0.2 先放一页「为什么有些数据没有」，再看改了什么。 */
const page = ref(0);
watch(() => receipt.value?.version, () => { page.value = 0; });
const onLeadPage = computed(() => !!receipt.value && leadsWithWhyHalfData(receipt.value.version) && page.value === 0);

const origin = () => document.querySelector<HTMLElement>('.brand');

/* 点「知道了」：卡片从这颗按钮往左上角一路化成灰飞走，背后的模糊退掉回到主页（lib/motion/ashDissolve.ts）。
   放不了（减少动态效果、没有 WebGL）就照常收起。 */
const dissolving = ref(false);
const acknowledge = async (event: MouseEvent) => {
  if (dissolving.value) return;
  dissolving.value = true;
  const button = event.currentTarget as HTMLElement;
  const panel = button.closest<HTMLElement>('[data-modal-dialog]');
  const rect = button.getBoundingClientRect();
  try {
    if (panel) {
      const { ashDissolve } = await import('../../lib/motion/ashDissolve');
      await ashDissolve(panel, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, panel.closest<HTMLElement>('.dialog-backdrop'));
    }
  } catch {
    // 动画出错不能卡住「知道了」。
  }
  acknowledgeUpdate();
  dissolving.value = false;
};
</script>

<template>
  <LetterEnvelope v-if="receipt && letters.length" :versions="letters" :current="baseVersion(receipt.version)" :notes="groups" :origin="origin()" @done="acknowledgeUpdate" />
  <ModalDialog v-else-if="receipt" labelledby="update-notice-title" :origin="origin()" :max-width="760">
    <div class="release-card">
      <header class="release-header">
        <span class="release-mark"><BrandMark :size="32" /></span>
        <div><h2 id="update-notice-title">{{ t.title(receipt.version) }}</h2><p v-if="receipt.from">{{ t.since(receipt.from) }}</p></div>
      </header>
      <div v-if="onLeadPage" class="release-body">
        <WhyHalfData title-id="update-notice-why" />
      </div>
      <div v-else class="release-body">
        <ReleaseNotesList :groups="groups" />

      </div>
      <footer class="release-actions">
        <button v-if="onLeadPage" type="button" class="button primary acknowledge" @click="page = 1">{{ t.next }}</button>
        <button v-else type="button" class="button primary acknowledge" :disabled="dissolving" @click="acknowledge">{{ t.acknowledge }}</button>
      </footer>
    </div>
  </ModalDialog>
</template>

<style scoped>
.release-card { padding: 20px; }
.release-header { display: flex; align-items: center; gap: 14px; }
.release-mark { display: grid; place-items: center; width: 48px; height: 48px; flex: none; border-radius: 15px; background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent); }
h2 { margin: 0; font-size: var(--fs-2xl); font-weight: 700; line-height: 1.3; letter-spacing: -.015em; }
.release-header p { margin: 4px 0 0; color: var(--subtle); font-size: var(--fs-xs); }
.release-body { margin: 24px 0; max-height: 52vh; overflow-y: auto; overscroll-behavior: contain; }
.release-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; padding-top: 4px; }
.release-actions .button { min-height: 42px; padding-inline: 18px; font-size: var(--fs-xs); }
.acknowledge { min-width: 104px; }

@media (max-width: 600px) { .release-card { padding: 4px; } h2 { font-size: var(--fs-xl); } .release-header { gap: 12px; } .release-body { margin: 20px 0; } .release-actions .button { flex: 1; } }
</style>

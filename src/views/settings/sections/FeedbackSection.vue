<script setup lang="ts">
/* 设置里的「写给作者」卡（2026-11-11：写信入口藏得太深，放回卡叠）。
   三行：直接写信、带一份脱敏诊断报告写信（原来「反馈问题」卡做的那件事）、打开信匣。
   信纸是全局的一份（composables/useAuthorCompose.ts），从被点的按钮那里抽出来。文案全用信匣已有的，不另起一套。 */
import { onMounted } from 'vue';
import Icon from '../../../components/Icon.vue';
import { useLetterText } from '../../../components/letters/letters.i18n';
import { openAuthorCompose } from '../../../composables/useAuthorCompose';
import { letterVersions } from '../../../services/letters';
import { hasNewAuthorReply, loadLetterBox } from '../../../services/letterBox';

const l = useLetterText();
const letterCount = letterVersions().length;
onMounted(() => { void loadLetterBox(); });
const write = (event: MouseEvent, withReport = false) =>
  openAuthorCompose(event.currentTarget as HTMLElement, withReport ? 'report' : undefined);
</script>

<template>
  <section id="feedback" class="s-section">
    <div class="s-list">
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ l.writeRowTitle }}</span>
        </div>
        <div class="s-row-control">
          <button type="button" class="button primary" data-setting="feedback-write" @click="write($event)">
            <Icon name="edit" :size="14" />{{ l.writeAction }}
          </button>
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ l.attachReportRow }}</span>
          <span class="s-row-sub">{{ l.attachHint }}</span>
        </div>
        <div class="s-row-control">
          <button type="button" class="button secondary" data-setting="feedback-write-report" @click="write($event, true)">
            <Icon name="edit" :size="14" />{{ l.attachAction }}
          </button>
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ l.settingsRow }}</span>
          <span v-if="hasNewAuthorReply()" class="s-row-sub author-new">{{ l.authorNew }}</span>
          <span v-else class="s-row-sub">{{ l.settingsSub(letterCount) }}</span>
        </div>
        <div class="s-row-control">
          <RouterLink class="button secondary" to="/letters">{{ l.openBox }}</RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.author-new { color: var(--accent); }
</style>

<script setup lang="ts">
/**
 * 更新清单的唯一一份渲染：按「新增 / 改进 / 修复」分组，每行只认 `**加粗**`（docs/releases/README.md）。
 * 旧的更新卡（UpdateNotice.vue）和信封里的「更新说明」那张信纸（components/letters/NotesSheet.vue）都用它。
 */
import { emphasis, type NoteGroup } from '../../services/updateNotice';
import { useUpdateNoticeText } from './UpdateNotice.i18n';

defineProps<{ groups: NoteGroup[] }>();
const t = useUpdateNoticeText();
</script>

<template>
  <div class="release-notes">
    <section v-for="group in groups" :key="group.kind" :class="['release-group', `is-${group.kind}`]">
      <h3><span class="release-dot" aria-hidden="true"></span>{{ t[group.kind] }}</h3>
      <ul>
        <li v-for="(item, index) in group.items" :key="index">
          <template v-for="(segment, part) in emphasis(item)" :key="part"><strong v-if="segment.strong">{{ segment.text }}</strong><template v-else>{{ segment.text }}</template></template>
        </li>
      </ul>
    </section>
    <p v-if="!groups.length" class="release-empty">{{ t.empty }}</p>
  </div>
</template>

<style scoped>
.release-group + .release-group { margin-top: 18px; }
.release-group h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; color: var(--muted); font-size: var(--fs-2xs); font-weight: 400; letter-spacing: .04em; }
.release-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--subtle); }
.is-added .release-dot { background: var(--accent); }
.is-improved .release-dot { background: var(--route-amber); }
.is-fixed .release-dot { background: var(--danger); }
.release-group ul { display: grid; gap: 8px; margin: 0; padding: 0 0 0 15px; list-style: none; }
.release-group li { position: relative; font-size: var(--fs-xs); line-height: 1.7; color: var(--muted); }
.release-group li::before { content: ''; position: absolute; left: -12px; top: .78em; width: 4px; height: 4px; border-radius: 50%; background: var(--subtle); }
.release-group li strong { font-weight: 700; color: var(--ink); }
.release-empty { color: var(--muted); line-height: 1.7; }
</style>

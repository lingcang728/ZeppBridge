<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    watch: '手表',
    strap: '腕带',
    ring: '戒指',
    band: '手环',
    earbuds: '耳机',
    scale: '体重秤',
    unknown: '设备',
  },
  {
    watch: 'Watch',
    strap: 'Strap',
    ring: 'Ring',
    band: 'Band',
    earbuds: 'Earbuds',
    scale: 'Scale',
    unknown: 'Device',
  },
);
const t = useMessages(messages);

const props = withDefaults(defineProps<{
  src: string;
  alt: string;
  compact?: boolean;
  kind?: string;
}>(), {
  compact: false,
  kind: 'unknown',
});

const imageFailed = ref(false);

watch(() => props.src, () => {
  imageFailed.value = false;
});

const onImageError = (): void => {
  imageFailed.value = true;
};

const kindLabel = computed(() => {
  const known = t.value as Record<string, string | undefined>;
  return known[props.kind] ?? t.value.unknown;
});
</script>

<template>
  <span
    :class="['device-visual', { compact }]"
    :role="imageFailed ? 'img' : undefined"
    :aria-label="imageFailed ? alt : undefined"
  >
    <img v-if="src && !imageFailed" :src="src" :alt="alt" loading="lazy" @error="onImageError" />
    <span v-else class="device-fallback" aria-hidden="true">
      <svg viewBox="0 0 160 160" focusable="false">
        <template v-if="kind === 'strap'">
          <ellipse cx="80" cy="80" rx="53" ry="68" fill="none" stroke="currentColor" stroke-width="22" />
          <rect x="61" y="47" width="38" height="66" rx="13" fill="currentColor" opacity=".85" />
        </template>
        <template v-else-if="kind === 'ring'">
          <ellipse cx="80" cy="80" rx="56" ry="56" fill="none" stroke="currentColor" stroke-width="18" />
          <ellipse cx="80" cy="80" rx="31" ry="31" fill="none" stroke="currentColor" stroke-width="4" opacity=".7" />
        </template>
        <template v-else-if="kind === 'band'">
          <rect x="51" y="14" width="58" height="132" rx="27" fill="currentColor" />
          <rect x="60" y="45" width="40" height="64" rx="12" fill="var(--surface-raised)" stroke="currentColor" stroke-width="4" />
        </template>
        <template v-else-if="kind === 'earbuds'">
          <rect x="28" y="54" width="104" height="54" rx="24" fill="currentColor" />
          <circle cx="59" cy="81" r="17" fill="var(--surface-raised)" />
          <circle cx="101" cy="81" r="17" fill="var(--surface-raised)" />
        </template>
        <template v-else-if="kind === 'scale'">
          <ellipse cx="80" cy="80" rx="64" ry="42" fill="currentColor" />
        </template>
        <template v-else-if="kind === 'unknown'">
          <circle cx="80" cy="80" r="56" fill="currentColor" />
          <path d="M80 38v48m0 22v4" stroke="var(--surface-raised)" stroke-width="10" stroke-linecap="round" />
        </template>
        <template v-else>
          <rect x="59" y="2" width="42" height="156" rx="18" fill="currentColor" />
          <rect x="34" y="38" width="92" height="84" rx="22" fill="currentColor" opacity=".85" />
          <circle cx="80" cy="80" r="25" fill="var(--surface-raised)" />
        </template>
      </svg>
      <span class="device-fallback-label">{{ kindLabel }}</span>
    </span>
  </span>
</template>

<style scoped>
.device-visual {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  /* 必须裁剪。上一版为了「图显示不全」把它改成 visible，结果图直接画到框外，
     压住了下面的设备名——那是把问题从「显示不全」换成了「盖住别人」。
     要让整表显示完整，得把框放大或调比例，不是让内容跑出去。 */
  overflow: hidden;
  flex: 0 0 76px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
}
.device-visual.compact { width: 48px; height: 48px; flex-basis: 48px; border-radius: var(--radius-sm); }
/* 表壳加表带是竖长的，塞进正方框再留 5px 内边距，上下就会顶到边。
   内边距收到 2px 就够了；`contain` 保证不管什么比例都完整显示在框内。 */
.device-visual img { display: block; width: 100%; height: 100%; object-fit: contain; padding: 2px; }
.device-fallback { display: grid; justify-items: center; gap: 1px; width: 100%; height: 100%; padding: 5px; color: var(--muted); }
.device-fallback svg { display: block; width: 100%; height: calc(100% - 12px); }
.device-fallback-label { max-width: 100%; overflow: hidden; color: var(--subtle); font-size: 9px; line-height: 11px; text-overflow: ellipsis; white-space: nowrap; }
</style>

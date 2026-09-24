<script setup lang="ts">
import { ref, watch } from 'vue';
import { defineMessages } from '../i18n';

// Retain the localized device-kind vocabulary for existing language packs.
defineMessages(
  { watch: '手表', strap: '腕带', ring: '戒指', band: '手环', earbuds: '耳机', scale: '体重秤', unknown: '设备' },
  { watch: 'Watch', strap: 'Strap', ring: 'Ring', band: 'Band', earbuds: 'Earbuds', scale: 'Scale', unknown: 'Device' },
  { watch: 'Reloj', strap: 'Correa', ring: 'Anillo', band: 'Pulsera', earbuds: 'Audífonos', scale: 'Báscula', unknown: 'Dispositivo' },
  'components/DeviceVisual',
);

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

</script>

<template>
  <span
    v-if="src && !imageFailed"
    :class="['device-visual', { compact }]"
  >
    <img :src="src" :alt="alt" loading="lazy" @error="onImageError" />
  </span>
</template>

<style scoped>
.device-visual {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
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
.device-visual img { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; object-fit: contain; object-position: center; padding: 3px; }
</style>

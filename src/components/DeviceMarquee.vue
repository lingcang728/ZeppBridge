<script setup lang="ts">
import { computed } from 'vue';
import { deviceCatalog, deviceThumbnailFor } from '../lib/deviceCatalog';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  { marqueeAria: '已收录的 Amazfit 在售设备' },
  { marqueeAria: 'Amazfit devices currently in the catalog' },
);
const t = useMessages(messages);

const items = computed(() => deviceCatalog
  .filter((entry) => entry.status === 'active' && entry.supported)
  .map((entry) => ({
    key: entry.catalog_id,
    name: entry.display_name,
    kind: entry.kind,
    src: deviceThumbnailFor(entry.kind, entry.image_key),
  })));

const rowA = computed(() => items.value);
const rowB = computed(() => [...items.value].reverse());
</script>

<template>
  <div class="device-marquee" :aria-label="t.marqueeAria">
    <div v-for="(row, index) in [rowA, rowB]" :key="index" :class="['marquee-row', `dir-${index === 0 ? 'ltr' : 'rtl'}`]">
      <div class="marquee-track">
        <span v-for="pass in 2" :key="pass" class="marquee-pass">
          <img
            v-for="item in row"
            :key="`${pass}-${item.key}`"
            :src="item.src"
            :alt="item.name"
            :title="item.name"
            loading="lazy"
          />
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.device-marquee {
  display: grid;
  gap: 18px;
  width: 100%;
  overflow: hidden;
  mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
}
.marquee-row { overflow: hidden; }
.marquee-track {
  display: flex;
  width: max-content;
  animation: slide 72s linear infinite;
}
.dir-rtl .marquee-track { animation-direction: reverse; animation-duration: 84s; }
.marquee-pass { display: flex; align-items: center; gap: 22px; padding-right: 22px; }
.marquee-pass img {
  width: 72px;
  height: 72px;
  object-fit: contain;
  filter: drop-shadow(0 8px 12px rgba(0, 0, 0, .28));
}
@keyframes slide {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .device-marquee {
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: 12px;
    mask-image: none;
  }
  .marquee-row { display: contents; }
  .marquee-track { display: contents; animation: none; }
  .marquee-pass:last-child { display: none; }
  .marquee-pass { display: contents; padding: 0; }
  .marquee-pass img { width: 64px; height: 64px; }
}
</style>

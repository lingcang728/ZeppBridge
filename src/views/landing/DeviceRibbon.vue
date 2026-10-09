<script setup lang="ts">
import { computed, reactive } from 'vue';
import { deviceCatalog, deviceImageFor, deviceThumbnailFor } from '../../lib/deviceCatalog';
const failed = reactive(new Map<string, number>());
const devices = computed(() => deviceCatalog.filter(d => d.status === 'active' && d.supported).map(d => ({
  id: d.catalog_id, name: d.display_name, thumb: deviceThumbnailFor(d.kind, d.image_key), full: deviceImageFor(d.kind, d.image_key),
})).filter(d => d.thumb || d.full));
const source = (d: typeof devices.value[number]) => (failed.get(d.id) ?? 0) === 0 ? d.thumb : d.full;
const miss = (d: typeof devices.value[number], event: Event) => {
  const img = event.target as HTMLImageElement;
  // Repeated ribbon copies can fail together. Only advance the attempt that failed.
  if ((img.currentSrc || img.src) === new URL(source(d), location.href).href) failed.set(d.id, (failed.get(d.id) ?? 0) + 1);
};
</script>

<template>
  <div class="device-marquee" aria-label="Amazfit">
    <div v-for="(row, index) in [devices, [...devices].reverse()]" :key="index" :class="['marquee-row', { reverse: index === 1 }]">
      <div class="marquee-track">
        <div v-for="pass in 2" :key="pass" class="marquee-pass" :aria-hidden="pass === 2 || index === 1 ? true : undefined">
          <span v-for="device in row" :key="device.id" class="device-cell" :title="device.name" :aria-label="device.name" role="img">
            <img v-if="source(device) && (failed.get(device.id) ?? 0) < 2" :src="source(device)" alt="" loading="lazy" width="92" height="92" @error="miss(device, $event)" />
            <svg v-else viewBox="0 0 72 92" class="device-fallback" aria-hidden="true"><rect x="22" y="2" width="28" height="88" rx="8"/><rect x="10" y="24" width="52" height="44" rx="18"/><circle cx="36" cy="46" r="14"/><path d="M36 36v11l7 4"/></svg>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.device-marquee { display: grid; gap: 38px; overflow: hidden; mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
.marquee-row { overflow: hidden; }
.marquee-track { display: flex; width: max-content; animation: drift 72s linear infinite; }
.reverse .marquee-track { animation-direction: reverse; animation-duration: 84s; }
.marquee-pass { display: flex; align-items: center; gap: 42px; padding-right: 42px; }
.device-cell { display: grid; place-items: center; flex: 0 0 92px; width: 92px; height: 92px; overflow: hidden; }
img { display: block; width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 10px 14px rgba(0,0,0,.18)); }
.device-fallback { width: 60px; height: 80px; fill: var(--surface); stroke: var(--subtle); stroke-width: 1.5; opacity: .5; }
.device-fallback circle, .device-fallback path { fill: none; }
@keyframes drift { to { transform: translateX(-50%); } }
@media(max-width:720px) { .device-cell { width: 64px; height: 64px; flex-basis: 64px; } }
@media(prefers-reduced-motion:reduce) {
  .device-marquee { mask-image: none; }
  .marquee-track { animation: none; width: auto; }
  .marquee-pass { flex-wrap: wrap; justify-content: center; padding: 0; gap: 16px; }
  .marquee-pass:last-child, .reverse { display: none; }
}
</style>

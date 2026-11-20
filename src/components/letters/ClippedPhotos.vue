<script setup lang="ts">
/**
 * 写给作者那张信纸右边的附图：每张图像一张小照片，用一枚回形针夹在纸的右边，从上往下排（最多 3 张）。
 *
 * 附上：照片从「附图」那里（或粘贴时的写字区）沿一条往上拱的弧飞到自己的位置，边飞边放大、转正；
 * 到了先略高一点，落下去的那一刻回形针夹住（针一缩一弹），照片挂在针上来回荡两下停住——转轴是针夹住的那一点。
 * 一次附几张就一张接一张飞，间隔一拍，后面的不会追尾。
 * 拿掉：照片从针上掉下去（往下滑、转一点、淡掉），下面的照片往上挪一格补位（只动 translate）。
 * 每张照片的歪斜角度跟着图走（按 id 定），补位时不会突然换个角度。
 * 只动 transform / opacity。减少动效时直接出现、直接消失。
 */
import { nextTick, ref, watch } from 'vue';
import type { ReplyImage } from '../../lib/letters/attachImage';
import { exemptFromSettle } from '../../lib/motion/interrupt';
import { lessMotion } from '../../lib/motion/lessMotion';
import { paced } from '../../lib/motion/timing';
import { useLetterText } from './letters.i18n';

const props = defineProps<{ images: ReplyImage[]; disabled?: boolean; launch?: DOMRect | null }>();
const emit = defineEmits<{ (event: 'remove', id: string): void }>();
const t = useLetterText();

/** 一格多高（照片 71px + 间隔）；和样式表里的 .photo 尺寸一起改。 */
const STEP = 84;
const TILTS = [-3, 2.6, -1.8, 3.2, -2.4];
const tiltOf = (id: string) => {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return TILTS[Math.abs(hash) % TILTS.length]!;
};

const root = ref<HTMLElement | null>(null);
const leaving = new Set<string>();
const photoEl = (id: string) => root.value?.querySelector<HTMLElement>(`.photo[data-id="${CSS.escape(id)}"]`) ?? null;
const clipEl = (id: string) => root.value?.querySelector<HTMLElement>(`.clip[data-id="${CSS.escape(id)}"]`) ?? null;

const LAND_MS = paced(820);
const GAP_MS = paced(130);

/** 一张照片飞来、被夹住、荡两下。order：这一批里的第几张（依次错开）。 */
const land = (id: string, order: number) => {
  const photo = photoEl(id);
  const clip = clipEl(id);
  if (!photo) return;
  const tilt = tiltOf(id);
  const box = photo.getBoundingClientRect();
  const height = photo.offsetHeight || 71;
  const from = props.launch ?? new DOMRect(box.left - 40, box.top + 220, box.width * 0.5, box.height * 0.5);
  /* 转轴在照片顶边正中（针夹住的地方）；起点让照片中心对准「附图」的中心。 */
  const scale0 = Math.min(0.6, Math.max(0.25, from.height / height));
  const dx = from.left + from.width / 2 - (box.left + box.width / 2);
  const dy = from.top + from.height / 2 - (box.top + (height * scale0) / 2);
  const delay = order * GAP_MS;
  exemptFromSettle(photo.animate([
    { transform: `translate(${dx}px, ${dy}px) rotate(-14deg) scale(${scale0})`, opacity: 0, easing: 'cubic-bezier(.2, .6, .35, 1)' },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) rotate(-6deg) scale(${(scale0 + 1) / 2})`, opacity: 1, offset: 0.34, easing: 'cubic-bezier(.3, .3, .3, 1)' },
    { transform: `translate(0px, -9px) rotate(${tilt + 8}deg) scale(1.03)`, opacity: 1, offset: 0.6, easing: 'cubic-bezier(.5, 0, .5, 1)' },
    { transform: `translate(0px, 0px) rotate(${tilt - 5}deg) scale(1)`, opacity: 1, offset: 0.75, easing: 'ease-in-out' },
    { transform: `translate(0px, 0px) rotate(${tilt + 2.2}deg) scale(1)`, opacity: 1, offset: 0.88, easing: 'ease-in-out' },
    { transform: `translate(0px, 0px) rotate(${tilt}deg) scale(1)`, opacity: 1 },
  ], { duration: LAND_MS, delay, fill: 'backwards' }));
  /* 针：照片落到的那一刻出现、一缩一弹，像夹了一下。 */
  clip?.animate([
    { opacity: 0, transform: 'translateY(-6px) scaleY(1.15)' },
    { opacity: 1, transform: 'translateY(0) scaleY(.82)', offset: 0.45 },
    { opacity: 1, transform: 'translateY(0) scaleY(1.06)', offset: 0.75 },
    { opacity: 1, transform: 'none' },
  ], { duration: paced(300), delay: delay + LAND_MS * 0.6, easing: 'ease-out', fill: 'backwards' });
};

watch(() => props.images.map((image) => image.id), async (ids, before) => {
  const old = before ?? [];
  const fresh = ids.filter((id) => !old.includes(id));
  await nextTick();
  if (lessMotion()) return;
  /* 补位：留下的照片从旧的那一格滑到新的一格。 */
  ids.forEach((id, index) => {
    const was = old.indexOf(id);
    const el = photoEl(id);
    if (was < 0 || was === index || !el) return;
    const shift = `0px ${(was - index) * STEP}px`;
    exemptFromSettle(el.animate([{ translate: shift }, { translate: '0px 0px' }], { duration: paced(380), easing: 'cubic-bezier(.3, .7, .3, 1)' }));
    clipEl(id)?.animate([{ translate: shift }, { translate: '0px 0px' }], { duration: paced(380), easing: 'cubic-bezier(.3, .7, .3, 1)' });
  });
  fresh.forEach((id, order) => land(id, order));
}, { flush: 'post' });

/** 拿掉：先从针上掉下去，再真的删。 */
const remove = (id: string) => {
  if (leaving.has(id) || props.disabled) return;
  const photo = photoEl(id);
  const clip = clipEl(id);
  if (!photo || lessMotion()) { emit('remove', id); return; }
  leaving.add(id);
  const tilt = tiltOf(id);
  clip?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: paced(200), fill: 'forwards' });
  const fall = photo.animate([
    { transform: `translate(0px, 0px) rotate(${tilt}deg) scale(1)`, opacity: 1 },
    { transform: `translate(0px, -4px) rotate(${tilt - 4}deg) scale(1)`, opacity: 1, offset: 0.2 },
    { transform: `translate(14px, 70px) rotate(${tilt + 16}deg) scale(.92)`, opacity: 0 },
  ], { duration: paced(360), easing: 'cubic-bezier(.5, 0, .75, .4)', fill: 'forwards' });
  void fall.finished.catch(() => undefined).then(() => {
    leaving.delete(id);
    emit('remove', id);
  });
};
</script>

<template>
  <div v-if="images.length" ref="root" class="photos">
    <template v-for="(image, index) in images" :key="image.id">
      <figure class="photo" :data-id="image.id" :style="{ top: `${index * STEP}px`, transform: `rotate(${tiltOf(image.id)}deg)` }">
        <img :src="image.url" alt="" draggable="false" />
        <button v-if="!disabled" type="button" class="photo-remove" :aria-label="t.removeImage(index + 1)" @click="remove(image.id)">×</button>
      </figure>
      <svg class="clip" :data-id="image.id" :style="{ top: `${index * STEP - 13}px` }" viewBox="0 0 14 40" aria-hidden="true">
        <path d="M9.5 13V29a2.5 2.5 0 0 1-5 0V6a4.25 4.25 0 0 1 8.5 0v25.5a5.75 5.75 0 0 1-11.5 0V11" />
      </svg>
    </template>
  </div>
</template>

<style scoped>
/* 纸右边一列：照片 84×63 加 4px 白边。转轴在顶边正中（针夹住的地方）。 */
.photos { position: absolute; top: calc(var(--paper-line) + 14px); inset-inline-end: 0; width: 92px; pointer-events: none; }
.photo {
  position: absolute; left: 0; width: 92px; height: 71px; margin: 0; box-sizing: border-box; padding: 4px; border-radius: 2px;
  background: #fffdf8; box-shadow: 0 0 0 1px rgb(60 50 40 / .12), 0 6px 14px -4px rgb(40 30 15 / .35);
  transform-origin: 50% 0; pointer-events: auto;
}
.photo img { display: block; width: 100%; height: 100%; object-fit: cover; }
.clip {
  position: absolute; left: 39px; z-index: 1; width: 14px; height: 40px; overflow: visible; transform-origin: 50% 0;
  fill: none; stroke: #8b877d; stroke-width: 1.7; stroke-linecap: round; filter: drop-shadow(0 1px 0 rgb(255 255 255 / .6));
}
.photo-remove {
  position: absolute; top: -8px; inset-inline-end: -8px; display: grid; place-items: center; width: 20px; height: 20px; padding: 0;
  border: 0; border-radius: 50%; background: var(--paper-ink); color: #fff; font: 400 14px / 1 var(--font-sans); cursor: pointer;
  opacity: 0; transition: opacity 160ms ease;
}
.photo:hover .photo-remove, .photo-remove:focus-visible { opacity: 1; }
.photo-remove:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (hover: none) { .photo-remove { opacity: 1; } }
</style>

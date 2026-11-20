/**
 * 一张信纸上的附图（最多 3 张）。图只在这次打开里：草稿存本机浏览器存储，图太大不进草稿。
 * 寄出成功后 clear()；组件卸载时把预览用的 blob: 地址都收回。
 */
import { onBeforeUnmount, ref } from 'vue';
import { ATTACH_MAX, prepareImage, type ReplyImage } from '../lib/letters/attachImage';

export function useReplyImages() {
  const images = ref<ReplyImage[]>([]);
  const preparing = ref(false);
  /** 上一次添加里有没有打不开 / 压不下来的图。 */
  const failed = ref(false);

  const add = async (files: Iterable<File>) => {
    const queue = [...files].slice(0, Math.max(0, ATTACH_MAX - images.value.length));
    if (!queue.length) return;
    preparing.value = true;
    failed.value = false;
    try {
      for (const file of queue) {
        const image = await prepareImage(file);
        if (!image) { failed.value = true; continue; }
        if (images.value.length >= ATTACH_MAX) { URL.revokeObjectURL(image.url); break; }
        images.value = [...images.value, image];
      }
    } finally {
      preparing.value = false;
    }
  };

  const remove = (id: string) => {
    const image = images.value.find((item) => item.id === id);
    if (image) URL.revokeObjectURL(image.url);
    images.value = images.value.filter((item) => item.id !== id);
    failed.value = false;
  };

  const clear = () => {
    for (const image of images.value) URL.revokeObjectURL(image.url);
    images.value = [];
    failed.value = false;
  };

  /** 寄信时交给后端的那一份；没有图就不带这个字段。 */
  const payload = (): { attachments?: string[] } =>
    images.value.length ? { attachments: images.value.map((image) => image.base64) } : {};

  onBeforeUnmount(clear);
  return { images, preparing, failed, add, remove, clear, payload };
}

export type ReplyImages = ReturnType<typeof useReplyImages>;

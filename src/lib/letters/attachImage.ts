/**
 * 回信附图：在界面里把用户选的 / 粘贴的图重新画一遍、编码成 JPEG 再交给后端。
 *
 * - 重新编码会丢掉原图的 EXIF（拍摄时间、机型、GPS 定位），寄出去的只有像素。
 * - 长边压到 2000 px 以内、单张 ≤ 1 MB；还大就降质量、再缩小。
 * - 透明 PNG 先垫白底，免得透明处变黑。
 *
 * 上限和后端（core `letters::LETTER_ATTACHMENT_MAX_BYTES`）、服务端（`ATTACHMENT_MAX_BYTES`）一致。
 */
export const ATTACH_MAX = 3;
export const ATTACH_MAX_BYTES = 1024 * 1024;
export const ATTACH_LONG_EDGE = 2000;

export interface ReplyImage {
  id: string;
  /** 预览用的 blob: 地址；不用了要 revoke。 */
  url: string;
  /** JPEG 的 base64（不带 data: 前缀），寄信时原样交给后端。 */
  base64: string;
  bytes: number;
}

/** 等比缩到长边不超过 max，至少 1 px。 */
export const fitSize = (width: number, height: number, max = ATTACH_LONG_EDGE): { width: number; height: number } => {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

/** 依次尝试的「缩放 × 质量」：先保清晰度，压不下来再缩小。 */
export const ENCODE_STEPS: ReadonlyArray<{ scale: number; quality: number }> = [
  { scale: 1, quality: 0.86 },
  { scale: 1, quality: 0.74 },
  { scale: 0.8, quality: 0.74 },
  { scale: 0.64, quality: 0.7 },
  { scale: 0.5, quality: 0.66 },
  { scale: 0.36, quality: 0.62 },
];

export const isImageFile = (file: Blob): boolean => /^image\/(png|jpeg|webp|gif|bmp)$/i.test(file.type);

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

/** 读不出来给 null，由 prepareImage 当成这张图打不开。 */
const toBase64 = (blob: Blob) => new Promise<string | null>((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
  reader.onerror = () => resolve(null);
  reader.readAsDataURL(blob);
});

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** 读不了（不是图、解码失败、怎么压都超限）返回 null。 */
export async function prepareImage(file: Blob): Promise<ReplyImage | null> {
  if (!isImageFile(file)) return null;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return null; }
  try {
    const base = fitSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;
    for (const step of ENCODE_STEPS) {
      const size = fitSize(base.width * step.scale, base.height * step.scale, ATTACH_LONG_EDGE);
      canvas.width = size.width;
      canvas.height = size.height;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await toBlob(canvas, step.quality);
      if (blob && blob.size <= ATTACH_MAX_BYTES) {
        const base64 = await toBase64(blob);
        if (!base64) return null;
        return { id: newId(), url: URL.createObjectURL(blob), base64, bytes: blob.size };
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}

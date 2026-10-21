/**
 * 邮票（批次 6）。票面图可以是作者为这一版画的一张（docs/releases/letters/<版本>/stamp.*）；
 * 没有就贴默认那枚（components/letters/StampArt.vue：海拔山形；2026-10-21 用户定的，别用通用的城堡风景）。
 * 齿孔、白边、面值在 components/letters/PostageStamp.vue 里画。
 */

/** x.y.0 印 x.y；补丁版印全号，不然 3.0.7 和 3.0.8 两枚票面一样。 */
export function stampFace(version: string): string {
  const [major, minor, patch] = version.split('.');
  return patch && patch !== '0' ? version : `${major ?? '?'}.${minor ?? '0'}`;
}

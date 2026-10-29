/**
 * 邮票（批次 6）。票面图可以是作者为这一版画的一张（docs/releases/letters/<版本>/stamp.*）；
 * 没有就贴默认那枚（components/letters/StampArt.vue：海拔山形；2026-10-21 用户定的，别用通用的城堡风景）。
 * 齿孔、白边、面值在 components/letters/PostageStamp.vue 里画。
 */

/** 面值印全号（2026-10-29 用户：3.1 不够精确，标成 3.1.0）；预发布后缀不印。 */
export function stampFace(version: string): string {
  return version.split('-')[0] ?? version;
}

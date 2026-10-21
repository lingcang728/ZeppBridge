/**
 * 邮票的面值（批次 6）。票面图是作者每版画的一张（docs/releases/letters/<版本>/stamp.*），没有就用默认那张；
 * 齿孔、白边、面值在 components/letters/PostageStamp.vue 里画，所以这里只剩「面值印什么」。
 *
 * x.y.0 印 x.y；补丁版印全号，不然 3.0.7 和 3.0.8 两枚票面一样。
 */
export function stampFace(version: string): string {
  const [major, minor, patch] = version.split('.');
  return patch && patch !== '0' ? version : `${major ?? '?'}.${minor ?? '0'}`;
}

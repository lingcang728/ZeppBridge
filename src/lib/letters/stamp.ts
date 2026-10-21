/**
 * 邮票（批次 6）。票面图可以是作者为这一版画的一张（docs/releases/letters/<版本>/stamp.*）；
 * 没有就从一套 ZeppBridge 自己的票面里挑一枚（components/letters/StampArt.vue：桥、手表、睡眠、路线、海拔、云到本机）。
 * 2026-10-21 用户：别用那张通用的城堡风景，要有 ZeppBridge 代表性，而且每版不一样。
 * 齿孔、白边、面值在 components/letters/PostageStamp.vue 里画。
 */

/** x.y.0 印 x.y；补丁版印全号，不然 3.0.7 和 3.0.8 两枚票面一样。 */
export function stampFace(version: string): string {
  const [major, minor, patch] = version.split('.');
  return patch && patch !== '0' ? version : `${major ?? '?'}.${minor ?? '0'}`;
}

export const STAMP_DESIGNS = ['bridge', 'watch', 'sleep', 'route', 'summit', 'cloud'] as const;
export type StampDesign = (typeof STAMP_DESIGNS)[number];

/**
 * 这一版用哪一枚：按版本号依次轮换（相邻两版一定不同），同一版永远是同一枚。
 * 预发布后缀（3.1.0-beta.2）不参与，正式版和它的测试版贴同一枚。
 */
export function stampDesign(version: string): StampDesign {
  const [major = 0, minor = 0, patch = 0] = version.split('-')[0]!.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const n = STAMP_DESIGNS.length;
  return STAMP_DESIGNS[(((major * 7 + minor * 3 + patch) % n) + n) % n]!;
}

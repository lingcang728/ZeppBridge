/*
 * Label-box geometry for the orbit graph — pure estimates, no DOM.
 *
 * The simulation needs a collision body and `assignAnchors` needs a footprint
 * to keep nodes inside the canvas, both before any DOM measurement exists.
 * Kept as a leaf module so slots/simulation can share it without a cycle.
 */

/** Vertical gap between node disc bottom and the label block top. */
export const LABEL_GAP = 6;
/** Horizontal breathing room added to half the label width. */
export const LABEL_PAD_X = 4;
/** Uniform padding around the whole collision body. */
export const BODY_PAD = 3;
export const LABEL_FONT_PX = 13;
export const SUBLABEL_FONT_PX = 11.5;
export const LABEL_LINE_H = 16;
export const SUBLABEL_LINE_H = 13;

export interface CollisionRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** CJK + fullwidth glyph ~1 em; everything else ~0.56 em. ASCII-only source on purpose. */
const isWideGlyph = (ch: string): boolean => {
  const cp = ch.codePointAt(0) ?? 0;
  return (cp >= 0x2e80 && cp <= 0x9fff)
    || (cp >= 0xf900 && cp <= 0xfaff)
    || (cp >= 0xff00 && cp <= 0xffef)
    || (cp >= 0x3000 && cp <= 0x303f);
};

const estimateTextWidth = (text: string, fontPx: number): number => {
  let units = 0;
  for (const ch of text) {
    units += isWideGlyph(ch) ? 1 : 0.56;
  }
  return units * fontPx + 2;
};

/** Estimated label block size (label + optional sublabel), in world px. */
export const estimateLabelBox = (
  label: string,
  sublabel?: string,
): { w: number; h: number } => ({
  w: Math.max(
    estimateTextWidth(label, LABEL_FONT_PX),
    sublabel ? estimateTextWidth(sublabel, SUBLABEL_FONT_PX) : 0,
  ),
  h: LABEL_LINE_H + (sublabel ? SUBLABEL_LINE_H : 0),
});

/**
 * Collision body: square around the disc, widened to cover the label, and
 * extended downward over the label block (labels are drawn centred below the
 * node). This is the same rect the tests assert pairwise non-overlap on.
 */
export const collisionRect = (n: {
  x: number;
  y: number;
  radius: number;
  labelW: number;
  labelH: number;
}): CollisionRect => {
  const halfW = Math.max(n.radius, n.labelW / 2 + LABEL_PAD_X) + BODY_PAD;
  return {
    left: n.x - halfW,
    right: n.x + halfW,
    top: n.y - n.radius - BODY_PAD,
    bottom: n.y + n.radius + (n.labelH > 0 ? LABEL_GAP + n.labelH : 0) + BODY_PAD,
  };
};

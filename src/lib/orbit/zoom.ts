/*
 * Zoom + pointer math (contract P5).
 *
 * Zoom is controlled: the component never mutates its own copy; it clamps to
 * [0.6, 1.8] and emits `update:zoom`. Wheel zoom keeps the world point under
 * the pointer fixed ("zoom around pointer anchor") by adjusting the internal
 * pan offset — pan is the only view state the canvas owns.
 *
 * Pointer → world MUST go through `getBoundingClientRect()`: with the app's
 * CSS-zoom UI scaling (`document.documentElement.style.zoom`), `clientX/Y`
 * and rect live in the same scaled space, so `clientX - rect.left` rescaled
 * by `rect.width` lands in unzoomed viewBox units for free. offsetX/Y or
 * offsetWidth would mix coordinate systems and break under UI scale ≠ 100%.
 */

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 1.8;
export const WHEEL_ZOOM_FACTOR = 0.0015;

export interface Vec {
  x: number;
  y: number;
}

export const clampZoom = (zoom: number): number =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

/** Wheel zoom: `z' = z·exp(-deltaY·0.0015)`, clamped. Trackpad pinch arrives as ctrl+wheel on the same path. */
export const zoomFromWheel = (zoom: number, deltaY: number): number =>
  clampZoom(zoom * Math.exp(-deltaY * WHEEL_ZOOM_FACTOR));

/**
 * Pan required to keep the world point under `viewPoint` stationary when
 * zoom changes from `zoom` to `nextZoom`.
 * Invariant: `view = center + pan + zoom·world`.
 */
export const panForZoom = (
  pan: Vec,
  viewPoint: Vec,
  center: Vec,
  zoom: number,
  nextZoom: number,
): Vec => ({
  x: viewPoint.x - center.x - (nextZoom / zoom) * (viewPoint.x - center.x - pan.x),
  y: viewPoint.y - center.y - (nextZoom / zoom) * (viewPoint.y - center.y - pan.y),
});

/**
 * Client (pointer event) coords → viewBox coords. `rect` comes from
 * `getBoundingClientRect()` on the svg host — the only conversion allowed,
 * because it stays correct when CSS zoom scales the whole document.
 */
export const clientToView = (
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  viewW: number,
  viewH: number,
): Vec => ({
  x: ((clientX - rect.left) / rect.width) * viewW,
  y: ((clientY - rect.top) / rect.height) * viewH,
});

/** viewBox coords → world coords (inverse of the inner <g> transform). */
export const viewToWorld = (view: Vec, center: Vec, pan: Vec, zoom: number): Vec => ({
  x: (view.x - center.x - pan.x) / zoom,
  y: (view.y - center.y - pan.y) / zoom,
});

export const worldToView = (world: Vec, center: Vec, pan: Vec, zoom: number): Vec => ({
  x: center.x + pan.x + world.x * zoom,
  y: center.y + pan.y + world.y * zoom,
});

/** One-call helper: pointer event → world coords. */
export const pointerToWorld = (
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  viewW: number,
  viewH: number,
  pan: Vec,
  zoom: number,
): Vec =>
  viewToWorld(clientToView(clientX, clientY, rect, viewW, viewH), { x: viewW / 2, y: viewH / 2 }, pan, zoom);

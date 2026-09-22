import type { IconName } from '../../components/Icon.vue';

/*
 * Orbit graph contract types (BETA1 P5).
 *
 * `OrbitCanvas` is a pure presentation component: it owns the local 2D
 * simulation and view state, but never business state. Join/leave/undo are
 * emitted as *intents*; the parent flips `nodes[].state` and the canvas
 * re-flows reactively. Keeping the shapes here (not in the .vue file) lets
 * the parent (AiComposer, OrbitLab) and the tests share one definition.
 */

/*
 * Local copy of the shared category union. The canonical type lands in
 * `src/lib/bridge/types.ts` (S4); values are pinned by contract P5 and must
 * stay identical. Defined here so the orbit chunk does not depend on a file
 * owned by another seat.
 */
export type AiTaskCategory =
  | 'workout'
  | 'sleep'
  | 'recovery'
  | 'heart_rate'
  | 'training'
  | 'body'
  | 'personal_note'
  | 'attachment';

export type OrbitNodeState = 'member' | 'candidate' | 'disabled';

/** Node disc radius in world px. Lives here so slots/simulation share it cycle-free. */
export const NODE_RADIUS = 26;
/** Center hub disc radius in world px. */
export const CENTER_RADIUS = 44;

export interface OrbitNode {
  id: string;
  category: AiTaskCategory;
  label: string;
  sublabel?: string;
  /** Falls back to the per-category default when omitted. */
  icon?: IconName;
  state: OrbitNodeState;
  count?: number;
  /** Deterministic anchor override: slot index within its own state group. */
  orbitSlot?: number;
}

export interface OrbitCenter {
  label: string;
  sublabel?: string;
}

export interface OrbitCanvasProps {
  center: OrbitCenter;
  nodes: OrbitNode[];
  /** Controlled zoom; the component only writes back through `update:zoom`. */
  zoom: number;
  /** Node currently open in the parent's side panel → persistent highlight. */
  activeId?: string | null;
  /** Undefined = follow `prefers-reduced-motion`; explicit value wins. */
  reducedMotion?: boolean;
  /** Readonly still allows open/focus; it blocks join/leave/undo intents. */
  readonly?: boolean;
}

export interface OrbitCanvasEmits {
  'node-join': [id: string];
  'node-leave': [id: string];
  'node-open': [id: string];
  'node-focus': [id: string | null];
  'update:zoom': [zoom: number];
  undo: [];
  'layout-settled': [];
}

/** Fallback icon per category when `OrbitNode.icon` is not set. */
export const ORBIT_CATEGORY_ICONS: Record<AiTaskCategory, IconName> = {
  workout: 'run',
  sleep: 'moon',
  recovery: 'hrv',
  heart_rate: 'heart',
  training: 'training-load',
  body: 'user',
  personal_note: 'edit',
  attachment: 'file',
};

export const orbitIconFor = (node: Pick<OrbitNode, 'category' | 'icon'>): IconName =>
  node.icon ?? ORBIT_CATEGORY_ICONS[node.category];

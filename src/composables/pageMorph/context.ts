import type { Ledger } from './ledger';
import type { MorphState } from './types';

/** 展开 / 收回两段共用的东西：状态、账本，以及「退回来处」（Esc 打断展开时用）。 */
export interface MorphCtx {
  state: MorphState;
  ledger: Ledger;
  back: () => void;
}

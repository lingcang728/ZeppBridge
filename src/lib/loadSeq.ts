/**
 * Monotonic load token. Range switches and overlapping fetches must not
 * write an older response over a newer one.
 */
export function createLoadSeq() {
  let seq = 0;
  return {
    next(): number {
      seq += 1;
      return seq;
    },
    current(): number {
      return seq;
    },
    isCurrent(token: number): boolean {
      return token === seq;
    },
  };
}

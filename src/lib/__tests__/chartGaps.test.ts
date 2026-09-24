import { describe, expect, it } from 'vitest';
import { HR_GAP_BREAK_MS, insertNullBreaks } from '../chartGaps';
import { insertSleepStageGaps } from '../sleepStages';

describe('insertNullBreaks', () => {
  it('does not invent a sample when the gap is under the threshold', () => {
    const start = 1_000_000;
    expect(insertNullBreaks([
      { ts: start, value: 60 },
      { ts: start + HR_GAP_BREAK_MS, value: 62 },
    ], HR_GAP_BREAK_MS)).toEqual([
      [start, 60],
      [start + HR_GAP_BREAK_MS, 62],
    ]);
  });

  it('inserts a null breakpoint when the gap exceeds the threshold', () => {
    const start = 1_000_000;
    const next = start + HR_GAP_BREAK_MS + 1;
    expect(insertNullBreaks([
      { ts: start, value: 60 },
      { ts: next, value: 90 },
    ], HR_GAP_BREAK_MS)).toEqual([
      [start, 60],
      [start + 1, null],
      [next, 90],
    ]);
  });

  it('leaves a single point unchanged', () => {
    expect(insertNullBreaks([{ ts: 10, value: 55 }], HR_GAP_BREAK_MS)).toEqual([[10, 55]]);
  });
});

describe('insertSleepStageGaps', () => {
  it('paints holes as unknown instead of stretching the previous stage', () => {
    const from = 0;
    const to = 10_000;
    const gapped = insertSleepStageGaps(
      [
        { tone: 'deep', start: 0, end: 3_000 },
        { tone: 'light', start: 7_000, end: 10_000 },
      ],
      from,
      to,
      1_000,
    );
    expect(gapped).toEqual([
      { tone: 'deep', start: 0, end: 3_000 },
      { tone: 'unknown', start: 3_000, end: 7_000 },
      { tone: 'light', start: 7_000, end: 10_000 },
    ]);
  });

  it('fills leading and trailing holes in the requested range', () => {
    const gapped = insertSleepStageGaps(
      [{ tone: 'rem', start: 2_000, end: 5_000 }],
      0,
      8_000,
      1_000,
    );
    expect(gapped).toEqual([
      { tone: 'unknown', start: 0, end: 2_000 },
      { tone: 'rem', start: 2_000, end: 5_000 },
      { tone: 'unknown', start: 5_000, end: 8_000 },
    ]);
  });

  it('ignores sub-threshold jitter between adjacent slices', () => {
    const gapped = insertSleepStageGaps(
      [
        { tone: 'deep', start: 0, end: 3_000 },
        { tone: 'light', start: 3_400, end: 6_000 },
      ],
      0,
      6_000,
      1_000,
    );
    expect(gapped.map((slice) => slice.tone)).toEqual(['deep', 'light']);
  });

  it('clips overlaps and coalesces adjacent slices of the same stage', () => {
    expect(insertSleepStageGaps([
      { tone: 'light', start: 3_000, end: 7_000 },
      { tone: 'deep', start: -1_000, end: 3_500 },
      { tone: 'light', start: 7_000, end: 8_000 },
      { tone: 'rem', start: 7_500, end: 9_000 },
    ], 0, 10_000)).toEqual([
      { tone: 'deep', start: 0, end: 3_500 },
      { tone: 'light', start: 3_500, end: 8_000 },
      { tone: 'rem', start: 8_000, end: 9_000 },
      { tone: 'unknown', start: 9_000, end: 10_000 },
    ]);
  });

  it('keeps a genuine short stage rather than deleting it', () => {
    expect(insertSleepStageGaps([
      { tone: 'light', start: 0, end: 5_000 },
      { tone: 'awake', start: 5_000, end: 5_100 },
      { tone: 'light', start: 5_100, end: 10_000 },
    ], 0, 10_000)).toHaveLength(3);
  });
});

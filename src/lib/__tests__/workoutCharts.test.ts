import { describe, expect, it } from 'vitest';
import { clockSeconds, lineOption, spannedAxis } from '../workoutCharts';
import type { ChartPalette } from '../echartsTheme';

const pts = (...values: number[]) => values.map((v, i) => ({ t: i * 1000, v }));

describe('spannedAxis', () => {
  it('widens a flat altitude trace around its middle', () => {
    const axis = spannedAxis(pts(7, 12, 9), 40);
    expect(axis.max! - axis.min!).toBe(40);
    expect(axis.min).toBeLessThanOrEqual(7);
    expect(axis.max).toBeGreaterThanOrEqual(12);
  });

  it('leaves a hilly trace and other charts to ECharts', () => {
    expect(spannedAxis(pts(100, 180), 40)).toEqual({});
    expect(spannedAxis(pts(130, 140), 0)).toEqual({});
  });
});

describe('pace chart', () => {
  const palette = { axis: '#888', gridSoft: '#222', tooltipBg: '#000', tooltipBorder: '#111', tooltipText: '#fff', mark: '#666' } as unknown as ChartPalette;

  it('puts the faster pace on top and labels it as m:ss', () => {
    const option = lineOption(pts(300, 330, 285), { color: '#0af', unit: '/km', palette, inverse: true, format: clockSeconds })!;
    expect(option.yAxis.inverse).toBe(true);
    expect((option.yAxis.axisLabel as { formatter?: (v: number) => string }).formatter?.(330)).toBe('5:30');
    const tip = option.tooltip.formatter([{ value: [0, 285] }]);
    expect(tip).toContain('<b>4:45</b> /km');
  });

  it('leaves other charts upright with plain numbers', () => {
    const option = lineOption(pts(120, 150), { color: '#f00', unit: 'bpm', palette })!;
    expect(option.yAxis.inverse).toBe(false);
    expect(option.tooltip.formatter([{ value: [0, 150] }])).toContain('<b>150</b> bpm');
  });

  it('rounds to whole seconds', () => {
    expect(clockSeconds(299.6)).toBe('5:00');
    expect(clockSeconds(61)).toBe('1:01');
  });
});

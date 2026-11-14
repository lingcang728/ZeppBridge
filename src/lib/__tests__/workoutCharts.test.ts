import { describe, expect, it } from 'vitest';
import { chartTier, fitTicks, lineOption, paceSeconds, withDetail } from '../workoutCharts';
import type { ChartPalette } from '../echartsTheme';

const pts = (...values: number[]) => values.map((v, i) => ({ t: i * 1000, v }));

describe('pace chart', () => {
  const palette = { axis: '#888', gridSoft: '#222', tooltipBg: '#000', tooltipBorder: '#111', tooltipText: '#fff', mark: '#666' } as unknown as ChartPalette;

  it('puts the faster pace on top, fills toward the slow end and writes m\'ss"', () => {
    const option = lineOption(pts(300, 330, 285), { color: '#0af', unit: '/km', palette, inverse: true, format: paceSeconds, axis: { min: 240, max: 360, interval: 30 } })!;
    expect(option.yAxis.inverse).toBe(true);
    expect(option.yAxis).toMatchObject({ min: 240, max: 360, interval: 30 });
    // 面积填到轴最大值（慢）那一端，不是顶上。
    expect(option.series[0].areaStyle.origin).toBe('end');
    expect((option.yAxis.axisLabel as { formatter?: (v: number) => string }).formatter?.(330)).toBe('5\'30"');
    expect(option.tooltip.formatter([{ value: [0, 285] }])).toContain('<b>4\'45"</b> /km');
  });

  it('draws the given average, not the mean of the plotted points', () => {
    const option = lineOption(pts(200, 210, 3000), { color: '#0af', unit: '/km', palette, inverse: true, format: paceSeconds, average: 215 })!;
    expect(option.series[0].markLine.data[0].yAxis).toBe(215);
  });

  it('leaves other charts upright with plain numbers', () => {
    const option = lineOption(pts(120, 150), { color: '#f00', unit: 'bpm', palette })!;
    expect(option.yAxis.inverse).toBe(false);
    expect(option.series[0].areaStyle.origin).toBe('start');
    expect(option.tooltip.formatter([{ value: [0, 150] }])).toContain('<b>150</b> bpm');
  });

  it('rounds to whole seconds', () => {
    expect(paceSeconds(299.6)).toBe('5\'00"');
    expect(paceSeconds(61)).toBe('1\'01"');
  });
});

describe('withDetail', () => {
  const palette = { axis: '#888888', gridSoft: '#222', tooltipBg: '#000', tooltipBorder: '#111', tooltipText: '#fff', mark: '#666', surface: '#111' } as unknown as ChartPalette;
  const long = Array.from({ length: 80 }, (_, i) => ({ t: i * 60_000, v: 120 + (i % 10) }));
  const base = lineOption(long, { color: '#ff0000', unit: 'bpm', palette })!;
  const bands = [{ index: 1, low: null, high: 120 }, { index: 2, low: 120, high: 140 }, { index: 3, low: 140, high: 160 }];
  const zoneColor = (i: number) => ['#000000', '#111111', '#222222', '#333333'][i]!;
  type Rich = typeof base & { series: Array<Record<string, unknown>>; visualMap?: { pieces: Array<Record<string, unknown>> } };

  it('picks the tier from width and height', () => {
    expect(chartTier(400)).toBe('sm');
    expect(chartTier(600)).toBe('md');
    expect(chartTier(900)).toBe('lg');
    // 宽但矮：只到中档；窄而高：还是小档。
    expect(chartTier(900, 300)).toBe('md');
    expect(chartTier(380, 900)).toBe('sm');
  });

  it('adds detail as the card grows and never trims the workout', () => {
    expect(withDetail(base, 'sm', { color: '#ff0000', palette, bands })).toBe(base);
    const md = withDetail(base, 'md', { color: '#ff0000', palette, bands }) as Rich;
    expect(md.series[0].data).toBe(base.series[0].data);
    expect(md.xAxis.maxInterval).toBeLessThan(base.xAxis.maxInterval);
    expect((md.series[0].markLine as { label: { show: boolean } }).label.show).toBe(true);
    expect('markPoint' in md.series[0]).toBe(false);
    // 中档不画区间色带。
    expect(md.series[0].markArea).toBeUndefined();
    const noBands = withDetail(base, 'lg', { color: '#ff0000', palette }) as Rich;
    expect(noBands.series[0].markArea).toBeUndefined();
    expect(noBands.visualMap).toBeUndefined();
  });

  it('colours each visible heart-rate zone and keeps its name out of the plot', () => {
    const lg = withDetail(base, 'lg', { color: '#ff0000', palette, bands, zoneColor }) as Rich;
    const areas = (lg.series[0].markArea as { data: Array<[{ yAxis: number; name: string; itemStyle: { color: string } }, { yAxis: number }]>; label: { position: string } });
    // 数据 120–129：Z1（≤120）只碰到边，Z3（140+）不在范围里，只剩 Z2，夹到数据范围。
    expect(areas.data.map(([a]) => a.name)).toEqual(['Z2']);
    expect(areas.data[0][0].yAxis).toBe(120);
    expect(areas.data[0][1].yAxis).toBe(129);
    expect(areas.data[0][0].itemStyle.color).toBe('#2222221c');
    expect(areas.label.position).toBe('right');
    expect(lg.grid.right).toBeGreaterThan(base.grid.right);
    expect(lg.visualMap?.pieces).toEqual([{ gt: 120, lte: 140, color: '#222222' }]);
  });

  it('greys out pauses and marks the given extremes', () => {
    const lg = withDetail(base, 'lg', { color: '#ff0000', palette, pauses: [{ start: 60_000, end: 120_000 }], extremes: [{ t: 0, v: 121 }, { t: 60_000, v: 128 }] }) as Rich;
    const areas = lg.series[0].markArea as { data: Array<[{ xAxis: number }, { xAxis: number }]> };
    expect(areas.data).toEqual([[expect.objectContaining({ xAxis: 60_000 }), { xAxis: 120_000 }]]);
    expect((lg.series[0].markPoint as { data: unknown[] }).data).toEqual([{ coord: [0, 121], value: 121 }, { coord: [60_000, 128], value: 128 }]);
  });
});

describe('fitTicks', () => {
  const palette = { axis: '#888', gridSoft: '#222', tooltipBg: '#000', tooltipBorder: '#111', tooltipText: '#fff', mark: '#666' } as unknown as ChartPalette;
  const pace = lineOption(pts(200, 230), { color: '#0af', unit: '/km', palette, axis: { min: 190, max: 250, interval: 10 } })!;

  it('thins a crowded axis on whole multiples and keeps the range (stacked charts, 2026-11-14)', () => {
    const y = fitTicks(pace, 100).yAxis as { min: number; max: number; interval: number };
    expect(y).toMatchObject({ min: 190, max: 250 });
    expect(y.interval).toBe(30);
    expect(fitTicks(pace, 400)).toBe(pace);
  });

  it('only caps the split count when ECharts picks the range', () => {
    const free = lineOption(pts(120, 150), { color: '#f00', unit: 'bpm', palette })!;
    expect((fitTicks(free, 90).yAxis as unknown as { splitNumber: number }).splitNumber).toBe(2);
  });
});

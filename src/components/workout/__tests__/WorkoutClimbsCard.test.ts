import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import WorkoutClimbsCard from '../WorkoutClimbsCard.vue';
import type { ElevationRelief } from '../ElevationFacts.vue';
import type { SlopeShare } from '../../../lib/elevationProfile';
import type { ClimbSegment, WorkoutClimbs } from '../../../types';

const method = { smoothing_window_s: 30, reversal_m: 10, min_change_m: 30, min_grade_pct: 3, moving_speed_m_s: 0.5 };
const segment = (over: Partial<ClimbSegment>): ClimbSegment => ({
  kind: 'climb',
  start_time: '2026-05-23T07:50:00+00:00',
  end_time: '2026-05-23T08:25:00+00:00',
  start_distance_m: 1313,
  end_distance_m: 3316,
  elevation_change_m: 278.4,
  average_grade_pct: 13.9,
  moving_seconds: 2100,
  vertical_speed_m_per_h: 476.5,
  average_hr: 135.2,
  average_pace_min_per_km: 17.45,
  ...over,
});
const render = (climbs: WorkoutClimbs, cycling = false, relief: ElevationRelief | null = null, slope: SlopeShare | null = null) =>
  renderToString(createSSRApp({ render: () => h(WorkoutClimbsCard, { climbs, cycling, relief, slope }) }));
const text = (html: string) => html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('workout climbs card', () => {
  it('says there is no notable climb instead of inventing segments', async () => {
    const html = await render({ method, segments: [] });
    expect(html).toContain('class="flat"');
    expect(html).not.toContain('<li');
  });

  it('gives a flat ride the real relief instead of one lonely sentence (user 2026-11-14), and dashes what is missing', async () => {
    const flat = text(await render({ method, segments: [] }, false, { min: 7.2, max: 12.4, gain: 55, loss: null }));
    expect(flat).toContain('累计爬升 55 米');
    expect(flat).toContain('累计下降 —');
    expect(flat).toContain('最大落差 5 米');
    expect(flat).toContain('海拔范围 7–12 米');
    const noAltitude = text(await render({ method, segments: [] }, false, { min: null, max: null, gain: 55, loss: 60 }));
    expect(noAltitude).toContain('海拔范围 —');
    expect(noAltitude).toContain('落差和坡度都没到下面的门槛');
  });

  it('adds the time-by-slope bar and how it is worked out only when it could be computed', async () => {
    const withSlope = text(await render({ method, segments: [] }, false, null, { up: 120, flat: 360, down: 120, total: 600 }));
    expect(withSlope).toContain('上坡 20% 2:00');
    expect(withSlope).toContain('平地 60% 6:00');
    expect(withSlope).toContain('每走 50 米算一次坡度');
    const without = text(await render({ method, segments: [] }));
    expect(without).not.toContain('上坡');
    expect(without).not.toContain('每走 50 米');
  });

  it('renders each segment with signed change, grade, vertical speed and pace', async () => {
    const html = await render({ method, segments: [segment({}), segment({ kind: 'descent', start_time: 'b', elevation_change_m: -230, average_grade_pct: -20.2, average_hr: null })] });
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain('+278');
    expect(html).toContain('−230');
    expect(html).toContain('13.9%');
    expect(html).toContain('−20.2%');
    expect(html).toContain('477');
    expect(html).toContain('17&#39;27&quot;');
    // 缺心率写「—」，不补 0。
    expect(html).toMatch(/<dd[^>]*>—<\/dd>/);
  });

  it('shows speed rather than pace for rides', async () => {
    const html = await render({ method, segments: [segment({ average_pace_min_per_km: 2 })] }, true);
    expect(html).toContain('30.0');
    expect(html).not.toContain('2&#39;00&quot;');
  });
});

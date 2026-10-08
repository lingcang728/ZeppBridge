import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import WorkoutClimbsCard from '../WorkoutClimbsCard.vue';
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
const render = (climbs: WorkoutClimbs, cycling = false) =>
  renderToString(createSSRApp({ render: () => h(WorkoutClimbsCard, { climbs, cycling }) }));

describe('workout climbs card', () => {
  it('says there is no notable climb instead of inventing segments', async () => {
    const html = await render({ method, segments: [] });
    expect(html).toContain('class="flat"');
    expect(html).not.toContain('<li');
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

import { describe, expect, it } from 'vitest';
import { planIssueText } from '../issues';
import type { PlanIssue } from '../../../types/trainingPlan';

const issue = (message_code: string, params: Record<string, unknown> = {}, message = '后端兜底'): PlanIssue => ({
  severity: 'error', message, message_code, params,
});

describe('planIssueText', () => {
  it('按码取文案，把参数填进去', () => {
    const text = planIssueText(issue('ui.training_plan.issue.too_far', { date: '2026-12-31', days: 28 }));
    expect(text).toContain('28');
    expect(text).not.toContain('后端兜底');
  });

  it('写法提示用解析器真认的英文标识，不是中文词', () => {
    const sport = planIssueText(issue('ui.training_plan.issue.unknown_sport', { value: 'x' }));
    expect(sport).toContain('running');
    expect(sport).toContain('open_water_swim');
    const kind = planIssueText(issue('ui.training_plan.issue.unknown_kind', { value: 'x' }));
    expect(kind).toContain('warmup');
    expect(kind).toContain('cooldown');
  });

  it('不认识的码：回落到后端原文（中文界面）', () => {
    expect(planIssueText(issue('ui.training_plan.issue.brand_new', {}, '一条新规则'))).toBe('一条新规则');
  });

  it('缺参数不崩：空参数照样出一句话', () => {
    expect(planIssueText(issue('ui.training_plan.issue.hr_out_of_range', {}))).toBeTruthy();
    expect(planIssueText({ severity: 'unverified', message: '', message_code: 'ui.training_plan.issue.distance_unverified', params: undefined as never })).toBeTruthy();
  });
});

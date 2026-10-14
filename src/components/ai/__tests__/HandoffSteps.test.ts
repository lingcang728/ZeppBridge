/**
 * HandoffSteps 的 SSR 契约：三步各自如实显示状态；失败的 copy/open 可单独
 * 重试，prepare 失败不给重试按钮（它靠主 CTA 重跑——这是有意的不对称）。
 * 组件只 import type useAiTaskHandoff，本文件同样只用 type，不进它的模块图。
 */
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import HandoffSteps from '../HandoffSteps.vue';
import type { HandoffStep, HandoffStepId } from '../../../composables/useAiTaskHandoff';

const step = (state: HandoffStep['state'] = 'idle', errorText: string | null = null): HandoffStep => ({
  state,
  errorText,
});

const steps = (patch: Partial<Record<HandoffStepId, HandoffStep>> = {}): Record<HandoffStepId, HandoffStep> => ({
  prepare: patch.prepare ?? step(),
  copy: patch.copy ?? step(),
  open: patch.open ?? step(),
});

const render = (value: Record<HandoffStepId, HandoffStep>, providerLabel = 'Claude') =>
  renderToString(createSSRApp(HandoffSteps, { steps: value, providerLabel }));

const count = (html: string, re: RegExp): number => (html.match(re) ?? []).length;

describe('HandoffSteps', () => {
  it('全部 idle：三行、零按钮、状态如实', async () => {
    const html = await render(steps());
    expect(count(html, /<li[\s>]/g)).toBe(3);
    expect(count(html, /class="step is-idle"/g)).toBe(3);
    expect(count(html, /<button/g)).toBe(0);
    expect(html).toContain('未开始');
    // open 行的名字跟着 providerLabel 走。
    expect(html).toContain('Claude');
  });

  it('copy 失败：恰好 1 个重试按钮，errorText 顶掉状态文案', async () => {
    const html = await render(steps({ copy: step('failed', 'clipboard dead') }));
    expect(count(html, /<button/g)).toBe(1);
    expect(html).toContain('clipboard dead');
    expect(html).toContain('class="step is-failed"');
    expect(html).toContain('重试');
  });

  it('open 失败同样可重试', async () => {
    const html = await render(steps({ open: step('failed', 'no opener') }));
    expect(count(html, /<button/g)).toBe(1);
    expect(html).toContain('no opener');
  });

  it('prepare 失败不给重试按钮——它由主 CTA 重跑', async () => {
    const html = await render(steps({ prepare: step('failed', 'disk full') }));
    expect(count(html, /<button/g)).toBe(0);
    expect(html).toContain('disk full');
    expect(html).toContain('class="step is-failed"');
  });

  it('三步全败：只有 copy/open 两枚重试按钮', async () => {
    const html = await render(steps({
      prepare: step('failed', 'p'),
      copy: step('failed', 'c'),
      open: step('failed', 'o'),
    }));
    expect(count(html, /<button/g)).toBe(2);
  });

  it('完成态打 is-done；blocked/skipped 如实进 class，不给重试', async () => {
    const html = await render(steps({
      prepare: step('done'),
      copy: step('done'),
      open: step('skipped'),
    }));
    expect(count(html, /class="step is-done"/g)).toBe(2);
    expect(html).toContain('class="step is-skipped"');
    expect(count(html, /<button/g)).toBe(0);
  });
});

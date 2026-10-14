import type { Chapter } from '../types';
import { JOURNEY } from '../../journeyCopy';
import { page } from './look';

/**
 * 第四章 交给 AI（计划 4.1–4.4）：挑 AI（免费 / 订阅跟着走）、自己写问题、长按发出去 → 演示对话 →
 * AI 给出计划 → 一键复制、接回定稿 → 计划落到周视图 → 点进一天改名、换运动类型、加一组 → 长按发到手表。
 * 演示对话本身是合成的示例（DemoConversation），影片里用 presentation.pace() 压快。
 */
const SEND = 'button.lock:not(:disabled)';

export const ai: Chapter = {
  id: 'ai',
  label: 'chapterAi',
  shots: [
    {
      // 4.1 复用已有订阅，不多花一分钱：选择 AI 的滚轮转过几家，徽章跟着显示「免费版 / 订阅版」。
      id: 'providers', ms: 5600, pose: 'full', caption: 'subscription',
      async run(d) {
        await page(d, '/ai');
        const wheel = await d.find('.lock-wheel');
        await d.camera(wheel, { zoom: 2.2, fill: 0.7, ms: 600, hold: 100 });
        for (const index of [1, 2, 3, 0]) {
          const item = wheel.querySelector<HTMLElement>(`.wheel-item[data-wheel-index="${index}"]`);
          if (item) await d.tap(item, { after: 520, travel: 220 });
        }
      },
    },
    {
      // 4.2 问什么，你说了算：意图滚轮挑一个，再自己写一句。
      id: 'prompt', ms: 6200, pose: 'full', caption: 'prompt',
      async run(d) {
        await d.camera('.fcard', { zoom: 1.6, fill: 0.85, ms: 600, hold: 100 });
        const intents = d.all('.intent-wheel .wheel-item');
        if (intents[1]) await d.tap(intents[1], { after: 500 });
        const field = d.all('.fcard textarea, .fcard input')[0];
        if (field) await d.type(field, JOURNEY[d.locale].turns[1]!.prompt, { replace: true, perChar: 30 });
        await d.camera(null, { ms: 500, hold: 200 });
      },
    },
    {
      // 4.3 一键复制，一键粘回：长按发出 → 和 AI 来回几轮 → 给出计划 → 复制 → 回到 ZeppBridge 接回定稿。
      id: 'chat', ms: 11500, pose: 'full', caption: 'coach',
      async run(d) {
        d.api.pace(0.2);
        await d.hold(SEND, 1150, { after: 900 }); // BridgeLock 按满 950ms 才发射
        await d.tap('dialog[open] .conversation-send', { after: 300 });
        // 对话自己往下走，等它走到「接回」那一步。
        const dialog = await d.find('dialog[open].demo-conversation') as HTMLDialogElement;
        for (let n = 0; n < 160 && dialog.open && !['return'].includes(dialog.dataset.state ?? ''); n++) await d.clock.wait(80);
        await d.find('.week-panel, .future-day', { limit: 8000 });
      },
    },
    {
      // 4.4 计划由你，落笔成训：点进一天，改名、换成跑步机、加一组间歇；回到一周，长按发到手表。
      id: 'plan', ms: 8600, pose: 'full', caption: 'plan',
      async run(d) {
        await d.cut(async () => { await d.clear(); await d.go('/ai/plan', 200); });
        await d.tap(await d.find('a.future-day:not(.rest)', { index: 0 }), { after: 700 });
        const name = d.all('.main-content .page input.ai-input')[0];
        if (name) await d.type(name, ' · 40′', { perChar: 60 });
        const treadmill = d.all('.main-content .page .segment-track')[1]?.querySelectorAll<HTMLElement>('.segment-item')[1];
        if (treadmill) await d.tap(treadmill, { after: 450 });
        const add = d.all('.main-content .page button.add')[2];
        if (add) await d.tap(add, { after: 700 });
        await d.go('/ai/plan', 400);
        await d.hold('.main-content .page button.hold-button', 1000, { after: 900 });
      },
    },
  ],
};

import type { PlaybackClock } from './playback';
import type { DemoPresentation } from '../../demo/presentation';
import type { LandingLocale } from '../../composables/useLandingLocale';
import { P4_COPY } from './p4Copy';

export const REEL_IDS = ['glass', 'poker', 'seasons', 'notes', 'box'] as const;
export type ReelId = typeof REEL_IDS[number];
export const reelRoute = (id: string) => ['ai', 'receive', 'prompt'].includes(id) ? '/ai' : ['plan-edit', 'templates', 'easy'].includes(id) ? '/ai/plan' : id === 'sleep' ? '/sleep' : id === 'workouts' ? '/workouts' : id === 'settings' ? '/settings' : '/';
/** 「问什么，你说了算」一镜里逐字打进去的问题：按演示窗口的界面语言取 P4 文案，没有译文的语言用英文。 */
const promptFor = (lang: string) => (P4_COPY[lang as LandingLocale] ?? P4_COPY[lang.split('-')[0] as LandingLocale] ?? P4_COPY.en!).demoPrompt;
export const reelSize = (_id?: string) => ({ width: 1280, height: 800 });
export interface ReelView {
  focus(el: Element | null, zoom?: number): void;
  pointer(x: number, y: number, pressed: boolean): void;
  beat(name: string): void;
}

export async function runReel(view: Window, id: string, clock: PlaybackClock, stage: ReelView): Promise<void> {
  const api = view.__ZB_PRESENTATION__ as DemoPresentation;
  if (!api) throw new Error('Demo presentation is not ready');
  const doc = view.document;
  // Shorten reading/idle beats, not input thresholds or pointer trajectories.
  const wait = (ms: number) => clock.wait(ms * 0.45);
  const settle = async () => {
    for (let elapsed = 0; elapsed < 1800; elapsed += 50) {
      const moving = doc.getAnimations().some(animation => {
        const timing = animation.effect?.getComputedTiming();
        return animation.playState === 'running' && timing?.iterations === 1 && Number(timing.endTime) <= 3000;
      });
      if (!moving) return;
      await clock.wait(50);
    }
  };
  const find = async (selector: string, limit = 12000): Promise<HTMLElement> => {
    for (let elapsed = 0; elapsed < limit; elapsed += 80) {
      await clock.checkpoint();
      const el = [...doc.querySelectorAll<HTMLElement>(selector)].find(item => item.getBoundingClientRect().width > 0 && !item.closest('[inert], .pending'));
      if (el) return el;
      await clock.wait(80);
    }
    throw new Error(`Presentation target unavailable: ${selector}`);
  };
  const point = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  const tap = async (selector: string | Element, after = 850) => {
    await clock.checkpoint();
    await settle();
    const el = typeof selector === 'string' ? await find(selector) : selector;
    await scrollTo(el);
    const { x, y } = point(el); stage.pointer(x, y, false); await wait(320);
    stage.pointer(x, y, true); api.click(el); await wait(160); stage.pointer(x, y, false); await wait(after);
    return el;
  };
  const blank = async () => {
    const el = await find('.table-backdrop:not(.deep)');
    const x = 38, y = 680;
    stage.pointer(x, y, false); await wait(320); stage.pointer(x, y, true);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    await wait(160); stage.pointer(x, y, false); await wait(1500);
  };
  const scroll = async (end: number) => {
    const main = doc.querySelector<HTMLElement>('.main-content');
    if (!main) return;
    const start = main.scrollTop;
    const target = Math.max(0, Math.min(end, main.scrollHeight - main.clientHeight));
    for (let i = 1; i <= 24; i++) { main.scrollTop = start + (target - start) * (1 - (1 - i / 24) ** 3); await clock.wait(16); }
  };
  const scrollTo = async (el: Element) => {
    const main = doc.querySelector<HTMLElement>('.main-content');
    if (!main || !main.contains(el)) return;
    const rect = el.getBoundingClientRect(), area = main.getBoundingClientRect();
    if (rect.bottom > area.bottom - 40 || rect.top < area.top + 40) {
      await scroll(main.scrollTop + rect.top - area.top - 90);
    }
  };
  const go = async (path: string) => {
    await clock.checkpoint();
    await settle();
    await api.go(path); await find('.main-content');
    const main = doc.querySelector<HTMLElement>('.main-content'); if (main) main.scrollTop = 0;
    await wait(750); await settle();
  };
  const focus = async (el: Element | null, zoom = 1.5) => { stage.focus(el, zoom); await wait(850); };
  const openTable = async () => {
    await go('/');
    const card = await find('.sleep-panel'); await scrollTo(card);
    await tap(card);
    // The sleep-card morph temporarily clones the page. Wait before targeting its button.
    await settle();
    stage.focus(null);
    await tap('button.pick-days', 800);
    await find('.card-table .segment-item');
    await tap(doc.querySelectorAll('.card-table .segment-item')[0]!, 800);
    await settle();
  };
  const drag = async (el: Element, dx: number, dy: number, duration: number) => {
    const from = point(el); stage.pointer(from.x, from.y, false); await wait(400);
    api.pointer(el, 'pointerdown', from.x, from.y); stage.pointer(from.x, from.y, true);
    try {
      await clock.wait(100);
      const steps = Math.ceil(duration / 16);
      for (let i = 1; i <= steps; i++) {
        const t = (1 - Math.cos(Math.PI * i / steps)) / 2;
        const x = from.x + dx * t, y = from.y + dy * t;
        api.pointer(el, 'pointermove', x, y); stage.pointer(x, y, true); await clock.wait(duration / steps);
      }
      await clock.wait(100);
      api.pointer(el, 'pointerup', from.x + dx, from.y + dy);
      stage.pointer(from.x + dx, from.y + dy, false); await wait(1100);
    } finally { api.pointer(el, 'pointercancel', from.x, from.y); }
  };
  const openSetting = async (card: string) => {
    await go('/settings');
    if (doc.querySelector('.deck-unbox')) await tap('.deck-unbox', 800);
    await tap(`[data-deck-card="${card}"] .list-open`, 900);
    await find('.open-card .deck-body'); await settle();
  };
  const hover = async (el: Element, ms = 1500) => {
    await scrollTo(el); const at = point(el); stage.pointer(at.x, at.y, false);
    api.pointer(el, 'pointerenter', at.x, at.y); await wait(ms);
    api.pointer(el.closest('.plan-strip') ?? el, 'pointerleave', at.x, at.y);
  };

  api.pause(false); api.glass(id === 'glass'); api.rate(1.5); api.pace(0.4);
  for (let n = 0; n < 4 && doc.querySelector('[data-modal-dialog], .card-table, .box-spread, .anchored-popover, dialog[open]'); n++) { api.escape(); await wait(350); }
  stage.focus(null); stage.beat('start');
  if (id === 'glass') {
    await go('/'); await wait(1100);
    const track = await find('nav.bottom-nav .segment-track');
    await focus(track, 2.1); stage.beat('lens');
    const items = track.querySelectorAll<HTMLElement>('.segment-item');
    const distance = point(items[2]!).x - point(items[0]!).x;
    await drag(items[0]!, distance, 0, 2600);
    stage.beat('return-lens');
    await drag(items[2]!, -distance, 0, 2200);
    stage.beat('quick-tabs');
    await tap(items[1]!, 220); await tap(items[2]!, 220); await tap(items[0]!, 220);
    await focus(null); stage.beat('complete'); return;
  }
  if (id === 'poker') {
    await openTable(); stage.beat('days');
    const days = [...doc.querySelectorAll('.table-layer:last-child button.pcard.day:not(.disabled)')];
    for (const card of days.slice(0, 3)) {
      await focus(card, 1.35); await tap(card, 900);
    }
    await focus(null);
    await tap(doc.querySelectorAll('.card-table .segment-item')[2]!, 1100); stage.beat('months');
    await find('.table-layer:last-child .pcard.month:not(.empty)'); await settle();
    const months = doc.querySelectorAll('.table-layer:last-child .pcard.month:not(.empty)');
    await tap(months[months.length - 1]!, 1100);
    await find('.table-layer:last-child .pcard.week:not(.empty)'); await settle(); stage.beat('month-open'); await wait(1300);
    const weeks = doc.querySelectorAll('.table-layer:last-child .pcard.week:not(.empty)');
    await tap(weeks[Math.min(1, weeks.length - 1)]!, 1100);
    await find('.table-layer:last-child .pcard.day'); await settle(); stage.beat('week-open'); await wait(1600);
    await tap('.table-layer:last-child .pcard.day:not(.disabled)', 900);
    await tap('.pcard.confirm .back-send', 1000); stage.beat('collected');
    await tap('.table-head button.table-icon:not([data-table-close])', 900); stage.beat('back-month');
    await tap('.table-head button.table-icon:not([data-table-close])', 900); stage.beat('back-months');
    await blank(); await tap('#card-collection-box:not(.empty)', 1100);
    await find('.box-spread'); stage.beat('collection'); await wait(2000); api.escape();
    stage.beat('complete'); return;
  }
  if (id === 'seasons') {
    await go('/');
    if (doc.querySelector('.pins-edit')) {
      await tap('.pins-edit', 300); await tap('.pp-actions .secondary', 200); await tap('.pp-actions .primary', 700);
    }
    stage.beat('0'); await focus(await find('.pins'), 1.5); await wait(1000);
    await tap('.pins-empty', 700); await focus(await find('.pp'), 1.2);
    const chips = [...doc.querySelectorAll<HTMLElement>('.pp-chip')];
    for (const index of [0, 1, 2, 3]) { await tap(chips[index]!, 900); stage.beat(String(index + 1)); }
    await tap('.pp-actions .primary', 1400); await focus(await find('.pins'), 1.5); await wait(1700);
    await tap('.pins-edit', 850); await focus(await find('.pp'), 1.2);
    for (let n = 4; n > 0; n--) { await tap('.pp-slot.filled .pp-remove:not(:disabled)', 850); stage.beat(String(n - 1)); }
    await tap('.pp-actions .primary', 1000); await focus(await find('.pins'), 1.4); await wait(1200);
    stage.beat('complete'); return;
  }
  if (id === 'notes') {
    await go('/'); const sleep = await find('.sleep-panel'); await scrollTo(sleep); await tap(sleep, 1000);
    const help = await find('.hero-duration .metric-info'); await focus(help, 1.4); await tap(help, 1800);
    stage.beat('note'); api.escape(); await wait(700); await openTable();
    const card = await find('.card-table button.pcard.day:not(.disabled)');
    await focus(card, 1.3); stage.beat('drag'); await drag(card, 0, -90, 1100);
    await focus(null); await blank(); stage.beat('complete'); return;
  }
  if (id === 'box') {
    await openTable(); await tap('.card-table button.pcard.day:not(.disabled)', 1000);
    await tap('.pcard.confirm .back-send', 1300); stage.beat('collected');
    const box = await find('#card-collection-box:not(.empty)'); await focus(box, 1.3); await tap(box, 1400);
    await focus(await find('.box-spread'), 1.1); await wait(1500);
    const buttons = doc.querySelectorAll('.spread-foot .foot-button');
    if (buttons.length) await tap(buttons[buttons.length - 1]!, 1000); else api.escape();
    await focus(null); stage.beat('complete'); return;
  }
  if (id === 'morph') {
    await go('/'); await tap('a.sleep-panel[href]', 1600); stage.beat('expand');
    await tap('.hero-duration .metric-info', 1800); api.escape(); await wait(500);
    await tap('.quick-back', 1600);
    if (view.location.pathname !== '/') await go('/');
    await find('.overview-page'); stage.beat('return'); await wait(1600);
  } else if (id === 'theme') {
    await go('/'); const initial = doc.documentElement.dataset.theme;
    const items = doc.querySelectorAll('.theme-toggle .segment-item');
    for (const index of [1, 0]) { await tap(items[index]!, 1900); stage.beat(index ? 'day' : 'night'); }
    await tap(items[initial === 'light' ? 1 : 0]!, 600);
  } else if (id === 'account') {
    await openSetting('advanced');
    const summary = await find('#connection summary'); await tap(summary, 700);
    await scrollTo(await find('#connection .auth-icon')); stage.beat('authorization'); await wait(2500);
    await go('/settings/account'); await find('#account-section'); await wait(2400);
    await go('/'); await tap('.sync-pill', 2400); stage.beat('synced'); await wait(1600);
  } else if (id === 'sync') {
    await openSetting('sync'); const track = await find('.open-card .segment-track'); await focus(track, 1.4);
    const items = track.querySelectorAll('.segment-item');
    for (const index of [0, 1, 2, 3, 1]) { await tap(items[index]!, 1000); stage.beat(`sync-${index}`); }
    await focus(null);
  } else if (id === 'devices') {
    await openSetting('account'); await scrollTo(await find('a.device-row'));
    await tap('a.device-row', 900); await find('.main-content .page button.button.primary');
    await tap('.main-content .page button.button.primary', 1000);
    const next = doc.querySelectorAll('.picker-arrow')[1];
    if (!next) throw new Error('Device model picker unavailable');
    await scrollTo(next); stage.beat('identify');
    for (let n = 0; n < 3; n++) await tap(next, 1100);
  } else if (id === 'local') {
    await openSetting('archive');
    const track = await find('.open-card .segment-track'); const items = track.querySelectorAll('.segment-item');
    await tap(items[items.length - 1]!, 1600); stage.beat('retain');
    await go('/settings/privacy'); await find('#privacy-section'); await wait(2300);
    await scroll(430); await wait(1600);
  } else if (id === 'hourly') {
    await go('/'); await tap('a[href="/activity"]', 1200); await find('.hourly-card');
    await scrollTo(await find('.hourly-card')); stage.beat('hourly'); await wait(2200);
    await scroll(650); await wait(1800); await scroll(0);
  } else if (id === 'gaps') {
    await openTable(); await tap(doc.querySelectorAll('.card-table .segment-item')[1]!, 900);
    await find('.pcard.week'); await settle();
    const weeks = doc.querySelectorAll('.pcard.week:not(.empty)'); await tap(weeks[Math.min(3, weeks.length - 1)]!, 1000);
    const gap = await find('.table-layer:last-child .pcard.day.disabled'); await settle();
    await focus(gap, 1.5); stage.beat('missing'); await wait(2800); await focus(null); await blank();
  } else if (id === 'prompt') {
    await go('/ai'); const intents = doc.querySelectorAll('.intent-wheel .wheel-item');
    if (intents[1]) await tap(intents[1], 900);
    const field = await find('.fcard textarea') as HTMLTextAreaElement;
    await tap(field, 300);
    const text = promptFor(doc.documentElement.lang);
    field.value = ''; const EventType = (view as Window & typeof globalThis).Event;
    for (const char of text) { field.value += char; field.dispatchEvent(new EventType('input', { bubbles: true })); await clock.wait(35); }
    stage.beat('custom-question'); await wait(2500);
  } else if (id === 'events') {
    await go('/'); await tap('#life-events .le-head .pill-button', 1000);
    const dialog = await find('[data-modal-dialog]'); stage.beat('context');
    const items = dialog.querySelectorAll('.segment-item');
    for (const index of [0, 1]) if (items[index]) await tap(items[index]!, 1500);
    await wait(1800); api.escape();
  } else if (id === 'autopaste') {
    await openSetting('ai');
    // 按稳定属性找，不按读屏名：读屏名随界面语言变，英文页上这一镜会找不到开关而报错。
    const toggle = await find('[data-setting="auto-paste"]');
    await scrollTo(toggle); stage.beat('default-off'); await wait(1800);
    await tap(toggle, 2200); stage.beat('enabled'); await tap(toggle, 1000);
  } else if (id === 'templates') {
    await go('/ai/plan'); await tap('a.future-day:not(.rest)', 900);
    await tap('.day-nav button.nav-button', 800); stage.beat('save-template');
    await tap('.pop-panel .menu-item', 1000);
    await tap('.day-nav button.nav-button', 900); await find('.template-row'); stage.beat('library'); await wait(2300);
    await tap('.template-row .menu-item', 1400); stage.beat('reuse'); await wait(1600);
  } else if (id === 'easy') {
    await go('/ai/plan'); const swap = await find('.easy-swap .pill-button:not(.quiet)');
    await scrollTo(swap); stage.beat('low-recovery'); await wait(2200);
    await tap(swap, 1400); stage.beat('easy-draft'); await wait(2200);
    await tap('a.future-day.today', 900); await find('.workout-editor'); await wait(2300);
  } else if (['ai', 'receive', 'plan-edit'].includes(id)) {
    if (id !== 'plan-edit') {
    await go('/ai'); await wait(600);
    if (id === 'ai') {
      const providers = [...doc.querySelectorAll('.lock-wheel .wheel-item')];
      for (const item of providers.slice(1)) await tap(item, 350);
      if (providers[0]) await tap(providers[0], 600);
    }
    const send = await find('button.lock:not(:disabled)');
    const pos = point(send); stage.pointer(pos.x, pos.y, true); stage.beat('send');
    api.pointer(send, 'pointerdown', pos.x, pos.y);
    try { await clock.wait(1150); } finally {
      api.pointer(send, 'pointerup', pos.x, pos.y); stage.pointer(pos.x, pos.y, false);
    }
    await tap('dialog[open] .conversation-send', 350); stage.beat('conversation');
    await find('.week-panel', 60000); await wait(1400);
    } else { await go('/ai/plan'); await find('.week-panel'); }
    stage.focus(null); stage.beat('plan'); await settle();
    const day = await find('a.future-day:not(.rest)'); await scrollTo(day); await wait(1800);
    await tap(day, 900); await find('.workout-editor'); stage.beat('plan-day'); await wait(1000);
    const strip = await find('.workout-editor .plan-strip'); await scrollTo(strip);
    const bars = [...strip.querySelectorAll<HTMLElement>('.bar')];
    for (const bar of bars.slice(0, 3)) {
      stage.beat('plan-hover'); await hover(bar);
    }
    await tap('.workout-editor .step-head', 900);
    await find('.step-body'); stage.beat('plan-step'); await scrollTo(await find('.step-body')); await wait(2000);
    if (id === 'plan-edit') {
      const wheels = doc.querySelectorAll('.step-body .wheel-col');
      if (wheels[0]) await drag(wheels[0], 0, -36, 450);
      const tracks = doc.querySelectorAll('.step-body .segment-track');
      const targets = tracks[1]?.querySelectorAll('.segment-item');
      if (targets?.[1]) await tap(targets[1], 1200);
    }
    await tap('.workout-editor .step-head', 600);
    await go('/ai/plan'); await find('.future-days'); stage.beat('plan-arrange');
    const cells = [...doc.querySelectorAll('a.future-day')];
    if (cells.length >= 2) {
      const from = point(cells[0]!), to = point(cells[1]!);
      await drag(cells[0]!, to.x - from.x, to.y - from.y, 650);
    }
    await wait(1800);
    if (id === 'plan-edit') {
      const publish = await find('button.hold-button:not(:disabled)'); const at = point(publish); await scrollTo(publish);
      stage.beat('send-watch'); api.pointer(publish, 'pointerdown', at.x, at.y); stage.pointer(at.x, at.y, true);
      try { await clock.wait(1000); } finally { api.pointer(publish, 'pointerup', at.x, at.y); stage.pointer(at.x, at.y, false); }
      await wait(2600);
    }
  } else if (id === 'overview') {
    await go('/'); await find('.dashboard-grid'); stage.beat('trends'); await wait(1200);
    const choices = doc.querySelectorAll('.overview-focus .segment-item');
    for (const index of [1, 2, 0]) if (choices[index]) await tap(choices[index]!, 1000);
    await scroll(500); await wait(1500); await scroll(1050); await wait(1500);
    await scroll(0); await wait(900);
    await tap('a.hr-panel[href]', 1100); stage.beat('detail');
    await find('.main-content .page'); await scroll(520); await wait(1700);
    await scroll(1050); await wait(1500); await scroll(0); await wait(900);
    await go('/'); stage.focus(null); await wait(1400);
  } else if (id === 'sleep') {
    await go('/sleep'); await wait(1000); await tap('.record-list a[href]', 1100); stage.beat('detail');
    await find('.sleep-hero'); await wait(1200);
    const help = await find('.hero-duration .metric-info'); await tap(help, 1800);
    api.escape(); await wait(500); stage.beat('stages');
    await scrollTo(await find('.stage-card')); await wait(1600);
    await scrollTo(await find('.weekly-sleep-chart')); stage.beat('weekly'); await wait(1800);
    await scroll(0); await wait(900);
    await go('/sleep'); stage.focus(null);
  } else if (id === 'workouts') {
    await go('/workouts'); await wait(1000); await tap('.record-list a[href]', 1100); stage.beat('detail');
    await find('.insight-card'); await wait(1400);
    // Keep the full width: the comparison needs all three columns in view.
    await scrollTo(await find('.insight-card')); stage.beat('comparison'); await wait(2000);
    await scroll(1000); stage.beat('charts'); await wait(1800);
    await scroll(1550); await wait(1600); await scroll(0); await wait(900);
    await go('/workouts'); stage.focus(null);
  } else if (id === 'settings') {
    await go('/settings'); await find('.card-deck'); stage.beat('card-pack');
    if (doc.querySelector('.deck-unbox')) await tap('.deck-unbox', 800);
    await scrollTo(await find('.deck-collapse')); await tap('.deck-collapse', 1100);
    await scrollTo(await find('.cover-stage')); stage.beat('large-cards'); await wait(1700);
    await drag(await find('.cover-card.centered'), -260, 0, 650); await wait(1000);
    await tap('.cover-card.centered .cover-hit', 900); await find('.open-card'); await wait(1500);
    await tap('.deck-close', 800); await tap('.deck-unbox', 1000); stage.beat('card-pack');
    // Visit every group through its real card, preserving the wallet expansion.
    const ids = [...doc.querySelectorAll<HTMLElement>('.list-card[data-deck-card]')].map(el => el.dataset.deckCard!);
    for (const cardId of ids) {
      await tap(`[data-deck-card="${cardId}"] .list-open`, 850);
      await find('.open-card .deck-body'); stage.beat(`settings-${cardId}`); await wait(1600);
      if (['sync', 'ai', 'display'].includes(cardId)) {
        const tracks = [...doc.querySelectorAll('.open-card .segment-track')];
        const track = tracks[cardId === 'display' ? 1 : 0];
        const items = track?.querySelectorAll<HTMLElement>('.segment-item');
        if (items && items.length > 1) {
          const selected = track?.querySelector('.segment-item[aria-checked="true"], .segment-item[aria-pressed="true"]');
          await tap(items[1]!, 1000);
          if (selected) await tap(selected, 500);
        }
      }
      if (['account', 'ai', 'advanced', 'data'].includes(cardId)) { await scroll(520); await wait(1200); }
      await tap('.deck-close', 650); await settle();
    }
    await scroll(0); await wait(1200);
  }
  else throw new Error(`Unknown story ${id}`);
  stage.beat('complete');
}

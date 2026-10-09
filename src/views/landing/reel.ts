import type { PlaybackClock } from './playback';
import type { DemoPresentation } from '../../demo/presentation';

export const REEL_IDS = ['glass', 'poker', 'seasons', 'notes', 'box'] as const;
export type ReelId = typeof REEL_IDS[number];
export const reelRoute = (id: string) => id === 'ai' ? '/ai' : id === 'sleep' ? '/sleep' : id === 'workouts' ? '/workouts' : id === 'settings' ? '/settings' : '/';
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
  const wait = (ms: number) => clock.wait(ms);
  const find = async (selector: string, limit = 12000): Promise<HTMLElement> => {
    for (let elapsed = 0; elapsed < limit; elapsed += 80) {
      await clock.checkpoint();
      const el = [...doc.querySelectorAll<HTMLElement>(selector)].find(item => item.getBoundingClientRect().width > 0);
      if (el) return el;
      await wait(80);
    }
    throw new Error(`Presentation target unavailable: ${selector}`);
  };
  const point = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  const tap = async (selector: string | Element, after = 850) => {
    await clock.checkpoint();
    const el = typeof selector === 'string' ? await find(selector) : selector;
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
  const scrollTo = async (el: Element) => {
    const main = doc.querySelector<HTMLElement>('.main-content');
    if (!main || !main.contains(el)) return;
    const rect = el.getBoundingClientRect(), area = main.getBoundingClientRect();
    if (rect.bottom > area.bottom - 40 || rect.top < area.top + 40) {
      const start = main.scrollTop, end = start + rect.top - area.top - 90;
      for (let i = 1; i <= 24; i++) { main.scrollTop = start + (end - start) * (1 - (1 - i / 24) ** 3); await wait(20); }
    }
  };
  const go = async (path: string) => {
    await clock.checkpoint();
    await api.go(path); await find('.main-content');
    const main = doc.querySelector<HTMLElement>('.main-content'); if (main) main.scrollTop = 0;
    await wait(750);
  };
  const focus = async (el: Element | null, zoom = 1.5) => { stage.focus(el, zoom); await wait(850); };
  const openTable = async () => {
    await go('/');
    const card = await find('.sleep-panel'); await scrollTo(card);
    await focus(card, 1.2); await tap(card);
    await focus(await find('button.pick-days'), 1.3);
    await tap('button.pick-days', 1300); stage.focus(null);
    await find('.card-table .segment-item');
    await tap(doc.querySelectorAll('.card-table .segment-item')[0]!, 1300);
  };
  const drag = async (el: Element, dx: number, dy: number, duration: number) => {
    const from = point(el); stage.pointer(from.x, from.y, false); await wait(400);
    api.pointer(el, 'pointerdown', from.x, from.y); stage.pointer(from.x, from.y, true);
    try {
      await wait(380);
      const steps = Math.ceil(duration / 16);
      for (let i = 1; i <= steps; i++) {
        const t = (1 - Math.cos(Math.PI * i / steps)) / 2;
        const x = from.x + dx * t, y = from.y + dy * t;
        api.pointer(el, 'pointermove', x, y); stage.pointer(x, y, true); await wait(duration / steps);
      }
      await wait(500);
      api.pointer(el, 'pointerup', from.x + dx, from.y + dy);
      stage.pointer(from.x + dx, from.y + dy, false); await wait(1100);
    } finally { api.pointer(el, 'pointercancel', from.x, from.y); }
  };

  api.pause(false); api.glass(id === 'glass');
  for (let n = 0; n < 4 && doc.querySelector('[data-modal-dialog], .card-table, .box-spread, .anchored-popover, dialog[open]'); n++) { api.escape(); await wait(350); }
  stage.focus(null); stage.beat('start');
  if (id === 'glass') {
    await go('/'); await wait(1100);
    const track = await find('nav.bottom-nav .segment-track');
    await focus(track, 2.1); stage.beat('lens');
    const items = track.querySelectorAll<HTMLElement>('.segment-item');
    await drag(items[0]!, 46, 0, 1500);
    await tap(items[1]!, 1600); await tap(items[2]!, 1600); await tap(items[0]!, 1500);
    await drag(items[0]!, -28, 0, 1100);
    await focus(null); stage.beat('complete'); return;
  }
  if (id === 'poker') {
    await openTable(); stage.beat('7'); await wait(1100);
    const card = await find('.card-table button.pcard.day:not(.disabled)');
    await tap(card, 1300);
    for (const [index, label] of [[1, '30'], [2, '180'], [1, '30'], [0, '7']] as const) {
      await tap(doc.querySelectorAll('.card-table .segment-item')[index]!, 1850); stage.beat(label);
    }
    await wait(800); await blank(); stage.beat('complete'); return;
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
  if (id === 'ai') {
    await go('/ai'); await wait(600);
    const send = await find('button.lock:not(:disabled)');
    const pos = point(send); stage.pointer(pos.x, pos.y, true); stage.beat('send');
    api.pointer(send, 'pointerdown', pos.x, pos.y); await wait(700);
    api.pointer(send, 'pointerup', pos.x, pos.y); stage.pointer(pos.x, pos.y, false);
    await tap('dialog[open] .conversation-send', 350); stage.beat('conversation');
    await find('.week-panel', 60000); await wait(1400);
    stage.focus(null); stage.beat('plan'); await wait(2500);
  } else if (id === 'overview') {
    await go('/'); const tile = await find('.pin-tile'); await focus(tile, 1.35); await tap(tile, 1700);
    const range = doc.querySelectorAll('.page .segment-item');
    if (range.length >= 3) { await tap(range[1]!, 1300); await tap(range[2]!, 1300); }
    await go('/'); stage.focus(null); await wait(1400);
  } else if (id === 'sleep') {
    await go('/sleep'); await tap('.record-list a', 1400);
    const help = await find('.hero-duration .metric-info'); await focus(help, 1.4); await tap(help, 2000);
    api.escape(); await wait(700); const chart = await find('.stage-card'); await scrollTo(chart); await focus(chart, 1.2); await wait(1800);
    await go('/sleep'); stage.focus(null);
  } else if (id === 'workouts') {
    await go('/workouts'); await tap('.record-list a', 1600);
    const chart = await find('.workout-hero, .page-heading'); await focus(chart, 1.3); await wait(1300);
    const main = doc.querySelector<HTMLElement>('.main-content');
    if (main) { const start = main.scrollTop; for (let i = 1; i <= 30; i++) { main.scrollTop = start + 340 * (1 - (1 - i / 30) ** 3); await wait(25); } }
    await wait(1600); await go('/workouts'); stage.focus(null);
  } else if (id === 'settings') { await go('/settings'); await wait(2500); }
  else throw new Error(`Unknown story ${id}`);
  stage.beat('complete');
}

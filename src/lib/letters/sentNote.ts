/**
 * 信纸折成纸飞机飞走以后，在信件按钮（打开信纸的那个控件）底下冒一句「已寄出」/「离线了，联网后自动补寄」，
 * 停两秒淡掉。按钮不在屏幕里就贴在窗口顶部正中。读屏通过 role="status" 念出来。只动 transform / opacity。
 */
import { lessMotion } from '../motion/lessMotion';

const HOLD_MS = 2200;

export function showSentNote(text: string, origin: HTMLElement | null): void {
  const note = document.createElement('div');
  note.setAttribute('role', 'status');
  note.textContent = text;
  Object.assign(note.style, {
    position: 'fixed', zIndex: '2302', maxWidth: 'min(360px, calc(100vw - 32px))', padding: '7px 14px',
    borderRadius: '999px', border: '1px solid var(--line)', background: 'var(--surface-raised)', color: 'var(--ink)',
    boxShadow: '0 8px 24px rgb(0 0 0 / .22)', font: '500 var(--fs-sm) / 1.4 var(--font-sans)', pointerEvents: 'none',
    whiteSpace: 'normal', textAlign: 'center', willChange: 'transform, opacity',
  });
  const box = origin?.isConnected ? origin.getBoundingClientRect() : null;
  const visible = box && box.width > 0 && box.bottom > 0 && box.top < window.innerHeight;
  if (visible) {
    note.style.top = `${Math.round(box.bottom + 10)}px`;
    note.style.right = `${Math.max(16, Math.round(window.innerWidth - box.right))}px`;
  } else {
    note.style.top = '16px';
    note.style.left = '50%';
    note.style.translate = '-50% 0';
  }
  document.body.append(note);
  const remove = () => note.remove();
  if (lessMotion()) { window.setTimeout(remove, HOLD_MS + 400); return; }
  const life = note.animate([
    { opacity: 0, transform: 'translateY(-6px) scale(.96)' },
    { opacity: 1, transform: 'none', offset: 0.1 },
    { opacity: 1, transform: 'none', offset: 0.88 },
    { opacity: 0, transform: 'translateY(-4px)' },
  ], { duration: HOLD_MS + 600, easing: 'cubic-bezier(.3, .7, .3, 1)', fill: 'forwards' });
  life.finished.then(remove, remove);
}

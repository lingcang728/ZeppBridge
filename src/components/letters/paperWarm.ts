/**
 * 空闲时把信纸上那几句先排一次版（动效交接 2026-11-13 第 2 条：「动笔写信」起步顿）。
 *
 * 信纸用 --paper-font（Georgia 打头的衬线栈），中文字 Georgia 里没有，第一次排版要逐字走系统字体回退、再整段塑形：
 * 无头实测（4K）点开那一下主线程里三段 ShapeText 共约 90ms，飞行起步就顿一下。
 * 塑形结果和字体回退都按字体缓存，所以在屏幕外放一个同字体、同字重、同文字的节点，强制排一次版再删掉，
 * 真信纸打开时就直接命中缓存。只排版不绘制（visibility: hidden），不占 GPU。
 */
import { useLetterText } from './letters.i18n';
import './paper.css';

let warmedFor = '';

export function warmPaperText(): void {
  const t = useLetterText().value;
  const lines: Array<[string, number]> = [
    [t.toDeveloper, 700],
    [t.authorPlaceholder, 400],
    [t.writeAuthor, 400],
    [t.send, 600],
  ];
  const key = lines.map(([text]) => text).join('\n');
  if (key === warmedFor || typeof document === 'undefined') return;
  warmedFor = key;
  const host = document.createElement('div');
  host.className = 'paper';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:560px;visibility:hidden;pointer-events:none;contain:layout style';
  for (const [text, weight] of lines) {
    const line = document.createElement('p');
    line.textContent = text;
    line.style.cssText = `margin:0;font:${weight} var(--paper-size)/var(--paper-line) var(--paper-font)`;
    host.appendChild(line);
  }
  document.body.appendChild(host);
  void host.offsetHeight;
  host.remove();
}

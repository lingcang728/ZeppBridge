"""Cut MiSans down to what the app actually draws.

The full MiSans Regular + Bold are ~10 MB of woff2. Every launch used to load both, even
in the English UI where not one CJK glyph is on screen. This script writes two slices per
weight into src/assets/fonts/:

- MiSans-Latin-<w>.woff2  Latin / Cyrillic / punctuation / symbols. Loaded by any page.
- MiSans-CJK-<w>.woff2    only the CJK characters that appear anywhere in src/ or
                          src-tauri/ (interface copy, backend fallbacks). fonts.css gives it a
                          CJK unicode-range, so a page with no CJK text never downloads it.

A character missing from the CJK slice (a nickname, a note the user typed) falls through to
the next family in the stack ('Microsoft YaHei UI' / system), per character. The list of
characters we ship is written next to the fonts so `tests/font-subset.test.mjs` can fail
when new interface copy needs a glyph that is not in the slice: rerun this script then.

Usage:  python scripts/assets/subset-fonts.py
Needs:  fonttools + brotli (pip install fonttools brotli)
"""
from __future__ import annotations

import pathlib
import re

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'scripts' / 'assets' / 'fonts'
OUT = ROOT / 'src' / 'assets' / 'fonts'
SCAN = [ROOT / 'src', ROOT / 'src-tauri' / 'src', ROOT / 'src-tauri' / 'crates']
SCAN_SUFFIXES = {'.ts', '.vue', '.json', '.rs', '.css', '.html'}

LATIN_RANGES = [
    (0x0020, 0x024F),  # Basic Latin .. Latin Extended-B (pt/fr/de/nl accents)
    (0x0300, 0x036F),  # combining marks
    (0x0400, 0x04FF),  # Cyrillic (ru)
    (0x2000, 0x206F),  # general punctuation (– — ‘ ’ “ ” … •)
    (0x20A0, 0x20BF),  # currency
    (0x2100, 0x214F),  # letterlike (℃ №)
    (0x2190, 0x21FF),  # arrows
    (0x2200, 0x22FF),  # math operators (≤ ≥ ± ×)
    (0x2460, 0x24FF),  # enclosed numbers
    (0x25A0, 0x25FF),  # geometric shapes
]
CJK_RE = re.compile('[⺀-⿿　-〿぀-ヿ㄀-ㇿ㐀-䶿一-鿿豈-﫿︰-﹏＀-￯]')


COMMENT_RE = re.compile(r'/\*[\s\S]*?\*/|<!--[\s\S]*?-->|(?:^|(?<=[^:\\]))//[^\n]*')


def strip_comments(text: str) -> str:
    """注释不会画到界面上，里面的字不进切片（`//` 前是冒号的算 URL，留着）。"""
    return COMMENT_RE.sub('', text)


def scan_cjk() -> str:
    chars: set[str] = set()
    for base in SCAN:
        for path in base.rglob('*'):
            if path.suffix not in SCAN_SUFFIXES or 'node_modules' in path.parts or 'target' in path.parts:
                continue
            try:
                chars.update(CJK_RE.findall(strip_comments(path.read_text(encoding='utf-8'))))
            except UnicodeDecodeError:
                continue
    return ''.join(sorted(chars))


NARROW_NBSP = 0x202F
THIN_SPACE = 0x2009


def add_narrow_nbsp(font: TTFont) -> None:
    """MiSans 没有 U+202F（窄不换行空格）。数字分组用它（lib/format.ts formatNumber，俄语 / 法语的
    「1 709」），没有字形会落到别的字体、宽窄不一。借 U+2009 细空格的字形：一样窄，但不会断行。"""
    for table in font['cmap'].tables:
        if table.isUnicode() and THIN_SPACE in table.cmap and NARROW_NBSP not in table.cmap:
            table.cmap[NARROW_NBSP] = table.cmap[THIN_SPACE]


def cut(source: pathlib.Path, dest: pathlib.Path, unicodes: list[int]) -> int:
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.notdef_outline = True
    options.hinting = False
    font = TTFont(source)
    add_narrow_nbsp(font)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    font.flavor = 'woff2'
    font.save(dest)
    return dest.stat().st_size


def main() -> None:
    cjk = scan_cjk()
    latin = [cp for a, b in LATIN_RANGES for cp in range(a, b + 1)]
    (OUT / 'misans-cjk-chars.txt').write_text(cjk + '\n', encoding='utf-8')
    for weight, name in (('400', 'Regular'), ('700', 'Bold')):
        src = SOURCE / f'MiSans-{name}.woff2'
        a = cut(src, OUT / f'MiSans-Latin-{weight}.woff2', latin)
        b = cut(src, OUT / f'MiSans-CJK-{weight}.woff2', [ord(c) for c in cjk])
        print(f'{name}: latin {a / 1024:.0f} KB, cjk {b / 1024:.0f} KB ({len(cjk)} chars)')


if __name__ == '__main__':
    main()

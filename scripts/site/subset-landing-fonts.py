"""Regenerate the website's MiSans CJK fonts without changing desktop fonts.

Run from any directory with the existing fontTools/brotli Python environment:
    python scripts/site/subset-landing-fonts.py
"""
from pathlib import Path
import importlib.util
import shutil
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('fontcut', ROOT / 'scripts/assets/subset-fonts.py')
fontcut = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fontcut)


def main():
    sources = [
        *(ROOT / 'src/views/landing').glob('*.ts'),
        *(ROOT / 'src/views/landing').glob('*.vue'),
        ROOT / 'src/views/LandingPage.vue',
        ROOT / 'src/composables/useLandingLocale.ts',
    ]
    chars = set()
    for source in sources:
        chars.update(fontcut.CJK_RE.findall(fontcut.strip_comments(source.read_text(encoding='utf-8'))))
    output = ROOT / 'public/landing/fonts'
    output.mkdir(parents=True, exist_ok=True)
    for weight, name in [('400', 'Regular'), ('700', 'Bold')]:
        fontcut.cut(ROOT / f'scripts/assets/fonts/MiSans-{name}.woff2',
                    output / f'Landing-CJK-{weight}.woff2', [ord(char) for char in chars])
    (output / 'cjk-chars.txt').write_text(''.join(sorted(chars)) + '\n', encoding='utf-8')
    shutil.copyfile(ROOT / 'scripts/assets/fonts/LICENSE-misans.txt', output / 'LICENSE-misans.txt')
    print(f'Website-only fonts: {len(chars)} CJK characters')


if __name__ == '__main__':
    main()

"""Read-only browser smoke for the complete website demo. Reuses installed Chromium."""
import argparse, json, os
from pathlib import Path
from urllib.parse import urlencode
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]

def installed_chromium():
    explicit = os.environ.get('LANDING_CHROMIUM')
    if explicit and Path(explicit).is_file():
        return explicit
    caches = [Path(os.environ.get('PLAYWRIGHT_BROWSERS_PATH', r'G:\build_cache\playwright-browsers')),
              Path(os.environ.get('LOCALAPPDATA', '')) / 'ms-playwright',
              Path.home() / '.cache/ms-playwright', Path.home() / 'Library/Caches/ms-playwright']
    for cache in caches:
        hits = sorted(cache.glob('chromium-*/chrome-win*/chrome.exe')) + sorted(cache.glob('chromium-*/chrome-linux*/chrome')) + sorted(cache.glob('chromium-*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium'))
        if hits:
            return str(hits[-1])
    raise RuntimeError('Set LANDING_CHROMIUM to your installed Chromium executable. No tool is installed automatically.')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:1532')
    parser.add_argument('--out', default=str(ROOT / '.site-cache/verification'))
    args = parser.parse_args()
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    rows = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=installed_chromium())
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, locale='zh-CN', timezone_id='Asia/Taipei')
        page = context.new_page(); errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(args.url + '/?' + urlencode({'demo': '1', 'theme': 'light', 'lang': 'zh'}), wait_until='networkidle')
        page.wait_for_function('!!window.__ZB_DEMO_API__')
        page.wait_for_timeout(1600)
        page.screenshot(path=str(out / 'overview.png'))
        for route in ['/sleep', '/heart', '/workouts', '/body', '/activity', '/training', '/ai', '/ai/plan', '/ai/tasks', '/ai/exchanges', '/settings/account', '/settings/sync', '/settings/archive', '/settings/privacy', '/health-check']:
            page.evaluate("path => window.postMessage({source:'zeppbridge-site',type:'go',to:path},location.origin)", route)
            page.wait_for_timeout(1400)
            result = {'route': route, 'path': page.evaluate('location.pathname'), 'missing': page.evaluate('window.__ZB_DEMO_API__.missing'), 'errors': errors.copy()}
            if route in ['/ai', '/ai/plan', '/settings/archive']:
                page.screenshot(path=str(out / (route.replace('/', '_') + '.png')))
            rows.append(result)
            print(json.dumps(result, ensure_ascii=False), flush=True)
        out.joinpath('demo-routes.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
        browser.close()
    assert all(not row['errors'] and not row['missing'] and row['path'] == row['route'] for row in rows), 'Demo route failed: see demo-routes.json'

if __name__ == '__main__':
    main()

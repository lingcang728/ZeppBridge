"""Record complete journeys from the current app, in every locale and theme.
Uses installed Playwright, Chromium and ffmpeg. No network, account or deployment.
python scripts/site/capture-features.py --all --url http://127.0.0.1:1532
Only invalidated dependency fingerprints are recorded. --force rebuilds selected clips.
"""
import argparse, concurrent.futures, datetime, hashlib, importlib.util, json, os, re, subprocess, time
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlencode, urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
MEDIA = ROOT / '.site-cache/media'
RAW = ROOT / '.site-cache/capture'
FIXED = datetime.datetime(2026, 10, 8, 4, 8, tzinfo=datetime.timezone.utc)
LANGUAGES = ['zh', 'en', 'es', 'fr', 'de', 'nl', 'pt-BR', 'pt-PT', 'ru', 'hi-IN']
THEMES = ['light', 'dark']
SCENES = {'overview': '/', 'sleep': '/sleep', 'workouts': '/workouts', 'ai': '/ai', 'plan': '/ai/plan'}
ENTRIES = {
 'overview': ['views/Overview.vue', 'views/SleepDetail.vue', 'views/Settings.vue'],
 'sleep': ['views/SleepList.vue', 'views/SleepDetail.vue'],
 'workouts': ['views/WorkoutList.vue', 'views/WorkoutDetail.vue'],
 'ai': ['views/AiComposer.vue', 'views/ai/AiPlanWeek.vue'],
 'plan': ['views/ai/AiPlanWeek.vue', 'views/ai/AiPlanDay.vue'],
}
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', r'G:\build_cache\playwright-browsers')
spec = importlib.util.spec_from_file_location('demo_verifier', Path(__file__).with_name('verify-demo.py'))
verifier = importlib.util.module_from_spec(spec); spec.loader.exec_module(verifier)
installed_chromium = verifier.installed_chromium

@lru_cache(maxsize=4096)
def file_hash(path, modified, size):
    return hashlib.sha256(path.read_bytes()).digest()


def fingerprint(scene, language):
    src = ROOT / 'src'
    files = {Path(__file__).resolve(), src / 'App.vue', src / 'main.ts'}
    files.update(p for p in src.joinpath('demo').glob('**/*.*') if '__tests__' not in p.parts)
    files.update(src.joinpath('styles').glob('**/*.css'))
    files.update(src.joinpath('assets/fonts').glob('*'))
    pending = [src / entry for entry in ENTRIES[scene]] + list(files)
    visited = set()
    while pending:
        file = pending.pop().resolve()
        if file in visited or not file.is_file(): continue
        if file.name == 'LandingPage.vue': continue
        if '/views/landing/' in file.as_posix() and file.name != 'journeyCopy.ts': continue
        if '/i18n/locales/' in file.as_posix() and file.stem not in [language, 'zh', 'en']: continue
        visited.add(file); files.add(file)
        if file.suffix not in ['.vue', '.ts', '.css']: continue
        content = file.read_text(encoding='utf-8-sig')
        for link in re.findall(r'''(?:from\s*|import\s*\(?\s*|src=|@import\s*)['"](\.[^'"]+)['"]''', content):
            target = file.parent / link
            if target.name == 'router': continue  # Each scene supplies its own page roots.
            choices = [target, *[Path(str(target) + ext) for ext in ['.ts', '.vue', '.css']], target / 'index.ts']
            candidate = next((p for p in choices if p.is_file()), None)
            if candidate: pending.append(candidate)
    digest = hashlib.sha256()
    for file in sorted(files):
        if file.is_file():
            stat = file.stat()
            digest.update(str(file.relative_to(ROOT)).encode()); digest.update(file_hash(file, stat.st_mtime_ns, stat.st_size))
    digest.update(language.encode())
    return digest.hexdigest()


def go(page, route):
    page.evaluate("path => window.postMessage({source:'zeppbridge-site',type:'go',to:path},location.origin)", route)
    page.wait_for_function('(path) => location.pathname === path', arg=route)
    page.wait_for_timeout(1300)


def scroll(page, top):
    page.locator('.main-content').evaluate('(e, top) => e.scrollTo({top, behavior:"smooth"})', top)
    page.wait_for_timeout(1400)


def hold(page, selector):
    page.locator(selector).focus()
    page.keyboard.down('Enter'); page.wait_for_timeout(1000); page.keyboard.up('Enter')


def actions(page, scene):
    page.wait_for_timeout(1800)
    if scene == 'overview':
        page.locator('.sleep-panel').click(); page.wait_for_timeout(1800)
        scroll(page, 460); page.wait_for_timeout(900)
        go(page, '/settings'); page.wait_for_timeout(1400)
        page.locator('.list-open').nth(2).click(position={'x': 60, 'y': 12})
        page.wait_for_timeout(2100)
        go(page, '/')
    elif scene in ['sleep', 'workouts']:
        page.locator(f'a[href^="/{scene}/"]').first.click()
        page.wait_for_timeout(2200)
        assert page.locator('.main-content').inner_text().strip()
        scroll(page, 520); page.wait_for_timeout(1900)
        scroll(page, 1080); page.wait_for_timeout(1200)
        scroll(page, 0); page.wait_for_timeout(1200)
        go(page, SCENES[scene])
    elif scene == 'ai':
        # Cards intentionally float continuously; they never pass Playwright's stable check.
        page.locator('.slot-button').first.click(force=True); page.wait_for_timeout(1800)
        page.keyboard.press('Escape'); page.wait_for_timeout(1400)
        hold(page, 'button.lock')
        page.wait_for_selector('dialog[open] .pill-button', timeout=15000)
        page.wait_for_timeout(1900)
        page.locator('dialog[open] .pill-button').click()
        page.wait_for_function('location.pathname === "/ai/plan"')
        page.wait_for_timeout(2300)
        go(page, '/ai')
    else:
        page.locator('.future-day').filter(has=page.locator('.workout-shape svg')).first.click()
        page.wait_for_timeout(2000); scroll(page, 370); page.wait_for_timeout(1400)
        go(page, '/ai/plan')
        hold(page, '.hold-button')
        page.wait_for_function('window.__ZB_DEMO_API__.plan.state().drafts.length === 0')
        page.wait_for_timeout(2200)
        page.locator('.week-foot .ledger .acts button:not(.danger)').click()
        page.wait_for_timeout(2000)
        assert page.evaluate('window.__ZB_DEMO_API__.plan.state().last_publish.kind') == 'undo'
    page.wait_for_timeout(1900)  # Finish the transition and leave the completed result readable.


def command(args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def capture(browser, scene, lang, theme, base, ffmpeg, source_hash):
    stem = f'feature-{scene}-{lang}-{theme}'
    context = browser.new_context(viewport={'width':2560, 'height':1600}, device_scale_factor=1,
        locale='zh-CN' if lang == 'zh' else lang, timezone_id='Asia/Taipei', color_scheme=theme,
        record_video_dir=str(RAW), record_video_size={'width':2560, 'height':1600})
    # Render the 1280 CSS-pixel desktop layout at 2x resolution, including charts and text.
    context.add_init_script("new MutationObserver(() => {if (document.documentElement) document.documentElement.style.zoom='2'}).observe(document,{childList:true,subtree:true})")
    context.route('**/*', lambda r: r.continue_() if urlparse(r.request.url).hostname in ['127.0.0.1', 'localhost'] else r.abort())
    start = time.monotonic(); page = context.new_page(); errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    # Freeze the starting date, not Date.now(): Vue's event guard requires time to advance.
    page.clock.set_system_time(FIXED)
    try:
        page.goto(base+'/?'+urlencode({'demo':'1','theme':theme,'lang':lang,'route':SCENES[scene]}), wait_until='networkidle')
        page.wait_for_selector('.main-content'); page.evaluate('document.fonts.ready'); page.wait_for_timeout(1700)
        assert page.evaluate('window.__ZB_DEMO__?.demo === true')
        poster = RAW / (stem+'.png'); page.screenshot(path=str(poster))
        if scene == 'overview':
            page.screenshot(path=str(RAW/f'hero-overview-{lang}-{theme}.png'))
            for kind in ['sleep','steps']:
                page.locator('.'+kind+'-panel').screenshot(path=str(RAW/f'hero-{kind}-{lang}-{theme}.png'))
            scroll(page, 0)
        offset = time.monotonic() - start
        actions(page, scene)
        missing = page.evaluate('window.__ZB_DEMO_API__.missing')
        assert not errors and not missing, {'errors': errors, 'missing': missing}
        body = page.locator('.main-content').inner_text()
        assert 'could not be cloned' not in body and '无法读取这条运动' not in body
        video = page.video
    except Exception:
        page.screenshot(path=str(RAW/(stem+'-failure.png')))
        print({'scene':stem, 'url':page.url, 'errors': errors}, flush=True)
        raise
    finally:
        context.close()
    source = Path(video.path())
    mp4 = MEDIA/(stem+'.mp4'); webp = MEDIA/(stem+'.webp')
    command([ffmpeg,'-y','-loglevel','error','-ss',f'{offset:.3f}','-i',str(source),'-an','-vf','fps=25','-c:v','libx264','-preset','fast','-crf','24','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',str(mp4)])
    command([ffmpeg,'-y','-loglevel','error','-i',str(poster),'-quality','88',str(webp)])
    if scene == 'overview':
        for kind in ['overview','sleep','steps']:
            command([ffmpeg,'-y','-loglevel','error','-i',str(RAW/f'hero-{kind}-{lang}-{theme}.png'),'-quality','90',str(MEDIA/f'hero-{kind}-{lang}-{theme}.webp')])
    probe = json.loads(subprocess.check_output(['ffprobe','-v','quiet','-print_format','json','-show_format','-show_streams',str(mp4)],text=True))
    stream = probe['streams'][0]; duration = float(probe['format']['duration'])
    assert duration >= 12 and stream['width'] == 2560 and stream['height'] == 1600
    assert mp4.stat().st_size < 24_000_000, 'Clip exceeds Pages per-file size limit'
    # Raw recording is a disposable output of this invocation only; keep PNG evidence.
    source.unlink()
    return {'id': scene, 'language': lang, 'theme': theme, 'route': SCENES[scene], 'sourceHash': source_hash,
      'sourceCommit': subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
      'workingTree': 'fingerprint includes uncommitted source contents', 'mockSeed': 20261002, 'mockTime': FIXED.isoformat(),
      'mp4': mp4.name, 'poster': webp.name, 'duration': duration, 'dimensions':[2560,1600], 'audio':False,
      'bytes':mp4.stat().st_size, 'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--all',action='store_true'); parser.add_argument('--force',action='store_true')
    parser.add_argument('--scene',choices=SCENES,default='overview'); parser.add_argument('--language',choices=LANGUAGES,default='zh')
    parser.add_argument('--languages',nargs='+',choices=LANGUAGES,help='Record every scene and theme for these languages only')
    parser.add_argument('--theme',choices=THEMES,default='light'); parser.add_argument('--workers',type=int,default=3)
    parser.add_argument('--url',default='http://127.0.0.1:1532'); parser.add_argument('--ffmpeg',default='ffmpeg')
    args = parser.parse_args()
    if urlparse(args.url).hostname not in ['127.0.0.1','localhost']: raise ValueError('Capture requires a local server')
    MEDIA.mkdir(parents=True,exist_ok=True); RAW.mkdir(parents=True,exist_ok=True)
    manifest = MEDIA/'manifest.json'
    rows = json.loads(manifest.read_text(encoding='utf-8')) if manifest.exists() else []
    selected_languages = list(dict.fromkeys(args.languages or LANGUAGES))
    selected = [(s,l,t) for l in selected_languages for t in THEMES for s in SCENES] if args.all or args.languages else [(args.scene,args.language,args.theme)]
    hashes = {(s,l):fingerprint(s,l) for s,l in dict.fromkeys((s,l) for s,l,t in selected)}
    todo = []
    for s,l,t in selected:
        row = next((r for r in rows if (r['id'],r['language'],r['theme']) == (s,l,t)),None)
        files = [f'feature-{s}-{l}-{t}.mp4', f'feature-{s}-{l}-{t}.webp']
        if s == 'overview': files += [f'hero-{kind}-{l}-{t}.webp' for kind in ['overview','sleep','steps']]
        if args.force or not row or row.get('sourceHash') != hashes[s,l] or not all((MEDIA/f).is_file() for f in files): todo.append((s,l,t))
    print(f'{len(todo)} of {len(selected)} clips need recording.', flush=True)
    def work(item):
        s,l,t = item
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=installed_chromium())
            try: return capture(browser,s,l,t,args.url,args.ffmpeg,hashes[s,l])
            finally: browser.close()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(work,item):item for item in todo}
        for future in concurrent.futures.as_completed(futures):
            item = futures[future]
            try: row = future.result()
            except Exception:
                for pending in futures: pending.cancel()
                raise
            rows = [r for r in rows if (r['id'],r['language'],r['theme']) != item] + [row]
            manifest.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            print(f"{len(rows)}/100 {row['mp4']}: {row['duration']:.1f}s, {row['bytes']//1024} KiB",flush=True)
    selected_keys = set(selected)
    selected_rows = [row for row in rows if (row['id'],row['language'],row['theme']) in selected_keys]
    assert len(selected_rows) == len(selected)
    assert all(row['sourceHash'] == fingerprint(row['id'],row['language']) for row in selected_rows), 'Source changed during capture; run again to refresh affected clips.'
    print('Selected media are current.',flush=True)

if __name__ == '__main__': main()

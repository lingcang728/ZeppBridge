"""Sequential headless checks against disposable demo data; no native IPC/account."""
import json
import io
import sys
import time
import traceback
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from PIL import Image

BASE = 'http://localhost:1420'
OUT = Path(__file__).resolve().parent / 'ui'
OUT.mkdir(parents=True, exist_ok=True)
RESULT = {'mode': 'headless disposable demo', 'checks': [], 'layouts': [], 'page_errors': []}
if '--extra-only' in sys.argv:
    RESULT = json.loads((OUT / 'verification.json').read_text(encoding='utf-8'))

def record(name, **data):
    RESULT['checks'].append({'name': name, 'passed': True, **data})

def wait_server():
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(BASE, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(1)
    raise RuntimeError('Dev server unavailable after 60 seconds')

def go(page, route):
    page.evaluate('(to) => window.postMessage({source:"zeppbridge-site",type:"go",to}, location.origin)', route)
    page.wait_for_url('**' + route)
    page.wait_for_timeout(300)

def latest(page, command):
    return page.evaluate('(command) => window.__uiCalls.filter(c => c.command === command).at(-1)', command)

def locale_ui(page, locale, surface='list'):
    # Use the application's actual host listener. Importing index.ts directly can
    # instantiate a second HMR module and leave the mounted component in English.
    expected = page.evaluate('''async ({locale,key}) => {
      if (['zh','en','es'].includes(locale)) {
        const {workoutToolsMessages}=await import('/src/components/WorkoutTools.i18n.ts');
        return workoutToolsMessages[locale][key];
      }
      const pack=await import(`/src/i18n/locales/${locale}.ts`);
      return pack.default.modules['components/WorkoutTools'][key];
    }''', {'locale': locale, 'key': 'done' if surface == 'list' else 'detailsTitle'})
    page.evaluate('(value) => window.postMessage({source:"zeppbridge-site",type:"locale",value},location.origin)', locale)
    target = page.locator('.selection-actions > button').nth(0) if surface == 'list' else page.locator('.detail-backfill .s-row-title')
    expect(target).to_have_text(expected)

def layout(page, locale, mode):
    result = page.evaluate('''() => {
      const root = document.querySelector('.page');
      const main = document.querySelector('#main-content');
      const bad = [...root.querySelectorAll('button,select,input')].filter(e => {
        const r=e.getBoundingClientRect(), s=getComputedStyle(e);
        return r.width && r.height && s.visibility !== 'hidden' &&
          (r.right > innerWidth + 2 || r.left < -2);
      }).map(e=>({tag:e.tagName,text:e.innerText || e.getAttribute('aria-label'),rect:e.getBoundingClientRect().toJSON()}));
      return {width:innerWidth,documentOverflow:document.documentElement.scrollWidth > innerWidth + 2,
        mainOverflow:main ? main.scrollWidth > main.clientWidth + 2 : false, badControls:bad};
    }''')
    RESULT['layouts'].append({'locale': locale, 'mode': mode, **result})
    assert not result['documentOverflow'], result
    assert not result['mainOverflow'], result
    assert not result['badControls'], result

def text_contrast(page, selector, theme, surface):
    targets = page.evaluate('''(selector) => {
      const canvas=document.createElement('canvas'); canvas.width=canvas.height=1;
      const ctx=canvas.getContext('2d');
      window.__contrastEls=[...document.querySelectorAll(selector)].filter(e=>{
        const r=e.getBoundingClientRect(); return r.width && r.height && r.top>=0 && r.bottom<=innerHeight;
      });
      return window.__contrastEls.map((e,i)=>{
        const s=getComputedStyle(e),r=e.getBoundingClientRect();
        ctx.clearRect(0,0,1,1);ctx.fillStyle=s.color;ctx.fillRect(0,0,1,1);
        return {index:i,text:e.innerText||e.value,fg:[...ctx.getImageData(0,0,1,1).data],rect:r.toJSON(),old:e.style.color};
      });
    }''', selector)
    page.evaluate('window.__contrastEls.forEach(e=>e.style.color="transparent")')
    bg = Image.open(io.BytesIO(page.screenshot())).convert('RGB')
    page.evaluate('(items)=>items.forEach(item=>window.__contrastEls[item.index].style.color=item.old)', targets)
    def luminance(rgb):
        channels = [v / 255 for v in rgb]
        channels = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in channels]
        return sum(a*b for a,b in zip(channels, [.2126,.7152,.0722]))
    measurements = []
    for target in targets:
        rect, fg = target['rect'], target['fg']
        ratios = []
        for fraction in [.25, .5, .75]:
            rgb = bg.getpixel((int(rect['x'] + rect['width'] * fraction), int(rect['y'] + rect['height'] * .5)))
            alpha = fg[3] / 255
            composited = [fg[i]*alpha + rgb[i]*(1-alpha) for i in range(3)]
            a,b = sorted([luminance(composited),luminance(rgb)])
            ratios.append((b+.05)/(a+.05))
        measurements.append({'text':target['text'],'ratio':round(min(ratios),2)})
    assert measurements
    RESULT.setdefault('contrast', []).append({'theme':theme,'surface':surface,'method':'computed text foreground against rendered background pixels with text hidden','measurements':measurements})
    assert all(item['ratio'] >= 4.5 for item in measurements), measurements

def extra_checks():
    wait_server()
    RESULT['checks'] = [item for item in RESULT['checks'] if not item['name'].startswith(('E3 ', 'E4 '))]
    RESULT['contrast'] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=r'G:\build_cache\playwright-browsers\chromium-1208\chrome-win64\chrome.exe')
        context = browser.new_context(viewport={'width':1280,'height':900}, reduced_motion='reduce')
        for scenario in ['with-altitude','without-altitude','null-series']:
            page=context.new_page()
            page.on('pageerror', lambda error: RESULT['page_errors'].append(str(error)))
            page.goto(BASE+'/?demo=1&lang=en&theme=light&route=/workouts')
            page.wait_for_selector('.record-row')
            workout_id=page.locator('.record-row a').first.get_attribute('href') if page.locator('.record-row a').count() else page.locator('a.record-row').first.get_attribute('href')
            page.evaluate('''(scenario)=>{
              if (!window.__ZB_IPC__?.__zbDemo) throw Error('Not demo');
              const original=window.__ZB_IPC__.invoke.bind(window.__ZB_IPC__);
              window.__ZB_IPC__.invoke=async(command,args={})=>{
                const value=await original(command,args);
                if(command==='get_workout_detail') {value.elevation_gain_m=null;return value;}
                if(command==='get_workout_series') {
                  if(scenario==='null-series') return null;
                  value.summary.elevation_gain_m=null;
                  value.samples.forEach(sample=>sample.altitude_m=scenario==='with-altitude'?50:null);
                  return value;
                }
                return value;
              };
            }''', scenario)
            go(page, workout_id)
            expect(page.locator('.workout-hero')).to_be_visible()
            hint=page.locator('.workout-page > .footnote').filter(has_text='Altitude comes')
            expect(hint).to_have_count(1 if scenario=='with-altitude' else 0)
            page.screenshot(path=str(OUT/f'altitude-{scenario}.png'))
            record('E3 '+scenario, source='synthetic demo IPC response override; no real account')
            page.close()
        for theme in ['light','dark']:
            page=context.new_page()
            page.goto(BASE+f'/?demo=1&lang=en&theme={theme}&route=/workouts')
            page.wait_for_selector('.record-row')
            page.get_by_role('button',name='Select workouts',exact=True).click()
            checkbox=page.locator('.selectable-record input').first
            page.get_by_role('button',name='Done selecting',exact=True).focus()
            tab_hops = 0
            while not checkbox.evaluate('(element)=>element===document.activeElement') and tab_hops < 12:
                page.keyboard.press('Tab'); tab_hops += 1
            expect(checkbox).to_be_focused()
            page.keyboard.press('Space'); expect(checkbox).to_be_checked()
            text_contrast(page,'.selection-actions button,.workout-tools .selected-count,.workout-tools .button',theme,'new multi-select controls')
            page.locator('.workout-tools').screenshot(path=str(OUT/f'contrast-tools-{theme}.png'))
            go(page,'/settings/archive')
            page.locator('[aria-controls="archive-details"]').click()
            page.locator('.detail-backfill').scroll_into_view_if_needed()
            text_contrast(page,'.detail-backfill .s-row-title,.detail-backfill .s-row-sub,.detail-backfill .detail-channel span,.detail-backfill select,.detail-backfill p,.detail-backfill button',theme,'new detail backfill controls')
            page.locator('.detail-backfill').screenshot(path=str(OUT/f'contrast-detail-{theme}.png'))
            record('E4 '+theme+' new controls contrast >=4.5 and keyboard Tab/Space checkbox', scope='new multi-select/detail controls only; not whole-app accessibility audit', tab_hops_to_first_checkbox=tab_hops)
            page.close()
        assert not RESULT['page_errors'], RESULT['page_errors']
        browser.close()

def run():
    wait_server()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=r'G:\build_cache\playwright-browsers\chromium-1208\chrome-win64\chrome.exe')
        context = browser.new_context(viewport={'width': 1280, 'height': 900}, reduced_motion='reduce')
        page = context.new_page()
        page.on('pageerror', lambda error: RESULT['page_errors'].append(str(error)))
        page.goto(BASE + '/?demo=1&lang=en&theme=light&route=/workouts')
        page.wait_for_selector('.record-row')
        page.evaluate('''() => {
          if (!window.__ZB_IPC__?.__zbDemo) throw Error('Not disposable demo');
          window.__uiCalls=[];
          const original=window.__ZB_IPC__.invoke.bind(window.__ZB_IPC__);
          window.__ZB_IPC__.invoke=async(command,args={})=>{
            window.__uiCalls.push({command,args:JSON.parse(JSON.stringify(args))});
            return original(command,args);
          };
        }''')
        rows = page.locator('.selectable-record')
        expect(rows).to_have_count(200)
        page.get_by_role('button', name='Select workouts', exact=True).click()
        rows.nth(0).locator('input[type=checkbox]').focus()
        page.keyboard.press('Space')
        expect(rows.nth(0).locator('input')).to_be_checked()
        first_id = rows.nth(0).locator('a').get_attribute('href').split('/')[-1]
        page.get_by_role('button', name='Load more', exact=True).click()
        expect(rows).to_have_count(271)
        rows.nth(205).locator('input').check()
        second_id = rows.nth(205).locator('a').get_attribute('href').split('/')[-1]
        expect(page.locator('.selected-count')).to_have_text('2 selected')
        expect(rows.nth(0).locator('input')).to_be_checked()
        page.locator('.type-picker').click()
        search = page.get_by_role('combobox')
        search.fill('Hiking')
        search.press('ArrowDown')
        search.press('Enter')
        expect(page.locator('.workout-tools .hint-line')).to_contain_text('2 workouts')
        page.locator('.workout-tools').screenshot(path=str(OUT / 'batch-preview-en.png'))
        page.get_by_role('button', name='Apply type', exact=True).click()
        expect(page.locator('.workout-tools')).to_contain_text('2 workouts updated')
        args = latest(page, 'edit_workouts')['args']
        assert set(args['workoutIds']) == {first_id, second_id}, args
        assert args['changeType'] and args['workoutType'] == 'hiking', args
        record('cross-page selection, keyboard type search, preview and apply', selected_ids=args['workoutIds'])
        page.get_by_role('button', name='Undo last change', exact=True).click()
        expect(page.get_by_role('button', name='Undo last change', exact=True)).to_have_count(0)
        record('undo batch type correction')

        rows.nth(0).locator('input').check()
        page.get_by_role('button', name='Hide on this device', exact=True).click()
        expect(page.locator('.workout-tools')).to_contain_text('1 workout updated')
        hidden_id = latest(page, 'edit_workouts')['args']['workoutIds'][0]
        page.get_by_role('button', name='Hidden workouts', exact=True).click()
        expect(rows).to_have_count(1)
        rows.nth(0).locator('input').check()
        page.get_by_role('button', name='Show again', exact=True).click()
        expect(rows).to_have_count(0)
        assert latest(page, 'edit_workouts')['args']['hidden'] is False
        page.get_by_role('button', name='Workouts', exact=True).click()
        expect(rows).to_have_count(200)
        record('hide, hidden view, restore', workout_id=hidden_id)
        page.get_by_role('button', name='Done selecting', exact=True).click()
        rows.nth(0).locator('a').click()
        page.wait_for_selector('.workout-hero')
        page.get_by_role('button', name='Hide on this device', exact=True).click()
        page.wait_for_url('**/workouts')
        list_undo = page.locator('.list-page').get_by_role('button', name='Undo last change', exact=True)
        expect(list_undo).to_be_visible()
        list_undo.click()
        expect(list_undo).to_have_count(0)
        record('detail hide navigates to list with working undo')

        go(page, '/settings/archive')
        page.locator('[aria-controls="archive-details"]').click()
        panel = page.locator('.detail-backfill')
        expect(panel).to_be_visible()
        for channel in ['official', 'advanced']:
            panel.locator('select').select_option(channel)
            panel.get_by_role('button', name='Start or resume', exact=True).click()
            expect(panel).to_have_attribute('aria-busy', 'false')
            call = latest(page, 'start_workout_detail_backfill')
            assert call['args']['channel'] == channel, call
            assert call['args']['maxRecords'] == 20, call
            assert page.get_by_role('alert').count() == 0
        panel.screenshot(path=str(OUT / 'detail-channels-en.png'))
        record('official and advanced bounded detail start with ready=0')

        locales = ['zh', 'en', 'es', 'nl', 'pt-BR', 'pt-PT', 'de', 'ru', 'hi-IN', 'fr', 'it', 'pl']
        go(page, '/workouts')
        page.set_viewport_size({'width': 540, 'height': 900})
        page.locator('.selection-actions > button').nth(0).click()
        page.locator('.selectable-record input').nth(0).check()
        for locale in locales:
            locale_ui(page, locale)
            page.wait_for_timeout(100)
            layout(page, locale, '540px list selected')
            if locale in ['de', 'hi-IN', 'ru', 'zh']:
                page.screenshot(path=str(OUT / f'list-540-{locale}.png'))
        locale_ui(page, 'en')
        page.set_viewport_size({'width': 320, 'height': 900})
        layout(page, 'en', '320px list selected')
        page.screenshot(path=str(OUT / 'list-320-en.png'))
        page.set_viewport_size({'width': 1080, 'height': 900})
        page.evaluate('document.documentElement.style.zoom="2"')
        layout(page, 'en', '1080px CSS zoom 200% (540px content equivalent)')
        page.screenshot(path=str(OUT / 'list-zoom200-en.png'))
        page.evaluate('document.documentElement.style.zoom=""')
        page.set_viewport_size({'width': 540, 'height': 900})
        go(page, '/settings/archive')
        if not panel.is_visible():
            page.locator('[aria-controls="archive-details"]').click()
        for locale in locales:
            locale_ui(page, locale, 'archive')
            page.wait_for_timeout(100)
            layout(page, locale, '540px archive details')
            if locale in ['de', 'hi-IN', 'pl']:
                panel.screenshot(path=str(OUT / f'detail-panel-540-{locale}.png'))
        page.screenshot(path=str(OUT / 'archive-540-pl.png'))
        record('12 locale sequential layout checks, 320px and 200% equivalent zoom', layouts=len(RESULT['layouts']))
        RESULT['ipc_calls'] = page.evaluate('window.__uiCalls')
        assert not RESULT['page_errors'], RESULT['page_errors']
        browser.close()

try:
    if '--extra-only' in sys.argv:
        extra_checks()
    else:
        run()
    RESULT['passed'] = True
except Exception as error:
    RESULT['passed'] = False
    RESULT['failure'] = str(error)
    RESULT['traceback'] = traceback.format_exc()
finally:
    (OUT / 'verification.json').write_text(json.dumps(RESULT, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({key: RESULT[key] for key in ['passed', 'checks', 'layouts', 'page_errors']}, ensure_ascii=False))
    if not RESULT['passed']:
        print(RESULT['traceback'])
        raise SystemExit(1)

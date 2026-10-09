"""Browser acceptance for the website and embedded real application.
Uses the existing Chromium; all external requests are blocked. No deployment.
"""
import argparse, importlib.util, io, json
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.site-cache/verification'
spec=importlib.util.spec_from_file_location('v',Path(__file__).with_name('verify-demo.py'))
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
LOCALES=['zh','en','es','fr','de','nl','pt-BR','pt-PT','ru','hi-IN']
ROWS=[]

def result(name, details=True):
    ROWS.append({'check':name,'result':details})
    (OUT/'website-results.json').write_text(json.dumps(ROWS,ensure_ascii=False,indent=2),encoding='utf-8')
    print(name, details, flush=True)

def context(browser,width=1440,lang='zh',theme='light',**kwargs):
    c=browser.new_context(viewport={'width':width,'height':960},locale='zh-CN' if lang=='zh' else lang,color_scheme=kwargs.pop('color_scheme',theme),**kwargs)
    c.add_init_script("localStorage.setItem('zeppbridge-landing-locale',%s);localStorage.setItem('zeppbridge-landing-theme',%s)"%(json.dumps(lang),json.dumps(theme)))
    c.route('**/api/release',lambda r:r.fulfill(status=503,body='unavailable'))
    c.route('https://**',lambda r:r.abort())
    return c

def load(c,url):
    p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(e.stack))
    p.goto(url,wait_until='networkidle');p.locator('h1').wait_for();p.evaluate('document.fonts.ready')
    return p,errors

def shot(p,name): p.screenshot(path=str(OUT/(name+'.png')))
def no_overflow(p): assert p.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
def nav(p,index):
    if p.locator('.lp-links').is_visible():p.locator('.lp-links button.segment-item').nth(index).click()
    else:p.locator('.mobile-toggle').click();p.locator('.lp-mobile-links a').nth(index).click()

def matrix(browser,url):
    for lang in LOCALES:
        for width in [390,1440]:
            for theme in ['light','dark']:
                c=context(browser,width,lang,theme);p,errors=load(c,url)
                assert p.locator('.feature-story').count()==5
                no_overflow(p)
                assert p.locator('iframe').count()==0
                assert p.locator('video[src]').count()==0
                p.wait_for_function('Array.from(document.querySelectorAll(".hero-stage img")).every(i=>i.complete&&i.naturalWidth>0)')
                if width==390:
                    assert not p.locator('.lp-links').is_visible()
                    box=p.locator('.lp-nav-actions').bounding_box();assert box['x']>=0 and box['x']+box['width']<=width
                if lang in ['zh','en']:shot(p,f'hero-{width}-{lang}-{theme}')
                nav(p,2);p.wait_for_timeout(500)
                p.locator('#docs details').first.locator('summary').click()
                assert p.locator('#docs details').first.get_attribute('open') is not None
                no_overflow(p);assert not errors,errors
                c.close();result(f'layout {width}/{lang}/{theme}')
    for width in [320,360,430,768,1024,1920]:
        c=context(browser,width);p,errors=load(c,url);no_overflow(p)
        if width<1080:
            box=p.locator('.lp-nav-actions').bounding_box();assert box['x']>=0 and box['x']+box['width']<=width
        assert not errors;c.close();result(f'width {width}')

def interaction(browser,url):
    c=context(browser);c.tracing.start(screenshots=True,snapshots=True,sources=True)
    p,errors=load(c,url)
    p.locator('.locale-wheel').focus();p.keyboard.press('ArrowRight')
    p.wait_for_function('document.documentElement.lang === "en"');p.wait_for_timeout(600)
    p.locator('.locale-wheel').focus();p.keyboard.press('Home');p.wait_for_function('document.documentElement.lang === "zh-CN"')
    result('native language wheel: keyboard and translated page')
    nav(p,1);p.wait_for_selector('iframe.shown',timeout=25000)
    p.locator('.demo-shield').click()
    f=p.locator('iframe').element_handle().content_frame()
    f.wait_for_selector('.main-content')
    assert p.locator('iframe').evaluate('(e)=>!e.inert')
    f.evaluate("window.__sessionToken='original';localStorage.setItem('test-demo-preference','changed')")
    assert p.evaluate("localStorage.getItem('test-demo-preference')") is None
    p.locator('.theme-toggle .segment-item').nth(0).click()
    p.wait_for_function('document.documentElement.dataset.theme === "dark"')
    f.wait_for_function('document.documentElement.dataset.theme === "dark"')
    assert f.evaluate('window.__sessionToken')=='original'
    p.locator('.theme-toggle .segment-item').nth(1).click()
    f.wait_for_function('document.documentElement.dataset.theme === "light"')
    # A root view-transition snapshots the iframe. Wait for live hit targets,
    # rather than treating a token update as the end of the visual transition.
    p.wait_for_function('!document.documentElement.hasAttribute("data-theme-morph") && !document.documentElement.hasAttribute("data-ash-morph")')
    p.locator('.demo-shortcuts .segment-item').nth(2).click()
    f.wait_for_function('location.pathname === "/workouts"')
    # Outgoing and incoming pages coexist during the client's native page morph.
    # Scope to the incoming list rather than a departing overview's workout link.
    workout_list=f.locator('section[aria-labelledby="workout-list-title"]')
    workout_list.wait_for()
    f.wait_for_function('!document.querySelector("[class*=enter-active],[class*=leave-active],[data-morph-layer]")')
    p.locator('iframe').evaluate('(e)=>e.scrollIntoView({block:"center",behavior:"instant"})')
    workout_link=workout_list.locator('a[href^="/workouts/"]').first
    workout_link.evaluate('(e)=>e.scrollIntoView({block:"center",behavior:"instant"})')
    workout_link.click()
    try:f.wait_for_selector('.workout-page .workout-hero',timeout=15000)
    except Exception:
        shot(p,'interaction-failure');print({'frame':f.url,'errors':errors,'body':f.locator('.main-content').inner_text()[:800]},flush=True)
        c.tracing.stop(path=str(OUT/'website-interaction-failure.zip'))
        raise
    f.locator('.main-content').evaluate('(e)=>e.scrollTo(0,900)');f.wait_for_timeout(600)
    assert f.locator('.main-content').evaluate('(e)=>e.scrollTop')>100
    result('demo: real detail, scrolling, isolated preferences, theme without reload')
    p.locator('.demo-shortcuts .segment-item').nth(3).click();f.wait_for_selector('button.lock')
    f.locator('button.lock').focus();p.keyboard.down('Enter');p.wait_for_timeout(900);p.keyboard.up('Enter')
    f.wait_for_selector('dialog[open] .pill-button',timeout=15000)
    f.locator('dialog[open] .pill-button').click();f.wait_for_function('location.pathname === "/ai/plan"')
    f.locator('.hold-button').focus();p.keyboard.down('Enter');p.wait_for_timeout(1000);p.keyboard.up('Enter')
    f.wait_for_function('window.__ZB_DEMO_API__.plan.state().drafts.length === 0')
    p.wait_for_timeout(1500)
    assert f.evaluate('window.__ZB_DEMO_API__.plan.state().last_publish.state')=='sent'
    f.locator('.week-foot .ledger .acts button:not(.danger)').click()
    f.wait_for_function('window.__ZB_DEMO_API__.plan.state().last_publish.kind === "undo"')
    assert not f.evaluate('window.__ZB_DEMO_API__.missing')
    result('AI round trip: prepare, sample reply, review, publish, undo')
    p.locator('.reset-demo').click();p.wait_for_selector('iframe.shown')
    f=p.locator('iframe').element_handle().content_frame()
    assert f.evaluate("localStorage.getItem('test-demo-preference')") is None
    assert f.evaluate('window.__ZB_DEMO_API__.plan.state().drafts.length')==1
    assert not errors,errors
    shot(p,'interactive-desktop');c.tracing.stop(path=str(OUT/'website-interaction.zip'));c.close()
    for width in [320,390]:
        c=context(browser,width);p,errors=load(c,url);nav(p,1);p.wait_for_selector('iframe.shown',timeout=25000)
        assert p.locator('.mobile-collapsed').count()==1
        collapsed_height=p.locator('.demo-window .frame').bounding_box()['height']
        p.locator('.demo-shield').click();p.wait_for_timeout(500)
        assert p.locator('.mobile-collapsed').count()==0
        assert p.locator('.demo-window .frame').bounding_box()['height']>collapsed_height+180
        no_overflow(p);shot(p,f'interactive-mobile-{width}');assert not errors;c.close()
    result('mobile: same-page expansion at 320 and 390 pixels')

def media(browser,url):
    c=context(browser);p,errors=load(c,url)
    for scene in ['overview','sleep','workouts','ai','plan']:
        article=p.locator('#feature-'+scene);article.scroll_into_view_if_needed()
        vid=article.locator('video');vid.wait_for();p.wait_for_function('(v)=>v.readyState>=2&&!v.paused',arg=vid.element_handle())
        assert vid.evaluate('(v)=>v.videoWidth')==2560
        assert vid.evaluate('(v)=>v.duration')>=12
        before=vid.evaluate('(v)=>v.currentTime');vid.hover();p.wait_for_timeout(500)
        assert vid.evaluate('(v)=>v.currentTime')>before
        assert 'zh-light' in vid.get_attribute('src')
        if scene in ['overview','plan']:shot(p,'feature-'+scene)
    assert not errors;c.close()
    c=context(browser,reduced_motion='reduce');p,errors=load(c,url);p.locator('#features').scroll_into_view_if_needed();p.wait_for_timeout(400)
    assert p.locator('video').count()==0
    assert p.locator('.feature-media img').count()==5
    assert p.locator('button').filter(has_text='暂停').count()==0
    c.close();result('media: full 2560px clips, hover continues, reduced-motion posters')

def forced_dark(playwright,url):
    samples={};controls={}
    for force in [False,True]:
        browser=playwright.chromium.launch(executable_path=v.installed_chromium(),args=['--enable-features=WebContentsForceDark'] if force else [])
        control=browser.new_page()
        control.set_content('<html><body style="margin:0;background:white;color:black">Control</body></html>')
        controls[force]=Image.open(io.BytesIO(control.screenshot())).convert('RGB').getpixel((100,100));control.close()
        for theme in ['light','dark']:
            # Auto Dark operates with a dark system preference. The website's manual
            # light choice must still win. Forcing the flag against a light OS is a
            # Chromium override mode which can ignore even `color-scheme: dark`.
            c=context(browser,theme=theme,color_scheme='dark');p,errors=load(c,url);p.wait_for_timeout(300)
            assert p.locator('meta[name="darkreader-lock"]').count()==1
            assert set(p.evaluate('getComputedStyle(document.documentElement).colorScheme').split())=={'only',theme}
            samples['site',theme,force]=Image.open(io.BytesIO(p.screenshot())).convert('RGB').getpixel((5,900))
            shot(p,f'theme-{theme}-forced-{force}')
            nav(p,1);p.wait_for_selector('iframe.shown',timeout=25000)
            p.locator('.demo-shield').click();f=p.locator('iframe').element_handle().content_frame()
            f.wait_for_selector('.main-content');p.wait_for_timeout(800)
            assert f.locator('meta[name="darkreader-lock"]').count()==1
            assert set(f.evaluate('getComputedStyle(document.documentElement).colorScheme').split())=={'only',theme}
            frame_image=Image.open(io.BytesIO(p.locator('iframe').screenshot())).convert('RGB')
            samples['demo',theme,force]=frame_image.getpixel((10,frame_image.height-15))
            c.close()
        browser.close()
    assert sum(abs(a-b) for a,b in zip(controls[False],controls[True]))>300,controls
    for theme in ['light','dark']:
        for surface in ['site','demo']:
            assert max(abs(a-b) for a,b in zip(samples[surface,theme,False],samples[surface,theme,True]))<5,samples
    result('forced dark: control changes, website and embedded app preserve native pixels',{str(k):value for k,value in samples.items()})

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:1532');parser.add_argument('--section',choices=['all','matrix','interaction','media','theme'],default='all');args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=v.installed_chromium())
        for name,fn in [('matrix',matrix),('interaction',interaction),('media',media)]:
            if args.section in ['all',name]:fn(browser,args.url)
        browser.close()
        if args.section in ['all','theme']:forced_dark(p,args.url)
    result('complete')

if __name__=='__main__':main()

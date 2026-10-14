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
SECTION='all'

def result(name, details=True):
    ROWS.append({'check':name,'result':details})
    (OUT/f'website-{SECTION}-results.json').write_text(json.dumps(ROWS,ensure_ascii=False,indent=2),encoding='utf-8')
    print(name, details, flush=True)

def context(browser,width=1440,lang='zh',theme='light',**kwargs):
    c=browser.new_context(viewport={'width':width,'height':960},locale='zh-CN' if lang=='zh' else lang,color_scheme=kwargs.pop('color_scheme',theme),**kwargs)
    c.add_init_script("localStorage.setItem('zeppbridge-landing-locale',%s);localStorage.setItem('zeppbridge-landing-theme',%s)"%(json.dumps(lang),json.dumps(theme)))
    c.route('**/api/release',lambda r:r.fulfill(status=503,body='unavailable'))
    c.route('https://**',lambda r:r.abort())
    return c

def load(c,url):
    p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(e.stack))
    p.goto(url,wait_until='domcontentloaded');p.locator('h1').wait_for();p.evaluate('document.fonts.ready')
    return p,errors

def shot(p,name): p.screenshot(path=str(OUT/(name+'.png')))
def no_overflow(p): assert p.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
def nav(p,target):
    if p.locator('.lp-links').is_visible():p.locator(f'.lp-links a[href="#{target}"]').click()
    else:
        p.locator('.mobile-toggle').click()
        p.locator(f'#mobile-nav a[href="#{target}"]').click()

def matrix(browser,url):
    for lang in LOCALES:
        for width in [390,1440]:
            for theme in ['light','dark']:
                c=context(browser,width,lang,theme);p,errors=load(c,url)
                assert p.locator('.motion-step').count()==5
                assert p.locator('.record-card').count()==3
                assert p.locator('#docs').count()==0
                no_overflow(p)
                assert p.locator('iframe').count()<=2
                assert p.locator('#records video[src], #ai video[src], #connect video[src]').count()==0
                p.wait_for_function('Array.from(document.querySelectorAll(".hero-stage img")).every(i=>i.complete&&i.naturalWidth>0)')
                if width==390:
                    assert not p.locator('.lp-links').is_visible()
                    box=p.locator('.lp-nav-actions').bounding_box();assert box['x']>=0 and box['x']+box['width']<=width
                if lang in ['zh','en']:shot(p,f'hero-{width}-{lang}-{theme}')
                if p.locator('.lp-links').is_visible():
                    p.locator('.product-toggle').click()
                    p.locator('#product-menu a[href="#record-overview"]').click()
                else:
                    p.locator('.mobile-toggle').click()
                    p.locator('#mobile-nav a[href="#record-overview"]').click()
                p.wait_for_function('''() => { const el=document.getElementById("record-overview"); if(!el) return false; const top=el.getBoundingClientRect().top; return top < innerHeight*0.55; }''')
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
    p.locator('.site-locale').focus();p.keyboard.press('ArrowRight')
    p.wait_for_function('document.documentElement.lang === "en"');p.wait_for_timeout(600)
    p.locator('.site-locale').focus();p.keyboard.press('Home');p.wait_for_function('document.documentElement.lang === "zh-CN"')
    result('native language wheel: keyboard and translated page')
    nav(p,'try-app');p.wait_for_selector('.demo-window iframe.shown',timeout=25000)
    p.locator('.demo-shield').click()
    f=p.locator('.demo-window iframe').element_handle().content_frame()
    f.wait_for_selector('.main-content')
    assert p.locator('.demo-window iframe').evaluate('(e)=>!e.inert')
    f.evaluate("window.__sessionToken='original';localStorage.setItem('test-demo-preference','changed')")
    assert p.evaluate("localStorage.getItem('test-demo-preference')") is None
    assert p.locator('.lp-nav').evaluate('(e)=>e.classList.contains("is-away")')
    p.locator('.demo-back').click()
    p.wait_for_function('!document.querySelector(".lp-nav").classList.contains("is-away")')
    p.locator('.site-theme .segment-item').nth(0).click()
    p.wait_for_function('document.documentElement.dataset.theme === "dark"')
    f.wait_for_function('document.documentElement.dataset.theme === "dark"')
    assert f.evaluate('window.__sessionToken')=='original'
    p.locator('.site-theme .segment-item').nth(1).click()
    f.wait_for_function('document.documentElement.dataset.theme === "light"')
    # A root view-transition snapshots the iframe. Wait for live hit targets,
    # rather than treating a token update as the end of the visual transition.
    p.wait_for_function('!document.documentElement.hasAttribute("data-theme-morph") && !document.documentElement.hasAttribute("data-ash-morph")')
    nav(p,'try-app')
    p.locator('.demo-window iframe').evaluate("e=>e.contentWindow.postMessage({source:'zeppbridge-site',type:'go',to:'/workouts'},location.origin)")
    f.wait_for_function('location.pathname === "/workouts"')
    # Outgoing and incoming pages coexist during the client's native page morph.
    # Scope to the incoming list rather than a departing overview's workout link.
    workout_list=f.locator('section[aria-labelledby="workout-list-title"]')
    workout_list.wait_for()
    f.wait_for_function('!document.querySelector("[class*=enter-active],[class*=leave-active],[data-morph-layer]")')
    p.locator('.demo-window iframe').evaluate('(e)=>e.scrollIntoView({block:"center",behavior:"instant"})')
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
    p.locator('.demo-window iframe').evaluate("e=>e.contentWindow.postMessage({source:'zeppbridge-site',type:'go',to:'/ai'},location.origin)");f.wait_for_selector('button.lock')
    f.locator('button.lock').focus();p.keyboard.down('Enter');p.wait_for_timeout(900);p.keyboard.up('Enter')
    f.wait_for_selector('dialog[open] .conversation-send',timeout=15000)
    f.locator('dialog[open] .conversation-send').click()
    f.wait_for_selector('dialog[data-turn="3"]',timeout=45000)
    f.wait_for_function('location.pathname === "/ai/plan"',timeout=25000)
    f.locator('.hold-button').focus();p.keyboard.down('Enter');p.wait_for_timeout(1000);p.keyboard.up('Enter')
    f.wait_for_function('window.__ZB_DEMO_API__.plan.state().drafts.length === 0')
    p.wait_for_timeout(1500)
    assert f.evaluate('window.__ZB_DEMO_API__.plan.state().last_publish.state')=='sent'
    f.locator('.week-foot .ledger .acts button:not(.danger)').click()
    f.wait_for_function('window.__ZB_DEMO_API__.plan.state().last_publish.kind === "undo"')
    assert not f.evaluate('window.__ZB_DEMO_API__.missing')
    result('AI round trip: prepare, sample reply, review, publish, undo')
    p.locator('.reset-demo').click();p.wait_for_selector('.demo-window iframe.shown')
    f=p.locator('.demo-window iframe').element_handle().content_frame()
    assert f.evaluate("localStorage.getItem('test-demo-preference')") is None
    assert f.evaluate('window.__ZB_DEMO_API__.plan.state().drafts.length')==1
    assert not errors,errors
    shot(p,'interactive-desktop');c.tracing.stop(path=str(OUT/'website-interaction.zip'));c.close()
    for width in [320,390]:
        c=context(browser,width);p,errors=load(c,url);nav(p,'try-app');p.wait_for_selector('.demo-window iframe.shown',timeout=25000)
        assert p.locator('.mobile-collapsed').count()==1
        collapsed_height=p.locator('.demo-window .frame').bounding_box()['height']
        p.locator('.demo-shield').click();p.wait_for_timeout(500)
        assert p.locator('.mobile-collapsed').count()==0
        assert p.locator('.demo-window .frame').bounding_box()['height']>collapsed_height+180
        no_overflow(p);shot(p,f'interactive-mobile-{width}');assert not errors;c.close()
    result('mobile: same-page expansion at 320 and 390 pixels')

def media(browser,url):
    c=context(browser,theme='dark');p,errors=load(c,url)
    p.locator('#motion').scroll_into_view_if_needed()
    size=None
    for scene in ['glass','poker','seasons','notes','box']:
        p.locator('#motion-'+scene).click()
        reel=p.locator('#motion .motion-reel')
        p.wait_for_function("id => {const el=document.querySelector('#motion .motion-reel');return el.dataset.reel===id && el.dataset.phase==='run'}",arg=scene,timeout=25000)
        current=reel.locator('.reel-scaler').bounding_box()
        if size:assert abs(current['width']-size['width'])<1 and abs(current['height']-size['height'])<1
        size=current
        if scene=='poker':
            p.wait_for_function("document.querySelector('#motion .motion-reel').dataset.beat === '7'",timeout=25000)
            reel.locator('.playback-toggle').click()
            before=reel.get_attribute('data-beat');p.wait_for_timeout(1400)
            assert reel.get_attribute('data-phase')=='paused' and reel.get_attribute('data-beat')==before
            reel.locator('.playback-toggle').click()
            reel.locator('iframe').evaluate('(e)=>{e.contentWindow.__playbackSession="retained"}')
            p.locator('#top .hero-copy').scroll_into_view_if_needed()
            p.wait_for_function("document.querySelector('#motion .motion-reel').dataset.phase==='paused'")
            before=reel.get_attribute('data-beat');p.wait_for_timeout(1200)
            assert reel.get_attribute('data-beat')==before
            reel.scroll_into_view_if_needed()
            assert reel.locator('iframe').evaluate('(e)=>e.contentWindow.__playbackSession')=='retained'
        p.wait_for_function("id => {const el=document.querySelector('#motion .motion-reel');return el.dataset.reel===id && ['complete','error'].includes(el.dataset.phase)}",arg=scene,timeout=60000)
        assert reel.get_attribute('data-phase')=='complete',reel.get_attribute('data-error')
        shot(p,'story-'+scene)
        result('complete native motion: '+scene)
    for scene in ['overview','sleep','workouts']:
        reel=p.locator('#record-'+scene+' .motion-reel');reel.scroll_into_view_if_needed()
        p.wait_for_function("id => ['complete','error'].includes(document.querySelector('#record-'+id+' .motion-reel').dataset.phase)",arg=scene,timeout=60000)
        assert reel.get_attribute('data-phase')=='complete',reel.get_attribute('data-error')
        shot(p,'record-'+scene)
    ai=p.locator('#ai .motion-reel');ai.scroll_into_view_if_needed()
    p.wait_for_function("['complete','error'].includes(document.querySelector('#ai .motion-reel').dataset.phase)",timeout=80000)
    assert ai.get_attribute('data-phase')=='complete',ai.get_attribute('data-error')
    frame=ai.locator('iframe').element_handle().content_frame()
    assert frame.evaluate('location.pathname')=='/ai/plan'
    assert '40' in frame.locator('.week-panel').inner_text()
    assert frame.evaluate('window.__ZB_DEMO_API__.plan.state().drafts.length')==1
    shot(p,'ai-complete')
    assert not errors,errors;c.close();result('records and full three-turn AI exchange completed')
    c=context(browser,reduced_motion='reduce');p,errors=load(c,url)
    p.locator('#motion').scroll_into_view_if_needed();p.wait_for_selector('#motion iframe.shown',timeout=25000)
    assert p.locator('#motion .motion-reel').get_attribute('data-phase')=='paused'
    assert p.locator('.motion-step').count()==5 and p.locator('video').count()==0
    p.wait_for_timeout(1400)
    assert p.locator('#motion .motion-reel').get_attribute('data-beat')=='start'
    p.locator('#motion-poker').click();p.locator('#motion .playback-toggle').click()
    p.wait_for_function("document.querySelector('#motion .motion-reel').dataset.phase==='complete'",timeout=60000)
    p.wait_for_timeout(2200)
    assert p.locator('#motion .motion-reel').get_attribute('data-reel')=='poker'
    assert not errors,errors;c.close();result('reduced motion: still by default, explicit playback, no automatic next chapter')


def assets(browser,url):
    for fail_full in [False,True]:
        c=context(browser)
        def fail_image(request):
            if request.request.resource_type=='image' and (fail_full or '-thumb' in request.request.url):request.abort()
            else:request.continue_()
        c.route('**/*amazfit-t-rex-3-pro-48-44mm*',fail_image)
        p,errors=load(c,url);p.locator('.device-ribbon').scroll_into_view_if_needed()
        cells=p.locator('.device-cell[title="Amazfit T-Rex 3 Pro 48mm/44mm"]')
        if fail_full:
            cells.locator('svg').first.wait_for()
            assert cells.locator('svg').count()==4
        else:
            p.wait_for_function("Array.from(document.querySelectorAll('.device-cell img')).some(i=>i.naturalWidth>0&&i.src.includes('amazfit-t-rex-3-pro-48-44mm')&&!i.src.includes('thumb'))")
        no_overflow(p);assert not errors,errors;c.close()
    result('device images: full image on thumbnail failure, bounded fallback on complete failure')

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
            nav(p,'try-app');p.wait_for_selector('.demo-window iframe.shown',timeout=25000)
            p.locator('.demo-shield').click();f=p.locator('.demo-window iframe').element_handle().content_frame()
            f.wait_for_selector('.main-content');p.wait_for_timeout(800)
            assert f.locator('meta[name="darkreader-lock"]').count()==1
            assert set(f.evaluate('getComputedStyle(document.documentElement).colorScheme').split())=={'only',theme}
            frame_image=Image.open(io.BytesIO(p.locator('.demo-window iframe').screenshot())).convert('RGB')
            samples['demo',theme,force]=frame_image.getpixel((10,frame_image.height-15))
            c.close()
        browser.close()
    assert sum(abs(a-b) for a,b in zip(controls[False],controls[True]))>300,controls
    for theme in ['light','dark']:
        for surface in ['site','demo']:
            assert max(abs(a-b) for a,b in zip(samples[surface,theme,False],samples[surface,theme,True]))<5,samples
    result('forced dark: control changes, website and embedded app preserve native pixels',{str(k):value for k,value in samples.items()})

def main():
    global SECTION
    parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:1532');parser.add_argument('--section',choices=['all','matrix','interaction','media','theme','assets'],default='all');args=parser.parse_args()
    SECTION=args.section
    OUT.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=v.installed_chromium())
        for name,fn in [('matrix',matrix),('interaction',interaction),('media',media),('assets',assets)]:
            if args.section in ['all',name]:fn(browser,args.url)
        browser.close()
        if args.section in ['all','theme']:forced_dark(p,args.url)
    result('complete')

if __name__=='__main__':main()

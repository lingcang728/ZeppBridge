import json, time, argparse
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output'/'landing-reels'
OUT.mkdir(parents=True, exist_ok=True)
parser=argparse.ArgumentParser()
parser.add_argument('--scenes',default='glass,morph,poker,theme,account,sync,devices,local,overview,hourly,gaps,ai,prompt,events,autopaste,receive,plan-edit,templates,easy,settings,records')
parser.add_argument('--url',default='http://127.0.0.1:1532/')
parser.add_argument('--browser',default=r'G:\build_cache\playwright-browsers\chromium-1208\chrome-win64\chrome.exe')
args=parser.parse_args()
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True, executable_path=args.browser)
 for scene in args.scenes.split(','):
  context=browser.new_context(viewport={'width':1600,'height':1000})
  context.add_init_script("localStorage.setItem('zeppbridge-landing-locale','zh');localStorage.setItem('zeppbridge-landing-theme','dark')")
  page=context.new_page(); errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(args.url,wait_until='domcontentloaded')
  tabs={'glass':('motion',0),'morph':('motion',1),'poker':('motion',2),'theme':('motion',3),
        'account':('connection',0),'sync':('connection',1),'devices':('connection',2),'local':('connection',3),
        'overview':('records',0),'hourly':('records',1),'gaps':('records',3),
        'ai':('ai',0),'prompt':('ai',1),'events':('ai',2),'autopaste':('ai',3),
        'receive':('ai-plan',0),'plan-edit':('ai-plan',1),'templates':('ai-plan',2),'easy':('ai-plan',3)}
  if scene in tabs:
   chapter,index=tabs[scene]
   page.locator('#'+chapter+'-point-'+str(index)).click()
   target=page.locator('#'+chapter+'-stage .motion-reel')
  elif scene=='records':
   target=page.locator('.record-pair .motion-reel')
  else:
   target=page.locator('[data-reel='+scene+']')
  target.first.evaluate('(el)=>el.scrollIntoView({block:"center",behavior:"instant"})')
  ids=['sleep','workouts'] if scene=='records' else [scene]
  seen={i:[] for i in ids}; last={}; shots=set(); simultaneous=False
  start=time.monotonic(); failure=None; evidence={}
  if scene=='records':
   page.wait_for_function("Array.from(document.querySelectorAll('.record-pair .motion-reel')).every(e=>e.dataset.phase==='run')")
   pair=page.locator('.record-pair .motion-reel')
   pair.first.locator('.playback-toggle').click()
   page.wait_for_timeout(200)
   evidence['independentPause']=pair.first.get_attribute('data-phase')=='paused' and pair.nth(1).get_attribute('data-phase')=='run'
   pair.first.locator('.playback-toggle').click()
   page.evaluate('window.scrollTo({top:0,behavior:"instant"})')
   page.wait_for_timeout(250)
   evidence['offscreenPaused']=all(pair.nth(n).get_attribute('data-phase')=='paused' for n in [0,1])
   pair.first.evaluate('(el)=>el.scrollIntoView({block:"center",behavior:"instant"})')

  while time.monotonic()-start<120:
   rows=target.evaluate_all('(els)=>els.map(e=>({id:e.dataset.reel,phase:e.dataset.phase,beat:e.dataset.beat,error:e.dataset.error,url:e.querySelector("iframe")?.contentWindow?.location.pathname}))')
   if scene=='records':
    simultaneous |= all(any(r['id']==i and r['phase']=='run' for r in rows) for i in ids)
   for row in rows:
    i=row['id']
    if i not in ids: continue
    key=(row['phase'],row['beat'],row.get('url'))
    if last.get(i)!=key:
     last[i]=key; seen[i].append(dict(row,seconds=round(time.monotonic()-start,2)))
     print(scene,row,flush=True)
    if row.get('error'): failure=row['error']; break
    f=target.locator('xpath=self::*[@data-reel="'+i+'"]').locator('iframe').element_handle()
    frame=f.content_frame() if f else None
    if frame and row['beat']=='week-open': evidence['expandedDays']=max(frame.locator('.table-layer:last-child .pcard.day').count(),evidence.get('expandedDays',0))
    if frame and row['beat']=='plan-hover': evidence['hoverTip']=bool(frame.locator('.plan-strip .tip').count()) or evidence.get('hoverTip',False)
    if frame and row['beat']=='plan-step': evidence['stepEditor']=bool(frame.locator('.step-body').count()) or evidence.get('stepEditor',False)
    if frame and row['beat']=='collection': evidence['collected']=frame.locator('.box-spread').count()>0
    if frame and row['beat']=='low-recovery': evidence['easySuggestion']=bool(frame.locator('.easy-swap').count()) or evidence.get('easySuggestion',False)
    if frame and row['beat']=='easy-draft' and row.get('url')=='/ai/plan': evidence['swapped']=frame.locator('.easy-swap').count()==0
    if frame and row['beat']=='library': evidence['templateSaved']=bool(frame.locator('.template-row').count()) or evidence.get('templateSaved',False)
    if frame and row['phase']=='complete' and i=='plan-edit': evidence['published']=frame.evaluate("window.__ZB_DEMO_API__.plan.state().last_publish?.state === 'sent' && window.__ZB_DEMO_API__.plan.state().last_publish?.id > 1")
    if frame and row['phase']=='complete' and i=='morph': evidence['returned']=row.get('url')=='/'
    if frame and i=='workouts': evidence['unzoomed']=target.locator('xpath=self::*[@data-reel="'+i+'"]').locator('.reel-camera').evaluate("e=>e.style.transform.endsWith('scale(1)')")

    if row['beat'] in ['week-open','month-open','plan-hover','plan-step','comparison','weekly','large-cards','settings-ai'] and (i,row['beat']) not in shots:
     page.wait_for_timeout(150)
     target.locator('xpath=self::*[@data-reel="'+i+'"]').screenshot(path=str(OUT/(i+'-'+row['beat']+'.png')))
     shots.add((i,row['beat']))
   if failure or all(any(r['phase']=='complete' for r in seen[i]) for i in ids): break
   page.wait_for_timeout(90)
  complete=all(any(r['phase']=='complete' for r in seen[i]) for i in ids)
  result={'scene':scene,'complete':complete,'error':failure,'pageErrors':errors,'beats':seen,'simultaneous':simultaneous if scene=='records' else None,'evidence':evidence}
  results.append(result)
  if not complete: page.screenshot(path=str(OUT/(scene+'-failure.png')))
  (OUT/('results-'+args.scenes.replace(',','_')[:100]+'.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
  print('RESULT',scene,complete,failure,errors,flush=True)
  context.close()
 browser.close()
assert all(r['complete'] and not r['error'] and not r['pageErrors'] for r in results), 'A reel did not finish cleanly'
assert all(r['simultaneous'] is not False for r in results), 'Sleep/workout playback did not overlap'

assert all(all(bool(value) for value in r['evidence'].values()) for r in results), 'A rendered interaction did not match its promised result'

required={'poker':['expandedDays','collected'],'morph':['returned'],'ai':['hoverTip','stepEditor'],'receive':['hoverTip','stepEditor'],'plan-edit':['hoverTip','stepEditor','published'],'templates':['templateSaved'],'easy':['easySuggestion','swapped'],'records':['unzoomed']}
assert all(all(r['evidence'].get(key) for key in required.get(r['scene'],[])) for r in results), 'Missing semantic interaction evidence'

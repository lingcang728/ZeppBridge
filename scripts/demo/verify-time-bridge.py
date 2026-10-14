"""Native WebView smoke. Refuses every library except the isolated synthetic demo.

Uses the machine's existing Python Playwright and an explicitly started local
WebView CDP endpoint. Never signs in, opens an AI site or sends to a real watch.
"""
import argparse, json, re
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--cdp', default='http://127.0.0.1:9237')
parser.add_argument('--output', type=Path, default=Path('release/time-bridge-demo/checks'))
parser.add_argument('--clipboard-only', action='store_true')
args = parser.parse_args()
args.output.mkdir(parents=True,exist_ok=True)

with sync_playwright() as p:
    browser=p.chromium.connect_over_cdp(args.cdp)
    page=browser.contexts[0].pages[0]
    page.set_default_timeout(10000)
    page.wait_for_url('http://tauri.localhost/**')
    page.wait_for_function('!!window.__TAURI_INTERNALS__')
    def ipc(name, **data):
        return page.evaluate('(input)=>window.__TAURI_INTERNALS__.invoke(input.name,input.data)', {'name':name,'data':data})
    assert ipc('get_user_prefs')['demo_mode'] is True, 'Refusing to mutate a real library'
    page.locator('.bridge-row').first.wait_for()
    if args.clipboard_only:
        before=ipc('training_plan_state')['drafts'][0]['id']
        page.locator('.receive-capsule').click()
        page.wait_for_timeout(500)
        page.screenshot(path=str(args.output/'native-receive.png'))
        page.wait_for_timeout(1000)
        after=ipc('training_plan_state')['drafts'][0]
        assert after['id'] != before and after['document']['format']=='zeppbridge-plan/2'
        assert len(after['document']['rest'])==14
        print('Native clipboard receive, plan/2 extraction and local rest preview passed.')
        browser.close()
        raise SystemExit(0)
    checks=[]
    def passed(name): checks.append(name)
    original=ipc('training_plan_state')['drafts'][0]
    page.wait_for_timeout(1200)
    assert page.locator('.bridge-row').count()==6
    assert page.locator('.bridge-row').nth(5).locator('.value').count()>20
    assert page.locator('.hold-button').is_enabled()
    passed('six real strips, weight values, final plan and valid hold gate')
    for width in [1440,1100,900]:
        page.set_viewport_size({'width':width,'height':800})
        page.wait_for_timeout(220)
        dock=page.locator('.dock').bounding_box(); box=page.locator('.compose-box').bounding_box()
        assert dock and box and dock['y']>=box['y']+box['height']-1, f'dock overlaps question at {width}'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        page.screenshot(path=str(args.output/f'native-light-{width}.png'))
    passed('1440 / 1100 / 900 viewport layout and dock clearance')
    page.set_viewport_size({'width':1440,'height':900})
    page.evaluate("document.documentElement.setAttribute('data-theme','dark')")
    page.wait_for_timeout(250); page.screenshot(path=str(args.output/'native-dark-1440.png'))
    page.emulate_media(reduced_motion='reduce')
    assert page.locator('.future-day').first.evaluate("e=>getComputedStyle(e).animationName")=='none'
    page.emulate_media(reduced_motion='no-preference')
    passed('dark theme and reduced motion')
    page.locator('.range-labels button').filter(has_text=re.compile('^90 天$')).click(); page.wait_for_timeout(400)
    assert page.locator('.bridge-row').first.locator('g').count()==30
    page.locator('.range-labels button').filter(has_text=re.compile('^7 天$')).click(); page.wait_for_timeout(400)
    assert page.locator('.bridge-row').first.locator('g').count()==7
    page.locator('.range-labels button').filter(has_text=re.compile('^30 天$')).click(); page.wait_for_timeout(400)
    page.locator('.row-toggle').last.click(); assert page.locator('.bridge-row.excluded').count()==1
    page.locator('.row-toggle').last.click(); assert page.locator('.bridge-row.excluded').count()==0
    workout=page.locator('.bridge-row').nth(3).locator('[role=button]').first
    workout.click(); assert workout.get_attribute('aria-pressed')=='true'
    workout.click(); assert workout.get_attribute('aria-pressed')=='false'
    passed('ranges, category inclusion and workout selection')
    names=page.locator('.day-name').all_text_contents()
    page.locator('.future-day').nth(1).focus(); page.keyboard.press('ArrowRight'); page.wait_for_timeout(450)
    assert page.locator('.day-name').nth(2).inner_text()==names[1]
    page.locator('.future-day').nth(2).focus(); page.keyboard.press('ArrowLeft'); page.wait_for_timeout(450)
    assert page.locator('.day-name').nth(1).inner_text()==names[1]
    page.locator('.future-day').nth(1).drag_to(page.locator('.future-day').nth(3)); page.wait_for_timeout(450)
    assert page.locator('.day-name').nth(3).inner_text()==names[1]
    page.locator('.future-day').nth(3).focus(); page.keyboard.press('Delete'); page.wait_for_timeout(450)
    assert page.locator('.day-name').nth(3).inner_text()=='休息'
    persisted=ipc('training_plan_state')['drafts'][0]
    assert len(persisted['document']['workouts'])==len(original['document']['workouts'])-1
    ipc('training_plan_update_draft',id=persisted['id'],document=original['document'])
    page.reload(); page.locator('.hold-button').wait_for(); page.wait_for_timeout(500)
    passed('keyboard swap, pointer drag, delete and backend draft persistence')
    last=ipc('training_plan_state')['last_publish']['id']
    button=page.locator('.hold-button'); rect=button.bounding_box()
    page.mouse.move(rect['x']+rect['width']/2,rect['y']+rect['height']/2)
    page.mouse.down(); page.wait_for_timeout(180); page.mouse.up(); page.wait_for_timeout(200)
    assert ipc('training_plan_state')['last_publish']['id']==last
    button.focus(); page.keyboard.down('Space'); page.wait_for_timeout(660); page.keyboard.up('Space'); page.wait_for_timeout(400)
    sent=ipc('training_plan_state')
    assert sent['last_publish']['id']>last and sent['last_publish']['state']=='sent'
    assert sent['last_publish']['workout_count']==5
    assert page.locator('.bridge-message').filter(has_text='本地模拟已完成').count()==1
    passed('early-release cancellation and full keyboard hold, local-only ledger')
    row=page.locator('.exchange-row').filter(has_text='被拒绝').first
    row.click(); page.wait_for_timeout(350)
    assert page.locator('.history-view').count()==1
    assert page.locator('.future-day[draggable=true]').count()==0
    assert page.locator('.hold-button').count()==0
    page.get_by_role('button',name='回到当前任务',exact=True).click()
    page.locator('.more-button').click()
    page.locator('.sheet').get_by_role('button',name='只导出到桌面',exact=True).click()
    page.locator('.file-card').wait_for(); page.wait_for_timeout(500)
    passed('history scope read-only and native export-only file card')
    path=ipc('ai_exchange_list',limit=1)[0]['md_path']
    content=Path(path).read_text(encoding='utf-8')
    assert 'simulated_data' in content and '## food' in content and '## Plan vs actual' in content
    assert content.index('## Plan vs actual') < content.index('zeppbridge-plan/2')
    assert 'weight (kg)' in content and 'protein' in content
    (args.output.parent/'完整模拟数据交付.md').write_text(content,encoding='utf-8')
    passed('exported food, weight, comparison and final format at file end')
    (args.output/'native-verification.json').write_text(json.dumps({'checks':checks,'export':path},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'checks':checks},ensure_ascii=False))
    browser.close()

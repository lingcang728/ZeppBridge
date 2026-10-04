"""Fill an empty, migration-created demo library with deterministic synthetic data.

Requires .demo-library and schema 36. Refuses real or already populated libraries.
No credentials, downloads, account identifiers or user records are used.
"""
from pathlib import Path
from datetime import datetime, date, time, timedelta, timezone
import argparse, hashlib, json, math, random, re, sqlite3

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
parser.add_argument('--today', default=date.today().isoformat())
args = parser.parse_args()
root = args.directory.resolve()
assert (root / '.demo-library').is_file(), 'Not an explicitly isolated demo library'
db = sqlite3.connect(root / 'zepp.db')
assert db.execute('PRAGMA user_version').fetchone()[0] == 36, 'Run current migrations first'
assert db.execute('SELECT count(*) FROM metric_samples').fetchone()[0] == 0, 'Library already populated'
assert db.execute('SELECT count(*) FROM raw_records').fetchone()[0] == 0, 'Library already populated'
today = date.fromisoformat(args.today)
tz = datetime.now().astimezone().tzinfo
now = datetime.combine(today, time(16,30), tz)
stamp = now.isoformat()
rng = random.Random(60436)
device = 'SIMULATED-WATCH'
def day(offset): return today + timedelta(days=offset)
def at(d,h=7,m=0): return datetime.combine(d,time(h,m),tz)
def js(value): return json.dumps(value,ensure_ascii=False,separators=(',',':'))
def insert(table, **row):
    cols = ','.join(row)
    marks = ','.join('?' for _ in row)
    return db.execute(f'INSERT INTO {table}({cols}) VALUES({marks})',list(row.values())).lastrowid
def meta(key,value): db.execute('INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES(?,?,?)',(key,value,stamp))
def raw(stream,key,d,payload):
    text = js(payload)
    return insert('raw_records',stream=stream,source_key=key,source_scope='device',device_id=device,
        start_utc=at(d,0).astimezone(timezone.utc).isoformat(),end_utc=at(d+timedelta(days=1),0).astimezone(timezone.utc).isoformat(),
        payload=text,payload_hash=hashlib.sha256(text.encode()).hexdigest(),fetched_at=stamp)
def sample(metric,ts,value,unit,raw_id=None):
    insert('metric_samples',metric=metric,timestamp=ts.isoformat(),value=round(value,3),unit=unit,source_scope='device',device_id=device,raw_record_id=raw_id)
def daily(metric,d,value,unit,raw_id=None):
    insert('daily_metrics',date=d.isoformat(),metric=metric,value=round(value,3),unit=unit,source_scope='device',device_id=device,raw_record_id=raw_id)

meta('time_bridge_demo','1')
normalizer_source = (Path(__file__).resolve().parents[2]/'src-tauri/crates/core/src/storage/mod.rs').read_text(encoding='utf-8')
revision = re.search(r'NORMALIZER_REVISION: &str = "([^"]+)"',normalizer_source).group(1)
meta('normalizer_revision',revision)
meta('ai_profile_note','【模拟档案】目标是秋季半马，每周跑 4 次；周三没有训练时间。最近工作较忙，希望保留一次质量课，优先恢复。所有健康记录均为合成数据。')
meta('last_cloud_sync_at',stamp)
meta('last_cloud_sync_outcome','updated')
meta('last_full_window_sync_at',stamp)
insert('device_identities',alias=device,name='Amazfit · 模拟设备',firmware='DEMO',device_id=device,timezone=str(tz),updated_at=stamp)

names = [('早餐','燕麦、牛奶与香蕉',7,30,510,22,15,72),('午餐','鸡肉杂粮饭与蔬菜',12,20,790,44,24,99),('晚餐','三文鱼、米饭与沙拉',19,10,720,39,28,78)]
workout_ids=[]
for offset in range(-89,1):
    d=day(offset); phase=(offset+89)/89; wave=math.sin((offset+2)*.65)
    tired = d.weekday()==2 or offset in [-12,-11,-4]
    recovery=round(81+7*wave-(17 if tired else 0))
    # Selected missing dates remain genuinely absent in every sample-backed reading.
    worn = offset not in [-63,-34,-11]
    weight=70.8-1.3*phase+.22*math.sin(offset*.9)
    if offset % 13 != 0:
        body={'weight':(weight,'kg'),'bmi':(weight/1.76**2,'kg/m2'),'height':(176,'cm'),
            'body_fat_rate':(19.1-1.2*phase+.2*wave,'%'),'body_water_rate':(55.4+.4*wave,'%'),
            'muscle_mass':(52.1+.3*phase,'kg'),'bone_mass':(2.8,'kg'),'protein_rate':(18.2,'%'),
            'visceral_fat':(6,'grade'),'bmr':(1630-11*phase,'kcal/day'),'body_balance_score':(86+2*wave,'score')}
        aliases={'body_fat_rate':'fatRate','body_water_rate':'bodyWaterRate','muscle_mass':'muscleMass','bone_mass':'boneMass','protein_rate':'proteinRate','visceral_fat':'visceralFat','body_balance_score':'bodyBalanceScore'}
        rid=raw('weight',f'weight:demo:{d}',d,{'items':[{'generatedTime':int(at(d,7,5).timestamp()),'summary':{aliases.get(k,k):v[0] for k,v in body.items()}}]})
        for metric,(value,unit) in body.items(): sample(metric,at(d,7,5),value,unit,rid)
    if offset not in [-47,-19]:
        meals=[]
        multiplier=1.05 if d.weekday()==6 else 1+.06*wave
        for i,(kind,name,h,m,kcal,protein,fat,carbs) in enumerate(names):
            meals.append({'foodLogId':f'demo-food-{d}-{i}','foodName':name,'foodText':'模拟餐食 · 软件支持的 Food 字段',
              'mealType':str(i+1),'mealtime':int(at(d,h,m).timestamp()*1000),'measureWeight':410+30*i,
              'energy':round(kcal*multiplier),'protein':round(protein*multiplier,1),'fatTotal':round(fat*multiplier,1),
              'carbohydrates':round(carbs*multiplier,1),'sugar':8+i,'fiber':7+i,'sodium':310+170*i})
        rid=raw('wellness',f'wellness:food:demo:{d}',d,{'code':0,'items':[{'timestamp':int(at(d,0).timestamp()*1000),'value':{'timeZone':str(tz),'samples':meals}}]})
        for metric,key,unit in [('intake_calories','energy','kcal'),('intake_protein_g','protein','g'),('intake_fat_g','fatTotal','g'),('intake_carbs_g','carbohydrates','g')]:
            daily(metric,d,sum(m[key] for m in meals),unit,rid)
    if worn:
        readings={'readiness':(recovery,'score'),'physical_readiness':(recovery-3,'score'),'mental_readiness':(recovery+2,'score'),
          'hybrid_charge':(recovery,'score'),'physical_charge':(recovery-4,'score'),'mental_charge':(recovery+1,'score'),
          'resting_hr':(51+3*wave+(4 if tired else 0),'bpm'),'sleep_rhr':(49+2*wave,'bpm'),
          'sleep_hrv':(54+9*wave-(8 if tired else 0),'ms'),'hrv_baseline':(52,'ms'),'rhr_baseline':(51,'bpm'),'ahi_baseline':(1.3,'events/h'),
          'stress':(26+7*wave+(9 if tired else 0),'score'),'stress_min':(12,'score'),'stress_max':(59+(9 if tired else 0),'score'),
          'respiratory_rate':(14.2+.6*wave,'次/分'),'respiratory_rate_min':(12,'次/分'),'respiratory_rate_max':(17,'次/分'),
          'steps':(10500+2300*wave,'步'),'distance':(8100+1200*wave,'米'),'active_calories':(570+160*wave,'千卡'),
          'active_minutes':(48+18*wave,'分钟'),'step_goal':(10000,'步'),'calorie_goal':(600,'千卡'),'active_minutes_goal':(45,'分钟'),
          'training_load':(190+50*wave,'load'),'vo2max':(46.2+1.7*phase,'ml/kg/min'),'lactate_threshold_hr':(168,'bpm'),
          'lactate_threshold_pace':(300,'秒/公里'),'pai_total':(130+12*wave,'pai'),'pai_daily':(12+4*wave,'pai'),
          'pai_low_zone':(3,'pai'),'pai_medium_zone':(6,'pai'),'pai_high_zone':(5,'pai'),
          'pai_low_zone_minutes':(25,'分钟'),'pai_medium_zone_minutes':(18,'分钟'),'pai_high_zone_minutes':(8,'分钟'),
          'pai_low_zone_lower_hr':(100,'bpm'),'pai_medium_zone_lower_hr':(130,'bpm'),'pai_high_zone_lower_hr':(160,'bpm'),
          'spo2_odi':(1.4+.2*wave,'events/h'),'spo2_night_score':(95,'score'),'spo2_measured_minutes':(380,'分钟')}
        rid=raw('daily_summary',f'daily_summary:demo:{d}',d,{'simulated':True,'date':d.isoformat(),'metrics':{k:v[0] for k,v in readings.items()}})
        for metric,(value,unit) in readings.items(): daily(metric,d,value,unit,rid)
        for i in range(96 if offset<0 else 66):
            ts=at(d,0)+timedelta(minutes=i*15)
            sample('heart_rate',ts,round(60+9*math.sin(i*.35)+rng.uniform(-4,4)+(14 if 25<i<34 else 0)),'bpm')
            sample('stress',ts,max(8,round(25+12*math.sin(i*.19)+rng.uniform(-4,4))),'score')
            if i%4==0:
                sample('hrv',ts,54+7*math.sin(i*.13),'ms'); sample('hrv_rmssd',ts,53+8*math.sin(i*.11),'ms'); sample('spo2',ts,97+rng.random()*2,'%')
        minutes=round(465+28*wave-(48 if tired else 0))
        finish=at(d,7,10); start=finish-timedelta(minutes=minutes); sid=f'demo-sleep-{d}'
        deep=round(minutes*.21); rem=round(minutes*.23); awake=12; light=minutes-deep-rem-awake
        insert('sleep_sessions',sleep_id=sid,start_time=start.isoformat(),end_time=finish.isoformat(),score=round(86+6*wave-(8 if tired else 0)),duration_minutes=minutes,
          deep_minutes=deep,light_minutes=light,rem_minutes=rem,awake_minutes=awake,source_scope='device',device_id=device,synced_at=stamp,wake_count=2,rem_seconds=rem*60)
        cursor=start
        # Aggregate and timeline stage durations agree exactly.
        for stage,total in [('light',light),('deep',deep),('rem',rem),('awake',awake)]:
            end=cursor+timedelta(minutes=total); insert('sleep_stages',sleep_id=sid,stage=stage,start_time=cursor.isoformat(),end_time=end.isoformat()); cursor=end
    if d.weekday() in [0,1,3,5,6] and offset not in [-11,-5,-2]:
        kind='cycling' if d.weekday()==5 else 'running'
        quality=d.weekday()==1; long=d.weekday()==6; seconds=4500 if long else 2880 if quality else 3000 if kind=='cycling' else 2400
        hr=145 if quality else 133 if long else 118 if kind=='cycling' else 126
        distance=18500 if kind=='cycling' else seconds/60/5.9*1000
        start=at(d,6,50); finish=start+timedelta(seconds=seconds); wid=f'demo-workout-{d}'
        workout_ids.append(wid)
        insert('workouts',workout_id=wid,workout_type=kind,start_time=start.isoformat(),end_time=finish.isoformat(),distance_meters=round(distance),calories=round(seconds/60*10),
          avg_hr=hr,max_hr=175 if quality else hr+18,min_hr=95,training_load=105 if quality else 85 if long else 38,vo2max=47,
          source_scope='device',device_id=device,synced_at=stamp,gps_available=1,sample_count=seconds//10,workout_type_source='verified',
          total_steps=round(seconds/60*172) if kind=='running' else None,moving_seconds=seconds,elevation_gain_m=72 if long else 24,
          elevation_loss_m=68 if long else 22,max_altitude_m=61,min_altitude_m=18,training_effect=3.6 if quality else 2.4,anaerobic_training_effect=2.5 if quality else .3,
          rpe=6 if quality else 3,avg_cadence_spm=172 if kind=='running' else 82,max_cadence_spm=184 if kind=='running' else 94,avg_stride_cm=98 if kind=='running' else None)
        for s in range(0,seconds,10):
            ts=start+timedelta(seconds=s); active=130<s<seconds-180
            pulse=hr+5*math.sin(s/190)+(21 if quality and (s//180)%2==1 and active else -11 if not active else 0)
            speed=distance/seconds*(1+.025*math.sin(s/60)); pace=1000/speed/60
            insert('workout_samples',workout_id=wid,timestamp=ts.isoformat(),heart_rate=round(pulse),speed=round(speed,3),pace=round(pace,3),cadence=172+3*math.sin(s/90) if kind=='running' else 82,
              altitude=30+7*math.sin(s/300),stride=98 if kind=='running' else None,power_watts=185 if kind=='cycling' else None,
              ground_contact_ms=245 if kind=='running' else None,vertical_oscillation_mm=75 if kind=='running' else None,vertical_ratio_pct=7.8 if kind=='running' else None,equivalent_pace_s=pace*60)
            if s%30==0:
                theta=2*math.pi*s/seconds
                insert('route_points',workout_id=wid,timestamp=ts.isoformat(),latitude=25.035+.009*math.sin(theta),longitude=121.54+.018*math.cos(theta),altitude=30+7*math.sin(s/300))
        for z,bound in enumerate([110,130,150,170,195]): insert('workout_hr_zones',workout_id=wid,zone_index=z,upper_bound_bpm=bound,seconds=seconds//5)
        for i in range(max(1,math.ceil(distance/1000))):
            dist=min(1000,distance-i*1000); secs=round(seconds*dist/distance); splitstart=start+timedelta(seconds=round(seconds*i*1000/distance)); splitend=splitstart+timedelta(seconds=secs)
            insert('workout_splits',workout_id=wid,split_index=i+1,start_time=splitstart.isoformat(),end_time=splitend.isoformat(),distance_m=dist,duration_seconds=secs,pace_min_per_km=secs/dist*1000/60,avg_hr=hr,max_hr=hr+12,elevation_gain_m=2,elevation_loss_m=2,partial=int(dist<999))
        if quality:
            for i in range(4):
                a=start+timedelta(minutes=10+i*6); b=a+timedelta(minutes=3)
                insert('workout_laps',workout_id=wid,lap_index=i+1,start_time=a.isoformat(),end_time=b.isoformat(),distance_m=600,duration_seconds=180,avg_hr=165,max_hr=175)
        if offset%10==0: insert('workout_pauses',workout_id=wid,start_time=(start+timedelta(minutes=18)).isoformat(),end_time=(start+timedelta(minutes=18,seconds=25)).isoformat(),kind='manual')

categories=[{'category':c,'enabled':True,'days_before':29,'include_workout_day':True,'excluded_metrics':[]} for c in ['workout','sleep','recovery','heart_rate','training','body']]
categories += [{'category':c,'enabled':False,'days_before':0,'include_workout_day':True,'excluded_metrics':[]} for c in ['personal_note','attachment']]
profile=db.execute("SELECT value FROM app_meta WHERE key='ai_profile_note'").fetchone()[0]
task={'schema_version':1,'id':'demo-full-task','title':'半马准备 · 下一周怎么排','template_id':None,'workout_ids':[],'categories':categories,'detail_level':'detailed',
 'prompt':'结合最近训练、睡眠、恢复和饮食，先商量下周怎么排。周三没空，想保留一次质量课；等我说定稿再给最终计划。','personal_note':profile,'attachments':[],
 'include_precise_gps':False,'mcp_shared':False,'created_at':stamp,'updated_at':stamp}
insert('ai_tasks',id=task['id'],title=task['title'],payload=js(task),workout_count=0,mcp_shared=0,created_at=stamp,updated_at=stamp)

def final_plan(start,count=14):
    workouts=[]; rest=[]
    for i in range(count):
        d=start+timedelta(days=i); slot=i%7
        rest.append({'date':str(d),'bedtime':'22:30' if slot!=2 else '22:00','sleepTarget':'8h30m','note':'模拟建议：质量课后提早休息。' if slot==2 else '模拟建议：尽量保持固定作息。'})
        if slot in [0,3]: continue
        sport='cycling' if slot==5 else 'running'; name={1:'轻松跑 · 找回节奏',2:'4 × 3 分钟间歇',4:'恢复跑 · 留点余力',5:'轻松骑行',6:'长跑 · 稳住心率'}[slot]
        steps=[{'kind':'warmup','duration':'10min','target':'hr 105-125'}]
        if slot==2: steps += [{'repeat':4,'steps':[{'kind':'interval','duration':'3min','target':'hr 155-170'},{'kind':'recovery','duration':'2min','target':'hr 115-135'}]}]
        else: steps += [{'kind':'active','duration':{1:'30min',4:'20min',5:'35min',6:'55min'}[slot],'target':'hr 115-135' if slot in [4,5] else 'hr 125-145'}]
        steps += [{'kind':'cooldown','duration':'5min','target':'hr 100-120'}]
        workouts.append({'date':str(d),'sport':sport,'name':name,'description':'完全模拟的 AI 定稿，用于检查界面与交互。','steps':steps})
    return {'format':'zeppbridge-plan/2','summary':'【模拟定稿】保留一次质量课，周三留给恢复；两次轻松跑、一段骑行和周末长跑，连续两周逐步推进。','from':str(start),'to':str(start+timedelta(days=count-1)),'workouts':workouts,'rest':rest}
def validated(w):
    def leaf(s):
        low,high=map(int,s['target'].split()[1].split('-'))
        return {'intensity':s['kind'],'length':{'type':'time','seconds':int(s['duration'].removesuffix('min'))*60},'target':{'type':'heart_rate','low':low,'high':high}}
    return {**{k:v for k,v in w.items() if k!='steps'},'steps':[{'type':'repeat','times':s['repeat'],'steps':[leaf(k) for k in s['steps']]} if 'repeat' in s else {'type':'step',**leaf(s)} for s in w['steps']]}
for n,(offset,state) in enumerate([(-21,'sent'),(-14,'unknown'),(-10,'rejected'),(-7,'sent')]):
    start=day(offset); doc=final_plan(start,7); did=f'demo-plan-old-{n}'; when=at(start,10).isoformat()
    insert('training_plan_drafts',id=did,origin='ai_paste',document=js(doc),status='published',created_at=when,updated_at=when)
    ids=[insert('training_plan_workouts',draft_id=did,workout_date=w['date'],workout=js(validated(w)),active=0,created_at=when) for w in doc['workouts']]
    body={'startDate':str(start),'endDate':str(start+timedelta(days=6)),'workouts':[{'workoutId':i} for i in ids]}
    pid=insert('training_plan_publishes',kind='publish',draft_id=did,window_start=str(start),window_ids=js(ids),body=js(body),activated=js(ids),state=state,http_status=200 if state=='sent' else 422 if state=='rejected' else None,error_code='err.training_plan.rejected' if state=='rejected' else 'err.core.network' if state=='unknown' else None,created_at=when,finished_at=when)
    insert('ai_exchanges',id=f'demo-exchange-{n}',task_id=task['id'],provider=['chatgpt','claude','gemini','chatgpt'][n],question=['根据近一个月的训练，排一周适应计划','减少质量课，把恢复做好','周三临时有事，重新调整一下','这一周保持节奏，周末长跑'][n],days_before=29,categories=js(categories),personal_note=profile,sent_at=when,md_path=f'DEMO-only/history-{n}.md',plan_draft_id=did,received_at=when,publish_id=pid)
current=final_plan(today)
insert('training_plan_drafts',id='demo-plan-current',origin='ai_paste',document=js(current),status='open',created_at=stamp,updated_at=stamp)
insert('ai_exchanges',id='demo-exchange-current',task_id=task['id'],provider='chatgpt',question=task['prompt'],days_before=29,categories=js(categories),personal_note=profile,sent_at=stamp,md_path='DEMO-only/full-context.md',plan_draft_id='demo-plan-current',received_at=stamp)
for stream in ['heart_rate','daily_summary','sleep','hrv','wellness','weight','workouts','workout_detail']:
    insert('sync_state',stream=stream,last_sync=stamp,status='ready',records_written=90,capability='verified',updated_at=stamp)
    insert('coverage_ledger',stream=stream,chunk_start=str(day(-89)),chunk_end=str(today),status='persisted',requested_at=stamp,fetched_at=stamp,persisted_at=stamp,records=90,updated_at=stamp)
insert('life_events',title='模拟：进入半马准备期',category='training',start_date=str(day(-35)),notes='完整演示，非个人健康建议',created_at=stamp,updated_at=stamp)
# This fixture builds normalized tables explicitly with the current contract.
# Stamp the synthetic provenance so startup does not replay simplified raw fixtures.
db.execute('INSERT INTO raw_normalization(raw_record_id,revision,records_written) SELECT id,?,0 FROM raw_records',(revision,))
assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
db.commit()
db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
manifest={'simulated':True,'seed':60436,'today':str(today),'days':90,'schema':36,'tables':{n:db.execute(f'SELECT count(*) FROM {n}').fetchone()[0] for n in ['metric_samples','daily_metrics','sleep_sessions','workouts','workout_samples','route_points','raw_records','ai_exchanges','training_plan_drafts']}}
db.close()
(root.parent/'mock-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
reply='【完整模拟回复】\n我们已按周三休息、保留一次质量课的要求谈妥。下面是定稿；所有安排均为演示用途。\n\n```json\n'+json.dumps(current,ensure_ascii=False,indent=2)+'\n```\n'
(root.parent/'模拟 AI 定稿.md').write_text(reply,encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False,indent=2))

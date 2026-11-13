"""trace_nest.py <trace> <起始ms> <窗口ms> — 展开窗口内主线程 ≥1ms 的任务，附样式 / 布局失效提示。"""
import sys, json
d = json.load(open(sys.argv[1], encoding='utf-8')); ev = d['traceEvents'] if isinstance(d, dict) else d
names = {(e['pid'], e['tid']): e['args']['name'] for e in ev if e.get('ph') == 'M' and e.get('name') == 'thread_name'}
X = [e for e in ev if e.get('ph') == 'X' and 'dur' in e]; t0 = min(e['ts'] for e in X)
at, win = float(sys.argv[2]), float(sys.argv[3])
main = sorted((e for e in X if names.get((e['pid'], e['tid'])) == 'CrRendererMain' and at <= (e['ts'] - t0) / 1000 <= at + win and e['dur'] >= 1000), key=lambda e: e['ts'])
for e in main:
    a = e.get('args', {})
    extra = ''
    for k in ('beginData', 'data'):
        if k in a:
            v = a[k]
            extra = json.dumps({kk: v[kk] for kk in list(v)[:6] if kk not in ('stackTrace',)}, ensure_ascii=False)[:220]
    print(f"{(e['ts']-t0)/1000:8.1f} {e['dur']/1000:6.1f} {e['name']} {extra}")
# instant events: style invalidation hints
inv = [e for e in ev if names.get((e.get('pid'), e.get('tid'))) == 'CrRendererMain' and at <= (e.get('ts', 0) - t0) / 1000 <= at + win and ('Invalidat' in e.get('name', '') or 'ScheduleStyle' in e.get('name', ''))]
import collections
print(collections.Counter(e['name'] for e in inv).most_common(10))
for e in inv[:12]:
    print('  ', e['name'], json.dumps(e.get('args', {}).get('data', {}), ensure_ascii=False)[:260])

"""trace_frames.py <trace> — 主线程每帧（BeginMainFrame > 4ms）与分层 / 绘制耗时合计。"""
import sys, json, collections
d = json.load(open(sys.argv[1], encoding='utf-8')); ev = d['traceEvents'] if isinstance(d, dict) else d
names = {(e['pid'], e['tid']): e['args']['name'] for e in ev if e.get('ph') == 'M' and e.get('name') == 'thread_name'}
X = [e for e in ev if e.get('ph') == 'X' and 'dur' in e]; t0 = min(e['ts'] for e in X)
main = [e for e in X if names.get((e['pid'], e['tid'])) == 'CrRendererMain']
bmf = sorted((e for e in main if e['name'] == 'ProxyMain::BeginMainFrame'), key=lambda e: e['ts'])
lay = [e for e in main if e['name'] == 'PaintArtifactCompositor::Update']
pnt = [e for e in main if e['name'] == 'Paint']
print('BMF count', len(bmf), 'layerize', len(lay), 'sum', round(sum(e['dur'] for e in lay)/1000,1), 'paint sum', round(sum(e['dur'] for e in pnt)/1000,1))
print(' '.join(f"{(e['ts']-t0)/1000:.0f}:{e['dur']/1000:.0f}" for e in bmf if e['dur'] > 4000))
# compositor-driven frames: count DrawFrame / Display::DrawAndSwap on viz
df = [e for e in X if e['name'] in ('Display::DrawAndSwap',)]
print('DrawAndSwap', len(df))

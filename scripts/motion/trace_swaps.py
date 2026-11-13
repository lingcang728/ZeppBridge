"""trace_swaps.py <trace>... — 首次输入后的 DrawAndSwap 帧间隔（ms）、GPU 与光栅长任务（>8ms）。"""
import sys, json
for f in sys.argv[1:]:
    d = json.load(open(f, encoding='utf-8')); ev = d['traceEvents'] if isinstance(d, dict) else d
    names = {(e['pid'], e['tid']): e['args']['name'] for e in ev if e.get('ph') == 'M' and e.get('name') == 'thread_name'}
    X = [e for e in ev if e.get('ph') == 'X' and 'dur' in e]; t0 = min(e['ts'] for e in X)
    sw = sorted(e['ts'] for e in X if e['name'] == 'Display::DrawAndSwap')
    ts = [(t - t0) / 1000 for t in sw]
    gaps = [round(b - a) for a, b in zip(ts, ts[1:])]
    print(f, 'swaps', len(ts), 'first', round(ts[0]) if ts else None, 'last', round(ts[-1]) if ts else None)
    print('  gaps', gaps)
    gpu = sorted((e for e in X if names.get((e['pid'], e['tid'])) == 'CrGpuMain' and e['name'] == 'SkiaOutputSurfaceImplOnGpu::FinishPaintRenderPass' and e['dur'] > 8000), key=lambda e: e['ts'])
    print('  gpu>8ms', [(round((e['ts'] - t0) / 1000), round(e['dur'] / 1000)) for e in gpu])
    rast = sorted((e for e in X if 'Raster' in e['name'] and e['dur'] > 8000), key=lambda e: e['ts'])
    print('  raster>8ms', [(round((e['ts'] - t0) / 1000), round(e['dur'] / 1000), e['name'][:30]) for e in rast][:12])

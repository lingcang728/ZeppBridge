"""生成玻璃胶囊的折射位移图（src/assets/glass/*.png）。

借的是 liquidGL（MIT）的折射思路：胶囊是一块边缘有斜面的玻璃，靠近边缘的地方把背后的内容往里「拉」，
中间略微放大。浏览器里用 SVG feDisplacementMap 实现：输出像素 (x, y) 取输入里
(x + scale·(R − .5), y + scale·(G − .5)) 那一点，所以 R / G 存的是「往哪边取样」。

CSP 不允许 data: / blob: 图片，位移图不能在运行时用 canvas 生成，只能作为实体文件由 Vite 产出。
图按常见的宽高比生成，运行时拉伸到元素大小（preserveAspectRatio="none"）。

三个通道：R / G 是往哪边取样（128 = 不动），B 是「离边缘多近」（0 = 中间，255 = 最外圈）。
滤镜只在 B > 0 的那一圈用折弯后的结果（再轻轻模糊一点），中间直接透出原图——一个像素都不重采样，
字和不开折射时一样清楚（用户 2026-09-30：「一拖就整块糊」）。

用法：python scripts/assets/build-glass-lens-maps.py
"""
import math
import os
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'assets', 'glass')


def stadium_sdf(x, y, w, h):
    """点到胶囊（两端半圆）边界的有向距离：里面为正。返回 (距离, 指向里面的单位法向)。"""
    r = h / 2
    cx = min(max(x, r), w - r)
    cy = h / 2
    dx, dy = x - cx, y - cy
    dist = math.hypot(dx, dy)
    inside = r - dist
    if dist < 1e-6:
        return inside, (0.0, 0.0)
    return inside, (-dx / dist, -dy / dist)


def build(name, w, h, bevel, edge_strength, magnify):
    """bevel：斜面宽度（占半高的比例）；edge_strength：边缘位移（占 scale 的比例，≤1）；magnify：中间放大量。"""
    img = Image.new('RGB', (w, h))
    px = img.load()
    half = h / 2
    for j in range(h):
        for i in range(w):
            x, y = i + 0.5, j + 0.5
            d, (nx, ny) = stadium_sdf(x, y, w, h)
            ox = oy = 0.0
            edge = 0.0
            if d > 0:
                b = bevel * half
                if d < b:
                    # 越靠边拉得越狠，但一路平滑：二次曲线。圆弧斜面在边上斜率无穷大，
                    # 取样点跳得太快，字被撕成碎片（第一版原型就是这样）。
                    t = 1 - d / b
                    k = edge_strength * t * t
                    ox += nx * k
                    oy += ny * k
                    # 边缘权重：斜面里从 0 平滑升到 1（smoothstep），中间是 0。
                    edge = t * t * (3 - 2 * t)
                # 中间略微放大：取样点往中心收。
                ox += (w / 2 - x) / (w / 2) * magnify
                oy += (h / 2 - y) / half * magnify
            ox = max(-1.0, min(1.0, ox))
            oy = max(-1.0, min(1.0, oy))
            # 中间（edge = 0）严格写 128：滤镜在那里本来也不用折弯结果，写死只是让图干净。
            if edge == 0:
                px[i, j] = (128, 128, 0)
            else:
                px[i, j] = (round(127.5 + ox * 127.5), round(127.5 + oy * 127.5), round(edge * 255))
    os.makedirs(OUT, exist_ok=True)
    img.save(os.path.join(OUT, name), optimize=True)
    print(name, w, h)


# 滑块（约 3:1）：只在拖动时浮起的玻璃——外圈一窄条把字往里弯，中间原样清楚（不放大：放大就是重采样，字会软）。
build('lens-thumb.png', 384, 128, bevel=0.5, edge_strength=0.7, magnify=0.0)
# 整条胶囊外沿（约 6:1）：只在边上一圈折射背后的页面，中间不动。
build('lens-rim.png', 768, 128, bevel=0.6, edge_strength=0.7, magnify=0.0)

"""生成玻璃的折射位移图（src/assets/glass/*.png）。2026-10-01 第四版。

iOS 26 Liquid Glass 的边：**放大 + 模糊 + 玻璃自身的散射**，中间原样清楚。
- 放大：斜面往里取样（边上的像素取更靠里的内容），而且越靠边位移越大——取样位置随离边距离变化得比像素慢，
  于是边上那一圈里的内容被拉开，就是放大。离边距离 s、斜面宽 b，位移 D(s) = Dmax·(1 − s/b)²，
  Dmax = 0.45·b：最外缘 D′ = −0.9，拉开约十倍（字一到边上就被抻长），往里平滑落回原样，处处单调、不会折叠。
- 第三版是往外取样、位移往里递减：数学上正好是把更多内容挤进更窄的地方——缩小，同一段字还会被画两遍
  （滚轮里的「Englissh」）。那一版错在这里。
- 模糊和散射在滤镜里做（lib/glassLens.ts），强度都跟着这里的位移大小走：越靠边越糊、越亮。

图按「端帽 + 中段」切开生成：胶囊两端是半圆、中段沿长边处处一样，运行时滤镜把左帽、中段、右帽按元素
的真实宽高摆好再拼起来，任何长宽比都是正确的半圆端。

四个通道：
- R / G：往哪边取样（128 = 不动；feDisplacementMap 取 (x + s·(R − .5), y + s·(G − .5))）。
- B：位移大小 m（0 = 中间不动，1 = 最外缘）。滤镜拿它算「用不用折射结果」「糊多少」「亮多少」。
- A：胶囊形状（端帽圆弧外透明，滤镜拿它裁输出）。

CSP 不允许 data: / blob: 图片，位移图不能在运行时用 canvas 生成，只能作为实体文件由 Vite 产出。

用法：python scripts/assets/build-glass-lens-maps.py
"""
import math
import os
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'assets', 'glass')
H = 128          # 图高；端帽是 H/2 × H，中段是 4 × H


def pixel(ox, oy, m):
    return (round(127.5 + ox * 127.5), round(127.5 + oy * 127.5), round(m * 255))


def build(prefix, bevel):
    """bevel：斜面宽度，占半高的比例。位移强度（占胶囊高度的比例）由滤镜按 0.45·bevel·半高 换算。"""
    r = H // 2
    bevel_px = bevel * r
    neutral = (128, 128, 0)

    def at(dist, nx, ny):
        """dist：离边距离；(nx, ny)：朝外的单位法向。往里取样 = 沿 −法向。"""
        dist = max(dist, 0.0)
        if dist >= bevel_px:
            return neutral
        m = (1 - dist / bevel_px) ** 2
        return pixel(-nx * m, -ny * m, m)

    def coverage(i, j):
        """像素被半圆盖住多少（4×4 超采样）：端帽圆弧外是透明的，滤镜靠它把输出裁成胶囊。"""
        hits = 0
        for a in range(4):
            for b in range(4):
                if math.hypot(i + (a + 0.5) / 4 - r, j + (b + 0.5) / 4 - r) <= r:
                    hits += 1
        return round(hits / 16 * 255)

    # 左端帽：圆心在 (r, r)，只覆盖 x ∈ [0, r)。带透明度：圆弧外透明（feDisplacementMap 按非预乘的颜色取位移，
    # 透明度不影响位移）。
    cap_l = Image.new('RGBA', (r, H), neutral + (0,))
    cap_r = Image.new('RGBA', (r, H), neutral + (0,))
    for j in range(H):
        for i in range(r):
            alpha = coverage(i, j)
            if alpha == 0:
                continue
            x, y = i + 0.5, j + 0.5
            dx, dy = x - r, y - r
            dist_c = math.hypot(dx, dy)
            if dist_c < 1e-6:
                cap_l.putpixel((i, j), neutral + (alpha,))
                cap_r.putpixel((r - 1 - i, j), neutral + (alpha,))
                continue
            nx, ny = dx / dist_c, dy / dist_c
            cap_l.putpixel((i, j), at(r - dist_c, nx, ny) + (alpha,))
            # 右端帽是左端帽的镜像：法向 x 分量取反。
            cap_r.putpixel((r - 1 - i, j), at(r - dist_c, -nx, ny) + (alpha,))
    mid = Image.new('RGB', (4, H), neutral)
    for j in range(H):
        y = j + 0.5
        px = at(y, 0.0, -1.0) if y < H - y else at(H - y, 0.0, 1.0)
        for i in range(4):
            mid.putpixel((i, j), px)

    os.makedirs(OUT, exist_ok=True)
    for name, img in ((f'{prefix}-cap-l.png', cap_l), (f'{prefix}-cap-r.png', cap_r), (f'{prefix}-mid.png', mid)):
        img.save(os.path.join(OUT, name), optimize=True)
        print(name, img.size)


# 透镜（按住 / 拖动 / 滑动时浮起来的那块，和滚轮的镜片）：斜面占半高的六成，正中约四成高原样透出。
build('lens', bevel=0.6)
# 整条胶囊的外沿：斜面窄得多，只在边上放大一圈，里面的字不动。
build('rim', bevel=0.3)

"""生成玻璃的折射位移图（src/assets/glass/*.png）。2026-10-01 第三版：照 iOS 26 的 Liquid Glass 重做。

对着苹果 App Store 标签栏的录屏逐帧看出来的几件事（第二版全反了）：
- 透镜是一块凸起的玻璃，斜面把**外面**的东西折进来：透镜上下沿里看到的是胶囊外面那一圈暗底，
  胶囊的边线被「搬」到透镜里面一截；字刚出透镜边，就在边上被拉长、镜像。所以取样方向是**往外**。
  第二版是往里取样（把中间的东西往外推），看上去像一圈放大镜框，不像玻璃。
- 斜面很窄、越靠边折得越狠（凸面的法线在边上接近水平），中间一点不弯、一点不糊。

位移曲线是对着录屏量出来的：先试过 kube.io 那套「convex squircle 斜面 + 斯涅尔定律」的物理模型，
算出来的位移几乎全挤在最外一两个像素（约 1/距离 衰减），透镜里的胶囊边线根本挪不动；而录屏里胶囊边线被
搬进透镜约一成半高、两端的字在半个端帽宽的范围里都在拉长。改用 (1 − t)^1.6（t = 离边距离 / 斜面宽），
斜面占半高的八成五：边上最狠、往里平滑减弱，中间约三成高完全不动。

图按「端帽 + 中段」切开生成：胶囊两端是半圆、中段沿长边处处一样，运行时滤镜把左帽、中段、右帽按元素
的真实宽高摆好再拼起来（lib/glassLens.ts），任何长宽比都是正确的半圆端，不再把一张图硬拉伸变形。

四个通道：A 是胶囊形状（端帽圆弧外透明，滤镜拿它裁输出）；R / G 是往哪边取样（128 = 不动；feDisplacementMap 取 (x + s·(R − .5), y + s·(G − .5))），
B 是「在斜面上」的权重（0 = 中间，滤镜在那里直接透出原图，一个像素都不重采样）。

CSP 不允许 data: / blob: 图片，位移图不能在运行时用 canvas 生成，只能作为实体文件由 Vite 产出。

用法：python scripts/assets/build-glass-lens-maps.py
"""
import math
import os
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'assets', 'glass')
H = 128          # 图高；端帽是 H/2 × H，中段是 4 × H
FALLOFF = 1.6    # 位移随离边距离减弱的幂


def profile(bevel_px):
    """离边距离 d（像素）→ 取样位移大小，最外缘为 1。"""
    def shift(d):
        if d >= bevel_px:
            return 0.0
        return (1 - max(d, 0.0) / bevel_px) ** FALLOFF
    return shift


def pixel(ox, oy, w):
    return (round(127.5 + ox * 127.5), round(127.5 + oy * 127.5), round(w * 255))


def edge_weight(m):
    """按位移大小给权重：位移到最大值的四分之一以上才完全用折射结果，往里随位移平滑落到 0。
    位移不到一个像素的地方（斜面内侧大半圈）就是原图——滤镜里折射结果还要轻轻糊一下，
    权重若在整个斜面上都是 1，透镜正中的字也会被这一下糊软（第三版初稿就是这样）。"""
    u = min(1.0, m / 0.25)
    return u * u * (3 - 2 * u)


def build(prefix, bevel):
    """bevel：斜面宽度，占半高的比例。"""
    r = H // 2
    bevel_px = bevel * r
    mag = profile(bevel_px)
    neutral = (128, 128, 0)

    def at(dist, nx, ny):
        # 压在边上、像素中心略出界的那一圈按最外缘算（它的透明度由覆盖率决定）。
        dist = max(dist, 0.01)
        m = mag(dist)
        w = edge_weight(m)
        if w == 0:
            return neutral
        # 往外取样：(nx, ny) 是朝外的单位法向。
        return pixel(nx * m, ny * m, w)

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
        top, bottom = y, H - y
        if top < bottom:
            px = at(top, 0.0, -1.0)
        else:
            px = at(bottom, 0.0, 1.0)
        for i in range(4):
            mid.putpixel((i, j), px)

    os.makedirs(OUT, exist_ok=True)
    for name, img in ((f'{prefix}-cap-l.png', cap_l), (f'{prefix}-cap-r.png', cap_r), (f'{prefix}-mid.png', mid)):
        img.save(os.path.join(OUT, name), optimize=True)
        print(name, img.size)


# 透镜（拖动 / 按住时浮起来的那块）：斜面占半高的八成五，中间约三成高原样透出。
build('lens', bevel=0.85)
# 整条胶囊的外沿：斜面窄得多，只在边上折一圈背后的页面，里面的字不动。
build('rim', bevel=0.4)

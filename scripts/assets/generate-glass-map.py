"""生成液态玻璃镜片用的位移贴图 src/assets/glass/displacement-pill.png。

算法逐行移植自 rdev/liquid-glass-react 的 src/shader-utils.ts（MIT，
Copyright 2025 Max Rovensky；它本身改编自 shuding/liquid-glass，MIT）：
对每个像素求胶囊形状的有向距离场，离边越近位移越大，把画面往中心收——
叠在 backdrop-filter 上就是「玻璃边缘的折射」。

为什么在构建期生成：原库在运行时用 canvas 生成 data: URL 交给 <feImage>，
而本应用的 CSP（img-src 'self' asset:）不允许 data: 图片。所以同一套数学
在这里预先算好，存成实体 PNG，让 Vite 当普通资源打包。

    python scripts/assets/generate-glass-map.py
"""
from pathlib import Path

from PIL import Image

# 胶囊镜片的典型比例（宽 : 高 ≈ 3.5 : 1）；滤镜里按 100% 拉伸到实际尺寸。
WIDTH, HEIGHT = 280, 80
OUT = Path(__file__).resolve().parents[2] / 'src' / 'assets' / 'glass' / 'displacement-pill.png'


def smooth_step(a: float, b: float, t: float) -> float:
    t = max(0.0, min(1.0, (t - a) / (b - a)))
    return t * t * (3 - 2 * t)


def rounded_rect_sdf(x: float, y: float, width: float, height: float, radius: float) -> float:
    qx = abs(x) - width + radius
    qy = abs(y) - height + radius
    return min(max(qx, qy), 0.0) + (max(qx, 0.0) ** 2 + max(qy, 0.0) ** 2) ** 0.5 - radius


def fragment(u: float, v: float) -> tuple[float, float]:
    """原库的 fragmentShaders.liquidGlass，半宽/半高按胶囊比例放宽，圆角取满。"""
    ix, iy = u - 0.5, v - 0.5
    distance_to_edge = rounded_rect_sdf(ix, iy, 0.42, 0.3, 0.3)
    displacement = smooth_step(0.8, 0.0, distance_to_edge - 0.15)
    scaled = smooth_step(0.0, 1.0, displacement)
    return ix * scaled + 0.5, iy * scaled + 0.5


def main() -> None:
    w, h = WIDTH, HEIGHT
    raw: list[tuple[float, float]] = []
    max_scale = 0.0
    for y in range(h):
        for x in range(w):
            px, py = fragment(x / w, y / h)
            dx, dy = px * w - x, py * h - y
            max_scale = max(max_scale, abs(dx), abs(dy))
            raw.append((dx, dy))
    max_scale = max(max_scale, 1.0)

    image = Image.new('RGBA', (w, h))
    pixels = image.load()
    for index, (dx, dy) in enumerate(raw):
        x, y = index % w, index // w
        # 贴图最外两像素渐弱，免得边上出硬折痕（原库同样处理）。
        edge = min(1.0, min(x, y, w - x - 1, h - y - 1) / 2)
        r = (dx * edge) / max_scale + 0.5
        g = (dy * edge) / max_scale + 0.5
        to_byte = lambda value: max(0, min(255, round(value * 255)))
        pixels[x, y] = (to_byte(r), to_byte(g), to_byte(g), 255)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT, optimize=True)
    print(f'wrote {OUT.relative_to(OUT.parents[2])} ({w}×{h}, max scale {max_scale:.2f}px)')


if __name__ == '__main__':
    main()

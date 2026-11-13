"""contact_sheet.py <dir> <out> <cols> [width] [起 止] — 把 video_grab.sh 抽出的帧拼成带文件名的联系表。"""
import sys, os
from PIL import Image, ImageDraw
d, out, cols = sys.argv[1], sys.argv[2], int(sys.argv[3])
w = int(sys.argv[4]) if len(sys.argv) > 4 else 480
names = sorted(os.listdir(d))
if len(sys.argv) > 5:
    lo, hi = float(sys.argv[5]), float(sys.argv[6])
    def t(n):
        try:
            return float(n.lstrip('t').rsplit('.', 1)[0])
        except ValueError:
            return -1
    names = [n for n in names if lo <= t(n) <= hi]
imgs = [Image.open(os.path.join(d, n)).convert('RGB') for n in names]
h = int(imgs[0].height * w / imgs[0].width)
rows = (len(imgs) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * (h + 18)), 'white')
dr = ImageDraw.Draw(sheet)
for i, (n, im) in enumerate(zip(names, imgs)):
    x, y = (i % cols) * w, (i // cols) * (h + 18)
    sheet.paste(im.resize((w, h)), (x, y + 18))
    dr.text((x + 4, y + 2), n, fill='black')
sheet.save(out, quality=85)
print(len(imgs), sheet.size)

import sys
sys.path.insert(0, sys.argv[2])
from dsr import Rom, palette, chars, cells, render_cell
from PIL import Image, ImageDraw
r = Rom(sys.argv[1]); outp = sys.argv[3]
N = r.count('BTCHR.PAK') // 5; S = 64; W = 16; PER = 160
for page in range((N + PER - 1) // PER):
    ids = range(page * PER, min(N, (page + 1) * PER))
    sheet = Image.new('RGBA', (W * S, ((len(ids) + W - 1) // W) * (S + 11)), (30, 40, 70, 255)); d = ImageDraw.Draw(sheet)
    for k, g in enumerate(ids):
        x = (k % W) * S; y = (k // W) * (S + 11)
        try:
            b = g * 5; ch = chars(r.entry('BTCHR.PAK', b + 1)); pal = palette(r.entry('BTCHR.PAK', b + 2)); cs, mp = cells(r.entry('BTCHR.PAK', b + 3))
            im = render_cell(cs[0], ch, pal, mp); im.thumbnail((S - 2, S - 2)); sheet.paste(im, (x + 1, y + 1), im)
        except Exception as e: pass
        d.text((x + 2, y + S - 1), str(g), fill=(255, 255, 0, 255))
    sheet.save(f'{outp}_{page}.png'); print('page', page)

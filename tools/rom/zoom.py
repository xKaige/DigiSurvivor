import sys
sys.path.insert(0, sys.argv[2])
from dsr import Rom, palette, chars, cells, render_cell
from PIL import Image
r = Rom(sys.argv[1]); out = sys.argv[3]; ids = list(map(int, sys.argv[4:]))
ims = []
for g in ids:
    b = g * 5; ch = chars(r.entry('BTCHR.PAK', b + 1)); pal = palette(r.entry('BTCHR.PAK', b + 2)); cs, mp = cells(r.entry('BTCHR.PAK', b + 3))
    im = render_cell(cs[0], ch, pal, mp); ims.append(im.resize((im.width * 3, im.height * 3), Image.NEAREST))
W = sum(i.width for i in ims) + 10 * len(ims); H = max(i.height for i in ims)
s = Image.new('RGBA', (W, H), (30, 40, 70, 255)); x = 0
for i in ims: s.paste(i, (x, 0), i); x += i.width + 10
s.save(out); print(out)

# Arma hojas 2x6 (formato del juego) con los sprites de batalla del ROM.
# Todas las hojas de una línea usan el MISMO tamaño de cuadro y el mismo punto de anclaje,
# así se mantiene el tamaño relativo entre etapas (un bebé se ve chico y un Mega grande).
# Filas: 0 quieto, 1 caminar, 2 muerto, 3 golpe, 4 festejo, 5 ataque.
import sys, json
sys.path.insert(0, sys.argv[2])
from dsr import Rom, palette, chars, cells, render_cell
from PIL import Image
r = Rom(sys.argv[1]); outdir = sys.argv[3]; spec = json.loads(sys.argv[4])  # {"archivo.png": id}
ROWS = [(0, 1), (0, 2), (3, 3), (3, 3), (4, 4), (4, 4)]

data = {}
for fname, g in spec.items():
    b = g * 5
    data[fname] = (chars(r.entry('BTCHR.PAK', b + 1)), palette(r.entry('BTCHR.PAK', b + 2)), *cells(r.entry('BTCHR.PAK', b + 3)))
# límites globales en coordenadas del origen del sprite
xs0 = ys0 = 10 ** 9; xs1 = ys1 = -10 ** 9
for ch, pal, cs, mp in data.values():
    for c in cs[:5]:
        for o in c:
            xs0 = min(xs0, o['x']); ys0 = min(ys0, o['y']); xs1 = max(xs1, o['x'] + o['w']); ys1 = max(ys1, o['y'] + o['h'])
half = max(-xs0, xs1); fw = 2 * half; fh = ys1 - ys0
fw = (fw + 7) // 8 * 8; fh = (fh + 7) // 8 * 8
print('cuadro', fw, 'x', fh)
for fname, (ch, pal, cs, mp) in data.items():
    sheet = Image.new('RGBA', (fw * 2, fh * 6), (0, 0, 0, 0))
    for row, pair in enumerate(ROWS):
        for col, ci in enumerate(pair):
            c = cs[min(ci, len(cs) - 1)]
            im = render_cell(c, ch, pal, mp)
            cx0 = min(o['x'] for o in c); cy0 = min(o['y'] for o in c)
            sheet.paste(im, (col * fw + fw // 2 + cx0, row * fh + (cy0 - ys0)), im)
    sheet.save(f'{outdir}/{fname}'); print(fname, sheet.size)

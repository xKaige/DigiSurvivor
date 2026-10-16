# Comparación a escala del juego (cada cuadro se dibuja a 96 px de alto, como drawBuddy).
import sys
from PIL import Image, ImageDraw
cur, new, out = sys.argv[1], sys.argv[2], sys.argv[3]
files = ['gigimon_2.png', 'guilmon_3.png', 'growmon_4.png', 'megalogrowmon_5.png', 'dukemon_6_1.png']
names = ['Gigimon', 'Guilmon', 'Growmon', 'WarGrowlmon', 'Dukemon']
BG = (5, 11, 26, 255); H = 96 * 2  # x2 para que se vea mejor

def frame(path, key_white):
    im = Image.open(path).convert('RGBA'); fw, fh = im.width // 2, im.height // 6
    f = im.crop((0, 0, fw, fh))
    if key_white:
        px = f.load()
        for y in range(f.height):
            for x in range(f.width):
                r, g, b, a = px[x, y]
                if r > 240 and g > 240 and b > 240: px[x, y] = (r, g, b, 0)
    return f.resize((round(fw * H / fh), H), Image.NEAREST)

cols = [('Actual (Workshop)', cur, True), ('ROM Dusk - loader de hoy', new, True), ('ROM Dusk - sin quitar blancos', new, False)]
CW = 330
sheet = Image.new('RGBA', (140 + CW * len(cols), 30 + len(files) * (H + 10)), BG); d = ImageDraw.Draw(sheet)
for j, (t, _, _) in enumerate(cols): d.text((140 + j * CW + 10, 8), t, fill=(255, 210, 63, 255))
for i, (f, n) in enumerate(zip(files, names)):
    y = 30 + i * (H + 10); d.text((10, y + H // 2), n, fill=(255, 255, 255, 255))
    for j, (_, folder, kw) in enumerate(cols):
        im = frame(f'{folder}/{f}', kw); x = 140 + j * CW + (CW - im.width) // 2
        d.line((140 + j * CW, y + H - 1, 140 + (j + 1) * CW - 10, y + H - 1), fill=(14, 42, 74, 255))
        sheet.paste(im, (x, y), im)
sheet.save(out); print(out, sheet.size)

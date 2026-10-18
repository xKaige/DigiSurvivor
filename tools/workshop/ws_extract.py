# Extrae los avatares de los packs del Workshop a una carpeta de trabajo.
# Uso: py -P ws_extract.py <carpeta workshop> <salida> <id> [<id> ...]
# - Normaliza las hojas de 7 filas (128x448, con baile) sacando la fila 5 -> 2x6 (128x384).
# - Guarda <salida>/sprites/<nombre normalizado>.png y <salida>/index.json con pack, nombre original y tamaño.
import sys, os, json, zipfile, io, re
from PIL import Image

ws, out, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
os.makedirs(os.path.join(out, 'sprites'), exist_ok=True)
index = {}

def norm(n):
    n = os.path.splitext(n)[0].strip().lower()
    n = re.sub(r'[^a-z0-9]+', '_', n).strip('_')
    return n

for pid in ids:
    d = os.path.join(ws, pid)
    zs = [f for f in os.listdir(d) if f.endswith('.zip')]
    if not zs:
        print('sin zip', pid); continue
    with zipfile.ZipFile(os.path.join(d, zs[0])) as z:
        for info in z.infolist():
            nm = info.filename
            if not re.match(r'(?i)^avatars/[^/]+\.png$', nm):
                continue
            raw = z.read(info)
            try:
                im = Image.open(io.BytesIO(raw)).convert('RGBA')
            except Exception as e:
                print('no se pudo abrir', pid, nm, e); continue
            w, h = im.size
            if (w, h) == (128, 448):   # 7 filas: idle, walk, sit, stand, jump, dance, attack -> sin la fila 5
                rows = [im.crop((0, r * 64, 128, r * 64 + 64)) for r in range(7)]
                im2 = Image.new('RGBA', (128, 384), (0, 0, 0, 0))
                for i, r in enumerate([0, 1, 2, 3, 4, 6]):
                    im2.paste(rows[r], (0, i * 64))
                im = im2
            elif (w, h) != (128, 384):
                print('tamaño raro', pid, nm, (w, h))
            key = norm(os.path.basename(nm))
            if key in index:   # repetido en otro pack: queda el primero, se anota el otro
                index[key].setdefault('also', []).append(pid)
                continue
            im.save(os.path.join(out, 'sprites', key + '.png'))
            index[key] = {'pack': pid, 'orig': os.path.basename(nm), 'size': list(im.size), 'raw': [w, h]}

json.dump(index, open(os.path.join(out, 'index.json'), 'w'), indent=1)
print(len(index), 'sprites únicos')

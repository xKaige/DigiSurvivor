# Exporta los efectos de Digital Tamers: Reborn (data.win) como tiras horizontales en assets/sprites/fx/, los clasifica
# por elemento (color promedio) y por uso (pr = proyectil, hit = impacto, nv = pulso de área) y le da a cada skill de
# skills.json un efecto propio de su elemento ("fxSkill": { id: { pr, hit, nv } }), así no se ven todas iguales.
# Uso (desde la raíz del repo): py -P tools/fx/export_fx.py <carpeta con gm.py y dtr/data.win>
import sys, os, re, io, json, colorsys, hashlib
from PIL import Image
SRC = sys.argv[1]; sys.path.insert(0, SRC)
from gm import DataWin

OUT = 'assets/sprites/fx'; SK = 'src/data/skills.json'
PRE = {'spr_bullet': 'pr', 'spr_ball': 'pr', 'spr_arrow': 'pr', 'spr_fire': 'pr', 'spr_wind': 'pr', 'spr_poop_proj': None,
       'spr_exp': 'hit', 'spr_SpExp': 'hit', 'spr_power': 'hit', 'spr_shock': 'nv', 'spr_Pillar': 'nv', 'spr_Barrage': 'nv'}
dw = DataWin(os.path.join(SRC, 'dtr', 'data.win'))
tex = dw.textures(); pages = {}
def page(i):
    if i not in pages: pages[i] = Image.open(io.BytesIO(dw.png_bytes(tex[i]))).convert('RGBA')
    return pages[i]

def element(img):
    px = [p for p in img.getdata() if p[3] > 120]
    if not px: return None
    r = sum(p[0] for p in px) / len(px) / 255; g = sum(p[1] for p in px) / len(px) / 255; b = sum(p[2] for p in px) / len(px) / 255
    h, s, v = colorsys.rgb_to_hsv(r, g, b); h *= 360
    if s < 0.22: return 'light' if v > 0.72 else 'metal'
    if 20 <= h < 48 and v < 0.62: return 'earth'
    if h < 22 or h >= 335: return 'fire'
    if h < 48: return 'fire' if s > 0.55 else 'earth'
    if h < 72: return 'electric'
    if h < 165: return 'wind'
    if h < 255: return 'water'
    return 'dark'

made = {}
for sp in dw.sprites():
    m = re.match(r'^(spr_[A-Za-z]+?)(\d+)$', sp['name'])
    if not m or m.group(1) not in PRE or not PRE[m.group(1)] or not sp['frames']: continue
    W, H = sp['w'], sp['h']
    if W < 8 or H < 8 or W > 260 or H > 260 or len(sp['frames']) > 24: continue
    strip = Image.new('RGBA', (W * len(sp['frames']), H))
    for k, f in enumerate(sp['frames']):
        pg = page(f['tex']); crop = pg.crop((f['sx'], f['sy'], f['sx'] + f['sw'], f['sy'] + f['sh']))
        if (f['tw'], f['th']) != (f['sw'], f['sh']) and f['tw'] and f['th']: crop = crop.resize((f['tw'], f['th']), Image.NEAREST)
        strip.paste(crop, (k * W + f['tx'], f['ty']), crop)
    el = element(strip)
    if not el: continue
    use = PRE[m.group(1)]
    if m.group(1) == 'spr_shock' and W < 100: use = 'hit'
    if m.group(1) == 'spr_power' and W >= 90: use = 'nv'
    key = (m.group(1)[4:] + m.group(2)).lower()
    strip.save(os.path.join(OUT, key + '.png'))
    made[key] = {'file': key + '.png', 'w': W, 'h': H, 'n': len(sp['frames']), 'use': use, 'el': el}

d = json.load(open(SK, encoding='utf-8'))
fs = d.setdefault('fxSprites', {})
for k, v in made.items(): fs[k] = {'file': v['file'], 'w': v['w'], 'h': v['h'], 'n': v['n']}
# pools por elemento y uso (si un elemento no tiene de un uso, toma los neutrales/claros)
pool = {}
for k, v in made.items(): pool.setdefault((v['el'], v['use']), []).append(k)
NEAR = {'neutral': ['light', 'metal'], 'earth': ['fire', 'metal'], 'metal': ['light', 'electric'], 'light': ['electric', 'metal'],
        'water': ['wind', 'light'], 'wind': ['water', 'light'], 'dark': ['fire', 'metal'], 'electric': ['light', 'fire'], 'fire': ['earth', 'electric']}
# efectos que no se le asignan a ninguna skill: corazones (ball15, barrage07) y casquillos de bala (bullet10, bullet25)
BAN = {'ball15', 'barrage07', 'bullet10', 'bullet25'}
def choose(el, use, sid):
    for e in [el] + NEAR.get(el, []) + ['light']:
        L = sorted(x for x in pool.get((e, use), []) if x not in BAN)
        if L: return L[int(hashlib.md5((sid + use).encode()).hexdigest(), 16) % len(L)]
    return None
fxs = {}
for sid, s in d['skills'].items():
    el = s.get('element') or 'neutral'
    o = {u: choose(el, u, sid) for u in ('pr', 'hit', 'nv')}
    fxs[sid] = {u: v for u, v in o.items() if v}
d['fxSkill'] = fxs
json.dump(d, open(SK, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
from collections import Counter
print('efectos exportados:', len(made)); print(Counter((v['el'], v['use']) for v in made.values()))
print('skills con efecto propio:', len(fxs), '· efectos distintos usados:', len({x for o in fxs.values() for x in o.values()}))

# Arma las evoluciones alternativas (ramas en Campeón, Perfecto y forma final) de cada línea a partir de las tablas
# del Vital Bracelet Digital Monster (humulos.com/digimon/vbdm, guardadas en vb.json por vbparse.py), usando solo
# Digimon que tienen sprite en el juego (criaturas, enemigos o jefes).
# Uso (desde la raíz del repo): py -P tools/vb/gen_alts.py
#   - stages[3].alts / stages[4].alts: [{id, name, file, req, vp, from, bonus, desc}]   (from: ids de la etapa anterior; 'main' = la de siempre)
#   - branches: la primera (6_1) sale solo con experiencia; a las demás se les agregan from/req/vp de VB si coinciden,
#     y se suman las formas finales de VB que tenemos (id 'v_<clave>', file = sprite de otra carpeta, skills = las de 6_1)
# Requisitos (VB -> juego): Vital Values -> Digimon eliminados, Batallas -> jefes, % de victorias -> segundos sin daño,
# Trofeos -> puntos de un stat (rota FUE/VEL/INT/VIT).
import json, os, re, glob, math
R = '.'
VB = json.load(open(os.path.join(R, 'tools/vb/vb.json'), encoding='utf-8'))
CHART = {'001_guilmon': 'guil_ex', '002_renamon': 'rena_ex', '003_terriermon': 'terrier_ex', '005_veemon': 'awa', '006_gammamon': 'gamma',
         '007_pulsemon': 'ici', '009_ryudamon': 'ryuda', '010_wormmon': 'pwa', '011_zubamon': 'ryuda', '012_jellymon': 'jelly',
         '017_agumon': 'agu_ex', '018_gabumon': 'gabu_ex', '031_bearmon': 'chack_ex', '033_kokuwamon': 'blitz_ex', '034_sunarizamon': 'tdu',
         '035_sangomon': 'iti', '036_ludomon': 'espi', '037_liollmon': 'louwe_ex', '038_blucomon': 'bfa'}
norm = lambda s: re.sub(r'[^a-z0-9]', '', (s or '').lower())
ALIAS = {'megalogrowmon': 'wargrowlmon', 'vmon': 'vmon', 'metaltyranomon': 'metaltyrannomon', 'darktyranomon': 'darktyrannomon',
         'tyranomon': 'tyrannomon', 'galgomon': 'galgomon', 'saintgalgomon': 'saintgalgomon', 'mastertyranomon': 'mastertyrannomon',
         'cherubimonvirtue': 'cherubimonvirtud', 'kuzuhamonmikomode': 'sakuyamonmikomode', 'rapidmonarmor': 'rapidmonarmor'}

# ---------- sprites que tenemos ----------
have = {}
def put(name, info):
    n = norm(name)
    if n and n not in have: have[n] = dict(info, name=name)
crea = {}
for f in sorted(glob.glob(os.path.join(R, 'src/data/creatures/*.json'))):
    d = json.load(open(f, encoding='utf-8')); cid = os.path.basename(f)[:-5]; crea[cid] = (f, d)
    for st in d['stages']: put(st['name'], {'file': 'creatures/%s/%s' % (cid, st['file'])})
    for b in d['branches']:
        if '/' not in b['file']: put(b['name'], {'file': 'creatures/%s/%s' % (cid, b['file'])})
for e in json.load(open(os.path.join(R, 'src/data/enemies.json'), encoding='utf-8'))['list']:
    if e.get('file'): put(e['name'], {'file': 'enemies/' + e['file']})
for b in json.load(open(os.path.join(R, 'src/data/bosses.json'), encoding='utf-8'))['list']:
    put(b['name'], {'file': b['file'] if '/' in b['file'] else 'bosses/' + b['file']})
def find(name):
    n = norm(name); n2 = norm(re.sub(r'\(.*?\)', '', name or ''))
    for k in (n, ALIAS.get(n), n2, ALIAS.get(n2)):
        if k and k in have: return have[k]
    return None

# ---------- requisitos ----------
num = lambda v: None if not v or v == 'N/A' else int(re.sub(r'[^0-9]', '', v) or 0)
KF = {3: 0.6, 4: 0.5, 5: 0.5}
def reqs(vbreq, stage, k):
    r = (vbreq or [{}])[0]; tro, vv, bat, win = num(r.get('Trophies')), num(r.get('Vital Values')), num(r.get('Battles')), num(r.get('Win Ratio'))
    req, vp = {}, {}
    if tro: req[['FUE', 'VEL', 'INT', 'VIT'][k % 4]] = math.ceil(tro / 3)
    if vv: vp['kills'] = int(round(vv * KF[stage] / 10) * 10)
    # jefes: el Gate sale cada 90 s y no da para más (pedido 23/10/2026): Campeón 1, Perfecto 1–2, forma final 1–2
    if bat: vp['bosses'] = max(1, min({3: 1, 4: 2, 5: 2}[stage], math.ceil(bat / 5) - (1 if stage < 5 else 2)))
    if win: vp['nohit'] = {50: 30, 60: 40, 70: 50}.get(win, 30 + (win - 50))
    if not req and not vp: vp['kills'] = {3: 200, 4: 600, 5: 1200}[stage]   # VB "N/A" (la salida por defecto allá): algo mínimo acá
    score = (vv or 0) / 1000 + (bat or 0) / 10 + (tro or 0) / 10 + ((win or 0) - 40) / 30
    return req, vp, score
def bonus_of(stage, rank):
    if stage < 5: return {'dmg': 1 + rank // 2, 'hp': 15 + 10 * rank}
    return {'dmg': 3 + rank, 'hp': 50 + 20 * rank, 'multi': 1 if rank >= 2 else 0}
def desc_of(b):
    t = []
    if b.get('dmg'): t.append('+%d de daño' % b['dmg'])
    if b.get('hp'): t.append('+%d de vida' % b['hp'])
    if b.get('multi'): t.append('+%d proyectil' % b['multi'])
    return 'Evolución alternativa (Vital Bracelet): ' + ', '.join(t)

log = []
for cid, ch in CHART.items():
    f, d = crea[cid]; C = VB[ch]['stages']
    mainKey = {}   # etapa -> clave VB de la forma de siempre
    for s, col in ((3, 'adult'), (4, 'perfect')):
        nm = norm(d['stages'][s]['name'])
        for x in C.get(col, []):
            h = find(x['name'])
            if h and norm(h['name']) == nm: mainKey[s] = x['key']
    # Novato de la tabla que es el nuestro (hay tablas con dos: cada Campeón sale de uno solo)
    childKey = next((x['key'] for x in C.get('child', []) if (find(x['name']) or {}).get('name') and norm(find(x['name'])['name']) == norm(d['stages'][2]['name'])), None)
    lineFiles = {'creatures/%s/%s' % (cid, st['file']) for st in d['stages']}   # sprites de la línea: no se repiten como alternativa
    ids = {2: {'main'}}
    for s, col in ((3, 'adult'), (4, 'perfect')):
        st = d['stages'][s]; alts = []; seen = set(lineFiles)
        rows = [x for x in C.get(col, []) if x['key'] != mainKey.get(s)]
        scored = []
        for x in rows:
            h = find(x['name'])
            if not h or h['file'] in seen: continue
            if s == 3 and childKey and x['from'] and childKey not in x['from']: continue   # sale del otro Novato de la tabla
            fr = ['main'] if s == 3 else [('main' if k == mainKey.get(s - 1) else k) for k in x['from'] if k == mainKey.get(s - 1) or k in ids[s - 1]]
            fr = list(dict.fromkeys(fr))
            if not fr: continue
            seen.add(h['file'])
            req, vp, sc = reqs(x['reqs'], s, len(scored) + s)
            scored.append((sc, {'id': x['key'], 'name': h['name'], 'file': h['file'], 'from': fr, 'req': req, 'vp': vp}))
        scored.sort(key=lambda z: z[0])
        for rank, (_, a) in enumerate(scored):
            a['bonus'] = bonus_of(s, rank); a['desc'] = desc_of(a['bonus']); alts.append(a)
        st['alts'] = alts; ids[s] = {a['id'] for a in alts}
    # formas finales
    B = d['branches']; mainFinals = {norm(b['name']): b for b in B}
    newb = []; rank = 0
    for x in C.get('ultimate', []):
        h = find(x['name'])
        if not h or h['file'] in lineFiles: continue
        fr = [('main' if k == mainKey.get(4) else k) for k in x['from'] if k == mainKey.get(4) or k in ids[4]]
        fr = list(dict.fromkeys(fr))
        req, vp, sc = reqs(x['reqs'], 5, len(newb) + 1)
        b = mainFinals.get(norm(h['name']))
        if b is B[0]: continue                       # la de experiencia: sin requisitos ni from
        if b:                                        # ya la teníamos: toma los requisitos y el camino de VB
            b['req'], b['vp'] = req, vp
            if fr: b['from'] = fr
            b['vb'] = x['key']; continue
        if any(norm(n['name']) == norm(h['name']) for n in newb) or not fr: continue
        bo = bonus_of(5, rank); rank += 1
        newb.append({'id': 'v_' + x['key'], 'name': h['name'], 'file': h['file'], 'cols': 2, 'rows': 6, 'req': req, 'vp': vp, 'from': fr,
                     'desc': desc_of(bo), 'skills': list(B[0].get('skills') or []), 'family': B[0].get('family'), 'bonus': bo, 'vb': x['key']})
    B[0].pop('from', None); B[0]['req'] = {}; B[0]['vp'] = {}   # la primera: solo experiencia
    d['branches'] = B + newb
    d['vbChart'] = ch
    json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    log.append('%s (%s): Campeón %s · Perfecto %s · finales +%d' % (cid, ch, [a['name'] for a in d['stages'][3]['alts']], [a['name'] for a in d['stages'][4]['alts']], len(newb)))
print('\n'.join(log))

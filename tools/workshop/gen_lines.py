# Genera las líneas nuevas, sus skills, huevos/misiones y los enemigos a partir de los sprites del Workshop + Wikimon.
# Uso: py -P gen_lines.py <ws_new> <repo>
import sys, os, json, re, shutil, hashlib
D, R = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from curated import LINES
db = json.load(open(D + '/wm.json', encoding='utf-8')); idx = json.load(open(D + '/index.json'))
ex = json.load(open(D + '/existing.json'))
SK = json.load(open(R + '/src/data/skills.json', encoding='utf-8'))
UN = json.load(open(R + '/src/data/unlocks.json', encoding='utf-8'))
EN = json.load(open(R + '/src/data/enemies.json', encoding='utf-8'))
CANON = json.load(open(R + '/tools/canon-reference.json', encoding='utf-8'))['enemy']
def h(s): return int(hashlib.md5(s.encode()).hexdigest(), 16)

# ---------- nombres ----------
def disp(k):
    t = db.get(k, {}).get('title') or k
    t = re.sub(r'\s*\((?:\d{4} [Aa]nime(?: Version)?|Red|Blue|Green|[^)]*Version)\)', '', t)
    a, sep, b = t.partition(':')
    return a.replace(' ', '') + sep + b   # 'Shine Greymon: Burst Mode' -> 'ShineGreymon: Burst Mode'
def fname(k): return re.sub(r'[^a-z0-9]+', '', disp(k).lower())

# ---------- atributo y familia ----------
AT = {'Vaccine': 'Vacuna', 'Virus': 'Virus', 'Data': 'Dato'}
def attr(k):
    for a in db.get(k, {}).get('attr', []):
        if a in AT: return AT[a]
    return ['Vacuna', 'Virus', 'Dato'][h(k) % 3]

def enemy_attr(k, eid):
    if eid in CANON: return CANON[eid]['attribute']
    first = (db.get(k, {}).get('attr') or ['None'])[0]
    return {**AT, 'Free': 'Free', 'Variable': 'Variable', 'Unknown': 'Desconocido', 'None': 'Sin atributo'}.get(first, 'Sin atributo')
FAM = ['Nature Spirits', 'Deep Savers', 'Nightmare Soldiers', 'Wind Guardians', 'Metal Empire', 'Virus Busters', "Dragon's Roar", 'Jungle Troopers', 'Dark Area', 'Unknown']
CODE = {'Nature Spirits': 'NSp', 'Deep Savers': 'DS', 'Nightmare Soldiers': 'NSo', 'Wind Guardians': 'WG', 'Metal Empire': 'ME',
        'Virus Busters': 'VB', "Dragon's Roar": 'DR', 'Jungle Troopers': 'JT', 'Dark Area': 'DA', 'Unknown': 'UK'}
RULES = [('Dark Knight', 'Dark Area'), ('Demon Lord', 'Dark Area'), ('Holy Knight', 'Virus Busters'), ('Holy', 'Virus Busters'),
         ('God', 'Virus Busters'), ('Angel', 'Virus Busters'), ('Fairy', 'Virus Busters'), ('Warrior', 'Virus Busters'), ('Dragon', "Dragon's Roar"),
         ('Cyborg', 'Metal Empire'), ('Machine', 'Metal Empire'), ('Weapon', 'Metal Empire'), ('Sword', 'Metal Empire'), ('Android', 'Metal Empire'),
         ('Aquatic', 'Deep Savers'), ('Mollusk', 'Deep Savers'), ('Crustacean', 'Deep Savers'), ('Sea', 'Deep Savers'), ('Insect', 'Jungle Troopers'), ('Larva', 'Jungle Troopers'),
         ('Plant', 'Jungle Troopers'), ('Vegetation', 'Jungle Troopers'), ('Bird', 'Wind Guardians'), ('Avian', 'Wind Guardians'),
         ('Mutation', 'Jungle Troopers'), ('Demon', 'Nightmare Soldiers'), ('Devil', 'Nightmare Soldiers'), ('Undead', 'Nightmare Soldiers'), ('Ghost', 'Nightmare Soldiers'),
         ('Bewitching', 'Nightmare Soldiers'), ('Beast', 'Nature Spirits'), ('Mammal', 'Nature Spirits'), ('Reptile', 'Nature Spirits'), ('Dinosaur', 'Nature Spirits')]
def family(k):
    v = db.get(k, {}); types, fams = v.get('type') or [], v.get('fam') or []
    guess = None
    for kw, f in RULES:
        if any(kw in t for t in types): guess = f; break
    if fams:
        if guess in fams: return CODE[guess]
        order = [f for _, f in RULES] + FAM
        return CODE[sorted(fams, key=lambda f: order.index(f) if f in order else 99)[0]]
    return CODE[guess] if guess else None

# ---------- skills ----------
ELW = {'fire': 'fuego', 'water': 'agua', 'electric': 'electricidad', 'light': 'luz', 'dark': 'oscuridad', 'metal': 'metralla', 'wind': 'viento', 'earth': 'tierra', 'neutral': 'energía'}
EKW = [('electric', r'thunder|lightning|electr|shock|spark|volt|plasma|static|bolt|raiden|raiji|ikazuchi'),
       ('fire', r'fire|flame|blaze|burn|heat|pepper|magma|volcan|solar|\bsun|inferno|phoenix|flare|pyro|scorch|corona|meteor'),
       ('water', r'water|aqua|bubble|tide|\bsea\b|ocean|rain|tsunami|\bice|frost|freez|snow|blizzard|cold|crystal|frozen|hail|aurora'),
       ('light', r'holy|heaven|\blight|angel|\bstar|shine|glory|saint|divine|celest|sacred|excalibur|seven|moon|lunar|halo|grace|justice'),
       ('dark', r'\bdark|death|shadow|evil|black|nightmare|demon|hell|curse|blood|night|vampir|poison|venom|chaos|grave|bat\b'),
       ('wind', r'wind|storm|tornado|typhoon|gale|wing|feather|\bsky|hurrican|\bair|cyclone|gust'),
       ('earth', r'rock|stone|earth|quake|sand|ground|mountain|gaia|desert|terra|\bmud|boulder'),
       ('metal', r'metal|steel|iron|missile|\bgun|buster|cannon|giga|drill|machine|bullet|laser|rocket')]
TKW = [('melee_arc', r'claw|slash|sword|blade|saber|sabre|edge|cutter|punch|fist|kick|knuckle|tail|horn|fang|bite|tooth|strike|scratch|crash|smash|tackle|rush|charge|upper|lance|spear|hammer|axe|whip|uppercut|talon|horns|head|body|chop|slam'),
       ('beam', r'beam|\bray|laser|cannon|blaster|buster|flash|force|spark|lightning|thunder|light'),
       ('nova', r'explosion|quake|nova|burst|tornado|typhoon|field|dome|shower|impact|wave|storm|aura|barrier|shockwave|meteor'),
       ('cone', r'breath|blizzard|spray|mist|wind|gust|flamethrower|howl|roar|scream'),
       ('projectile', r'.')]
DMG = {'projectile': [1.6, 2.2, 2.8, 3.6], 'melee_arc': [1.9, 2.6, 3.2, 4.1], 'beam': [2.0, 2.8, 3.4, 4.3], 'cone': [1.7, 2.4, 3.0, 3.9], 'nova': [1.5, 2.1, 2.7, 3.5]}
CD = {'projectile': [1.5, 1.7, 1.9, 2.1], 'melee_arc': [1.1, 1.3, 1.4, 1.6], 'beam': [2.2, 2.5, 2.8, 3.1], 'cone': [1.7, 1.9, 2.1, 2.3], 'nova': [2.4, 2.7, 3.0, 3.3]}
MEL = [(r'claw|talon|scratch', 'sus garras'), (r'sword|blade|saber|sabre|edge|cutter|lance|spear|axe', 'su arma'), (r'punch|fist|knuckle|upper', 'sus puños'),
       (r'kick', 'una patada'), (r'horn', 'sus cuernos'), (r'tail|whip', 'la cola'), (r'fang|bite|tooth', 'sus colmillos'), (r'hammer', 'su martillo')]
def atk_name(a):
    for n in (a.get('en') or '', a.get('jp') or ''):
        n = n.strip()
        if n and len(n) < 32 and '.' not in n and '}' not in n and len(n.split()) <= 4 and n.isascii(): return n
    return None
def make_skill(a, stage, line_el):
    nm = atk_name(a)
    if not nm: return None
    key = re.sub(r'[^a-z0-9]+', '_', nm.lower()).strip('_')
    if not key: return None
    if key in SK['skills']: return key   # ya existe (misma técnica canon): se reutiliza
    text = (nm + ' ' + (a.get('desc') or '')).lower()
    # elemento: primero por el nombre de la técnica; si no dice nada, por la descripción; si tampoco, el de la línea
    el = next((e for e, rx in EKW if re.search(rx, nm.lower())), None) or next((e for e, rx in EKW if re.search(rx, text)), line_el)
    ty = next((t for t, rx in TKW if re.search(rx, nm.lower())), 'projectile')
    s = min(3, max(0, stage - 2))
    d = {'name': nm, 'type': ty, 'element': el, 'dmg': DMG[ty][s], 'cd': CD[ty][s], 'source': 'canon:wikimon'}
    w = ELW[el]
    if ty == 'projectile':
        d.update(speed=380 + 20 * s, life=1.2, count=[1, 2, 2, 3][s], spread=0.35 if s else 0.0)
        if re.search(r'bomb|ball|missile|meteor|explo|grenade', text): d['explode'] = 50 + 10 * s
        d['desc'] = 'Lanza ' + w + ' contra el Digimon más cercano' + (' y explota al impactar' if 'explode' in d else '')
    elif ty == 'beam':
        d.update(range=360 + 30 * s, width=18 + 6 * s); d['desc'] = 'Dispara un rayo de ' + w + ' que atraviesa todo en línea recta'
    elif ty == 'melee_arc':
        d.update(range=70 + 12 * s, arc=1.9); arm = next((t for rx, t in MEL if re.search(rx, nm.lower())), 'todo su cuerpo')
        d['desc'] = 'Golpea con ' + arm + ' a los Digimon de enfrente'
    elif ty == 'cone':
        d.update(range=150 + 20 * s, arc=0.9); d['desc'] = 'Suelta ' + w + ' en abanico hacia adelante'
    else:
        d.update(radius=120 + 20 * s); d['desc'] = 'Libera una onda de ' + w + ' a su alrededor'
    if stage >= 5: d['final'] = True
    SK['skills'][key] = d
    return key
LINE_EL = {'Vacuna': 'light', 'Virus': 'dark', 'Dato': 'neutral'}
def skills_for(k, stage, el, n):
    out = []
    for a in db.get(k, {}).get('atks', []):
        key = make_skill(a, stage, el)
        if key and key not in out: out.append(key)
        if len(out) >= n: break
    return out

# ---------- perfil, rasgo y huevo de cada línea ----------
TRAITS = {'valor': ('Valor', 'Al recibir un golpe, +25% de daño durante 3 s'), 'manada': ('Manada', '+4% de daño por cada enemigo cerca (hasta +32%)'),
          'chispa': ('Chispa', '15% de chance de que un golpe salte a otro enemigo cercano'), 'kitsune': ('Esquiva', '12% de chance de esquivar un golpe'),
          'kabuto': ('Coraza', 'Su armadura bloquea un golpe cada 12 s'), 'bendicion': ('Bendición', 'Si no lo golpean en 4 s, se cura un 1% de la vida por segundo'),
          'hazard': ('Furia', 'Cuanta menos vida tiene, más daño hace (hasta +40%)'), 'arsenal': ('Arsenal', '+1 disparo básico y ataca un 10% más rápido'),
          'filo': ('Filo', '+10% de crítico y +25% de daño crítico'), 'hilo': ('Enredadera', 'Sus golpes ralentizan a los enemigos un 30%'),
          'pulso': ('Pulso', 'Mientras se mueve, suelta una descarga alrededor cada 3 s'), 'curioso': ('Curiosidad', '+12% de experiencia'),
          'puas': ('Púas', 'Los enemigos que lo tocan reciben daño'), 'momentai': ('Rebote', 'Sus disparos básicos rebotan a otro enemigo')}
META = {  # perfil FUE/INT/VEL/VIT (suma 10), rasgo, huevo, misión
 '017_agumon':        ((4, 1, 2, 3), 'valor',    {'type': 'reach_stage', 'goal': 4, 'name': 'Emblema del Valor', 'desc': 'Llegá a etapa Perfecto en una partida'}),
 '018_gabumon':       ((3, 2, 3, 2), 'manada',   {'type': 'kills_with', 'with': '017_agumon', 'goal': 500, 'name': 'Emblema de la Amistad', 'desc': 'Eliminá 500 Digimon en total jugando con Agumon'}),
 '019_tentomon':      ((2, 4, 1, 3), 'chispa',   {'type': 'analyzer', 'goal': 30, 'name': 'Emblema del Conocimiento', 'desc': 'Registrá 30 datos en el Digimon Analyzer'}),
 '020_biyomon':       ((2, 3, 4, 1), 'kitsune',  {'type': 'survive', 'goal': 420, 'name': 'Emblema del Amor', 'desc': 'Sobreviví 7 minutos en una partida'}),
 '021_armadillomon':  ((3, 1, 1, 5), 'kabuto',   {'type': 'kills_total', 'goal': 4000, 'name': 'Digimental de la Sinceridad', 'desc': 'Eliminá 4000 Digimon en total'}),
 '022_patamon':       ((2, 4, 2, 2), 'bendicion',{'type': 'boss', 'boss': 'megadramon', 'goal': 1, 'name': 'Emblema de la Esperanza', 'desc': 'Derrotá a Megadramon'}),
 '023_dracomon':      ((4, 2, 2, 2), 'hazard',   {'type': 'stage_with', 'with': '001_guilmon', 'goal': 5, 'name': 'Escama de dragón', 'desc': 'Llegá a una forma final con Guilmon'}),
 '024_agumon_savers': ((4, 1, 3, 2), 'arsenal',  {'type': 'kills_with', 'with': '017_agumon', 'goal': 1500, 'name': 'Puño de DATS', 'desc': 'Eliminá 1500 Digimon en total jugando con Agumon'}),
 '025_gaomon':        ((3, 1, 4, 2), 'filo',     {'type': 'runs_total', 'goal': 25, 'name': 'Guante de campeón', 'desc': 'Terminá 25 partidas'}),
 '026_lalamon':       ((1, 4, 2, 3), 'hilo',     {'type': 'survive', 'goal': 600, 'name': 'Semilla de luz', 'desc': 'Sobreviví 10 minutos en una partida'}),
 '027_falcomon':      ((3, 2, 4, 1), 'kitsune',  {'type': 'boss', 'boss': 'etemon', 'goal': 2, 'name': 'Pluma ninja', 'desc': 'Derrotá a Etemon 2 veces'}),
 '028_coronamon':     ((4, 2, 3, 1), 'pulso',    {'type': 'reach_stage', 'goal': 5, 'name': 'Corona solar', 'desc': 'Llegá a una forma final en una partida'}),
 '029_lunamon':       ((1, 4, 3, 2), 'curioso',  {'type': 'stage_with', 'with': '028_coronamon', 'goal': 4, 'name': 'Fragmento lunar', 'desc': 'Llegá a Perfecto con Coronamon'}),
 '030_dracmon':       ((3, 3, 3, 1), 'hazard',   {'type': 'boss', 'boss': 'warumonzaemon', 'goal': 1, 'name': 'Colmillo nocturno', 'desc': 'Derrotá a WaruMonzaemon'}),
 '031_bearmon':       ((4, 1, 2, 3), 'valor',    {'type': 'kills_total', 'goal': 8000, 'name': 'Garra de oso', 'desc': 'Eliminá 8000 Digimon en total'}),
 '032_fanbeemon':     ((3, 2, 4, 1), 'filo',     {'type': 'kills_with', 'with': '019_tentomon', 'goal': 800, 'name': 'Panal digital', 'desc': 'Eliminá 800 Digimon en total jugando con Tentomon'}),
 '033_kokuwamon':     ((2, 4, 2, 2), 'pulso',    {'type': 'analyzer', 'goal': 60, 'name': 'Chip de escarabajo', 'desc': 'Registrá 60 datos en el Digimon Analyzer'}),
 '034_sunarizamon':   ((3, 2, 1, 4), 'puas',     {'type': 'survive', 'goal': 720, 'name': 'Arena del desierto', 'desc': 'Sobreviví 12 minutos en una partida'}),
 '035_sangomon':      ((2, 3, 2, 3), 'momentai', {'type': 'stage_with', 'with': '018_gabumon', 'goal': 5, 'name': 'Coral del abismo', 'desc': 'Llegá a una forma final con Gabumon'}),
 '036_ludomon':       ((2, 4, 2, 2), 'curioso',  {'type': 'boss', 'boss': 'metaletemon', 'goal': 1, 'name': 'Cristal antiguo', 'desc': 'Derrotá a MetalEtemon'}),
 '037_liollmon':      ((3, 2, 3, 2), 'manada',   {'type': 'runs_total', 'goal': 60, 'name': 'Melena de león', 'desc': 'Terminá 60 partidas'}),
 '038_blucomon':      ((3, 3, 2, 2), 'hilo',     {'type': 'boss', 'boss': 'machinedramon', 'goal': 1, 'name': 'Hielo eterno', 'desc': 'Derrotá a Machinedramon'})}
REQ = [{'FUE': 3, 'VIT': 1}, {'VEL': 4}, {'INT': 4}]
BDESC = ['Pesado: +3 de daño, +60 de vida y ataques que perforan', 'Veloz: +2 proyectiles, +1 de daño y +15% de velocidad', 'Poderoso: +5 de daño']
BONUS = [{'dmg': 3, 'hp': 60, 'pierce': 1}, {'dmg': 1, 'multi': 2, 'spP': 0.15}, {'dmg': 5}]
VP = [{'kills': 250}, {'nohit': 40}, {'care': 1}]

used = set(); report = []
for n, (cid, L) in enumerate(LINES.items()):
    chain, fin = L[:5], L[5]
    used.update(chain); used.update(fin)
    od = os.path.join(R, 'assets/sprites/creatures', cid); os.makedirs(od, exist_ok=True)
    at = attr(chain[2]); lel = LINE_EL[at]
    child_fam = family(chain[2]) or 'UK'
    stages = []
    for s, k in enumerate(chain):
        fn = f'{fname(k)}_{s + 1}.png'; shutil.copy(os.path.join(D, 'sprites', k + '.png'), os.path.join(od, fn))
        sk = ['bubble_blow'] if s == 0 else ['tackle'] if s == 1 else skills_for(k, s, lel, 2 if s == 2 else 3)
        if s >= 2 and not sk: sk = ['tackle']
        stages.append({'stage': s, 'name': disp(k), 'file': fn, 'cols': 2, 'rows': 6, 'skills': sk, 'wiki': None, 'verified': False,
                       'note': 'Skills del canon (Wikimon)' if s >= 2 else 'Bebé: ataque típico', 'family': family(k) or child_fam})
    branches = []
    for i, k in enumerate(fin):
        fn = f'{fname(k)}_6_{i + 1}.png'; shutil.copy(os.path.join(D, 'sprites', k + '.png'), os.path.join(od, fn))
        sk = skills_for(k, 5, lel, 3) or skills_for(chain[4], 5, lel, 2)
        j = min(i, 2)
        branches.append({'id': f'6_{i + 1}', 'name': disp(k), 'file': fn, 'cols': 2, 'rows': 6, 'req': REQ[j], 'desc': BDESC[j], 'skills': sk,
                         'wiki': None, 'verified': False, 'note': 'Skills del canon (Wikimon)', 'family': family(k) or 'UK', 'bonus': BONUS[j], 'vp': VP[j]})
    st, tr, un = META[cid]
    M = {'id': cid, 'name': 'Línea ' + disp(chain[2]) + (' (Savers)' if cid == '024_agumon_savers' else ''), 'attribute': at, 'anySkill': False,
         'source': 'Sprites: Steam Workshop de Stream Avatars (packs ' + ', '.join(sorted({idx[k]['pack'] for k in chain + fin})) + '). Evoluciones y skills: Wikimon (canon)',
         'stats': {'FUE': st[0], 'INT': st[1], 'VEL': st[2], 'VIT': st[3]}, 'trait': {'id': tr, 'name': TRAITS[tr][0], 'desc': TRAITS[tr][1]},
         'stages': stages, 'branches': branches}
    json.dump(M, open(os.path.join(R, 'src/data/creatures', cid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    open(os.path.join(R, 'src/data/creatures', cid + '.json'), 'a', encoding='utf-8').write('\n')
    UN['eggs'][cid] = 'egg_%02d' % (1 + (n * 7) % 17)
    UN['unlocks'] = [u for u in UN['unlocks'] if u['cid'] != cid] + [dict({'cid': cid, 'hatch': 1}, **un)]
    report.append(f"{cid}: {at} · " + ' → '.join(s['name'] for s in stages) + ' ⇒ ' + ' / '.join(b['name'] for b in branches))

# ---------- enemigos con lo que sobra ----------
TIER = {'Baby I': 0, 'Baby II': 1, 'Child': 2, 'Adult': 3, 'Perfect': 4, 'Ultimate': 5, 'Armor': 3, 'Hybrid': 3}
def kind_of(k, tier):
    ty = ' '.join(db[k].get('type') or []).lower(); r = h(k) % 100
    if tier <= 1: return 'swarm' if r < 55 else 'chaser'
    if re.search(r'machine|cyborg|android|wizard|mage|puppet|magician|archer|gunner|weapon', ty): return 'shooter' if r < 70 else 'chaser'
    if re.search(r'plant|vegetation|mollusk|undead|ghost|mutant|bomb|slime', ty): return 'bomber' if r < 70 else 'chaser'
    if re.search(r'bird|insect|avian|flying|winged', ty): return 'dasher' if r < 70 else 'chaser'
    if re.search(r'beast man|warrior|knight|mammal|fighter|man\b', ty): return 'leaper' if r < 60 else 'chaser'
    if tier >= 4 and re.search(r'dragon|giant|ancient|machine|dinosaur|beast', ty): return 'tank' if r < 60 else 'shooter'
    return ['chaser', 'dasher', 'shooter', 'bomber', 'leaper', 'tank'][r % 6] if tier >= 3 else ('chaser' if r < 60 else 'dasher')
play_names = set(ex['play']); enemy_ids = set(ex['enemy'])
os.makedirs(os.path.join(R, 'assets/sprites/enemies'), exist_ok=True)
added = []
for k in sorted(idx):
    v = db.get(k, {})
    if k in used or not v.get('ok'): continue
    nm = disp(k); eid = re.sub(r'[^a-z0-9]+', '', nm.lower())
    if eid in enemy_ids or eid in play_names: continue
    lvl = (v.get('level') or ['?'])[0]
    if lvl not in TIER: continue
    tier = TIER[lvl]
    if lvl == 'Hybrid' and 'ancient' in k: tier = 5
    if eid in CANON: tier = CANON[eid]['tier']
    shutil.copy(os.path.join(D, 'sprites', k + '.png'), os.path.join(R, 'assets/sprites/enemies', eid + '.png'))
    EN['list'].append({'id': eid, 'name': nm, 'tier': tier, 'attribute': enemy_attr(k, eid), 'level': CANON.get(eid, {}).get('level', lvl), 'kind': kind_of(k, tier), 'file': eid + '.png', 'pack': idx[k]['pack']})
    enemy_ids.add(eid); added.append(eid)

json.dump(SK, open(R + '/src/data/skills.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
json.dump(EN, open(R + '/src/data/enemies.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
open(R + '/src/data/enemies.json', 'a', encoding='utf-8').write(chr(10))
# unlocks.json tiene formato a mano: se insertan las líneas nuevas como texto (huevos y misiones), sin reescribir el resto
NL = chr(10)
txt = open(R + '/src/data/unlocks.json', encoding='utf-8').read()
new_cids = [c for c in LINES if '"' + c + '"' not in txt]
eg = ', '.join('"%s": "%s"' % (c, UN['eggs'][c]) for c in new_cids)
if eg:
    i = txt.index('"eggs": {'); j = txt.index(NL + '  }', i)
    txt = txt[:j] + ',' + NL + '    ' + eg + txt[j:]
    rows = [json.dumps(next(u for u in UN['unlocks'] if u['cid'] == c), ensure_ascii=False).replace('{', '{ ', 1)[:-1] + ' }' for c in new_cids]
    k = txt.rindex(NL + '  ]')
    txt = txt[:k] + ',' + NL + '    ' + (',' + NL + '    ').join(rows) + txt[k:]
    open(R + '/src/data/unlocks.json', 'w', encoding='utf-8').write(txt)
json.loads(open(R + '/src/data/unlocks.json', encoding='utf-8').read())   # que siga siendo JSON válido
print(NL.join(report))
print('skills totales:', len(SK['skills']), '· enemigos nuevos:', len(added), '· total enemigos:', len(EN['list']))

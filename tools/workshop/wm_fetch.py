# Baja de Wikimon los datos de cada sprite: título real, nivel, atributo, tipo, familias, evoluciones y técnicas.
# Uso: py -P wm_fetch.py <index.json> <salida.json>   (guarda en caché: se puede cortar y volver a correr)
import sys, os, json, re, time, urllib.request, urllib.parse

idx = json.load(open(sys.argv[1], encoding='utf-8')); outp = sys.argv[2]
db = json.load(open(outp, encoding='utf-8')) if os.path.exists(outp) else {}

def api(params):
    url = 'https://wikimon.net/api.php?' + urllib.parse.urlencode(dict(params, format='json'))
    req = urllib.request.Request(url, headers={'User-Agent': 'DigiSurvivor-fan-game/0.6 (data import)'})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)

# nombres de archivo que no coinciden con Wikimon (a mano)
ALIAS = {'agumon_2006': 'Agumon (2006 anime)', 'falcomon_2006': 'Falcomon (2006 anime)', 'crowmon_2006': 'Yatagaramon (2006 Anime Version)',
         'cyberdramon2010': 'Cyberdramon (2010 anime)', 'beelzebumon2010': 'Beelzebumon', 'algomonadult': 'Algomon (Adult)',
         'megakabuterimon_red': 'AtlurKabuterimon (Red)', 'metaltyranomon': 'MetalTyranomon', 'lucemonfalldownmode': 'Lucemon: Falldown Mode',
         'eosmon_perfect': 'Eosmon (Perfect)', 'deathmonblack': 'Deathmon Black', 'blacktailmonuver': 'BlackTailmon Uver.',
         'myotismon': 'Vamdemon', 'malomyotismon': 'BelialVamdemon', 'pucchiemongreen': 'Pucchiemon (Green)',
         'rosemon_burst_mode': 'Rosemon: Burst Mode', 'ravemon_burst_mode': 'Ravemon: Burst Mode',
         'miragegaogamon_burst_mode': 'MirageGaogamon: Burst Mode', 'shinegreymon_burst_mode': 'ShineGreymon: Burst Mode',
         'arresterdramon_superior_mode': 'Arresterdramon: Superior Mode', 'belphemon_rage_mode': 'Belphemon: Rage Mode',
         'imperialdramonpaladinmode': 'Imperialdramon: Paladin Mode', 'imperialdramondragonmode': 'Imperialdramon: Dragon Mode',
         'imperialdramon_dragon_mode': 'Imperialdramon: Dragon Mode', 'coredramon_blue': 'Coredramon (Blue)',
         'coredramon_green': 'Coredramon (Green)', 'panjyamon_x': 'Panjyamon (X-Antibody)', 'anomalocarimon_x': 'Anomalocarimon (X-Antibody)',
         'marinchimairamon': 'MarinChimairamon', 'marinchimeramon': 'MarinChimairamon', 'neptunemon': 'Neptunmon',
         'babydmon': 'Babydmon', 'petitmon': 'Petitmon', 'loaderliomon': 'Loaderleomon', 'louwemon': 'Lowemon',
         'kokabuterimon': 'Kokabuterimon', 'metallifekuwagamon': 'MetallifeKuwagamon', 'yukimibotamon': 'YukimiBotamon',
         'xiquemon': 'Xiquemon', 'velgrmon': 'Velgrmon', 'nyokimon': 'Nyokimon', 'cthyllamon': 'Cthyllamon'}

ALIAS.update({'ancientbeatmon': 'AncientBeatmon', 'arkhaiangemon': 'ArkhaiAngemon', 'bancholillymon': 'BanchoLillymon',
  'banchostingmon': 'BanchoStingmon', 'baohackmon': 'BaoHackmon', 'betelgammamon': 'BetelGammamon', 'donedevimon': 'DoneDevimon',
  'frosvelgrmon': 'Frosvelgrmon', 'gracenovamon': 'GraceNovamon', 'grapleomon': 'GrapLeomon', 'gulusgammamon': 'GulusGammamon',
  'heavyleomon': 'HeavyLeomon', 'hoverespimon': 'HoverEspimon', 'kausgammamon': 'KausGammamon', 'neovamdemon': 'NeoVamdemon',
  'noblepumpmon': 'NoblePumpmon', 'rareraremon': 'RareRaremon', 'saviorhackmon': 'SaviorHackmon', 'shellnumemon': 'ShellNumemon',
  'symbareangoramon': 'SymbareAngoramon', 'teslajellymon': 'TeslaJellymon', 'wezengammamon': 'WezenGammamon'})
def search_title(q):
    try:
        r = api({'action': 'query', 'list': 'search', 'srsearch': q, 'srlimit': 1, 'srnamespace': 0})
        h = r['query']['search']; return h[0]['title'] if h else None
    except Exception: return None
def title_of(key):
    if key in ALIAS: return ALIAS[key]
    q = key.replace('_', ' ')
    try:
        r = api({'action': 'opensearch', 'search': q, 'limit': 1, 'redirects': 'resolve', 'namespace': 0})
        if r[1]: return r[1][0]
    except Exception:
        pass
    return q.title()

def section(w, names):
    for nm in names:
        m = re.search(r'==+\s*' + nm + r'\s*==+\s*\n(.*?)(?=\n==[^=]|\Z)', w, re.S | re.I)
        if m: return m.group(1)
    return ''

def links(txt):
    out = []
    for line in txt.split('\n'):
        if not line.lstrip().startswith('*'): continue
        m = re.search(r'\[\[([^\]|#]+)', line)
        if m:
            t = m.group(1).strip()
            if t not in out: out.append(t)
    return out

import threading
from concurrent.futures import ThreadPoolExecutor
lock = threading.Lock()
def one(key):
    t = title_of(key)
    try:
        r = api({'action': 'parse', 'page': t, 'prop': 'wikitext', 'redirects': 1})
        if 'parse' not in r:
            t2 = search_title(key.replace('_', ' '))
            r = api({'action': 'parse', 'page': t2, 'prop': 'wikitext', 'redirects': 1}) if t2 else {}
            if 'parse' not in r: db[key] = {'ok': 0, 'title': t, 'err': 'sin página'}; return
        w = r['parse']['wikitext']['*']; head = w[:8000]
        get = lambda pat: [v.strip() for k, v in re.findall(r'\n\|(' + pat + r')\s*=([^\n|]*)', head) if v.strip()]
        ef = section(w, ['Evolves From', 'Evolves from']); et = section(w, ['Evolves To', 'Evolves to'])
        atk = re.findall(r'\|name\d*\s*=\s*([^\n|]+)', section(w, ['Attack Techniques']))
        db[key] = {'ok': 1, 'title': r['parse']['title'], 'level': get(r'l\d+'), 'attr': get(r'a\d+'), 'type': get(r't\d+'),
                   'fam': get(r'f\d+'), 'from': links(ef), 'to': links(et), 'atk': [a.strip() for a in atk][:8]}
    except Exception as e:
        db[key] = {'ok': 0, 'title': t, 'err': str(e)}
todo = [k for k in sorted(idx) if not (k in db and db[k].get('ok'))]
print('faltan', len(todo), flush=True)
with ThreadPoolExecutor(6) as ex:
    for n, _ in enumerate(ex.map(one, todo)):
        if n % 25 == 0:
            with lock: json.dump(db, open(outp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            print(n, flush=True)
json.dump(db, open(outp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
bad = [k for k, v in db.items() if not v.get('ok')]
print('listo', len(db), 'sin datos:', bad)

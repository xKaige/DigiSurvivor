# Baja las técnicas (=Attack Techniques=) de cada sprite: nombre japonés romanizado, nombre en inglés (d=) y descripción.
# Uso: py -P wm_atk.py <wm.json>   (agrega 'atks' a cada entrada)
import sys, json, re, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
p = sys.argv[1]; db = json.load(open(p, encoding='utf-8'))
def api(params):
    url = 'https://wikimon.net/api.php?' + urllib.parse.urlencode(dict(params, format='json'))
    req = urllib.request.Request(url, headers={'User-Agent': 'DigiSurvivor-fan-game/0.6 (data import)'})
    with urllib.request.urlopen(req, timeout=40) as r: return json.load(r)
def clean(s):
    s = re.sub(r'<ref[^>]*/>|<ref.*?</ref>', '', s, flags=re.S)
    s = re.sub(r'\{\{[^{}]*\}\}', '', s); s = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', r'\1', s)
    return re.sub(r"''+", '', s).strip()
def one(k):
    v = db[k]
    if not v.get('ok') or 'atks' in v: return
    try:
        w = api({'action': 'parse', 'page': v['title'], 'prop': 'wikitext', 'redirects': 1})['parse']['wikitext']['*']
        m = re.search(r'\n=\s*Attack Techniques\s*=\s*\n(.*?)(?=\n=[^=]|\Z)', w, re.S)
        sec = m.group(1) if m else ''
        out = []
        for i in [''] + [str(n) for n in range(2, 12)]:
            nm = re.search(r'\|name' + i + r'\s*=([^\n]*)', sec)
            if not nm: continue
            d = re.search(r'\|d' + i + r'\s*=([^\n]*)', sec); ds = re.search(r'\|desc' + i + r'\s*=([^\n]*)', sec)
            out.append({'jp': clean(nm.group(1)), 'en': clean(d.group(1)).split(',')[0].strip() if d else '', 'desc': clean(ds.group(1)) if ds else ''})
        v['atks'] = out
    except Exception as e:
        v['atks_err'] = str(e)
with ThreadPoolExecutor(6) as ex: list(ex.map(one, list(db)))
json.dump(db, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('con técnicas:', sum(1 for v in db.values() if v.get('atks')), 'de', sum(1 for v in db.values() if v.get('ok')))

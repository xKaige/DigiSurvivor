# Líneas elegidas a mano (camino canónico cuando se puede) y verificación contra Wikimon.
# Formato: id: [Bebé I, Bebé II, Novato, Campeón, Perfecto, [finales...]]   (claves de sprite de ws_new)
import sys, json
LINES = {
 '017_agumon':      ['botamon', 'koromon', 'agumon', 'greymon', 'metalgreymon', ['wargreymon', 'blitzgreymon', 'blackwargreymon']],
 '018_gabumon':     ['punimon', 'tsunomon', 'gabumon', 'garurumon', 'weregarurumon', ['metalgarurumon', 'cresgarurumon']],
 '019_tentomon':    ['pabumon', 'motimon', 'tentomon', 'kabuterimon', 'megakabuterimon_red', ['herculeskabuterimon', 'tyrantkabuterimon']],
 '020_biyomon':     ['nyokimon', 'yokomon', 'biyomon', 'birdramon', 'garudamon', ['phoenixmon', 'ravemon', 'dominimon']],
 '021_armadillomon':['tsubumon', 'upamon', 'armadillomon', 'ankylomon', 'shakkoumon', ['vikemon', 'regalecusmon']],
 '022_patamon':     ['popomon', 'frimon', 'patamon', 'angemon', 'magnaangemon', ['seraphimon', 'dominimon', 'lordknightmon']],
 '023_dracomon':    ['petitmon', 'babydmon', 'dracomon', 'coredramon_blue', 'wingdramon', ['slayerdramon', 'examon', 'breakdramon']],
 '024_agumon_savers':['botamon', 'koromon', 'agumon_2006', 'geogreymon', 'rizegreymon', ['shinegreymon', 'shinegreymon_burst_mode']],
 '025_gaomon':      ['popomon', 'wanyamon', 'gaomon', 'gaogamon', 'machgaogamon', ['miragegaogamon', 'miragegaogamon_burst_mode']],
 '026_lalamon':     ['yuramon', 'tanemon', 'lalamon', 'sunflowmon', 'lilamon', ['rosemon', 'rosemon_burst_mode', 'bancholillymon']],
 '027_falcomon':    ['nyokimon', 'yokomon', 'falcomon_2006', 'peckmon', 'crowmon_2006', ['ravemon', 'ravemon_burst_mode']],
 '028_coronamon':   ['mokumon', 'petimeramon', 'coronamon', 'firamon', 'flaremon', ['apollomon', 'heavyleomon']],
 '029_lunamon':     ['pitchmon', 'pukamon', 'lunamon', 'lekismon', 'crescemon', ['dianamon']],
 '030_dracmon':     ['pyonmon', 'bosamon', 'dracmon', 'sangloupmon', 'matadormon', ['grandracmon', 'plutomon', 'piedmon']],
 '031_bearmon':     ['popomon', 'wanyamon', 'bearmon', 'gryzmon', 'grapleomon', ['marsmon', 'heavyleomon']],
 '032_fanbeemon':   ['pabumon', 'motimon', 'fanbeemon', 'waspmon', 'cannonbeemon', ['tigervespamon', 'herculeskabuterimon']],
 '033_kokuwamon':   ['leafmon', 'minomon', 'kokuwamon', 'thunderballmon', 'metallifekuwagamon', ['grandiskuwagamon', 'ancientbeatmon']],
 '034_sunarizamon': ['sunamon', 'goromon', 'sunarizamon', 'golemon', 'gogmamon', ['ancientsphinxmon', 'pharaohmon', 'blastmon']],
 '035_sangomon':    ['pitchmon', 'pukamon', 'sangomon', 'shellmon', 'dagomon', ['neptunemon', 'plesiomon', 'regalecusmon']],
 '036_ludomon':     ['cotsucomon', 'kakkinmon', 'ludomon', 'tialudomon', 'raijiludomon', ['bryweludramon']],
 '037_liollmon':    ['popomon', 'frimon', 'liollmon', 'liamon', 'loaderliomon', ['dinotigermon', 'heavyleomon']],
 '038_blucomon':    ['yukimibotamon', 'hiyarimon', 'blucomon', 'paledramon', 'cryspaledramon', ['hexeblaumon', 'frosvelgrmon']],
}
LEVEL = ['Baby I', 'Baby II', 'Child', 'Adult', 'Perfect', 'Ultimate']

if __name__ == '__main__':
    D = sys.argv[1]
    db = json.load(open(D + '/wm.json', encoding='utf-8'))
    T = {}
    for k, v in db.items():
        if v.get('ok'): T.setdefault(v['title'], k)
    def link(a, b):   # a evoluciona a b según Wikimon (en cualquiera de las dos páginas)
        return b in [T.get(t) for t in db.get(a, {}).get('to', [])] or a in [T.get(t) for t in db.get(b, {}).get('from', [])]
    def lv(k): return (db.get(k, {}).get('level') or ['?'])[0]
    for cid, L in LINES.items():
        chain = L[:5]; fin = L[5]; probs = []
        for i, k in enumerate(chain):
            if k not in db: probs.append(f'{k}: sin sprite'); continue
            if lv(k) != LEVEL[i]: probs.append(f'{k}: nivel {lv(k)} (esperaba {LEVEL[i]})')
            if i and not link(chain[i - 1], k): probs.append(f'{chain[i-1]}→{k} no está en Wikimon')
        for f in fin:
            if f not in db: probs.append(f'{f}: sin sprite'); continue
            if lv(f) != 'Ultimate': probs.append(f'{f}: nivel {lv(f)}')
            if not link(chain[4], f): probs.append(f'{chain[4]}→{f} no está en Wikimon')
        print(cid, 'OK' if not probs else '; '.join(probs))

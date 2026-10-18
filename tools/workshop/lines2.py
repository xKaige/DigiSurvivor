import sys, json
D = sys.argv[1]
idx = json.load(open(D + '/index.json')); db = json.load(open(D + '/wm.json', encoding='utf-8'))
T = {}
for k, v in db.items():
    if v.get('ok'): T.setdefault(v['title'], k)
def lv(k): return (db.get(k, {}).get('level') or ['?'])[0]
def rel(a, ra, lvl, rb):
    out = [T[t] for t in db.get(a, {}).get(ra, []) if t in T and lv(T[t]) == lvl]
    for k in db:
        if db[k].get('ok') and lv(k) == lvl and a in [T.get(t) for t in db[k].get(rb, [])] and k not in out: out.append(k)
    pk = idx[a]['pack']
    return sorted(set(out), key=lambda x: (idx[x]['pack'] != pk, x))
for c in sorted(k for k in db if db[k].get('ok') and lv(k) == 'Child'):
    b2 = rel(c, 'from', 'Baby II', 'to'); ad = rel(c, 'to', 'Adult', 'from')
    print(f'\n## {c} [{idx[c]["pack"]}] attr={db[c].get("attr")}')
    print('  B2:', ', '.join(f'{x}(B1:{"/".join(rel(x,"from","Baby I","to")[:4])})' for x in b2[:6]))
    for A in ad[:5]:
        pe = rel(A, 'to', 'Perfect', 'from')
        print(f'  A {A}[{idx[A]["pack"][-4:]}] -> P:', '; '.join(f'{P}[{idx[P]["pack"][-4:]}]->U:{"/".join(rel(P,"to","Ultimate","from")[:6])}' for P in pe[:4]))

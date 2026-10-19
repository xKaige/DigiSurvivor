# Lee las tablas de evolución de humulos.com/digimon/vbdm/all (HTML guardado) y arma un JSON:
# { chartId: { name, stages: { stage: [ {key, name, from: [keys], reqs: [ {tro, vv, bat, win} ]} ] } } }
# Uso: py -I vbparse.py <all.html> <salida.json>
import sys, re, json
from html.parser import HTMLParser

STAGES = ['baby', 'babyII', 'child', 'adult', 'perfect', 'ultimate', 'super']

class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.stack = []; self.charts = {}; self.chart = None; self.title = None
        self.stage = None; self.row = None; self.cur = None; self.req = None; self.reqField = None; self.inP = False
    def handle_starttag(self, tag, a):
        a = dict(a); cls = (a.get('class') or '').split(); info = {'tag': tag, 'cls': cls, 'id': a.get('id')}
        if tag in ('img', 'br', 'input', 'meta', 'link'):
            self.void(tag, a, cls); return
        self.stack.append(info)
        if tag == 'div':
            if 'chart' in cls and a.get('id'):
                self.chart = a['id']; self.charts[self.chart] = {'name': self.title, 'stages': {}}; info['chartRoot'] = 1
            elif self.chart and 'column' in cls and cls[0] in STAGES:
                self.stage = cls[0]; info['stage'] = 1
            elif self.chart and self.stage and 'row' in cls and a.get('id'):
                self.row = {'key': a['id'], 'name': None, 'from': [], 'reqs': []}
                self.charts[self.chart]['stages'].setdefault(self.stage, []).append(self.row); info['row'] = 1
            elif self.row is not None and 'reqs_vbdm' in cls:
                self.req = {}; self.row['reqs'].append(self.req); info['req'] = 1
            elif self.req is not None and a.get('title'):
                self.reqField = a['title']
            elif self.row is not None and any(c.endswith('_line') and c.startswith(self.chart + '_') for c in cls):
                src = [c for c in cls if c.endswith('_line') and c.startswith(self.chart + '_')][0][len(self.chart) + 1:-5]
                if src and not src.endswith('_Req') and src not in self.row['from'] and src != self.row['key']: self.row['from'].append(src)
        if tag == 'h4': info['h4'] = 1
        if tag == 'p' and self.reqField: self.inP = True
    def void(self, tag, a, cls):
        if tag == 'img':
            if 'emblem' in cls: self.title = a.get('title')
            if self.row is not None and 'dot' in cls and not self.row['name'] and a.get('title'): self.row['name'] = a['title']
    def handle_endtag(self, tag):
        if tag == 'p': self.inP = False
        while self.stack:
            info = self.stack.pop()
            if info['tag'] != tag: continue
            if info.get('req'): self.req = None; self.reqField = None
            if info.get('row'): self.row = None
            if info.get('stage'): self.stage = None
            if info.get('chartRoot'): self.chart = None
            break
    def handle_data(self, d):
        if self.inP and self.req is not None and self.reqField:
            self.req[self.reqField] = d.strip(); self.reqField = None

p = P(); p.feed(open(sys.argv[1], encoding='utf-8', errors='replace').read())
json.dump(p.charts, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k, c in p.charts.items():
    print(k, c['name'], {s: len(v) for s, v in c['stages'].items()})

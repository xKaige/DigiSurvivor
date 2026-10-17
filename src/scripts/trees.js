// Árboles de mejoras permanentes (0.6). Se carga DESPUÉS de game.js y usa sus globals (save, persist, wal, elOf, CR,
// CreatureLoader, ATTR, ELC, $, treeOpen).
//
// - Datos: src/data/trees.json (lo genera tools/gentrees.py). Cuatro árboles: Vacuna, Virus y Dato (cruz con ramas de
//   Fuerza / Inteligencia / Velocidad / Vitalidad, y conectores con pasivas del atributo entre ramas) y el de Tamer.
// - Nodos: "minor" (secundario, hasta 5 niveles), "attr" (pasiva del atributo, hasta 3), "major" (principal, 1 nivel).
//   Un nodo se puede comprar si está unido a otro que ya tenés (empezando por el Inicio). Efecto = fx × nivel.
// - Monedas: cada árbol de atributo usa la suya (se ganan jugando con un Digimon de ese atributo: save.ac[0..2]);
//   el de Tamer usa las monedas de siempre (save.coins). Reiniciar un árbol (devuelve todo lo gastado) cuesta un
//   Chip de Reformateo (save.rc), que a veces sueltan los jefes.
// - Vínculo: cada Digimon junta XP de vínculo al jugarlo (save.bond[cid]); cada nivel da +1,5% de daño y +2% de vida.
// - Guardado: save.tr = { vac: {nodo: nivel}, vir, dat, tam }. Todo esto viaja en el guardado de la cuenta (firebase.js).
const Trees = {
  data: null,
  KEYS: ['vac', 'vir', 'dat'],          // árbol de cada atributo (0 Vacuna, 1 Virus, 2 Dato)
  BOND: [100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000, 6500],   // XP de vínculo para cada nivel (máx. 10)
  tab: 'vac', sel: 'start', view: null, confirmRs: 0,

  async load() {
    if (this.data) return;
    try { const r = await fetch('src/data/trees.json'); if (r.ok) this.data = await r.json(); } catch (e) { console.error(e); }
  },
  tree(k) { return this.data && this.data.trees[k]; },
  node(k, id) { const T = this.tree(k); return T && T.nodes.find(n => n.id === id); },

  // ---------- Guardado ----------
  // completa los campos de la 0.6 en el guardado (un guardado viejo no los tiene)
  ensure(s) {
    s = s || save;
    if (!Array.isArray(s.ac)) s.ac = [0, 0, 0];
    if (typeof s.rc !== 'number') s.rc = 0;
    if (!s.tr || typeof s.tr !== 'object') s.tr = {};
    for (const k of [...this.KEYS, 'tam']) if (!s.tr[k] || typeof s.tr[k] !== 'object') s.tr[k] = {};
    if (!s.bond || typeof s.bond !== 'object') s.bond = {};
    s.v = 2;
    return s;
  },
  lv(k, id) { return (save.tr && save.tr[k] && save.tr[k][id]) | 0; },
  owned(k, id) { return id === 'start' || this.lv(k, id) > 0; },
  // monedas del árbol k
  money(k) { this.ensure(); const T = this.tree(k); return !T ? 0 : T.cur === 'coins' ? save.coins | 0 : save.ac[this.KEYS.indexOf(k)] | 0; },
  spend(k, v) { const T = this.tree(k); if (T.cur === 'coins') save.coins -= v; else save.ac[this.KEYS.indexOf(k)] -= v; },
  curName(k) { const T = this.tree(k); return !T ? '' : T.cur === 'coins' ? 'monedas' : 'datos ' + T.name; },
  cost(n, lv) { return n.c * (n.cl ? lv + 1 : 1); },
  // se puede comprar: unido a uno que ya tenés (las uniones van para los dos lados)
  reachable(k, n) {
    if (n.t === 'start') return true;
    const T = this.tree(k);
    return n.link.some(id => this.owned(k, id)) || T.nodes.some(o => o.link.includes(n.id) && this.owned(k, o.id));
  },
  state(k, n) {
    const lv = this.lv(k, n.id);
    if (n.t === 'start') return 'max';
    if (lv >= n.m) return 'max';
    if (!this.reachable(k, n)) return 'lock';
    return this.money(k) >= this.cost(n, lv) ? 'buy' : 'poor';
  },
  buy(k, id) {
    const n = this.node(k, id); if (!n || this.state(k, n) !== 'buy') return false;
    const lv = this.lv(k, id); this.spend(k, this.cost(n, lv)); save.tr[k][id] = lv + 1;
    persist(); wal(); return true;
  },
  // devuelve todo lo gastado en el árbol k (cuesta un Chip de Reformateo)
  respec(k) {
    this.ensure(); if (save.rc < 1) return false;
    const T = this.tree(k); let back = 0;
    for (const n of T.nodes) { const lv = this.lv(k, n.id); for (let i = 0; i < lv; i++) back += this.cost(n, i); }
    if (!back) return false;
    this.spend(k, -back); save.tr[k] = {}; save.rc--;
    persist(); wal(); return back;
  },

  // ---------- Lo que lleva cada jugador a la partida ----------
  bondLv(cid) { const xp = (save.bond && save.bond[cid]) | 0; let l = 0; while (l < this.BOND.length && xp >= this.BOND[l]) l++; return l; },
  bondInfo(cid) { const xp = (save.bond && save.bond[cid]) | 0, lv = this.bondLv(cid); return { lv, xp, next: this.BOND[lv] || null, prev: lv ? this.BOND[lv - 1] : 0 }; },
  // suma los efectos de un árbol (fx × nivel) en una bolsa de modificadores
  sum(k, m) {
    const T = this.tree(k); if (!T) return m;
    for (const n of T.nodes) { const lv = this.lv(k, n.id); if (lv) Stats.add(m, n.fx, lv); }
    return m;
  },
  loadout(cid) {
    this.ensure();
    const m = {};
    if (this.data) { this.sum(this.KEYS[elOf(cid)] || 'vac', m); this.sum('tam', m); }
    return { m, bond: this.bondLv(cid) };
  },
  // un loadout que llegó por la red: solo números conocidos y con topes
  clean(lo) {
    if (!lo || typeof lo !== 'object') return null;
    const B = Stats.blank(), m = {};
    for (const k in (lo.m || {})) { const v = Number(lo.m[k]); if (k in B && isFinite(v)) m[k] = Math.max(-1, Math.min(k === 'hp' ? 200 : 10, v)); }
    return { m, bond: Math.max(0, Math.min(10, lo.bond | 0)) };
  },

  // ---------- Fin de la partida: datos del atributo, vínculo y chips (de los jugadores de este navegador) ----------
  onRunEnd(list, secs) {
    this.ensure(); const parts = [];
    for (const q of list) {
      if (!q || !q.vp) continue;
      const el = q.el | 0, k = this.KEYS[el];
      const ac = Math.floor((q.vp.k / 20 + secs / 40 + (q.stage | 0) * 2) * (1 + ((q.m && q.m.acoin) || 0)));
      save.ac[el] += ac;
      const b0 = this.bondLv(q.cid);
      save.bond[q.cid] = ((save.bond[q.cid]) | 0) + q.vp.k + Math.floor(secs / 5);
      const b1 = this.bondLv(q.cid);
      save.rc += q.vp.rc | 0;
      let txt = '+' + ac + ' datos ' + this.tree(k).name;
      if (b1 > b0) txt += ', vínculo nivel ' + b1;
      if (q.vp.rc) txt += ', +' + q.vp.rc + ' Chip' + (q.vp.rc > 1 ? 's' : '') + ' de Reformateo';
      parts.push(txt);
    }
    persist();
    return parts.length ? ' ' + parts.join(' · ') + '.' : '';
  },

  // ---------- Texto de los efectos ----------
  PCT: { dmgP: 'de daño', rateP: 'de velocidad de ataque', spP: 'de velocidad', hpP: 'de vida', arm: 'menos de daño recibido', magP: 'de alcance del imán',
    xp: 'de experiencia', coin: 'de monedas', crit: 'de crítico', critD: 'de daño crítico', cdr: 'menos de recarga', area: 'de área', dur: 'de duración',
    luck: 'de suerte', leech: 'de robo de vida', spg: 'de carga de SP', dodge: 'de esquiva', vs0: 'de daño contra Vacuna', vs1: 'de daño contra Virus',
    vs2: 'de daño contra Dato', healP: 'de curación de ítems', acoin: 'de datos de atributo', bulletRes: 'menos de daño de balas',
    rcChance: 'de chance de Chip de Reformateo', bossCoin: 'de monedas de jefes', revSpd: 'de velocidad al revivir', revHP: 'de vida al revivir',
    moveDmg: 'de daño al moverte', moveCdr: 'de recarga al moverte' },
  fmt(fx, lv) {
    const out = [];
    for (const k in fx) {
      const v = fx[k] * lv, r = x => Math.round(x * 1000) / 10;
      if (this.PCT[k]) out.push((v > 0 ? '+' : '') + String(r(v)).replace('.', ',') + '% ' + this.PCT[k]);
      else if (k === 'hp') out.push('+' + Math.round(v) + ' de vida');
      else if (k === 'regen') out.push('+' + String(Math.round(v * 100) / 100).replace('.', ',') + ' de vida por segundo');
      else if (k === 'lowRegen') out.push('+' + v + ' de vida por segundo con poca vida');
    }
    return out.join(', ');
  },
  TYPE: { start: 'Inicio', minor: 'Secundario', attr: 'Pasiva de atributo', major: 'Principal' },

  // ---------- Pantalla ----------
  open() { this.ensure(); treeOpen = true; $('tree').style.display = 'flex'; this.load().then(() => this.render()); },
  close() { treeOpen = false; $('tree').style.display = 'none'; },
  render() {
    this.injectStyles();
    const box = $('cols'); if (!box) return;
    if (!this.data) { box.innerHTML = '<p>No se pudo cargar el árbol.</p>'; return; }
    box.className = 'tr-box';
    const tabs = [...this.KEYS, 'tam'].map(k => { const T = this.tree(k);
      return '<button class="tr-tab' + (k === this.tab ? ' on' : '') + '" data-k="' + k + '" style="--ac:' + T.col + '"><b>' + T.name + '</b><small>' + this.money(k) + ' ' + (T.cur === 'coins' ? 'monedas' : 'datos') + '</small></button>'; }).join('');
    box.innerHTML = '<div class="tr-tabs">' + tabs + '</div>' +
      '<div class="tr-main"><div class="tr-view" id="tr-view"><div class="tr-in" id="tr-in"></div>' +
      '<div class="tr-zoom"><button data-z="1.25" aria-label="Acercar">+</button><button data-z="0.8" aria-label="Alejar">−</button><button data-z="0" aria-label="Centrar">◎</button></div></div>' +
      '<aside class="tr-info" id="tr-info"></aside></div>';
    $('tw').textContent = 'Chips de Reformateo: ' + (save.rc | 0);
    if ($('tsub')) $('tsub').textContent = 'Cada atributo tiene su árbol y sus datos (se ganan jugando con un Digimon de ese atributo). El de Tamer usa las monedas.';
    box.querySelectorAll('.tr-tab').forEach(b => b.onclick = () => { this.tab = b.dataset.k; this.sel = 'start'; this.view = null; this.confirmRs = 0; this.render(); });
    box.querySelectorAll('.tr-zoom button').forEach(b => b.onclick = () => { const z = +b.dataset.z; if (!z) this.view = null; else this.zoom(z); this.paint(); });
    this.drawTree(); this.panel(); this.bindPan();
  },
  drawTree() {
    const k = this.tab, T = this.tree(k), inn = $('tr-in'); if (!inn) return;
    const xs = T.nodes.map(n => n.x), ys = T.nodes.map(n => n.y), pad = 80;
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad;
    this.box = { x0, y0, w, h };
    let svg = '<svg class="tr-lines" width="' + w + '" height="' + h + '" viewBox="' + x0 + ' ' + y0 + ' ' + w + ' ' + h + '">';
    for (const n of T.nodes) for (const id of n.link) {
      const o = T.nodes.find(z => z.id === id); if (!o) continue;
      const on = this.owned(k, n.id) && this.owned(k, o.id), half = this.owned(k, n.id) || this.owned(k, o.id);
      svg += '<line x1="' + o.x + '" y1="' + o.y + '" x2="' + n.x + '" y2="' + n.y + '" class="' + (on ? 'on' : half ? 'half' : '') + '"/>';
    }
    svg += '</svg>';
    // etiquetas de las ramas
    // nombre de cada rama, en la punta (un poco más allá del último nodo)
    const lab = Object.entries(T.arms).map(([a, nm]) => { const d = { FUE: [0, -1], INT: [1, 0], VIT: [0, 1], VEL: [-1, 0] }[a];
      const far = Math.max(...T.nodes.filter(n => n.arm === a).map(n => Math.abs(n.x) + Math.abs(n.y))) + 62;
      return '<span class="tr-arm' + (a === T.fav ? ' fav' : '') + '" style="left:' + (d[0] * far - x0) + 'px;top:' + (d[1] * far - y0) + 'px">' + nm + (a === T.fav ? ' ★' : '') + '</span>'; }).join('');
    const nodes = T.nodes.map(n => {
      const st = this.state(k, n), lv = this.lv(k, n.id);
      return '<button class="tr-n ' + n.t + (n.notable ? ' notable' : '') + ' ' + st + (lv ? ' own' : '') + (n.id === this.sel ? ' sel' : '') + '" data-id="' + n.id + '" style="left:' + (n.x - x0) + 'px;top:' + (n.y - y0) + 'px" title="' + n.n + '">' +
        (n.t === 'major' ? '<i>★</i>' : n.t === 'start' ? '<i>◆</i>' : '<i>' + lv + '</i>') +
        (n.t === 'major' || n.t === 'start' ? '<span>' + n.n + '</span>' : '') + '</button>';
    }).join('');
    inn.style.width = w + 'px'; inn.style.height = h + 'px'; inn.style.setProperty('--ac', T.col);
    inn.innerHTML = svg + lab + nodes;
    inn.querySelectorAll('.tr-n').forEach(b => {
      b.onclick = e => { if (this.dragged) return; this.sel = b.dataset.id; this.confirmRs = 0; this.drawTree(); this.panel(); };
      b.ondblclick = () => { if (this.buy(k, b.dataset.id)) this.render(); };
    });
    this.paint();
  },
  panel() {
    const k = this.tab, T = this.tree(k), n = this.node(k, this.sel) || T.nodes[0], el = $('tr-info'); if (!el) return;
    const lv = this.lv(k, n.id), st = this.state(k, n), cost = st === 'max' ? 0 : this.cost(n, lv);
    const pips = n.m > 1 ? '<div class="tr-pips">' + Array.from({ length: n.m }, (_, i) => '<u' + (i < lv ? ' class="on"' : '') + '></u>').join('') + '<small>' + lv + '/' + n.m + '</small></div>' : '';
    // los principales con descripción la muestran; los notables (puntas de las ramitas) muestran su efecto
    const now = n.t === 'major' && n.d ? '' : lv ? this.fmt(n.fx, lv) : '', nxt = (n.t === 'major' && n.d) || lv >= n.m ? '' : this.fmt(n.fx, lv + 1);
    let html = '<span class="tr-type ' + n.t + '">' + (n.notable ? 'Notable' : this.TYPE[n.t]) + '</span><h3>' + n.n + '</h3>' + pips;
    if (n.d) html += '<p class="tr-d">' + n.d + '</p>';
    if (now) html += '<p><b>Ahora:</b> ' + now + '</p>';
    if (nxt) html += '<p><b>' + (lv ? 'Próximo nivel' : 'Nivel 1') + ':</b> ' + nxt + '</p>';
    if (n.t !== 'start') {
      if (st === 'max') html += '<p class="tr-ok">' + (n.m > 1 ? 'Nivel máximo' : 'Activa') + '</p>';
      else if (st === 'lock') html += '<p class="tr-lockt">Primero desbloqueá un nodo unido a este</p>';
      else html += '<button class="tr-buy" ' + (st === 'poor' ? 'disabled' : '') + '>Mejorar · ' + cost + ' ' + this.curName(k) + '</button>' + (st === 'poor' ? '<p class="tr-lockt">Te faltan ' + (cost - this.money(k)) + '</p>' : '');
    }
    const spent = T.nodes.some(o => this.lv(k, o.id));
    html += '<div class="tr-foot"><p>' + T.about + '.</p>' + (T.fav ? '<p>Rama fuerte: <b>' + T.arms[T.fav] + '</b></p>' : '') +
      '<p>Tenés <b>' + this.money(k) + '</b> ' + this.curName(k) + '</p>' +
      (spent ? '<button class="tr-rs"' + (save.rc < 1 ? ' disabled' : '') + '>' + (this.confirmRs ? '¿Seguro? Tocá de nuevo' : 'Reiniciar árbol · 1 Chip de Reformateo') + '</button>' + (save.rc < 1 ? '<small>Los Chips de Reformateo los sueltan a veces los jefes</small>' : '') : '') + '</div>';
    el.style.setProperty('--ac', T.col); el.innerHTML = html;
    const b = el.querySelector('.tr-buy'); if (b) b.onclick = () => { if (this.buy(k, n.id)) this.render(); };
    const r = el.querySelector('.tr-rs'); if (r) r.onclick = () => { if (!this.confirmRs) { this.confirmRs = 1; this.panel(); return; } this.confirmRs = 0; this.respec(k); this.render(); };
  },
  // ---------- Arrastrar y hacer zoom ----------
  paint() {
    const v = $('tr-view'), inn = $('tr-in'); if (!v || !inn || !this.box) return;
    // vista inicial: centrada en el Inicio, con todo el árbol si entra (y si no, sin achicar de más)
    if (!this.view) { const s = Math.max(0.55, Math.min(1, Math.min(v.clientWidth / this.box.w, v.clientHeight / this.box.h) * 0.95)); this.view = { s, x: v.clientWidth / 2 + this.box.x0 * s, y: v.clientHeight / 2 + this.box.y0 * s }; }
    inn.style.transform = 'translate(' + this.view.x + 'px,' + this.view.y + 'px) scale(' + this.view.s + ')';
  },
  zoom(f, cx_, cy_) {
    const v = $('tr-view'); if (!v || !this.view) return;
    const s = Math.max(0.2, Math.min(2.2, this.view.s * f)), k = s / this.view.s;
    const px = cx_ == null ? v.clientWidth / 2 : cx_, py = cy_ == null ? v.clientHeight / 2 : cy_;
    this.view.x = px - (px - this.view.x) * k; this.view.y = py - (py - this.view.y) * k; this.view.s = s;
  },
  bindPan() {
    const v = $('tr-view'); if (!v) return;
    let d = null;
    v.onpointerdown = e => { d = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y }; this.dragged = false; };
    v.onpointermove = e => { if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 6) this.dragged = true; if (this.dragged) { this.view.x = d.vx + dx; this.view.y = d.vy + dy; this.paint(); } };
    const up = () => { d = null; setTimeout(() => { this.dragged = false; }, 0); };
    v.onpointerup = up; v.onpointerleave = up;
    v.onwheel = e => { e.preventDefault(); const r = v.getBoundingClientRect(); this.zoom(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - r.left, e.clientY - r.top); this.paint(); };
  },

  injectStyles() {
    if ($('tree-css')) return;
    const st = document.createElement('style'); st.id = 'tree-css';
    st.textContent = `
#cols.tr-box{display:flex;flex-direction:column;gap:10px;width:100%;max-width:1240px}
.tr-tabs{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.tr-tab{display:flex;flex-direction:column;align-items:center;min-width:120px;padding:8px 16px;background:rgba(4,16,34,.85);border:2px solid var(--ac);color:#f2fbff;cursor:pointer;font:700 15px 'Chakra Petch',sans-serif;opacity:.65;clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)}
.tr-tab small{font-weight:500;color:var(--ac)}.tr-tab.on{opacity:1;box-shadow:0 0 14px var(--ac);background:linear-gradient(180deg,rgba(18,60,100,.6),rgba(4,16,34,.9))}
.tr-main{display:flex;gap:12px;align-items:stretch;min-height:min(62vh,640px)}
.tr-view{position:relative;flex:1;overflow:hidden;border:2px solid var(--cy);background:radial-gradient(circle at 50% 50%,rgba(18,60,100,.35),rgba(2,8,20,.92));touch-action:none;cursor:grab;min-height:420px}
.tr-view:active{cursor:grabbing}
.tr-in{position:absolute;left:0;top:0;transform-origin:0 0}
.tr-lines{position:absolute;left:0;top:0;overflow:visible}.tr-lines line{stroke:rgba(120,170,210,.28);stroke-width:4}
.tr-lines line.half{stroke:rgba(255,210,63,.45);stroke-dasharray:6 6}.tr-lines line.on{stroke:var(--ac);stroke-width:6;filter:drop-shadow(0 0 4px var(--ac))}
.tr-arm{position:absolute;transform:translate(-50%,-50%);font:700 11px 'Orbitron',sans-serif;letter-spacing:.08em;text-transform:uppercase;color:rgba(200,230,255,.55);pointer-events:none;white-space:nowrap}
.tr-arm.fav{color:var(--ac)}
.tr-n{position:absolute;transform:translate(-50%,-50%);width:34px;height:34px;border-radius:50%;border:3px solid #3a5a78;background:#081a30;color:#cfe8ff;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;font:700 13px 'Chakra Petch',sans-serif}
.tr-n i{font-style:normal}
.tr-n span{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:6px;white-space:nowrap;font:700 12px 'Chakra Petch',sans-serif;color:#f2fbff;text-shadow:0 0 4px #000,0 0 8px #000;pointer-events:none}
.tr-n.attr{border-radius:4px;transform:translate(-50%,-50%) rotate(45deg);width:30px;height:30px}.tr-n.attr i{transform:rotate(-45deg)}
.tr-n.major{width:52px;height:52px;font-size:22px;border-radius:12px}.tr-n.notable{width:40px;height:40px;font-size:16px;border-radius:50%}
.tr-n.start{width:60px;height:60px;font-size:24px;border-color:var(--ac);color:var(--ac);box-shadow:0 0 16px var(--ac)}
.tr-n.lock{opacity:.4}
.tr-n.buy{border-color:#ffd23f;box-shadow:0 0 12px rgba(255,210,63,.7);color:#ffd23f}
.tr-n.poor{border-color:#c9a23a}
.tr-n.own{border-color:var(--ac);background:color-mix(in srgb,var(--ac) 35%,#081a30);color:#fff;box-shadow:0 0 10px var(--ac)}
.tr-n.max.own{background:var(--ac);color:#04101f}
.tr-n.sel{outline:3px solid #fff;outline-offset:3px}
.tr-zoom{position:absolute;right:8px;bottom:8px;display:flex;gap:6px}
.tr-zoom button{width:34px;height:34px;border:2px solid var(--cy);background:rgba(4,16,34,.9);color:#f2fbff;font:700 18px sans-serif;cursor:pointer}
.tr-info{width:300px;flex-shrink:0;display:flex;flex-direction:column;gap:6px;padding:14px;border:2px solid var(--ac);background:linear-gradient(180deg,rgba(18,60,100,.45),rgba(4,16,34,.92));font:500 14px/1.4 'Chakra Petch',sans-serif;color:var(--ink)}
.tr-info h3{margin:0;font:700 20px 'Chakra Petch',sans-serif;color:#f2fbff;text-transform:uppercase}
.tr-info p{margin:0}.tr-d{color:#f2fbff}
.tr-type{align-self:flex-start;padding:2px 8px;font:700 11px 'Orbitron',sans-serif;letter-spacing:.08em;text-transform:uppercase;background:rgba(255,255,255,.1);color:var(--ac)}
.tr-type.major{background:var(--ac);color:#04101f}
.tr-pips{display:flex;gap:3px;align-items:center}.tr-pips u{width:16px;height:7px;border:1px solid var(--ac)}.tr-pips u.on{background:var(--ac)}.tr-pips small{margin-left:6px;color:var(--ac);font-weight:700}
.tr-buy,.tr-rs{margin-top:4px;padding:10px;border:2px solid #ffd23f;background:rgba(255,210,63,.12);color:#ffd23f;font:700 15px 'Chakra Petch',sans-serif;cursor:pointer}
.tr-buy:disabled,.tr-rs:disabled{opacity:.4;cursor:not-allowed}
.tr-rs{border-color:#ff7a7a;color:#ffb0b0;background:rgba(255,80,80,.1);font-size:13px}
.tr-ok{color:#4dffb8;font-weight:700}.tr-lockt{color:#9fb3c4;font-size:13px}
.tr-foot{margin-top:auto;padding-top:10px;border-top:1px solid rgba(255,255,255,.15);display:flex;flex-direction:column;gap:4px;font-size:13px}
.tr-foot small{color:#9fb3c4}
@media (max-width:860px){.tr-main{flex-direction:column}.tr-info{width:auto}.tr-view{min-height:360px}}`;
    document.head.appendChild(st);
  }
};
Trees.ensure();
Trees.load();

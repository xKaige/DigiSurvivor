// Motor de skills. Se carga DESPUÉS de loader.js y ANTES de game.js.
// Usa las variables globales de game.js (en, sh, ef, hit, cx, t, CR) en tiempo de ejecución.
//
// Íconos: cada skill puede tener "icon" (archivo en assets/sprites/skills/, sacado de dsrworldwiki);
// si no tiene, la barra muestra el ícono de su elemento (el_<elemento>.webp).
// Efectos: sprites animados de Digital Tamers en assets/sprites/fx/ (tiras horizontales, "fxSprites" en skills.json).
// "fx" en skills.json dice qué usa cada elemento: pr = proyectil, hit = impacto, nv = pulso de área.
//
// REGLAS:
// - Skills NUEVAS: solo las de la etapa actual (o la rama elegida). Nada de etapas anteriores o futuras.
// - Skills que ya tenés: siempre pueden recibir mejoras, aunque seas de otra etapa.
// - Máximo nivel: "maxLevel" de skills.json (5); las skills de forma final ("final": true) llegan a "maxLevelFinal" (10).
// - Cada nivel da UNA mejora concreta que se ve en pantalla, según el tipo de skill (PERKS): más daño, más área,
//   menos recarga, +1 proyectil / tajo / rayo / onda / orbe, perforación, y en el nivel 10 "Máximo poder".
// - Con las 4 skills ocupadas siguen saliendo skills nuevas: al elegir una, game.js pregunta cuál reemplazar.
const SkillSys = {
  cat: null,
  sig: null,
  img: {},          // sprites de efectos cargados: nombre -> { i: Image, w, h, n }

  async load() {
    if (this.cat) return;
    const r = await fetch('src/data/skills.json');
    if (!r.ok) throw new Error('No se encontró src/data/skills.json (' + r.status + ')');
    this.cat = await r.json();
    await Promise.all(Object.entries(this.cat.fxSprites || {}).map(([k, m]) => new Promise(res => {
      const i = new Image();
      i.onload = () => { this.img[k] = Object.assign({ i }, m); res(); };
      i.onerror = () => { console.error('No se pudo cargar el efecto:', m.file); res(); };
      i.src = 'assets/sprites/fx/' + m.file;
    })));
  },
  // sprite de efecto de un elemento (kind: 'pr' | 'hit' | 'nv'); si el elemento no tiene, usa el neutral
  fxOf(el, kind) { const f = this.cat && this.cat.fx && (this.cat.fx[el] || this.cat.fx.neutral); return f ? this.img[f[kind]] : null; },
  // dibuja el cuadro f de una tira, centrado, con alto h (respeta la proporción)
  spr(S, f, x, y, h, rot) {
    const w = S.w * h / S.h;
    cx.save(); cx.translate(x, y); if (rot) cx.rotate(rot); cx.imageSmoothingEnabled = false;
    cx.drawImage(S.i, (Math.max(0, f | 0) % S.n) * S.w, 0, S.w, S.h, -w / 2, -h / 2, w, h);
    cx.restore();
  },
  iconOf(d) { return 'assets/sprites/skills/' + (d.icon || 'el_' + (d.element || 'neutral') + '.webp'); },

  def(k) { return this.cat && this.cat.skills[k]; },
  col(d) { return (this.cat.elements[d.element]) || '#ffffff'; },
  maxLv() { return (this.cat && this.cat.maxLevel) || 5; },
  // nivel máximo de una skill: las de forma final llegan a 10
  maxOf(k) { const d = typeof k === 'string' ? this.def(k) : k; return d && d.final ? (this.cat.maxLevelFinal || 10) : this.maxLv(); },
  // Máximo de skills activas a la vez (maxActive en skills.json). Con el cupo lleno solo salen mejoras de las que ya tenés.
  // q: con Compresión (árbol de Dato) se puede tener una más
  maxActive(q) { return ((this.cat && this.cat.maxActive) || 4) + ((q && q.m && q.m.slots) | 0); },
  activeCount(q) { return Object.keys(q.wp).filter(k => this.def(k) && (q.wp[k] | 0) > 0).length; },
  canTake(q, k) { return !!this.def(k) && ((q.wp[k] | 0) > 0 || this.activeCount(q) < this.maxActive(q)); },

  // ---------- Mejoras por nivel ----------
  // PERKS[tipo][i] = mejora que da el nivel i+2 (nivel 2 … 10). Cada una cambia algo que se VE al usar la skill.
  PERKS: {
    projectile: ['dmg', 'cnt', 'pierce', 'cnt', 'area', 'cnt', 'dmg', 'cnt', 'big'],
    melee_arc:  ['dmg', 'area', 'cnt', 'dmg', 'area', 'cnt', 'cd', 'area', 'big'],
    cone:       ['dmg', 'area', 'cnt', 'dmg', 'area', 'cnt', 'cd', 'area', 'big'],
    beam:       ['dmg', 'area', 'cnt', 'dmg', 'cd', 'cnt', 'area', 'dmg', 'big'],
    nova:       ['dmg', 'area', 'cd', 'cnt', 'area', 'dmg', 'cnt', 'area', 'big'],
    orbit:      ['dmg', 'cnt', 'area', 'dmg', 'cnt', 'area', 'dmg', 'cnt', 'big']
  },
  UNIT: { projectile: 'proyectil', melee_arc: 'tajo', cone: 'abanico', beam: 'rayo', nova: 'onda', orbit: 'orbe' },
  perkText(d, lv) {
    const k = (this.PERKS[d.type] || [])[lv - 2], u = this.UNIT[d.type] || 'golpe';
    return { dmg: '+30% de daño', area: '+15% de área', cd: '-12% de recarga', cnt: '+1 ' + u, pierce: 'Atraviesa 1 enemigo más',
      big: 'MÁXIMO PODER: +40% de daño, +25% de área y +1 ' + u }[k] || '+30% de daño';
  },
  // valores efectivos de una skill a cierto nivel (suma de todas las mejoras hasta ese nivel)
  perks(d, lv) {
    const S = { dmg: 1, area: 1, cd: 1, cnt: 0, pierce: 0, size: 1 }, L = this.PERKS[d.type] || [];
    for (let i = 2; i <= lv; i++) {
      const k = L[i - 2] || 'dmg';
      if (k === 'dmg') S.dmg *= 1.3;
      else if (k === 'area') { S.area *= 1.15; S.size *= 1.1; }
      else if (k === 'cd') S.cd *= 0.88;
      else if (k === 'cnt') S.cnt++;
      else if (k === 'pierce') S.pierce++;
      else if (k === 'big') { S.dmg *= 1.4; S.area *= 1.25; S.size *= 1.35; S.cnt++; }
    }
    return S;
  },

  shuffle(a) { return a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]); },

  // Skills que se pueden APRENDER ahora: solo las de la etapa actual / rama elegida
  pool(q) {
    const C = CR(q), meta = C && C.meta; if (!meta) return [];
    if (meta.anySkill) return Object.keys(this.cat.skills);
    const s = q.stage | 0;
    if (s < 5) { const st = meta.stages[s]; return (st && st.skills) || []; }
    const b = meta.branches.find(x => x.id === q.branchId) || meta.branches[q.line || 0];
    return (b && b.skills) || [];
  },

  // Cartas de skills: NUEVAS (de tu etapa) y MEJORAS (de las que ya tenés), mezcladas
  cards(q) {
    if (!this.cat) return [];
    const full = this.activeCount(q) >= this.maxActive(q);
    // nuevas: aunque tengas las 4 ocupadas (full); en ese caso game.js pregunta cuál reemplazar (u.rep)
    const fresh = this.pool(q).filter(k => this.def(k) && !(q.wp[k] | 0)).map(k => {
      const d = this.def(k), u = { n: d.name, d: d.desc, op: 'wp', wpKey: k, tag: 'Skill NUEVA', fresh: 1, full,
        f: () => { this.forget(q, u.rep); if (this.canTake(q, k)) q.wp[k] = 1; } };
      return u;
    });
    const ups = Object.keys(q.wp).filter(k => this.def(k) && (q.wp[k] | 0) >= 1 && q.wp[k] < this.maxOf(k)).map(k => {
      const d = this.def(k), nx = q.wp[k] + 1;
      return { n: d.name, d: d.desc, op: 'wp', wpKey: k,
        tag: 'Nivel ' + nx + '/' + this.maxOf(k) + ' · ' + this.perkText(d, nx), f: () => { q.wp[k] = (q.wp[k] | 0) + 1; } };
    });
    const a = this.shuffle(fresh), c = this.shuffle(ups), out = [];
    for (let i = 0; i < Math.max(a.length, c.length); i++) { if (a[i]) out.push(a[i]); if (c[i]) out.push(c[i]); }
    return out;
  },

  // olvida una skill (para hacer lugar a una nueva)
  forget(q, k) { if (!k || !q.wp[k]) return; delete q.wp[k]; delete q.wt[k]; if (q.wc) delete q.wc[k]; },

  near(q, max) {
    let b = null, bd = max;
    for (const e of en) { const d = Math.hypot(e.x - q.x, e.y - q.y); if (d < bd) { bd = d; b = e; } }
    return b;
  },

  update(q, dt) {
    if (!this.cat) return;
    q.skT = Math.max(0, (q.skT || 0) - dt);
    for (const k in q.wp) {
      const lv = q.wp[k] | 0; if (!lv) continue;
      const d = this.def(k); if (!d) continue;
      const S = this.perks(d, lv);
      // stats del jugador (stats.js): área, recarga y duración
      if (q.area) { S.area *= q.area; S.size *= Math.sqrt(q.area); }
      if (d.type === 'orbit') { this.orbit(q, k, d, S, dt); continue; }
      q.wt[k] = (q.wt[k] === undefined ? 0 : q.wt[k]) - dt * (q.moving && q.m && q.m.moveCdr ? 1 + q.m.moveCdr : 1);
      if (q.wt[k] > 0) continue;
      const fn = this[d.type]; if (!fn) continue;
      if (q.emp && this.near(q, 520)) Stats.useEmp(q, S);   // SP lleno: esta sale potenciada
      const cd = Math.max(.35, d.cd * S.cd * (q.cdr || 1)), c0 = q.casts | 0;
      fn.call(this, q, k, d, S, cd);
      // Sobrecarga (árbol de Dato): cada 5 skills, la quinta sale dos veces
      if (q.m && q.m.overload && (q.casts | 0) > c0 && q.casts % 5 === 0) fn.call(this, q, k, d, S, cd);
    }
  },

  fired(q, k, cd) { q.wt[k] = cd; (q.wc || (q.wc = {}))[k] = cd; q.skT = .25; q.casts = (q.casts | 0) + 1; },
  idle(q, k) { q.wt[k] = .25; (q.wc || (q.wc = {}))[k] = 0; },   // sin enemigos cerca: reintenta pronto, sin "apagar" el ícono
  // tamaño visual de los efectos según lo grande que se dibuja el Digimon (q.dh lo guarda drawBuddy)
  vis(q) { return Math.min(2.2, Math.max(1.2, ((q && q.dh) || 96) / 80)); },

  sweep(q, a, R, arc, dm, col, kind) {
    ef.push({ k: kind, x: q.x, y: q.y, a, R, s: arc, col, l: .25, m: .25 });
    for (const e of en) {
      const dx = e.x - q.x, dy = e.y - q.y, dist = Math.hypot(dx, dy);
      if (dist > R + e.r) continue;
      let da = Math.abs(Math.atan2(dy, dx) - a); if (da > Math.PI) da = 2 * Math.PI - da;
      if (da <= arc / 2 || dist < e.r + 12) hit(e, dm, q.el, q);
    }
  },

  melee_arc(q, k, d, S, cd) {
    const R = d.range * S.area;
    const b = this.near(q, R + 120); if (!b) { this.idle(q, k); return; }
    const a0 = Math.atan2(b.y - q.y, b.x - q.x), n = 1 + S.cnt;
    for (let i = 0; i < n; i++) this.sweep(q, a0 + i * 6.283 / n, R, d.arc, d.dmg * q.dmg * S.dmg, this.col(d), 'arc');   // +1 tajo: otro corte alrededor
    this.impact(b.x, b.y, d.element, 46 * this.vis(q) * S.size);
    this.fired(q, k, cd);
  },

  cone(q, k, d, S, cd) {
    const R = d.range * S.area;
    const b = this.near(q, R + 60); if (!b) { this.idle(q, k); return; }
    const a0 = Math.atan2(b.y - q.y, b.x - q.x);
    for (let i = 0; i <= S.cnt; i++) { const off = i ? Math.ceil(i / 2) * (i % 2 ? 1 : -1) * d.arc * 0.9 : 0;   // +1 abanico: otro a un costado
      this.sweep(q, a0 + off, R, d.arc, d.dmg * q.dmg * S.dmg, this.col(d), 'cone'); }
    this.impact(b.x, b.y, d.element, 54 * this.vis(q) * S.size);
    this.fired(q, k, cd);
  },

  projectile(q, k, d, S, cd) {
    const b = this.near(q, 520); if (!b) { this.idle(q, k); return; }
    // count + spread: varios proyectiles repartidos en abanico (spread = ángulo total en radianes)
    const a0 = Math.atan2(b.y - q.y, b.x - q.x), n = (d.count || 1) + S.cnt;   // +1 proyectil por mejora
    const sp = n > 1 ? Math.min(1.5, (d.count > 1 ? (d.spread || .5) : 0.2) + 0.14 * S.cnt) : 0;
    for (let i = 0; i < n; i++) {
      const a = a0 + (n > 1 ? -sp / 2 + sp * i / (n - 1) : 0);
      sh.push({ x: q.x, y: q.y, vx: Math.cos(a) * d.speed, vy: Math.sin(a) * d.speed,
        l: (d.life || 1.2) * (q.dur || 1), pi: (d.pierce || 0) + S.pierce, h: new Set(), d: d.dmg * q.dmg * S.dmg, el: q.el, q: q.id,
        ex: (d.explode || 0) * S.area, c: this.col(d), r: 8 * S.size, fx: d.element, sz: 34 * this.vis(q) * S.size });
    }
    this.fired(q, k, cd);
  },

  // Pulso alrededor del jugador. guard: segundos de invulnerabilidad (barreras tipo Mandara)
  nova(q, k, d, S, cd) {
    const R = d.radius * S.area;
    if (!this.near(q, R + 40)) { this.idle(q, k); return; }
    const dm = d.dmg * q.dmg * S.dmg;
    for (let i = 0; i <= S.cnt; i++) {   // +1 onda: otro anillo, más grande
      const Ri = R * (1 + 0.35 * i);
      ef.push({ k: 'ring', x: q.x, y: q.y, R: Ri, col: this.col(d), l: .35 + .08 * i, m: .35 + .08 * i });
      if (!i && this.fxOf(d.element, 'nv')) ef.push({ k: 'nova', fx: d.element, x: q.x, y: q.y, R, l: .45, m: .45 });
      for (const e of en) if (Math.hypot(e.x - q.x, e.y - q.y) < Ri + e.r) hit(e, dm * (i ? 0.6 : 1), q.el, q);
    }
    if (d.guard) q.inv = Math.max(q.inv || 0, d.guard * (q.dur || 1));
    this.fired(q, k, cd);
  },

  // Explosión de un proyectil con área (se llama desde el bucle de proyectiles de game.js)
  explode(s, first) {
    ef.push({ k: 'ring', x: s.x, y: s.y, R: s.ex, col: s.c, l: .3, m: .3 });
    this.impact(s.x, s.y, s.fx, Math.max((s.sz || 34) * 1.5, s.ex * 1.6));
    for (const e of en) {
      if (e === first) continue;
      if (Math.hypot(e.x - s.x, e.y - s.y) < s.ex + e.r) hit(e, s.d * .6, s.el, P[s.q]);
    }
  },

  beam(q, k, d, S, cd) {
    const b = this.near(q, d.range * S.area + 100); if (!b) { this.idle(q, k); return; }
    const a = Math.atan2(b.y - q.y, b.x - q.x), Lg = d.range * S.area, W = d.width * S.area;
    const dm = d.dmg * q.dmg * S.dmg;
    for (let i = 0; i <= S.cnt; i++) {   // +1 rayo: otro en abanico
      const ai = a + (i ? Math.ceil(i / 2) * (i % 2 ? 1 : -1) * 0.26 : 0), ca = Math.cos(ai), sa = Math.sin(ai);
      ef.push({ k: 'ray', x: q.x, y: q.y, a: ai, Lg, w: W, col: this.col(d), l: .25, m: .25 });
      for (const e of en) {
        const px = e.x - q.x, py = e.y - q.y, al = px * ca + py * sa;
        if (al > 0 && al < Lg && Math.abs(-px * sa + py * ca) < e.r + W / 2) hit(e, dm, q.el, q);
      }
    }
    this.impact(b.x, b.y, d.element, 50 * this.vis(q) * S.size);
    this.fired(q, k, cd);
  },

  // efecto de impacto (sprite animado) en un punto; h = tamaño en pantalla
  impact(x, y, el, h) { if (this.fxOf(el, 'hit')) ef.push({ k: 'hit', fx: el, x, y, R: h, l: .35, m: .35 }); },

  // proyectil con sprite (lo llama el dibujo de disparos de game.js). Devuelve false si no tiene sprite.
  drawShot(s) {
    const S = s.fx && this.fxOf(s.fx, 'pr'); if (!S) return false;
    this.spr(S, t * 12, s.x, s.y, s.sz || 34, s.a != null ? s.a : Math.atan2(s.vy, s.vx));
    return true;
  },

  orbit(q, k, d, S, dt) {
    q.oa += dt * 3.2;
    const n = (d.count || 3) + S.cnt, R = (d.radius || 64) * S.area, key = 'oh' + q.id + k;
    for (let i = 0; i < n; i++) {
      const a = q.oa + i * 6.283 / n, ox = q.x + Math.cos(a) * R, oy = q.y + Math.sin(a) * R;
      for (const e of en) {
        if (t - (e[key] || -9) > .45 && Math.hypot(e.x - ox, e.y - oy) < e.r + 9) {
          e[key] = t; hit(e, d.dmg * q.dmg * S.dmg, q.el, q);
        }
      }
    }
  },

  drawOrbits(q) {
    if (!this.cat) return;
    for (const k in q.wp) {
      const d = this.def(k); if (!d || d.type !== 'orbit' || !(q.wp[k] | 0)) continue;
      const S = this.perks(d, q.wp[k]), n = (d.count || 3) + S.cnt, R = (d.radius || 64) * S.area * (q.area || 1);
      const P = this.fxOf(d.element, 'pr');
      cx.fillStyle = this.col(d); cx.strokeStyle = '#fff'; cx.lineWidth = 2;
      for (let i = 0; i < n; i++) {
        const a = q.oa + i * 6.283 / n, ox = q.x + Math.cos(a) * R, oy = q.y + Math.sin(a) * R;
        if (P) { this.spr(P, t * 12 + i, ox, oy, 28 * this.vis(q) * S.size, a + Math.PI / 2); continue; }
        cx.beginPath(); cx.arc(ox, oy, 9, 0, 6.283); cx.fill(); cx.stroke();
      }
    }
  },

  drawFx(o) {
    const k = 1 - o.l / o.m, col = o.col || '#bfe6ff';
    cx.globalAlpha = Math.max(0, o.l / o.m);
    if (o.k === 'ring') {
      cx.strokeStyle = col; cx.lineWidth = 6; cx.beginPath(); cx.arc(o.x, o.y, o.R * k, 0, 6.283); cx.stroke();
    } else if (o.k === 'ray') {
      const x2 = o.x + Math.cos(o.a) * o.Lg, y2 = o.y + Math.sin(o.a) * o.Lg;
      cx.lineCap = 'round'; cx.strokeStyle = col; cx.lineWidth = (o.w || 14) * 1.5;
      cx.globalAlpha = Math.max(0, o.l / o.m) * .45; cx.beginPath(); cx.moveTo(o.x, o.y); cx.lineTo(x2, y2); cx.stroke();
      cx.globalAlpha = Math.max(0, o.l / o.m); cx.lineWidth = o.w || 14; cx.beginPath(); cx.moveTo(o.x, o.y); cx.lineTo(x2, y2); cx.stroke();
      cx.strokeStyle = '#fff'; cx.lineWidth = Math.max(2, (o.w || 14) * .35); cx.beginPath(); cx.moveTo(o.x, o.y); cx.lineTo(x2, y2); cx.stroke();
      cx.lineCap = 'butt';
    } else if (o.k === 'wline' || o.k === 'wcirc') {
      Enemies.drawWarn(o);   // aviso de ataque enemigo (enemies.js)
    } else if (o.k === 'hit' || o.k === 'nova') {
      const S = this.fxOf(o.fx, o.k === 'hit' ? 'hit' : 'nv');
      if (S) { cx.globalAlpha = Math.min(1, o.l / o.m * 3); this.spr(S, k * S.n, o.x, o.y, o.k === 'hit' ? o.R : o.R * 2); }
    } else if (o.k === 'arc') {
      cx.strokeStyle = col; cx.lineWidth = 10; cx.lineCap = 'round';
      cx.beginPath(); cx.arc(o.x, o.y, o.R * .8, o.a - o.s / 2, o.a - o.s / 2 + o.s * Math.min(1, k * 2)); cx.stroke();
      cx.lineCap = 'butt';
    } else if (o.k === 'cone') {
      cx.globalAlpha = Math.max(0, o.l / o.m) * .55; cx.fillStyle = col;
      cx.beginPath(); cx.moveTo(o.x, o.y); cx.arc(o.x, o.y, o.R * (.4 + .6 * k), o.a - o.s / 2, o.a + o.s / 2);
      cx.closePath(); cx.fill();
    }
    cx.globalAlpha = 1;
  },

  // ---------- Barra fija de skills (abajo, al centro) ----------
  renderBar(players) {
    const el = document.getElementById('skbar'); if (!el || !this.cat) return;
    const sig = players.length + '|' + players.map(q => Object.keys(q.wp).map(k => k + q.wp[k]).join(',')).join('|');
    if (sig !== this.sig) { this.sig = sig; this.buildBar(players, el); }
    this.cdBar(players);
  },
  buildBar(players, el) {
    const two = players.length > 1, pc = ['#2ee6c8', '#ff7ad9'], max = this.maxLv();
    el.innerHTML = players.map((q, i) => {
      const ks = Object.keys(q.wp).filter(k => this.def(k) && (q.wp[k] | 0) > 0);
      const slots = ks.length
        ? ks.map(k => { const d = this.def(k);
            return '<div class="sk" style="--ac:' + this.col(d) + '"><div class="skbox' + (d.icon ? '' : ' el') + '" data-q="' + i + '" data-k="' + k + '"><img src="' + this.iconOf(d) + '" alt=""><i class="cd"></i><b>' + q.wp[k] + '</b></div><div class="skname">' + d.name + '<br>Nv ' + q.wp[k] + '/' + this.maxOf(d) + '</div></div>'; }).join('')
        : '<div class="sk empty"><div class="skbox"></div><div class="skname">Sin skill</div></div>';
      return '<div class="skgrp">' + (two ? '<span class="skwho" style="color:' + pc[i] + '">J' + (i + 1) + '</span>' : '') + slots + '</div>';
    }).join('');
  },

  // Recarga de cada skill en la barra: el cuadrito se "apaga" al usarla y se va prendiendo de abajo hacia arriba
  cdBar(players) {
    document.querySelectorAll('#skbar .skbox[data-k]').forEach(b => {
      const q = players[+b.dataset.q], k = b.dataset.k, tot = q && q.wc && q.wc[k];
      const f = tot ? Math.max(0, Math.min(1, (q.wt[k] || 0) / tot)) : 0;
      b.firstElementChild.nextElementSibling.style.height = (f * 100).toFixed(1) + '%';
      b.classList.toggle('cool', f > 0);
    });
  },

  clearBar() {
    this.sig = null;
    const el = document.getElementById('skbar'); if (el) el.innerHTML = '';
  }
};

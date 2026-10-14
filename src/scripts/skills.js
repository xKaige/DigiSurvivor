// Motor de skills. Se carga DESPUÉS de loader.js y ANTES de game.js.
// Usa las variables globales de game.js (en, sh, ef, hit, cx, t, CR) en tiempo de ejecución.
//
// REGLAS:
// - Skills NUEVAS: solo las de la etapa actual (o la rama elegida). Nada de etapas anteriores o futuras.
// - Skills que ya tenés: siempre pueden recibir mejoras, aunque seas de otra etapa.
// - Máximo nivel: "maxLevel" de skills.json (5). Cada nivel suma lo mismo a TODAS las skills
//   ("levelBonus" de skills.json): más daño, más área y menos recarga.
const SkillSys = {
  cat: null,
  sig: null,

  async load() {
    if (this.cat) return;
    const r = await fetch('src/data/skills.json');
    if (!r.ok) throw new Error('No se encontró src/data/skills.json (' + r.status + ')');
    this.cat = await r.json();
  },

  def(k) { return this.cat && this.cat.skills[k]; },
  col(d) { return (this.cat.elements[d.element]) || '#ffffff'; },
  maxLv() { return (this.cat && this.cat.maxLevel) || 5; },

  // Escalado por nivel: igual para todas las skills
  scale(lv) {
    const b = this.cat.levelBonus, n = Math.max(0, lv - 1);
    return { dmg: 1 + b.dmg * n, area: 1 + b.area * n, cd: Math.max(.4, 1 - b.cd * n) };
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
    const max = this.maxLv(), b = this.cat.levelBonus;
    const gain = '+' + Math.round(b.dmg * 100) + '% daño · +' + Math.round(b.area * 100) + '% área · -' + Math.round(b.cd * 100) + '% recarga';
    const fresh = this.pool(q).filter(k => this.def(k) && !(q.wp[k] | 0)).map(k => {
      const d = this.def(k);
      return { n: d.name, d: d.desc, op: 'wp', wpKey: k, tag: 'Skill NUEVA', f: () => { q.wp[k] = 1; } };
    });
    const ups = Object.keys(q.wp).filter(k => this.def(k) && (q.wp[k] | 0) >= 1 && q.wp[k] < max).map(k => {
      const d = this.def(k);
      return { n: d.name, d: d.desc, op: 'wp', wpKey: k,
        tag: 'Nivel ' + (q.wp[k] + 1) + '/' + max + ' · ' + gain, f: () => { q.wp[k] = (q.wp[k] | 0) + 1; } };
    });
    const a = this.shuffle(fresh), c = this.shuffle(ups), out = [];
    for (let i = 0; i < Math.max(a.length, c.length); i++) { if (a[i]) out.push(a[i]); if (c[i]) out.push(c[i]); }
    return out;
  },

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
      const S = this.scale(lv);
      if (d.type === 'orbit') { this.orbit(q, k, d, S, dt); continue; }
      q.wt[k] = (q.wt[k] === undefined ? 0 : q.wt[k]) - dt;
      if (q.wt[k] > 0) continue;
      const fn = this[d.type];
      if (fn) fn.call(this, q, k, d, S, Math.max(.35, d.cd * S.cd));
    }
  },

  fired(q, k, cd) { q.wt[k] = cd; q.skT = .25; },

  sweep(q, a, R, arc, dm, col, kind) {
    ef.push({ k: kind, x: q.x, y: q.y, a, R, s: arc, col, l: .25, m: .25 });
    for (const e of en) {
      const dx = e.x - q.x, dy = e.y - q.y, dist = Math.hypot(dx, dy);
      if (dist > R + e.r) continue;
      let da = Math.abs(Math.atan2(dy, dx) - a); if (da > Math.PI) da = 2 * Math.PI - da;
      if (da <= arc / 2 || dist < e.r + 12) hit(e, dm);
    }
  },

  melee_arc(q, k, d, S, cd) {
    const R = d.range * S.area;
    const b = this.near(q, R + 120); if (!b) { q.wt[k] = .25; return; }
    this.sweep(q, Math.atan2(b.y - q.y, b.x - q.x), R, d.arc, d.dmg * q.dmg * S.dmg, this.col(d), 'arc');
    this.fired(q, k, cd);
  },

  cone(q, k, d, S, cd) {
    const R = d.range * S.area;
    const b = this.near(q, R + 60); if (!b) { q.wt[k] = .25; return; }
    this.sweep(q, Math.atan2(b.y - q.y, b.x - q.x), R, d.arc, d.dmg * q.dmg * S.dmg, this.col(d), 'cone');
    this.fired(q, k, cd);
  },

  projectile(q, k, d, S, cd) {
    const b = this.near(q, 520); if (!b) { q.wt[k] = .25; return; }
    const a = Math.atan2(b.y - q.y, b.x - q.x);
    sh.push({ x: q.x, y: q.y, vx: Math.cos(a) * d.speed, vy: Math.sin(a) * d.speed,
      l: d.life || 1.2, pi: 0, h: new Set(), d: d.dmg * q.dmg * S.dmg,
      ex: (d.explode || 0) * S.area, c: this.col(d), r: 8 });
    this.fired(q, k, cd);
  },

  // Explosión de un proyectil con área (se llama desde el bucle de proyectiles de game.js)
  explode(s, first) {
    ef.push({ k: 'ring', x: s.x, y: s.y, R: s.ex, col: s.c, l: .3, m: .3 });
    for (const e of en) {
      if (e === first) continue;
      if (Math.hypot(e.x - s.x, e.y - s.y) < s.ex + e.r) hit(e, s.d * .6);
    }
  },

  beam(q, k, d, S, cd) {
    const b = this.near(q, d.range * S.area + 100); if (!b) { q.wt[k] = .25; return; }
    const a = Math.atan2(b.y - q.y, b.x - q.x), Lg = d.range * S.area, W = d.width * S.area;
    const ca = Math.cos(a), sa = Math.sin(a), dm = d.dmg * q.dmg * S.dmg;
    ef.push({ k: 'ray', x: q.x, y: q.y, a, Lg, w: W, col: this.col(d), l: .25, m: .25 });
    for (const e of en) {
      const px = e.x - q.x, py = e.y - q.y, al = px * ca + py * sa;
      if (al > 0 && al < Lg && Math.abs(-px * sa + py * ca) < e.r + W / 2) hit(e, dm);
    }
    this.fired(q, k, cd);
  },

  orbit(q, k, d, S, dt) {
    q.oa += dt * 3.2;
    const n = d.count || 3, R = (d.radius || 64) * S.area, key = 'oh' + q.id + k;
    for (let i = 0; i < n; i++) {
      const a = q.oa + i * 6.283 / n, ox = q.x + Math.cos(a) * R, oy = q.y + Math.sin(a) * R;
      for (const e of en) {
        if (t - (e[key] || -9) > .45 && Math.hypot(e.x - ox, e.y - oy) < e.r + 9) {
          e[key] = t; hit(e, d.dmg * q.dmg * S.dmg);
        }
      }
    }
  },

  drawOrbits(q) {
    if (!this.cat) return;
    for (const k in q.wp) {
      const d = this.def(k); if (!d || d.type !== 'orbit' || !(q.wp[k] | 0)) continue;
      const S = this.scale(q.wp[k]), n = d.count || 3, R = (d.radius || 64) * S.area;
      cx.fillStyle = this.col(d); cx.strokeStyle = '#fff'; cx.lineWidth = 2;
      for (let i = 0; i < n; i++) {
        const a = q.oa + i * 6.283 / n;
        cx.beginPath(); cx.arc(q.x + Math.cos(a) * R, q.y + Math.sin(a) * R, 9, 0, 6.283); cx.fill(); cx.stroke();
      }
    }
  },

  drawFx(o) {
    const k = 1 - o.l / o.m, col = o.col || '#bfe6ff';
    cx.globalAlpha = Math.max(0, o.l / o.m);
    if (o.k === 'ring') {
      cx.strokeStyle = col; cx.lineWidth = 6; cx.beginPath(); cx.arc(o.x, o.y, o.R * k, 0, 6.283); cx.stroke();
    } else if (o.k === 'ray') {
      cx.strokeStyle = col; cx.lineWidth = o.w || 14; cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(o.x, o.y); cx.lineTo(o.x + Math.cos(o.a) * o.Lg, o.y + Math.sin(o.a) * o.Lg); cx.stroke();
      cx.lineCap = 'butt';
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
    if (sig === this.sig) return;
    this.sig = sig;
    const two = players.length > 1, pc = ['#2ee6c8', '#ff7ad9'], max = this.maxLv();
    el.innerHTML = players.map((q, i) => {
      const ks = Object.keys(q.wp).filter(k => this.def(k) && (q.wp[k] | 0) > 0);
      const slots = ks.length
        ? ks.map(k => '<div class="sk"><div class="skbox"></div><div class="skname">' + this.def(k).name + '<br>Nv ' + q.wp[k] + '/' + max + '</div></div>').join('')
        : '<div class="sk empty"><div class="skbox"></div><div class="skname">Sin skill</div></div>';
      return '<div class="skgrp">' + (two ? '<span class="skwho" style="color:' + pc[i] + '">J' + (i + 1) + '</span>' : '') + slots + '</div>';
    }).join('');
  },

  clearBar() {
    this.sig = null;
    const el = document.getElementById('skbar'); if (el) el.innerHTML = '';
  }
};

// Explore: cosas en el mapa para que convenga explorarlo (pedido). Se carga antes que game.js y usa sus globals.
// - Cofres: aparecen lejos (500–1300 px) y se abren pasando por encima; sueltan ítems y experiencia. Uno de cada 6 es
//   dorado (más ítems y siempre un potenciador).
// - Zonas de datos: un círculo; si te quedás adentro ZONE_T segundos (con más jugadores adentro carga más rápido) se
//   completa y da experiencia y un potenciador a los que estén adentro. Mientras se carga van llegando Digimon.
//   Afuera se descarga despacio. Si nadie la termina, se borra a los ZONE_LIFE segundos.
// - Potenciadores (ítems de Items: buff_*): por BUFF_T segundos suben daño, velocidad de ataque, velocidad o defensa.
//   Se suman a q.m y se sacan al terminar (Stats.calc). También caen poco de los Digimon (Items.drop).
// Hay flechas en el borde de la pantalla hacia lo que está cerca (drawPointers). En la arena del jefe y en el final no
// aparece nada. Online: lo decide el anfitrión y viaja en el sync (xo); los potenciadores activos van en el jugador (bf).
const Explore = {
  BUFF_T: 15, ZONE_T: 8, ZONE_R: 120, ZONE_LIFE: 75, CHEST_LIFE: 120,
  BUFFS: {
    buff_pow: { n: 'Poder',      col: '#ff4a4a', s: '⚔', d: '+50% de daño',              m: { dmgP: 0.5 } },
    buff_frz: { n: 'Frenesí',    col: '#ffd23f', s: '»', d: 'Ataque y skills más rápidos', m: { rateP: 0.6, cdr: 0.2 } },
    buff_spd: { n: 'Turbo',      col: '#3fd0ff', s: '➤', d: '+40% de velocidad',          m: { spP: 0.4 } },
    buff_arm: { n: 'Coraza',     col: '#b35cff', s: '⛨', d: '30% menos daño recibido',     m: { arm: 0.3 } }
  },
  o: [],          // en el mapa: { k: 'chest'|'zone', x, y, l, gold, p }
  next: 0,
  reset() { this.o = []; this.next = 20; },
  on() { return !World.arena && !(typeof Finale !== 'undefined' && Finale.on); },

  // ---------- Simulación (anfitrión / 1 jugador) ----------
  tick(dt) {
    for (const q of P) this.buffTick(q, dt);
    if (!this.on()) return;
    if (t >= this.next) {
      this.next = t + 18 + Math.random() * 14;
      const nc = this.o.filter(o => o.k === 'chest').length, nz = this.o.filter(o => o.k === 'zone').length;
      const k = nz < 1 && t > 45 && Math.random() < 0.45 ? 'zone' : nc < 3 ? 'chest' : nz < 1 ? 'zone' : null;
      if (k) this.place(k);
    }
    const al = P.filter(q => !q.dead);
    for (const o of this.o) {
      o.l -= dt;
      if (o.k === 'chest') {
        if (al.some(q => Math.hypot(q.x - o.x, q.y - o.y) < q.r + 34)) { this.open(o); o.l = 0; }
      } else {
        const ins = al.filter(q => Math.hypot(q.x - o.x, q.y - o.y) < this.ZONE_R);
        if (ins.length) {
          if (!o.p) Bosses.banner('¡Zona de datos! Quedate adentro');
          o.p = Math.min(this.ZONE_T, (o.p || 0) + dt * (1 + 0.35 * (ins.length - 1))); o.l = Math.max(o.l, 6);
          if ((o.w = (o.w || 0) - dt) <= 0) { o.w = 2.4; this.wave(o); }   // llegan Digimon mientras cargás
          if (o.p >= this.ZONE_T) { this.done(o, ins); o.l = 0; }
        } else o.p = Math.max(0, (o.p || 0) - dt * 0.35);
      }
    }
    this.o = this.o.filter(o => o.l > 0);
  },
  // lugar libre y con camino, lejos de todos (a 500–1300 px de un jugador al azar)
  place(k) {
    const al = P.filter(q => !q.dead); if (!al.length) return;
    for (let i = 0; i < 16; i++) {
      const q = al[(Math.random() * al.length) | 0], a = Math.random() * 6.283, d = 500 + Math.random() * 800;
      const sp = World.freeSpot(q.x + Math.cos(a) * d, q.y + Math.sin(a) * d, null);
      if (!sp || World.reach(sp[0], sp[1] + 40) === 65535) continue;
      if (al.some(p => Math.hypot(p.x - sp[0], p.y - sp[1]) < 420) || this.o.some(o => Math.hypot(o.x - sp[0], o.y - sp[1]) < 300)) continue;
      const gold = k === 'chest' && Math.random() < 1 / 6;
      this.o.push({ k, x: sp[0], y: sp[1], l: k === 'chest' ? this.CHEST_LIFE : this.ZONE_LIFE, gold, p: 0 });
      return;
    }
  },
  open(o) {
    const n = o.gold ? 5 : 3, bk = Object.keys(this.BUFFS);
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.283 + Math.random() * 0.4, k = (o.gold && !i) || Math.random() < 0.3 ? bk[(Math.random() * bk.length) | 0] : Items.roll();
      Items.on.push({ x: o.x + Math.cos(a) * 46, y: o.y + Math.sin(a) * 46, k, l: Items.LIFE });
    }
    for (let i = 0; i < (o.gold ? 14 : 7); i++) { const a = Math.random() * 6.283, r = 10 + Math.random() * 40; gems.push({ x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r, v: 3 + t / 120 }); }
    for (let i = 0; i < 24; i++) burst(o.x, o.y, o.gold ? '#ffd23f' : '#c89a5a');
    fx.push({ x: o.x, y: o.y - 40, txt: o.gold ? '¡Cofre dorado!' : 'Cofre', col: '#ffd23f', sz: 22, l: 1.4 });
    Sound.play('item');
  },
  wave(o) {
    const ti = Math.max(0, Math.max(...P.map(q => q.stage | 0)) - 1), n = 3 + Math.min(5, Math.floor(t / 180));
    for (let j = 0; j < n; j++) {
      const i = Enemies.choose(ti); if (i == null) return;
      const a = Math.random() * 6.283, d = this.ZONE_R + 260 + Math.random() * 120;
      Enemies.make(i, ti, o.x + Math.cos(a) * d, o.y + Math.sin(a) * d);
    }
  },
  done(o, ins) {
    xp += need * 0.6;   // como un Digicore y medio
    for (let i = 0; i < 18; i++) { const a = Math.random() * 6.283, r = 20 + Math.random() * 90; gems.push({ x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r, v: 2 + t / 150, mg: 1 }); }
    const bk = Object.keys(this.BUFFS), b = bk[(Math.random() * bk.length) | 0];
    for (const q of ins) this.buff(q, b);
    for (let i = 0; i < 40; i++) burst(o.x, o.y, i % 2 ? '#3dff9a' : '#fff');
    ef.push({ k: 'ring', x: o.x, y: o.y, R: this.ZONE_R * 1.6, col: '#3dff9a', l: 0.6, m: 0.6 });
    Bosses.banner('¡Datos recuperados!'); Sound.play('win');
  },
  // potenciador: suma su modificador a q.m por BUFF_T segundos (si ya lo tenía, renueva el tiempo)
  buff(q, k) {
    const B = this.BUFFS[k]; if (!B || !q.m) return;
    q.bf = q.bf || {};
    if (!q.bf[k]) Stats.add(q.m, B.m);
    q.bf[k] = this.BUFF_T * (q.dur || 1); Stats.calc(q);
    fx.push({ x: q.x, y: q.y - (q.dh || 96) + 10, txt: B.n + '! ' + B.d, col: B.col, sz: 18, l: 1.6 });
    for (let i = 0; i < 14; i++) burst(q.x, q.y, B.col);
  },
  buffTick(q, dt) {
    if (!q.bf) return; let ch = false;
    for (const k in q.bf) {
      if ((q.bf[k] -= dt) > 0) continue;
      const B = this.BUFFS[k], m = {}; for (const x in B.m) m[x] = -B.m[x];
      Stats.add(q.m, m); delete q.bf[k]; ch = true;
    }
    if (ch) Stats.calc(q);
  },

  // ---------- Online ----------
  sync() { return this.o.map(o => [o.k === 'zone' ? 1 : 0, Math.round(o.x), Math.round(o.y), Math.round((o.p || 0) * 10) / 10, o.gold ? 1 : 0, Math.round(o.l)]); },
  apply(a) { if (Array.isArray(a)) this.o = a.map(v => ({ k: v[0] ? 'zone' : 'chest', x: v[1], y: v[2], p: v[3], gold: !!v[4], l: v[5] })); },
  bfSync(q) { const o = {}; for (const k in q.bf || {}) o[k] = Math.round(q.bf[k]); return o; },

  // ---------- Dibujo ----------
  draw() {
    for (const o of this.o) {
      if (o.k === 'chest') this.drawChest(o);
      else this.drawZone(o);
    }
  },
  drawChest(o) {
    const bob = Math.sin(t * 3 + o.x) * 2, x = o.x, y = o.y + bob, G = o.gold, w = 44, h = 32;
    if (o.l < 10 && Math.floor(t * 6) % 2) return;   // parpadea antes de irse
    cx.save();
    cx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 5); cx.fillStyle = G ? '#ffd23f' : '#ffe9b0';   // brillo en el piso
    cx.beginPath(); cx.ellipse(x, o.y + h / 2 + 2, w * 0.75, 9, 0, 0, 6.283); cx.fill(); cx.globalAlpha = 1;
    const body = G ? '#d9a21a' : '#8a5a2b', dark = G ? '#9a6a00' : '#5b3818', trim = G ? '#fff3a0' : '#e8c060';
    cx.fillStyle = '#000'; cx.fillRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4);
    cx.fillStyle = body; cx.fillRect(x - w / 2, y - h / 2, w, h);
    cx.fillStyle = dark; cx.fillRect(x - w / 2, y - h / 2 + 11, w, 3);   // línea de la tapa
    cx.fillStyle = trim; cx.fillRect(x - w / 2, y - h / 2, 4, h); cx.fillRect(x + w / 2 - 4, y - h / 2, 4, h); cx.fillRect(x - w / 2, y - h / 2, w, 3);
    cx.fillRect(x - 4, y - h / 2 + 8, 8, 10); cx.fillStyle = dark; cx.fillRect(x - 1.5, y - h / 2 + 12, 3, 4);   // cerradura
    if (G) { cx.fillStyle = '#fff'; const s = 2 + Math.sin(t * 8) * 1.5; cx.fillRect(x + 12, y - h / 2 - 8 - s, 2, 6 + s * 2); cx.fillRect(x + 9 - s, y - h / 2 - 6, 8 + s * 2, 2); }
    cx.restore();
  },
  drawZone(o) {
    const R = this.ZONE_R, f = Math.min(1, (o.p || 0) / this.ZONE_T);
    cx.save();
    cx.globalAlpha = 0.12 + 0.05 * Math.sin(t * 4); cx.fillStyle = '#3dff9a'; cx.beginPath(); cx.arc(o.x, o.y, R, 0, 6.283); cx.fill();
    cx.globalAlpha = 0.9; cx.strokeStyle = '#3dff9a'; cx.lineWidth = 2.5; cx.setLineDash([12, 8]); cx.lineDashOffset = -t * 30;
    cx.beginPath(); cx.arc(o.x, o.y, R, 0, 6.283); cx.stroke(); cx.setLineDash([]);
    if (f > 0) { cx.strokeStyle = '#eafff2'; cx.lineWidth = 7; cx.beginPath(); cx.arc(o.x, o.y, R - 8, -Math.PI / 2, -Math.PI / 2 + 6.283 * f); cx.stroke(); }
    // columna de luz (se ve desde lejos) y el porcentaje
    const g = cx.createLinearGradient(0, o.y - 260, 0, o.y); g.addColorStop(0, 'rgba(61,255,154,0)'); g.addColorStop(1, 'rgba(61,255,154,.35)');
    cx.globalAlpha = 1; cx.fillStyle = g; cx.fillRect(o.x - 16, o.y - 260, 32, 260);
    cx.textAlign = 'center'; cx.font = "bold 15px 'Chakra Petch',sans-serif"; cx.lineWidth = 4; cx.strokeStyle = '#000';
    const txt = f > 0 ? Math.floor(f * 100) + '%' : 'ZONA DE DATOS'; cx.strokeText(txt, o.x, o.y + 5); cx.fillStyle = '#eafff2'; cx.fillText(txt, o.x, o.y + 5);
    cx.restore();
  },
  // potenciador en el piso (Items.draw, no tienen sprite): hexágono de su color con su símbolo
  drawBuffItem(it) {
    const B = this.BUFFS[it.k]; if (!B) return;
    const bob = Math.sin(t * 4 + it.x * 0.05) * 4, x = it.x, y = it.y + bob, r = 15;
    cx.save();
    cx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 6); cx.fillStyle = B.col; cx.beginPath(); cx.ellipse(it.x, it.y + 18, 16, 5, 0, 0, 6.283); cx.fill();
    cx.globalAlpha = 1; cx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + Math.PI / 6; cx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } cx.closePath();
    cx.fillStyle = '#05101e'; cx.fill(); cx.lineWidth = 3; cx.strokeStyle = B.col; cx.stroke();
    cx.fillStyle = B.col; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.font = "bold 16px 'Chakra Petch',sans-serif"; cx.fillText(B.s, x, y + 1);
    cx.restore();
  },
  // aura y barritas de los potenciadores activos (sobre el jugador)
  drawBuffs(q) {
    const ks = Object.keys(q.bf || {}); if (!ks.length || q.dead) return;
    cx.save();
    const B0 = this.BUFFS[ks[0]]; cx.globalAlpha = 0.18 + 0.08 * Math.sin(t * 8); cx.fillStyle = B0.col;
    cx.beginPath(); cx.ellipse(q.x, q.y + 44, 30, 9, 0, 0, 6.283); cx.fill(); cx.globalAlpha = 1;
    ks.forEach((k, i) => { const B = this.BUFFS[k], f = Math.max(0, Math.min(1, q.bf[k] / this.BUFF_T)), x = q.x - ks.length * 11 + i * 22 + 2, y = q.y + 62;
      cx.fillStyle = 'rgba(0,0,0,.6)'; cx.fillRect(x, y, 18, 4); cx.fillStyle = B.col; cx.fillRect(x, y, 18 * f, 4); });
    cx.restore();
  },
  // flechas en el borde (drawPointers de game.js) hacia lo que está a menos de 1800 px
  pointers(ox, oy) {
    if (!this.on()) return [];
    return this.o.filter(o => Math.hypot(o.x - ox, o.y - oy) < 1800).map(o => o.k === 'zone'
      ? { x: o.x, y: o.y - 40, col: '#3dff9a', txt: 'Zona de datos' }
      : { x: o.x, y: o.y - 20, col: o.gold ? '#ffd23f' : '#e8c060', txt: o.gold ? 'Cofre dorado' : 'Cofre' });
  }
};

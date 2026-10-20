// Jefes canon (arco de Adventure / Dark Masters). Se carga ANTES que game.js y usa sus globals en tiempo de ejecución
// (en, eb, P, t, fx, cam, W, H, TEST, mode, spawn, burst, gems, ELC, ATTR, evo, running, $).
//
// - Catálogo en src/data/bosses.json; sprites en assets/sprites/bosses/ (hojas 2×6 como las criaturas).
// - Cada `every` segundos (con ?test, `testEvery`) aparece el siguiente jefe de la lista. Si todavía hay uno vivo, espera.
//   Al terminar la lista vuelve a empezar, más fuerte (ciclo).
// - El jefe vive en `en` como un enemigo más, con `bo` = índice en la lista, `mh` = vida máxima y sus timers de ataque.
// - Solo el anfitrión (o el juego local) simula; el cliente online ve los jefes por el `sync` (bo, hp, mh, at)
//   y la barra/avisos salen de `hud()`, que corre en los dos lados.
const Bosses = {
  data: null,
  spr: {},          // id -> { canvas, cols, rows }
  n: 0,             // jefes que aparecieron en esta partida
  recent: [],       // últimos jefes sorteados (pick no los repite)
  next: 0,          // segundo de partida en que aparece el próximo
  down: [],         // ids de jefes derrotados en esta partida (se manda en el sync como `bd`)
  shown: null,      // jefe que muestra la barra (para avisar cuando aparece o cae, también en el cliente)

  async load() {
    if (this.data) return;
    const r = await fetch('src/data/bosses.json');
    if (!r.ok) throw new Error('No se encontró src/data/bosses.json (' + r.status + ')');
    this.data = await r.json();
    await Promise.all(this.data.list.map(b => new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        cv.getContext('2d').drawImage(img, 0, 0);
        this.spr[b.id] = { canvas: cv, cols: 2, rows: 6 }; res();
      };
      img.onerror = () => { console.error('No se pudo cargar el jefe:', b.file); res(); };
      img.src = 'assets/sprites/' + (b.file.includes('/') ? b.file : 'bosses/' + b.file);   // 'enemies/x.png': hoja de un enemigo del Workshop
    })));
  },

  def(i) { return this.data && this.data.list[i]; },
  sprite(i) { const b = this.def(i); return b ? this.spr[b.id] : null; },
  elOf(b) { return b.attribute === 'Virus' ? 1 : b.attribute === 'Dato' ? 2 : 0; },
  every() { return this.data ? (TEST ? this.data.testEvery : typeof Challenge !== 'undefined' && Challenge.has('boss60') ? 60 : this.data.every) : 1e9; },

  // al empezar cada partida
  reset() { this.n = 0; this.recent = []; this.fast = false; this.down = []; this.shown = this.shownName = null; this.next = this.every(); this.hideBar(); },

  // monedas extra por los jefes derrotados en la partida
  coins() { return this.down.reduce((a, id) => { const b = this.data && this.data.list.find(x => x.id === id); return a + (b ? b.coins : 0); }, 0); },

  // ---------- Simulación (solo anfitrión / local) ----------
  tick() {
    if (!this.data || t < this.next || en.some(e => e.bo != null)) return;
    this.spawn(); this.next = t + this.every();
  },
  // sorteo del próximo jefe: rango 1 desde el primero, 2 desde el segundo, 3 desde el cuarto (y desde el séptimo ya no salen
  // los de rango 1); nunca repite uno de los últimos 4
  pick() {
    const L = this.data.list, n = this.n, hi = n < 1 ? 1 : n < 3 ? 2 : 3, lo = n >= 6 ? 2 : 1, rk = i => L[i].rank || 1;
    let c = L.map((_, i) => i).filter(i => rk(i) <= hi && rk(i) >= lo && !this.recent.includes(i));
    if (!c.length) c = L.map((_, i) => i).filter(i => rk(i) <= hi);
    const i = c[Math.random() * c.length | 0]; this.recent = [i, ...this.recent].slice(0, 4); return i;
  },
  spawn() {
    const L = this.data.list, i = this.pick(), cyc = Math.floor(this.n / 6), B = L[i];   // cyc: cada 6 jefes, más fuertes
    this.n++;
    const a = Math.random() * 6.283, d = Math.hypot(W, H) / 2 + 60;
    // la vida escala con la etapa del más evolucionado (0,5× en Bebé … 1,75× en forma final), el ciclo y la cantidad de jugadores
    const st = Math.max(...P.map(q => q.stage | 0)), hp = 1.6 * B.hp * (0.5 + 0.25 * st) * (1 + cyc * 1.5) * (1 + 0.6 * (P.length - 1)) * (1 + Math.max(0, t - 240) / 300);   // más vida con más jugadores y, desde los 4 min, con el tiempo
    en.push({ x: cam.x + Math.cos(a) * d, y: cam.y + Math.sin(a) * d, k: 2, ti: 0, sk: null, bo: i, cyc,
      hp, mh: hp, sp: B.sp, r: B.r, v: 0, dm: B.dm * (1 + cyc * 0.5) * (1 + Math.max(0, t - 240) / 600), fl: 0, ang: 0, el: this.elOf(B), gun: false, cd: 0,
      pt: 2.5, at: 0, ch: 0, wd: 0, ca: 0, ai: 0, t0: t });
    const b = en[en.length - 1], sp = World.spawnPos(b) || World.freeSpot(b.x, b.y, b); b.x = sp[0]; b.y = sp[1];
  },
  // comportamiento de un jefe en el loop de enemigos (tg = jugador más cercano, dd = distancia, a = ángulo hacia él)
  // Ataques extra de todos los jefes (pedido: más mecánicas). Fase 1 suma el terremoto; desde el 50% de vida (furia)
  // suman espiral de balas, lluvia de impactos y cruz de rayos, atacan más seguido y se mueven más rápido.
  // 0.7: Cruz giratoria (va al centro, escudo inmune y 4 rayos que giran como las agujas del reloj) y Embestidas (varias
  // seguidas, apuntando de nuevo cada vez). Además el jefe persigue al que más daño le hizo (aggro, e.ag).
  P1: [{ n: 'Terremoto', k: 'quake' }, { n: 'Embestidas', k: 'mdash' }, { n: 'Muralla', k: 'wall' }, { n: 'Cruz giratoria', k: 'shieldx' }],
  P2: [{ n: 'Espiral', k: 'spiral' }, { n: 'Lluvia', k: 'rain' }, { n: 'Cruz giratoria', k: 'shieldx' }, { n: 'Terremoto', k: 'quake' }, { n: 'Orbes', k: 'homing' }, { n: 'Embestidas', k: 'mdash' }],
  SX_DUR: 7.5, SX_W: 54, SX_L: 1150,
  // aggro: daño recibido por jugador (game.js: hit), se va olvidando (mitad cada ~4 s); persigue al que más le pegó
  aggro(e, dt) {
    if (!e.dmg) return null; let b = null, bv = 0;
    for (const k in e.dmg) { e.dmg[k] *= Math.pow(0.84, dt); const q = P[k]; if (q && !q.dead && e.dmg[k] > bv) { bv = e.dmg[k]; b = q; } }
    e.ag = b && P.length > 1 ? b.id : -1; return b;
  },
  act(e, dt, tg, dd, a) {
    const B = this.def(e.bo); if (!B) return;
    e.at -= dt;
    const ag = this.aggro(e, dt); if (ag) { tg = ag; dd = Math.hypot(tg.x - e.x, tg.y - e.y); a = Math.atan2(tg.y - e.y, tg.x - e.x); e.ang = a; }
    // Cruz giratoria: primero va al centro de la arena, después escudo (no recibe daño) y 4 rayos que giran
    if (e.sxW > 0) {
      e.sxW -= dt; const X = World.arena ? 0 : e.x, Y = World.arena ? 0 : e.y, d = Math.hypot(X - e.x, Y - e.y);
      if (d > 24 && e.sxW > 0) { const g = Math.atan2(Y - e.y, X - e.x); World.move(e, Math.cos(g) * Math.max(160, e.sp * 2.4) * dt, Math.sin(g) * Math.max(160, e.sp * 2.4) * dt); return; }
      e.sxW = 0; e.shd = this.SX_DUR; e.sxT = 0; e.sxA = Math.random() * 6.283;
      this.banner('¡' + B.name + ' levanta un escudo! Rodealo');
      e.sxE = { k: 'rbeam', x: e.x, y: e.y, a: e.sxA, Lg: this.SX_L, w: this.SX_W, col: '#ff3d81', l: 1, m: 0 }; ef.push(e.sxE);
    }
    if (e.shd > 0) {
      e.shd -= dt; e.sxT += dt; e.at = 0.3;
      const on = e.sxT > 1.4, o = e.sxE;   // 1,4 s de aviso (rayos finitos) y después queman
      if (on) e.sxA += (e.p2 ? 0.78 : 0.62) * dt;   // en pantalla, ángulo que crece = sentido de las agujas del reloj
      if (o) { o.x = e.x; o.y = e.y; o.a = e.sxA; o.m = on ? 1 : 0; o.l = e.shd > 0 ? 1 : 0; }
      if (on) for (const q of P) {
        if (q.dead || q.inv > 0) continue;
        const rx = q.x - e.x, ry = q.y - e.y;
        for (let j = 0; j < 4; j++) { const g = e.sxA + j * Math.PI / 2, c = Math.cos(g), s = Math.sin(g), pr = rx * c + ry * s;
          if (pr > 0 && pr < this.SX_L && Math.abs(-rx * s + ry * c) < this.SX_W / 2 + q.r * 0.4) { hurt(q, e.dm * 22, e.el); break; } }
      }
      if (e.shd <= 0) { e.pt = 1; this.banner('¡Se rompió el escudo!'); for (let j = 0; j < 24; j++) burst(e.x, e.y, j % 2 ? '#9fe8ff' : '#fff'); }
      return;
    }
    // furia: al bajar del 50% de vida
    if (!e.p2 && e.hp < e.mh * 0.5) {
      e.p2 = 1; e.sp *= 1.25; e.pt = Math.min(e.pt, 1.2);
      this.banner('¡' + B.name + ' se enfurece!');
      for (let j = 0; j < 30; j++) burst(e.x, e.y, j % 2 ? '#ff3d3d' : '#ffd23f');
    }
    // espiral en curso: dos brazos de balas que giran mientras camina despacio
    if (e.spT > 0) {
      e.spT -= dt; e.spE = (e.spE || 0) - dt;
      while (e.spE <= 0) { e.spE += 0.07; e.spA += 0.33;
        for (let j = 0; j < 2; j++) { const g = e.spA + j * Math.PI; eb.push({ x: e.x, y: e.y, vx: Math.cos(g) * 200, vy: Math.sin(g) * 200, l: 4, el: e.el, bf: SkillSys.bfx(e), dm: e.dm, r: 9 }); } }
      const m = World.steer(e, a); World.move(e, Math.cos(m) * e.sp * 0.35 * dt, Math.sin(m) * e.sp * 0.35 * dt);
      return;
    }
    if (e.wd > 0) {                     // preparando una embestida: se queda quieto un instante (aviso)
      e.wd -= dt; e.fl = Math.max(e.fl, Math.floor(e.wd * 10) % 2 ? 0.05 : 0);
      if (e.wd <= 0) e.ch = e.chDur;   // embiste en la dirección que marcó el aviso
      return;
    }
    if (e.ch > 0) {                     // embestida en línea recta
      e.ch -= dt; e.at = 0.2;
      World.move(e, Math.cos(e.ca) * e.sp * 3.6 * dt, Math.sin(e.ca) * e.sp * 3.6 * dt);
      // Embestidas: al terminar una, apunta de nuevo y sale la siguiente (aviso más corto)
      if (e.ch <= 0 && e.mc > 0) { e.mc--; e.wd = 0.45; e.chDur = 0.55; e.ca = a; Enemies.warnLine(e.x, e.y, a, e.sp * 3.6 * e.chDur + e.r, e.r * 2 + 10, 0.45); }
      return;
    }
    const ma = World.steer(e, a); World.move(e, Math.cos(ma) * e.sp * dt, Math.sin(ma) * e.sp * dt);   // rodea las paredes
    e.pt -= dt;
    if (e.pt > 0 || dd > 720) return;
    const L = e.p2 ? B.atk.concat(this.P2) : B.atk.concat(this.P1);
    const k = e.p2 ? L[(Math.random() * L.length) | 0] : L[e.ai++ % L.length];
    e.pt = e.p2 ? Math.max(1.0, 1.9 - e.cyc * 0.25) : Math.max(1.4, 2.6 - e.cyc * 0.3); e.at = 0.6;
    fx.push({ x: e.x, y: e.y - this.h(e) / 2 - 14, txt: k.n, col: '#ffd23f', sz: 22, l: 1.4 });
    const shot = (ang, sp) => eb.push({ x: e.x, y: e.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, l: 4, el: e.el, bf: SkillSys.bfx(e), dm: e.dm, r: 9 });
    if (k.k === 'ring') {
      const off = Math.random() * 6.283;
      for (let j = 0; j < k.c; j++) shot(off + j / k.c * 6.283, k.sp || 210);
    } else if (k.k === 'fan') {
      const s = k.spread || 0.2;
      for (let j = 0; j < k.c; j++) shot(a + (j - (k.c - 1) / 2) * s, k.sp || 270);
    } else if (k.k === 'charge') {
      e.wd = 0.7; e.chDur = k.dur || 1; e.ca = a;   // marca el recorrido antes de embestir
      Enemies.warnLine(e.x, e.y, a, e.sp * 3.6 * e.chDur + e.r, e.r * 2 + 10, 0.7);
    } else if (k.k === 'mdash') {   // varias embestidas seguidas (3; 4 en furia)
      e.mc = e.p2 ? 3 : 2; e.wd = 0.65; e.chDur = 0.55; e.ca = a;
      Enemies.warnLine(e.x, e.y, a, e.sp * 3.6 * e.chDur + e.r, e.r * 2 + 10, 0.65);
    } else if (k.k === 'shieldx') {  // ver arriba (sxW: segundos como mucho para llegar al centro)
      e.sxW = 2.5;
    } else if (k.k === 'spiral') {
      e.spT = 2.4; e.spA = Math.random() * 6.283; e.spE = 0;
    } else if (k.k === 'rain') {   // impactos marcados alrededor de los jugadores
      const al = P.filter(q => !q.dead), n = Math.min(12, 6 + 2 * e.cyc);
      for (let j = 0; j < n && al.length; j++) { const q = al[j % al.length], g = Math.random() * 6.283, r = Math.random() * 260;
        Enemies.bomb(q.x + Math.cos(g) * r, q.y + Math.sin(g) * r, 70, 1.2 + j * 0.12, e, 1.1, '#ffb02e'); }
    } else if (k.k === 'cross') {  // rayos en cruz (o en estrella) desde el jefe
      const n = e.cyc ? 6 : 4, g0 = Math.random() * 6.283;
      for (let j = 0; j < n; j++) Enemies.lineBomb(e.x, e.y, g0 + j / n * 6.283, 1100, 58, 1.15, e, 1.3, '#ff3d81');
    } else if (k.k === 'quake') {  // tres anillos que van saliendo del jefe: hay que meterse entre uno y otro
      [[0, 140, 0.9], [140, 280, 1.45], [280, 420, 2.0]].forEach(([r0, r1, d]) => Enemies.bomb(e.x, e.y, r1, d, e, 1.2, '#ffd23f', r0));
    } else if (k.k === 'wall') {   // muralla: una fila de balas que avanza hacia el jugador, con un hueco para pasar
      const n = 15, gap = 4 + ((Math.random() * (n - 8)) | 0), px = -Math.sin(a), py = Math.cos(a);
      for (let j = 0; j < n; j++) { if (j === gap || j === gap + 1) continue; const o = (j - (n - 1) / 2) * 42;
        eb.push({ x: e.x + px * o, y: e.y + py * o, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, l: 5, el: e.el, bf: SkillSys.bfx(e), dm: e.dm, r: 10 }); }
    } else if (k.k === 'homing') { // orbes que te persiguen unos segundos (hm = segundos que siguen apuntando)
      const n = 4 + Math.min(4, e.cyc * 2);
      for (let j = 0; j < n; j++) { const g = j / n * 6.283; eb.push({ x: e.x, y: e.y, vx: Math.cos(g) * 160, vy: Math.sin(g) * 160, l: 6, el: e.el, bf: SkillSys.bfx(e), dm: e.dm, r: 11, hm: 3.2 }); }
    } else if (k.k === 'summon') {   // refuerzos del jefe: Digimon del plantel marcados (aro violeta, mn), como mucho 6 vivos a la vez
      const ti = Math.max(0, Math.max(...P.map(q => q.stage | 0)) - 1), n = Math.min(k.c, 6 - en.filter(x => x.mn).length);
      if (n > 0) this.banner(B.name + ' invoca refuerzos');
      for (let j = 0; j < n; j++) {
        const i = Enemies.choose(ti); if (i == null) break;
        const g = j / n * 6.283, m = Enemies.make(i, ti, e.x + Math.cos(g) * (e.r + 40), e.y + Math.sin(g) * (e.r + 40)); m.mn = 1;
        ef.push({ k: 'ring', x: m.x, y: m.y, R: 46, col: '#c05bff', l: 0.6, m: 0.6 });
      }
    }
  },
  // al morir: lluvia de XP y queda anotado para las monedas, el Analyzer y las misiones de desbloqueo
  onDeath(e) {
    if (e.t0 != null && t - e.t0 <= 30) this.fast = true;   // logro Rápido y furioso (lo cuenta achievements.js al final)
    const B = this.def(e.bo); if (!B) return;
    this.down.push(B.id);
    for (let j = 0; j < 16; j++) { const g = Math.random() * 6.283, r = 10 + Math.random() * 60; gems.push({ x: e.x + Math.cos(g) * r, y: e.y + Math.sin(g) * r, v: 8 + 4 * e.cyc }); }
    for (let j = 0; j < 40; j++) burst(e.x, e.y, j % 2 ? '#fff' : ELC[e.el]);
    Items.bossDrop(e.x, e.y);   // Recovery Floppy y, a veces, X-Antibody
  },

  // ---------- Dibujo y HUD (anfitrión y cliente) ----------
  h(e) { return e.r * 6.5; },           // alto en pantalla (bastante más grande que un tanque)
  banner(txt) {
    if (evo) return;
    const v = $('evt'); v.textContent = txt; v.style.display = 'block';
    clearTimeout(this.bt); this.bt = setTimeout(() => { if (!evo && v.textContent === txt) v.style.display = 'none'; }, 2600);
  },
  bar() {
    let b = document.getElementById('bossbar');
    if (!b) {
      b = document.createElement('div'); b.id = 'bossbar';
      b.innerHTML = '<div class="bb-top"><b id="bb-n"></b><span id="bb-l"></span></div><div class="bb-hp"><i id="bb-f"></i></div>';
      document.body.appendChild(b);
    }
    return b;
  },
  hideBar() { const b = document.getElementById('bossbar'); if (b) b.style.display = 'none'; },
  hud() {
    const e = en.find(x => x.bo != null), B = e && this.def(e.bo);
    const id = B ? B.id + ':' + e.cyc : null;
    if (id !== this.shown) {             // apareció uno nuevo o cayó el que estaba
      if (B) this.banner('¡Apareció ' + B.name + '!');
      else if (this.shownName && running) { this.banner('¡Derrotaste a ' + this.shownName + '!'); Sound.play('win'); }
      this.shown = id; this.shownName = B ? B.name : null;
    }
    if (!B) { this.hideBar(); return; }
    const b = this.bar(), el = this.elOf(B);
    b.style.display = 'block'; b.style.setProperty('--ac', ELC[el]);
    $('bb-n').textContent = B.name + (e.cyc ? ' +' + e.cyc : '');
    $('bb-l').textContent = B.level + ' · ' + ATTR[el];
    $('bb-f').style.width = Math.max(0, e.hp / e.mh * 100) + '%';
  }
};

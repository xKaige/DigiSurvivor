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
      img.src = 'assets/sprites/bosses/' + b.file;
    })));
  },

  def(i) { return this.data && this.data.list[i]; },
  sprite(i) { const b = this.def(i); return b ? this.spr[b.id] : null; },
  elOf(b) { return b.attribute === 'Virus' ? 1 : b.attribute === 'Dato' ? 2 : 0; },
  every() { return this.data ? (TEST ? this.data.testEvery : this.data.every) : 1e9; },

  // al empezar cada partida
  reset() { this.n = 0; this.down = []; this.shown = this.shownName = null; this.next = this.every(); this.hideBar(); },

  // monedas extra por los jefes derrotados en la partida
  coins() { return this.down.reduce((a, id) => { const b = this.data && this.data.list.find(x => x.id === id); return a + (b ? b.coins : 0); }, 0); },

  // ---------- Simulación (solo anfitrión / local) ----------
  tick() {
    if (!this.data || t < this.next || en.some(e => e.bo != null)) return;
    this.spawn(); this.next = t + this.every();
  },
  spawn() {
    const L = this.data.list, i = this.n % L.length, cyc = Math.floor(this.n / L.length), B = L[i];
    this.n++;
    const a = Math.random() * 6.283, d = Math.hypot(W, H) / 2 + 60;
    const hp = B.hp * (1 + cyc * 1.5) * (mode === 2 ? 1.6 : 1);
    en.push({ x: cam.x + Math.cos(a) * d, y: cam.y + Math.sin(a) * d, k: 2, ti: 0, sk: null, bo: i, cyc,
      hp, mh: hp, sp: B.sp, r: B.r, v: 0, dm: B.dm * (1 + cyc * 0.5), fl: 0, ang: 0, el: this.elOf(B), gun: false, cd: 0,
      pt: 2.5, at: 0, ch: 0, wd: 0, ca: 0, ai: 0 });
  },
  // comportamiento de un jefe en el loop de enemigos (tg = jugador más cercano, dd = distancia, a = ángulo hacia él)
  act(e, dt, tg, dd, a) {
    const B = this.def(e.bo); if (!B) return;
    e.at -= dt;
    if (e.wd > 0) {                     // preparando una embestida: se queda quieto un instante (aviso)
      e.wd -= dt; e.fl = Math.max(e.fl, Math.floor(e.wd * 10) % 2 ? 0.05 : 0);
      if (e.wd <= 0) { e.ca = a; e.ch = e.chDur; }
      return;
    }
    if (e.ch > 0) {                     // embestida en línea recta
      e.ch -= dt; e.at = 0.2;
      e.x += Math.cos(e.ca) * e.sp * 3.6 * dt; e.y += Math.sin(e.ca) * e.sp * 3.6 * dt;
      return;
    }
    e.x += Math.cos(a) * e.sp * dt; e.y += Math.sin(a) * e.sp * dt;
    e.pt -= dt;
    if (e.pt > 0 || dd > 720) return;
    const k = B.atk[e.ai++ % B.atk.length];
    e.pt = Math.max(1.4, 2.6 - e.cyc * 0.3); e.at = 0.6;
    fx.push({ x: e.x, y: e.y - this.h(e) / 2 - 14, txt: k.n, col: '#ffd23f', sz: 22, l: 1.4 });
    const shot = (ang, sp) => eb.push({ x: e.x, y: e.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, l: 4, el: e.el, dm: e.dm, r: 9 });
    if (k.k === 'ring') {
      const off = Math.random() * 6.283;
      for (let j = 0; j < k.c; j++) shot(off + j / k.c * 6.283, k.sp || 210);
    } else if (k.k === 'fan') {
      const s = k.spread || 0.2;
      for (let j = 0; j < k.c; j++) shot(a + (j - (k.c - 1) / 2) * s, k.sp || 270);
    } else if (k.k === 'charge') {
      e.wd = 0.5; e.chDur = k.dur || 1;
    } else if (k.k === 'summon') {
      const ti = Math.max(0, Math.max(...P.map(q => q.stage | 0)) - 1);
      for (let j = 0; j < k.c; j++) {
        spawn(ti); const m = en[en.length - 1], g = j / k.c * 6.283;
        m.x = e.x + Math.cos(g) * (e.r + 30); m.y = e.y + Math.sin(g) * (e.r + 30);
      }
    }
  },
  // al morir: lluvia de XP y queda anotado para las monedas, el Analyzer y las misiones de desbloqueo
  onDeath(e) {
    const B = this.def(e.bo); if (!B) return;
    this.down.push(B.id);
    for (let j = 0; j < 16; j++) { const g = Math.random() * 6.283, r = 10 + Math.random() * 60; gems.push({ x: e.x + Math.cos(g) * r, y: e.y + Math.sin(g) * r, v: 8 + 4 * e.cyc }); }
    for (let j = 0; j < 40; j++) burst(e.x, e.y, j % 2 ? '#fff' : ELC[e.el]);
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
      else if (this.shownName && running) this.banner('¡Derrotaste a ' + this.shownName + '!');
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

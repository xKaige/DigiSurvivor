// Enemigos comunes: plantel de Digimon variados con comportamientos distintos. Se carga ANTES que game.js y usa sus
// globals en tiempo de ejecución (en, eb, ef, P, t, cam, W, H, mode, hurt, CreatureLoader, SkillSys, Challenge).
//
// - Catálogo en src/data/enemies.json (sprites en assets/sprites/enemies/, o de una criatura con "creature" + "key").
// - Cada partida sortea hasta `perRun` especies por nivel (newRun): así cada run tiene enemigos distintos.
// - Comportamientos (kind): swarm, chaser, dasher, shooter, bomber, leaper, tank. Los ataques especiales tienen
//   recarga propia y SIEMPRE avisan antes: una marca roja en el piso (efectos 'wline' / 'wcirc' en `ef`) que se va
//   llenando; el daño se resuelve al terminar, contra la posición de ese momento (se puede esquivar).
// - Solo el anfitrión (o el juego local) simula; el cliente ve los enemigos por el `sync` (et, st) y los avisos por `ef`.
const Enemies = {
  data: null,
  spr: {},          // id -> canvas { canvas, cols, rows } (los de criatura se toman de CreatureLoader)
  roster: [],       // por etapa (0..5): índices de `data.list` elegidos para esta partida
  bombs: [],        // golpes pendientes { x, y, R, t, dm, el, src } (solo anfitrión)
  RED: '#ff3d3d',

  async load() {
    if (this.data) return;
    const r = await fetch('src/data/enemies.json');
    if (!r.ok) throw new Error('No se encontró src/data/enemies.json (' + r.status + ')');
    this.data = await r.json();
  },
  // Sprites a demanda: son cientos, así que no se cargan todos al abrir el juego. Cada partida carga los de su plantel
  // (prepare, desde start) y el invitado online carga los que le van apareciendo (sprite() pide el que falta).
  loading: {},
  loadSprite(x) {
    if (!x || !x.file || this.spr[x.id] || this.loading[x.id]) return this.loading[x.id] || Promise.resolve();
    return (this.loading[x.id] = new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        cv.getContext('2d').drawImage(img, 0, 0);
        this.spr[x.id] = { canvas: cv, cols: 2, rows: 6 };
        if (typeof whiteOf === 'function') whiteOf(this.spr[x.id]);   // silueta del golpe, generada al cargar (no en plena pelea)
        res();
      };
      img.onerror = () => { console.error('No se pudo cargar el enemigo:', x.file); res(); };
      img.src = 'assets/sprites/enemies/' + x.file;
    }));
  },
  // carga los sprites del plantel de esta partida (se espera antes de empezar)
  prepare() { return this.data ? Promise.all([...new Set(this.roster.flat())].map(i => this.loadSprite(this.data.list[i]))) : Promise.resolve(); },
  def(i) { return this.data && this.data.list[i]; },
  K(e) { return this.data.kinds[e.kd] || this.data.kinds.chaser; },
  sprite(i) {
    const d = this.def(i); if (!d) return null;
    if (d.creature) { const C = CreatureLoader.cache[d.creature]; return C ? C.canvases[d.key] : null; }
    if (!this.spr[d.id]) this.loadSprite(d);   // todavía no estaba (ej. invitado online): se pide y mientras se dibuja con figuras
    return this.spr[d.id] || null;
  },
  elOf(d) { return d.attribute === 'Virus' ? 1 : d.attribute === 'Dato' ? 2 : 0; },

  // ---------- Plantel de la partida ----------
  // El reloj de la partida define la etapa, sin contar el tiempo dentro del Gate. Los élite van una etapa por delante.
  tier(elite = false) { const s = gclk(), ti = s >= 600 ? 4 : s >= 300 ? 3 : s >= 150 ? 2 : 0; return elite ? (ti === 0 ? 2 : ti + 1) : ti; },
  // Una sola etapa por plantel. Se garantiza un swarm/chaser si hay, para las oleadas.
  newRun() {
    this.bombs = []; this.pools = []; this.evT = 100; this.chT = 60;
    if (!this.data) return;
    const L = this.data.list, n = this.data.perRun || 5, sh = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
    this.roster = [];
    for (let ti = 0; ti <= 5; ti++) {
      const cand = sh(L.map((d, i) => i).filter(i => L[i].tier === ti));
      // uno común (swarm/chaser) y un tirador si hay; después, como mucho 1 especie por comportamiento especial
      const basic = cand.find(i => L[i].kind === 'swarm' || L[i].kind === 'chaser'), shoot = cand.find(i => L[i].kind === 'shooter');
      const pick = [basic, shoot].filter(i => i != null), cnt = k => pick.filter(i => L[i].kind === k).length;
      for (const i of cand) { if (pick.length >= n) break; const k = L[i].kind; if (!pick.includes(i) && (k === 'swarm' || k === 'chaser' || cnt(k) < 1)) pick.push(i); }
      for (const i of cand) { if (pick.length >= n) break; if (!pick.includes(i)) pick.push(i); }
      this.roster.push(pick);
    }
  },
  // elige especie del nivel ti según el peso de su comportamiento (los especiales salen menos que los comunes)
  choose(ti) {
    const pool = this.roster[Math.max(0, Math.min(5, ti))] || [];
    if (!pool.length) return null;
    const early = t < 20, w = i => { const k = this.data.list[i].kind; return early && k !== 'swarm' && k !== 'chaser' ? 0.15 : this.data.kinds[k].w; };
    let r = Math.random() * pool.reduce((a, i) => a + w(i), 0);
    for (const i of pool) { r -= w(i); if (r <= 0) return i; }
    return pool[0];
  },

  // ---------- Aparición y números (balance) ----------
  // vida = (2 + t/45) × [nivel] × kind.hp · velocidad con tope · daño por nivel. group: los "swarm" vienen de a 3.
  HPT: 60,          // cada HPT segundos los enemigos ganan la vida base de uno nuevo
  HPQ: 180,         // y además (t/HPQ)^HPE: crece cada vez más rápido desde mitad de partida (el daño del jugador escala mucho):
  HPE: 2.2,         //   (2,4 → 2,2 a pedido: a los 10 min ~13% menos vida y a los 20 ~26% menos; costaba matarlos)
  DMT: 300,         // desde DMT_0 segundos, el daño de los enemigos sube 1× cada DMT segundos
  DMT_0: 180,
  HM: [1, 1.45, 2.1, 2.85, 3.9, 5.1],
  DM: [1, 1.15, 1.3, 1.5, 1.75, 2],
  spawn(ti, group) {
    if (!this.data || !this.roster.length) return;
    const lv = ti, i = this.choose(ti); if (i == null) return;
    const d = this.data.list[i], K = this.data.kinds[d.kind];
    // lugar fuera de pantalla, libre y con camino hasta el jugador (map.js)
    const base = World.spawnPos({ k: 0, r: K.r * (1 + 0.1 * lv) }) || [cam.x + Math.hypot(W, H) / 2, cam.y];
    const n = group && d.kind === 'swarm' ? 3 : 1;
    for (let j = 0; j < n; j++) this.make(i, lv, base[0] + j * 22, base[1] + j * 18);
  },
  // crea un enemigo de la especie i (nivel lv) en (x, y), con su patrón de movimiento y su variante de ataque
  make(i, lv, x, y, mv) {
    const d = this.data.list[i], K = this.data.kinds[d.kind];
    // más vida con más jugadores (+60% por cada uno: en party se rompía todo)
    const hp = (2 + t / this.HPT + Math.pow(t / this.HPQ, this.HPE)) * this.HM[lv] * K.hp * (1 + 0.6 * Math.max(0, P.length - 1));
    const e = { x, y, et: i, kd: d.kind,
      k: d.kind === 'swarm' ? 1 : d.kind === 'tank' ? 2 : 0, ti: lv, hp, mh: hp,
      sp: (55 + Math.random() * 25 + Math.min(45, t * 0.12)) * K.sp * (1 + 0.04 * lv) * (typeof Challenge !== 'undefined' && Challenge.has('fast') ? 1.3 : 1),
      r: K.r * (1 + 0.1 * lv), v: K.xp * (1 + 0.5 * lv), dm: this.DM[lv] * (1 + Math.max(0, t - this.DMT_0) / this.DMT), touch: K.touch, el: this.elOf(d),
      fl: 0, ang: 0, ac: (K.cd || 3) * (0.5 + Math.random() * 0.6), st: 0, stT: 0,
      mv: mv || this.pattern(d.kind), fs: Math.random() < 0.5 ? 1 : -1, zp: Math.random() * 6.283, sub: this.variant(d.kind) };
    en.push(e);
    const sp = World.freeSpot(e.x, e.y, e); e.x = sp[0]; e.y = sp[1];   // nunca dentro de una pared
    return e;
  },
  // ---------- Patrones de movimiento (pedido: que intercepten y se muevan distinto) ----------
  // direct: va derecho · intercept: apunta a donde vas a estar · flank: llega de costado y recién cerca se tira encima ·
  // zigzag: avanza serpenteando · orbit: da vueltas y se acerca de a poco · rush: estampida en línea recta (oleadas)
  pattern(kind) {
    if (kind !== 'swarm' && kind !== 'chaser') return kind === 'tank' ? 'direct' : Math.random() < 0.35 ? 'intercept' : 'direct';
    const r = Math.random(); return r < 0.4 ? 'direct' : r < 0.65 ? 'intercept' : r < 0.82 ? 'flank' : r < 0.94 ? 'zigzag' : 'orbit';
  },
  // variante de ataque: no todos los tiradores marcan una línea roja (fan: abanico lento; ring: anillo de balas);
  // los bomber a veces dejan un charco tóxico (pool) en vez de explotar
  variant(kind) {
    const r = Math.random();
    if (kind === 'shooter') return r < 0.35 ? 'aim' : r < 0.7 ? 'fan' : 'ring';
    if (kind === 'bomber') return r < 0.45 ? 'pool' : 'blast';
    return null;
  },
  // ángulo de movimiento según el patrón (si hay paredes en el medio, manda el mapa de distancias)
  steerPat(e, tg, dd, a) {
    const f = World.steer(e, a); let da = Math.abs(f - a) % 6.283; if (da > Math.PI) da = 6.283 - da;
    if (da > 0.9) return f;   // el camino directo está tapado: rodea por donde dice el mapa
    if (e.mv === 'intercept' && (tg.vx || tg.vy)) { const lead = Math.min(1.2, dd / Math.max(60, e.sp * 1.3)); return Math.atan2(tg.y + (tg.vy || 0) * lead - e.y, tg.x + (tg.vx || 0) * lead - e.x); }
    if (e.mv === 'flank' && dd > 200) return a + e.fs * 0.95;
    if (e.mv === 'zigzag') return a + Math.sin(t * 4 + e.zp) * 0.85;
    if (e.mv === 'orbit' && dd > 150) return a + e.fs * (dd > 380 ? 0.6 : 1.25);
    return a;
  },
  // ---------- Élite (Issues #7 y #28) ----------
  // Cada 25–35 s (desde el minuto 1) aparece un Digimon élite: más grande, aura dorada, barra de vida, ×8 de vida y
  // ×2,5 de daño. Al caer suelta siempre botín (carne o potenciador, y a veces los dos) y mucha experiencia. Los comunes
  // sueltan menos ítems (Items.DROP), así las curas vienen sobre todo de ellos.
  chT: 60,
  champ(dt) {
    if (!this.data || !this.roster.length || (this.chT -= dt) > 0) return;
    this.chT = 25 + Math.random() * 10;
    if (en.filter(e => e.cp).length >= 2 + P.length) return;
    const lv = this.tier(true), i = this.choose(lv); if (i == null) return;
    const d = this.data.list[i], K = this.data.kinds[d.kind];
    const sp = World.spawnPos({ k: 0, r: K.r * 1.5 }); if (!sp) return;
    const e = this.make(i, lv, sp[0], sp[1], 'direct');
    e.cp = 1; e.hp *= 8; e.mh = e.hp; e.dm *= 2.5; e.r *= 1.25; e.sp *= 0.9; e.v *= 6; e.sub = e.sub || null;
  },
  champDrop(e) {
    const bk = ['buff_pow', 'buff_frz', 'buff_spd', 'buff_arm'], two = Math.random() < 0.35;
    const ks = [Math.random() < 0.5 ? 'meat' : bk[(Math.random() * 4) | 0]];
    if (two) ks.push(ks[0] === 'meat' ? bk[(Math.random() * 4) | 0] : 'meat');
    ks.forEach((k, j) => Items.on.push({ x: e.x + (j ? 40 : -20), y: e.y + 10, k, l: Items.LIFE }));
    for (let j = 0; j < 20; j++) burst(e.x, e.y, j % 2 ? '#ffd23f' : '#fff');
  },

  // ---------- Oleadas (pedido: más densidad y que te rodeen) ----------
  // cada 35–55 s desde el minuto 2: un cerco (te rodean desde todos lados) o una estampida (una fila que cruza la pantalla)
  evT: 100,
  events(dt, ti) {
    if (!this.data || !this.roster.length || (this.evT -= dt) > 0 || t < 120) return;
    this.evT = 35 + Math.random() * 20;
    const al = P.filter(q => !q.dead); if (!al.length) return;
    const q = al[(Math.random() * al.length) | 0], pool = (this.roster[Math.max(0, Math.min(4, ti))] || []).filter(i => { const k = this.data.list[i].kind; return k === 'swarm' || k === 'chaser'; });
    if (!pool.length) return;
    const pick = () => pool[(Math.random() * pool.length) | 0], R = Math.hypot(W, H) / 2 + 40;
    if (Math.random() < 0.55) {   // cerco
      const n = Math.min(36, 14 + Math.floor(t / 60));
      for (let j = 0; j < n; j++) { const g = j / n * 6.283; this.make(pick(), ti, q.x + Math.cos(g) * R, q.y + Math.sin(g) * R, 'direct'); }
      Bosses.banner('¡Te rodean!');
    } else {   // estampida: una fila que cruza de un lado al otro
      const g = Math.random() * 6.283, n = Math.min(26, 10 + Math.floor(t / 90)), px = -Math.sin(g), py = Math.cos(g);
      for (let j = 0; j < n; j++) {
        const o = (j - (n - 1) / 2) * 46, x = q.x - Math.cos(g) * R + px * o, y = q.y - Math.sin(g) * R + py * o;
        const e = this.make(pick(), ti, x, y, 'rush'); e.ra = g; e.sp *= 1.6; e.ru = t + 2 * R / e.sp + 1.5;
      }
      Bosses.banner('¡Estampida!');
    }
  },
  // daño al tocar (embistiendo o cayendo de un salto pega más)
  touch(e) { return (e.touch || [7, 5, 12][e.k] || 7) * (e.st === 2 ? 1.6 : 1) * e.dm; },

  // ---------- Comportamientos (solo anfitrión / local) ----------
  warnLine(x, y, a, Lg, w, dur, col) { ef.push({ k: 'wline', x, y, a, Lg, w, l: dur, m: dur, col: col || this.RED }); },
  warnCirc(x, y, R, dur, col, R0) { ef.push({ k: 'wcirc', x, y, R, R0, l: dur, m: dur, col: col || this.RED }); },
  warns() { let n = 0; for (const o of ef) if (o.k === 'wline' || o.k === 'wcirc') n++; return n; },
  // golpe de área diferido: se resuelve en tick(). R0: radio de adentro (anillo: el centro queda a salvo)
  bomb(x, y, R, dur, e, mult, col, R0) { this.warnCirc(x, y, R, dur, col, R0); this.bombs.push({ x, y, R, R0: R0 || 0, t: dur, dm: 9 * (mult || 1) * e.dm, el: e.el }); },
  // golpe en línea diferido (jefes: cruz, barridos)
  lineBomb(x, y, a, Lg, w, dur, e, mult, col) { this.warnLine(x, y, a, Lg, w, dur, col); this.bombs.push({ x, y, a, Lg, w, line: 1, t: dur, dm: 9 * (mult || 1) * e.dm, el: e.el }); },
  // charco tóxico: aviso verde y después un charco que daña de a poco (lo dibuja drawWarn como 'pool')
  pool(x, y, R, dur, e) { this.warnCirc(x, y, R, dur, '#5dff7a'); this.bombs.push({ x, y, R, t: dur, pool: 4.5, dm: 2.2 * e.dm, el: e.el }); },
  move(e, a, sp, dt) { sp *= Stats.slowOf(e) * Weather.slow(); World.move(e, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt); },   // con choque contra las paredes (y ralentizado: stats.js)

  act(e, dt, tg, dd, a) {
    const K = this.K(e);
    if (e.kd == null) { this.move(e, World.steer(e, a), e.sp, dt); return; }   // enemigo viejo (sin tipo): solo persigue
    if (e.st === 1) {                                           // preparando el ataque: quieto, parpadea
      e.stT -= dt; e.fl = Math.max(e.fl, Math.floor(e.stT * 12) % 2 ? 0.04 : 0);
      if (e.stT <= 0) this.release(e);
      return;
    }
    if (e.st === 2) {                                           // ejecutando (embestida o salto)
      e.stT -= dt;
      if (e.kd === 'leaper') { const f = 1 - Math.max(0, e.stT) / e.dur; e.x = e.sx + (e.tx - e.sx) * f; e.y = e.sy + (e.ty - e.sy) * f; }
      else this.move(e, e.la, 760, dt);
      if (e.stT <= 0) {
        if (e.kd === 'leaper') { this.bomb(e.x, e.y, 62, 0.01, e, 1.2); }
        e.st = 0; e.ac = K.cd * (0.8 + Math.random() * 0.4);
      }
      return;
    }
    // estampida: derecho en su dirección; cuando cruzó, se va (sin premio)
    if (e.mv === 'rush') { this.move(e, e.ra, e.sp, dt); if (t > e.ru) { e.hp = -1; e.nr = 1; } return; }
    // movimiento normal: su patrón (interceptar, flanquear, zigzag…) y, si hay paredes, el mapa de distancias
    const ma = this.steerPat(e, tg, dd, a);
    if (e.kd === 'shooter') {                                   // se mantiene a media distancia, de costado
      // Issue #7: se quedan lejos, cerca del borde de su alcance (~420–500 px), y retroceden rápido si te acercás
      const s = dd < 400 ? -1 : dd > 500 ? 1 : 0;
      if (s) this.move(e, s > 0 ? ma : a, e.sp * (s < 0 ? 1.25 : 1) * s, dt); else this.move(e, a + Math.PI / 2 * (e.et % 2 ? 1 : -1), e.sp * 0.6, dt);
    } else if (e.kd === 'bomber' && dd < 300) {
      this.move(e, a + Math.PI / 2, e.sp * 0.5, dt);            // da vueltas alrededor
    } else this.move(e, ma, e.sp, dt);
    if (!K.cd) return;
    e.ac -= dt;
    if (e.ac > 0 || t < 8) return;
    // demasiados avisos en pantalla: espera (pedido: "llega un punto que solo ves marcas rojas")
    if (this.warns() > 10 || (e.kd === 'shooter' && eb.length > 70)) { e.ac = 0.4 + Math.random() * 0.6; return; }   // y no más de ~70 balas enemigas a la vez
    // tiradores sin línea: parpadean y sueltan un abanico lento o un anillo de balas
    if (e.kd === 'shooter' && e.sub !== 'aim' && dd < 620) { e.la = a; e.st = 1; e.stT = 0.5; e.fl = 0.5; return; }
    // charco tóxico: marca verde donde estás y queda un charco que daña unos segundos
    if (e.kd === 'bomber' && e.sub === 'pool' && dd < 460) {
      e.st = 1; e.stT = 0.3; e.ac = K.cd * (0.8 + Math.random() * 0.4);
      this.pool(tg.x, tg.y, 70 + 6 * e.ti, 1.0, e); return;
    }
    // empieza un ataque (con aviso)
    if (e.kd === 'dasher' && dd < 430) {
      e.la = a; e.dl = Math.min(480, dd + 140); e.st = 1; e.stT = 0.8;
      this.warnLine(e.x, e.y, a, e.dl, e.r * 2 + 12, 0.8);
    } else if (e.kd === 'shooter' && dd < 640) {
      e.la = a; e.st = 1; e.stT = 0.55;
      this.warnLine(e.x, e.y, a, Math.min(620, dd + 200), 5, 0.55);
    } else if (e.kd === 'bomber' && dd < 460) {
      e.st = 1; e.stT = 0.3; e.ac = K.cd * (0.8 + Math.random() * 0.4);
      this.bomb(tg.x, tg.y, 58 + 8 * e.ti, 1.15, e, 1);
    } else if (e.kd === 'leaper' && dd < 400) {
      e.sx = e.x; e.sy = e.y; e.tx = tg.x; e.ty = tg.y; e.st = 1; e.stT = 0.75;
      this.warnCirc(tg.x, tg.y, 62, 0.75 + 0.45);
    } else if (e.kd === 'tank' && dd < 170) {
      e.st = 1; e.stT = 0.95;
      this.bomb(e.x, e.y, 120 + 6 * e.ti, 0.95, e, 1.5);
    }
  },
  // termina la preparación y suelta el ataque
  release(e) {
    const K = this.K(e);
    if (e.kd === 'dasher') { e.st = 2; e.stT = e.dl / 760; return; }
    if (e.kd === 'leaper') { e.st = 2; e.dur = e.stT = 0.45; return; }
    if (e.kd === 'shooter' && e.sub === 'fan') {
      const n = 3 + Math.min(2, e.ti >> 1);
      for (let j = 0; j < n; j++) { const aa = e.la + (j - (n - 1) / 2) * 0.24; eb.push({ x: e.x, y: e.y, vx: Math.cos(aa) * 240, vy: Math.sin(aa) * 240, l: 3, el: e.el, bf: SkillSys.bfx(e), dm: e.dm, r: 7 }); }
    } else if (e.kd === 'shooter' && e.sub === 'ring') {
      const n = 6 + Math.min(4, e.ti), off = Math.random() * 6.283;
      for (let j = 0; j < n; j++) { const aa = off + j / n * 6.283; eb.push({ x: e.x, y: e.y, vx: Math.cos(aa) * 200, vy: Math.sin(aa) * 200, l: 3, el: e.el, bf: SkillSys.bfx(e), dm: e.dm, r: 7 }); }
    } else if (e.kd === 'shooter') {
      const n = e.ti >= 3 ? 3 : 1;
      for (let j = 0; j < n; j++) {
        const aa = e.la + (j - (n - 1) / 2) * 0.16;
        eb.push({ x: e.x, y: e.y, vx: Math.cos(aa) * 380, vy: Math.sin(aa) * 380, l: 2.2, el: e.el, bf: SkillSys.bfx(e), dm: e.dm, r: 8 });
      }
    }
    e.st = 0; e.ac = K.cd * (0.8 + Math.random() * 0.4);
  },
  // golpes de área pendientes (bombas, aterrizajes, pisotones)
  pools: [],   // charcos activos { x, y, R, l, dm, el, tk }
  tick(dt) {
    for (const b of this.bombs) {
      b.t -= dt; if (b.t > 0) continue;
      if (b.pool) { this.pools.push({ x: b.x, y: b.y, R: b.R, l: b.pool, dm: b.dm, el: b.el, tk: 0 }); ef.push({ k: 'pool', x: b.x, y: b.y, R: b.R, l: b.pool, m: b.pool }); continue; }
      if (b.line) {
        ef.push({ k: 'ray', x: b.x, y: b.y, a: b.a, Lg: b.Lg, w: b.w, col: '#ff6a3d', l: 0.25, m: 0.25 });
        const ca = Math.cos(b.a), sa = Math.sin(b.a);
        for (const q of P) { if (q.dead || q.inv > 0) continue; const px = q.x - b.x, py = pcy(q) - b.y, al = px * ca + py * sa;
          if (al > 0 && al < b.Lg && Math.abs(-px * sa + py * ca) < b.w / 2 + q.r * 0.5) hurt(q, b.dm, b.el); }
        continue;
      }
      ef.push({ k: 'ring', x: b.x, y: b.y, R: b.R, col: '#ff6a3d', l: 0.3, m: 0.3 });
      if (!b.R0 && SkillSys.fxOf('fire', 'hit')) ef.push({ k: 'hit', fx: 'fire', x: b.x, y: b.y, R: b.R * 1.3, l: 0.35, m: 0.35 });
      for (const q of P) { if (q.dead || q.inv > 0) continue; const d = Math.hypot(q.x - b.x, pcy(q) - b.y); if (d < b.R + q.r * 0.5 && d > (b.R0 || 0) - q.r * 0.5) hurt(q, b.dm, b.el); }
    }
    this.bombs = this.bombs.filter(b => b.t > 0);
    for (const o of this.pools) {   // charcos: dañan cada 0,5 s a quien esté adentro
      o.l -= dt; o.tk -= dt; if (o.tk > 0) continue; o.tk = 0.5;
      for (const q of P) if (!q.dead && q.inv <= 0 && Math.hypot(q.x - o.x, pcy(q) - o.y) < o.R) hurt(q, o.dm, o.el);
    }
    this.pools = this.pools.filter(o => o.l > 0);
  },

  // ---------- Dibujo de los avisos (lo llama SkillSys.drawFx) ----------
  drawWarn(o) {
    const f = 1 - Math.max(0, o.l) / o.m;   // progreso 0..1 hasta el golpe
    cx.save();
    if (o.k === 'rbeam') {   // Cruz giratoria del jefe: 4 rayos desde el borde del escudo (R0); m = 0 aviso (finito), 1 quema
      cx.translate(o.x, o.y); cx.rotate(o.a); const r0 = o.R0 || 0; cx.translate(r0, 0); o = Object.assign({}, o, { Lg: o.Lg - r0 });
      for (let j = 0; j < (o.s || 4); j++) {
        if (o.m) {
          cx.globalAlpha = 0.35 + 0.1 * Math.sin(t * 30); cx.fillStyle = o.col; cx.fillRect(0, -o.w / 2 - 6, o.Lg, o.w + 12);
          cx.globalAlpha = 0.85; cx.fillRect(0, -o.w / 2, o.Lg, o.w);
          cx.globalAlpha = 1; cx.fillStyle = '#fff'; cx.fillRect(0, -o.w / 6, o.Lg, o.w / 3);
        } else { cx.globalAlpha = 0.5; cx.strokeStyle = o.col; cx.lineWidth = 2; cx.setLineDash([12, 8]); cx.strokeRect(0, -o.w / 2, o.Lg, o.w); cx.setLineDash([]); cx.globalAlpha = 0.1; cx.fillStyle = o.col; cx.fillRect(0, -o.w / 2, o.Lg, o.w); }
        cx.translate(-r0, 0); cx.rotate(Math.PI / 2); cx.translate(r0, 0);
      }
    } else if (o.k === 'shrink') {   // arena que se achica: todo rojo afuera del círculo
      cx.globalAlpha = 0.28 + 0.08 * Math.sin(t * 10); cx.fillStyle = o.col; cx.beginPath();
      cx.rect(o.x - o.Lg, o.y - o.w, o.Lg * 2, o.w * 2); cx.moveTo(o.x + Math.max(1, o.R), o.y); cx.arc(o.x, o.y, Math.max(1, o.R), Math.PI * 2, 0, true); cx.fill('evenodd');
      cx.globalAlpha = 0.95; cx.strokeStyle = '#ffd23f'; cx.lineWidth = 4; cx.setLineDash([16, 8]); cx.lineDashOffset = -t * 60; cx.beginPath(); cx.arc(o.x, o.y, Math.max(1, o.R), 0, 6.283); cx.stroke(); cx.setLineDash([]);
    } else if (o.k === 'grid') {     // cuadrícula: casilleros alternados (a = cuáles); s = 1 → explotan ahora
      const C = o.R || 128, nx = Math.ceil(o.Lg / C), ny = Math.ceil(o.w / C), x0 = o.x - o.Lg / 2, y0 = o.y - o.w / 2, ph = o.a | 0;
      cx.globalAlpha = o.s ? Math.max(0, o.l / o.m) * 0.8 : 0.12 + 0.3 * f; cx.fillStyle = o.s ? '#fff3d0' : o.col;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if ((i + j) % 2 === ph) cx.fillRect(x0 + i * C + 3, y0 + j * C + 3, C - 6, C - 6);
    } else if (o.k === 'wave') {     // ola: pared vertical con un hueco (a = centro del hueco, R = medio hueco)
      const top = o.y - o.Lg / 2, bot = o.y + o.Lg / 2, g0 = o.a - o.R, g1 = o.a + o.R;
      cx.globalAlpha = o.m ? 0.8 : 0.3 + 0.2 * Math.sin(t * 14); cx.fillStyle = o.col;
      cx.fillRect(o.x - o.w / 2, top, o.w, Math.max(0, g0 - top)); cx.fillRect(o.x - o.w / 2, g1, o.w, Math.max(0, bot - g1));
      cx.globalAlpha = 1; cx.fillStyle = '#eaffff'; cx.fillRect(o.x - 4, top, 8, Math.max(0, g0 - top)); cx.fillRect(o.x - 4, g1, 8, Math.max(0, bot - g1));
    } else if (o.k === 'pull') {   // Gravedad: anillos que se cierran hacia el jefe
      const f = 1 - Math.max(0, o.l) / o.m; cx.strokeStyle = o.col; cx.lineWidth = 4;
      for (let j = 0; j < 3; j++) { const r = o.R * (1 - ((f + j / 3) % 1)); cx.globalAlpha = 0.5 * (r / o.R); cx.beginPath(); cx.arc(o.x, o.y, r, 0, 6.283); cx.stroke(); }
    } else if (o.k === 'danger') {   // Zonas seguras: toda la zona en rojo
      cx.globalAlpha = 0.12 + 0.06 * Math.sin(t * 12); cx.fillStyle = o.col; cx.fillRect(o.x - o.R, o.y - o.R, o.R * 2, o.R * 2);
    } else if (o.k === 'safe') {     // círculo verde: ahí no te pega
      cx.globalAlpha = 0.3; cx.fillStyle = o.col; cx.beginPath(); cx.arc(o.x, o.y, o.R, 0, 6.283); cx.fill();
      cx.globalAlpha = 0.95; cx.strokeStyle = '#eafff2'; cx.lineWidth = 3; cx.setLineDash([10, 6]); cx.lineDashOffset = -t * 30; cx.stroke(); cx.setLineDash([]);
      cx.font = "bold 14px 'Chakra Petch',sans-serif"; cx.textAlign = 'center'; cx.fillStyle = '#eafff2'; cx.fillText('SEGURO', o.x, o.y + 5);
    } else if (o.k === 'wline') {
      cx.translate(o.x, o.y); cx.rotate(o.a);
      // más transparentes que antes (con muchos enemigos se superponían y tapaban todo)
      cx.globalAlpha = 0.08; cx.fillStyle = o.col; cx.fillRect(0, -o.w / 2, o.Lg, o.w);
      cx.globalAlpha = 0.22; cx.fillRect(0, -o.w / 2, o.Lg * f, o.w);
      cx.globalAlpha = 0.6; cx.strokeStyle = o.col; cx.lineWidth = 1.5; cx.strokeRect(0, -o.w / 2, o.Lg, o.w);
    } else if (o.k === 'pool') {   // charco tóxico: verde, late suave y se apaga al final
      const al = Math.min(1, o.l / 0.6) * (0.28 + 0.08 * Math.sin(t * 6));
      cx.globalAlpha = al; cx.fillStyle = '#3dff6a'; cx.beginPath(); cx.arc(o.x, o.y, o.R, 0, 6.283); cx.fill();
      cx.globalAlpha = Math.min(1, al * 1.6); cx.strokeStyle = '#9dffb0'; cx.lineWidth = 2; cx.stroke();
    } else if (o.R0) {             // anillo: el centro queda a salvo
      cx.globalAlpha = 0.18; cx.fillStyle = o.col; cx.beginPath(); cx.arc(o.x, o.y, o.R, 0, 6.283); cx.moveTo(o.x + o.R0, o.y); cx.arc(o.x, o.y, o.R0, Math.PI * 2, 0, true); cx.fill();
      cx.globalAlpha = 0.9; cx.strokeStyle = o.col; cx.lineWidth = 2.5; cx.setLineDash([10, 6]);
      cx.beginPath(); cx.arc(o.x, o.y, o.R * Math.max(f, o.R0 / o.R), 0, 6.283); cx.stroke(); cx.setLineDash([]);
    } else {
      cx.globalAlpha = 0.14; cx.fillStyle = o.col; cx.beginPath(); cx.arc(o.x, o.y, o.R, 0, 6.283); cx.fill();
      cx.globalAlpha = 0.35; cx.beginPath(); cx.arc(o.x, o.y, o.R * f, 0, 6.283); cx.fill();
      cx.globalAlpha = 0.9; cx.strokeStyle = o.col; cx.lineWidth = 2.5; cx.setLineDash([10, 6]);
      cx.beginPath(); cx.arc(o.x, o.y, o.R, 0, 6.283); cx.stroke(); cx.setLineDash([]);
    }
    cx.restore();
  }
};

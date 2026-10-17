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
  roster: [],       // por nivel de aparición (0..4): índices de `data.list` elegidos para esta partida
  bombs: [],        // golpes pendientes { x, y, R, t, dm, el, src } (solo anfitrión)
  RED: '#ff3d3d',

  async load() {
    if (this.data) return;
    const r = await fetch('src/data/enemies.json');
    if (!r.ok) throw new Error('No se encontró src/data/enemies.json (' + r.status + ')');
    this.data = await r.json();
    await Promise.all(this.data.list.filter(x => x.file).map(x => new Promise(res => {
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
    })));
  },
  def(i) { return this.data && this.data.list[i]; },
  K(e) { return this.data.kinds[e.kd] || this.data.kinds.chaser; },
  sprite(i) {
    const d = this.def(i); if (!d) return null;
    if (d.creature) { const C = CreatureLoader.cache[d.creature]; return C ? C.canvases[d.key] : null; }
    return this.spr[d.id] || null;
  },
  elOf(d) { return d.attribute === 'Virus' ? 1 : d.attribute === 'Dato' ? 2 : 0; },

  // ---------- Plantel de la partida ----------
  // Para el nivel de aparición ti entran las especies de nivel ti y ti+1. Se garantiza al menos un enemigo "común"
  // (swarm o chaser) por nivel, para que no sean todos especiales.
  newRun() {
    this.bombs = [];
    if (!this.data) return;
    const L = this.data.list, n = this.data.perRun || 5, sh = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
    this.roster = [];
    for (let ti = 0; ti <= 4; ti++) {
      const cand = sh(L.map((d, i) => i).filter(i => L[i].tier === ti || L[i].tier === ti + 1));
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
    const pool = this.roster[Math.max(0, Math.min(4, ti))] || [];
    if (!pool.length) return null;
    const early = t < 20, w = i => { const k = this.data.list[i].kind; return early && k !== 'swarm' && k !== 'chaser' ? 0.15 : this.data.kinds[k].w; };
    let r = Math.random() * pool.reduce((a, i) => a + w(i), 0);
    for (const i of pool) { r -= w(i); if (r <= 0) return i; }
    return pool[0];
  },

  // ---------- Aparición y números (balance) ----------
  // vida = (2 + t/45) × [nivel] × kind.hp · velocidad con tope · daño por nivel. group: los "swarm" vienen de a 3.
  HPT: 60,          // cada HPT segundos los enemigos ganan la vida base de uno nuevo
  HM: [1, 1.45, 2.1, 2.85, 3.9, 5.1],
  DM: [1, 1.15, 1.3, 1.5, 1.75, 2],
  spawn(ti, group) {
    if (!this.data || !this.roster.length) return;
    const elite = Math.random() < 0.12, lv = Math.min(5, ti + (elite ? 1 : 0));
    const i = this.choose(elite ? ti + 1 : ti); if (i == null) return;
    const d = this.data.list[i], K = this.data.kinds[d.kind];
    // lugar fuera de pantalla, libre y con camino hasta el jugador (map.js)
    const base = World.spawnPos({ k: 0, r: K.r * (1 + 0.1 * lv) }) || [cam.x + Math.hypot(W, H) / 2, cam.y];
    const n = group && d.kind === 'swarm' ? 3 : 1;
    for (let j = 0; j < n; j++) {
      const hp = (2 + t / this.HPT) * this.HM[lv] * K.hp;
      en.push({ x: base[0] + j * 22, y: base[1] + j * 18, et: i, kd: d.kind,
        k: d.kind === 'swarm' ? 1 : d.kind === 'tank' ? 2 : 0, ti: lv, hp, mh: hp,
        sp: (55 + Math.random() * 25 + Math.min(45, t * 0.12)) * K.sp * (1 + 0.04 * lv) * (typeof Challenge !== 'undefined' && Challenge.has('fast') ? 1.3 : 1),
        r: K.r * (1 + 0.1 * lv), v: K.xp * (1 + 0.5 * lv), dm: this.DM[lv], touch: K.touch, el: this.elOf(d),
        fl: 0, ang: 0, ac: (K.cd || 3) * (0.5 + Math.random() * 0.6), st: 0, stT: 0 });
      const e = en[en.length - 1], sp = World.freeSpot(e.x, e.y, e); e.x = sp[0]; e.y = sp[1];   // nunca dentro de una pared
    }
  },
  // daño al tocar (embistiendo o cayendo de un salto pega más)
  touch(e) { return (e.touch || [7, 5, 12][e.k] || 7) * (e.st === 2 ? 1.6 : 1) * e.dm; },

  // ---------- Comportamientos (solo anfitrión / local) ----------
  warnLine(x, y, a, Lg, w, dur) { ef.push({ k: 'wline', x, y, a, Lg, w, l: dur, m: dur, col: this.RED }); },
  warnCirc(x, y, R, dur) { ef.push({ k: 'wcirc', x, y, R, l: dur, m: dur, col: this.RED }); },
  // golpe de área diferido: se resuelve en tick()
  bomb(x, y, R, dur, e, mult) { this.warnCirc(x, y, R, dur); this.bombs.push({ x, y, R, t: dur, dm: 9 * (mult || 1) * e.dm, el: e.el }); },
  move(e, a, sp, dt) { sp *= Stats.slowOf(e); World.move(e, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt); },   // con choque contra las paredes (y ralentizado: stats.js)

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
    // movimiento normal: sigue el mapa de distancias para rodear paredes (World.steer)
    const ma = World.steer(e, a);
    if (e.kd === 'shooter') {                                   // se mantiene a media distancia, de costado
      const s = dd < 210 ? -1 : dd > 330 ? 1 : 0;
      if (s) this.move(e, s > 0 ? ma : a, e.sp * s, dt); else this.move(e, a + Math.PI / 2 * (e.et % 2 ? 1 : -1), e.sp * 0.6, dt);
    } else if (e.kd === 'bomber' && dd < 300) {
      this.move(e, a + Math.PI / 2, e.sp * 0.5, dt);            // da vueltas alrededor
    } else this.move(e, ma, e.sp, dt);
    if (!K.cd) return;
    e.ac -= dt;
    if (e.ac > 0 || t < 8) return;
    // empieza un ataque (con aviso)
    if (e.kd === 'dasher' && dd < 430) {
      e.la = a; e.dl = Math.min(480, dd + 140); e.st = 1; e.stT = 0.8;
      this.warnLine(e.x, e.y, a, e.dl, e.r * 2 + 12, 0.8);
    } else if (e.kd === 'shooter' && dd < 560) {
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
    if (e.kd === 'shooter') {
      const n = e.ti >= 3 ? 3 : 1;
      for (let j = 0; j < n; j++) {
        const aa = e.la + (j - (n - 1) / 2) * 0.16;
        eb.push({ x: e.x, y: e.y, vx: Math.cos(aa) * 380, vy: Math.sin(aa) * 380, l: 2.2, el: e.el, dm: e.dm, r: 8 });
      }
    }
    e.st = 0; e.ac = K.cd * (0.8 + Math.random() * 0.4);
  },
  // golpes de área pendientes (bombas, aterrizajes, pisotones)
  tick(dt) {
    for (const b of this.bombs) {
      b.t -= dt; if (b.t > 0) continue;
      ef.push({ k: 'ring', x: b.x, y: b.y, R: b.R, col: '#ff6a3d', l: 0.3, m: 0.3 });
      if (SkillSys.fxOf('fire', 'hit')) ef.push({ k: 'hit', fx: 'fire', x: b.x, y: b.y, R: b.R * 1.3, l: 0.35, m: 0.35 });
      for (const q of P) if (!q.dead && q.inv <= 0 && Math.hypot(q.x - b.x, q.y - b.y) < b.R + q.r * 0.5) hurt(q, b.dm, b.el);
    }
    this.bombs = this.bombs.filter(b => b.t > 0);
  },

  // ---------- Dibujo de los avisos (lo llama SkillSys.drawFx) ----------
  drawWarn(o) {
    const f = 1 - Math.max(0, o.l) / o.m;   // progreso 0..1 hasta el golpe
    cx.save();
    if (o.k === 'wline') {
      cx.translate(o.x, o.y); cx.rotate(o.a);
      cx.globalAlpha = 0.16; cx.fillStyle = o.col; cx.fillRect(0, -o.w / 2, o.Lg, o.w);
      cx.globalAlpha = 0.38; cx.fillRect(0, -o.w / 2, o.Lg * f, o.w);
      cx.globalAlpha = 0.85; cx.strokeStyle = o.col; cx.lineWidth = 2; cx.strokeRect(0, -o.w / 2, o.Lg, o.w);
    } else {
      cx.globalAlpha = 0.14; cx.fillStyle = o.col; cx.beginPath(); cx.arc(o.x, o.y, o.R, 0, 6.283); cx.fill();
      cx.globalAlpha = 0.35; cx.beginPath(); cx.arc(o.x, o.y, o.R * f, 0, 6.283); cx.fill();
      cx.globalAlpha = 0.9; cx.strokeStyle = o.col; cx.lineWidth = 2.5; cx.setLineDash([10, 6]);
      cx.beginPath(); cx.arc(o.x, o.y, o.R, 0, 6.283); cx.stroke(); cx.setLineDash([]);
    }
    cx.restore();
  }
};

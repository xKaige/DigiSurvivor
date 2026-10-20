// Digital Gate: cada vez que antes aparecía un jefe, se abre una fisura en algún lugar del mapa ("DIGITAL GATE OPEN").
// Cuando un jugador se para encima, todo el grupo viaja a la arena (World.arena, estilo MT Infinity) y pelea contra el jefe.
// Al caer el jefe: sus recompensas, un nivel obligatorio y una cuenta de 5 a 0; después vuelven todos a donde estaban,
// con el mundo como lo dejaron (enemigos, gemas e ítems quedan guardados mientras tanto).
// Se carga ANTES que game.js y usa sus globals en tiempo de ejecución (P, en, gems, eb, sh, ef, t, xp, need, cam, W, H, cx,
// Bosses, Items, World, burst, isOnline, isHost, myIdx, party, PC). Solo el anfitrión (o el juego local) decide; el cliente
// recibe el estado por el sync (Gate.sync / Gate.apply).
const Gate = {
  g: null,          // fisura abierta en el mundo: [x, y]
  cd: null,         // cuenta regresiva para volver (segundos), o null
  back: null,       // a dónde vuelve cada jugador
  stash: null,      // el mundo guardado mientras están en la arena
  R: 46,            // radio para entrar (pies del jugador)
  LIFE: 120,        // segundos que queda abierta la fisura; si nadie entra se cierra y el jefe espera al próximo turno
  gt: 0,            // cuándo se abrió
  seen: 0,          // estado que ya mostró el HUD (para los avisos, también en el cliente)

  reset() { this.g = null; this.cd = null; this.back = null; this.stash = null; this.seen = 0; World.arena = false; },

  // ---------- Simulación (anfitrión / local) ----------
  tick(dt) {
    if (!Bosses.data) return;
    if (!World.arena) {
      // se abre cuando antes salía el jefe (Bosses.every); si ya hay una abierta, espera a que alguien entre
      if (!this.g && t >= Bosses.next) this.open();
      if (this.g && t - this.gt > this.LIFE) { this.g = null; Bosses.next = t + Bosses.every(); return; }   // nadie entró: se cierra
      if (this.g && P.some(q => !q.dead && Math.hypot(q.x - this.g[0], q.y + 40 - this.g[1]) < this.R)) this.enter();
      return;
    }
    // en la arena: cuando cae el jefe arranca la cuenta (y el nivel obligatorio); al llegar a 0, vuelven
    if (this.cd == null) {
      if (!en.some(e => e.bo != null)) {
        this.cd = 5; Items.magT = 5;      // las gemas del jefe van solas hacia ustedes
        xp = Math.max(xp, need);          // nivel obligatorio
      }
    } else if ((this.cd -= dt) <= 0) this.exit();
  },
  // abre la fisura lejos del grupo (fuera de pantalla), en un lugar con camino
  open() {
    const [x0, y0] = World.spawnCenter();
    let best = null;
    for (let k = 0; k < 30 && !best; k++) {
      const a = Math.random() * 6.283, d = 900 + Math.random() * 700;
      const sp = World.freeSpot(x0 + Math.cos(a) * d, y0 + Math.sin(a) * d);
      const v = World.reach(sp[0], sp[1] + 40);
      if (v !== 65535) best = [sp[0], sp[1] + 40];
    }
    this.g = best || [x0 + 600, y0]; this.gt = t;
    for (let i = 0; i < 30; i++) burst(this.g[0], this.g[1], i % 2 ? '#3dff7a' : '#fff');
  },
  enter() {
    this.back = P.map(q => [q.x, q.y]);
    this.stash = { en, gems, eb, sh, it: Items.on, flow: World.flow };
    en = []; gems = []; eb = []; sh = []; Items.on = []; ef.length = 0;
    World.arena = true; World.flow = null; World.flowT = 0;
    const A = World.AR, n = P.length;
    P.forEach((q, i) => { q.x = (i - (n - 1) / 2) * 80; q.y = A.h / 2 - 150; q.inv = Math.max(q.inv, 1.5); });
    cam.x = 0; cam.y = A.h / 2 - 150;
    Bosses.spawn();                                   // el jefe que tocaba, arriba de la plataforma
    const b = en[en.length - 1]; if (b) { b.x = 0; b.y = -A.h / 2 + 120; b.pt = 3; }
    // a medida que avanza la partida, chance de que sean DOS jefes (hasta 50%; cada uno con 80% de la vida)
    if (Math.random() < Math.min(0.5, Math.max(0, (t - 180) / 1200))) {
      Bosses.spawn(); const c = en[en.length - 1];
      if (c && c !== b) { c.x = 260; c.y = -A.h / 2 + 140; c.pt = 4.5; b.x = -260; for (const e of [b, c]) { e.hp *= 0.8; e.mh = e.hp; } setTimeout(() => Bosses.banner('¡DOS JEFES!'), 2700); }
    }
    Bosses.next = Infinity;                           // no se abre otra mientras están acá
    this.g = null; this.cd = null;
  },
  exit() {
    const S = this.stash, left = Items.on;            // ítems que quedaron sin levantar en la arena: vuelven con ustedes
    World.arena = false;
    en = S.en; gems = S.gems; eb = S.eb; sh = S.sh; Items.on = S.it; World.flow = null; World.flowT = 0;
    P.forEach((q, i) => { const b = this.back[i] || this.back[0]; const sp = World.freeSpot(b[0], b[1], q); q.x = sp[0]; q.y = sp[1]; q.inv = Math.max(q.inv, 2); });
    left.forEach((it, i) => { const q = P[i % P.length], sp = World.freeSpot(q.x + (i % 2 ? 1 : -1) * 150 * (1 + (i >> 1)), q.y + 40); Items.on.push({ x: sp[0], y: sp[1], k: it.k, l: Items.LIFE }); });   // separados: que no se agarren dos sin querer
    ef.length = 0; this.stash = null; this.back = null; this.cd = null;
    Bosses.next = t + Bosses.every();
  },

  // ---------- Sync online ----------
  sync() { return { g: this.g && [Math.round(this.g[0]), Math.round(this.g[1])], a: World.arena ? 1 : 0, cd: this.cd == null ? null : Math.round(this.cd * 10) / 10 }; },
  apply(d) { this.g = d.g || null; World.arena = !!d.a; this.cd = d.cd; },

  // ---------- Avisos (anfitrión y cliente) ----------
  hud() {
    const st = World.arena ? (this.cd != null ? 3 : 2) : this.g ? 1 : 0;
    if (st === this.seen) return;
    if (st === 1) { Bosses.banner('¡DIGITAL GATE OPEN!'); Sound.play('gate'); }
    if (st === 0 && this.seen === 1 && running) { Bosses.banner('La fisura se cerró'); if (typeof Achievements !== 'undefined') Achievements.flag('gate'); }   // nadie entró
    this.seen = st;
  },

  // ---------- Dibujo ----------
  // la fisura, en el mundo (con la cámara aplicada)
  drawWorld() {
    if (!this.g || World.arena) return;
    const [x, y] = this.g, k = t * 3, h = 120, w = 34;
    cx.save(); cx.translate(x, y - h / 2);
    cx.globalAlpha = 0.35 + 0.15 * Math.sin(k);
    const gr = cx.createRadialGradient(0, 0, 4, 0, 0, 110); gr.addColorStop(0, 'rgba(61,255,122,.8)'); gr.addColorStop(1, 'rgba(61,255,122,0)');
    cx.fillStyle = gr; cx.beginPath(); cx.ellipse(0, 0, 90, 120, 0, 0, 6.283); cx.fill();
    cx.globalAlpha = 1;
    // grieta: zigzag negro con borde verde brillante (tiembla un poco)
    const pts = []; for (let i = 0; i <= 10; i++) { const yy = -h / 2 + h * i / 10, ww = Math.sin(i / 10 * Math.PI) * w; pts.push([yy, ww * (0.75 + 0.25 * Math.sin(k * 2 + i))]); }
    cx.beginPath(); pts.forEach(([yy, ww], i) => { const zx = (i % 2 ? 6 : -6); i ? cx.lineTo(zx + ww * 0.5, yy) : cx.moveTo(zx, yy); });
    for (let i = pts.length - 1; i >= 0; i--) { const [yy, ww] = pts[i], zx = (i % 2 ? 6 : -6); cx.lineTo(zx - ww * 0.5, yy); }
    cx.closePath(); cx.fillStyle = '#020a04'; cx.fill();
    cx.lineWidth = 5; cx.strokeStyle = 'rgba(61,255,122,.5)'; cx.stroke(); cx.lineWidth = 2; cx.strokeStyle = '#b6ffcb'; cx.stroke();
    // datos que suben
    cx.fillStyle = '#3dff7a'; cx.font = 'bold 12px monospace';
    for (let i = 0; i < 8; i++) { const ph = (t * 0.6 + i / 8) % 1; cx.globalAlpha = 1 - ph; cx.fillText(i % 2 ? '1' : '0', Math.sin(i * 7) * 40, h / 2 - ph * (h + 40)); }
    cx.globalAlpha = 1; cx.restore();
    // círculo para pararse
    cx.strokeStyle = 'rgba(61,255,122,' + (0.5 + 0.3 * Math.sin(k * 2)) + ')'; cx.lineWidth = 3;
    cx.beginPath(); cx.ellipse(x, y, this.R + 10, (this.R + 10) * 0.45, 0, 0, 6.283); cx.stroke();
  },
  // cuenta regresiva en pantalla (sin cámara)
  drawOverlay() {
    if (!World.arena || this.cd == null) return;
    const n = Math.max(0, Math.ceil(this.cd));
    cx.save(); cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = "900 26px 'Orbitron','Chakra Petch',sans-serif"; cx.fillStyle = '#d6f03a';
    cx.fillText('VOLVIENDO AL DIGIMUNDO', W / 2, H * 0.28);
    cx.font = "900 " + Math.round(90 + 30 * (this.cd % 1)) + "px 'Orbitron','Chakra Petch',sans-serif";
    cx.lineWidth = 8; cx.strokeStyle = '#000'; cx.strokeText(n, W / 2, H * 0.4); cx.fillStyle = '#3dff7a'; cx.fillText(n, W / 2, H * 0.4);
    cx.restore();
  }
};

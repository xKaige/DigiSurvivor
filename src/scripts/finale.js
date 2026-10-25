// 0.8: al llegar a FINALE_T desaparecen todos los Digimon del mapa y aparecen los Royal Knights (uno de cada uno, jefes con
// mucha más vida y daño: bosses.json `royal`). Si te borran, la partida termina como siempre; si los vencés a todos, sigue
// el final de Yggdrasill de abajo.
// Final de la partida: Yggdrasill. Al vencer a los Royal Knights, todos los jugadores van a un mismo punto y quedan quietos,
// desaparecen los enemigos, hay unos pulsos de luz suaves, baja un resplandor desde arriba con el mensaje de Yggdrasill y la
// pantalla entera se va a blanco: fin de la partida. Sin sprite (al usuario no le gustó ningún diseño de Yggdrasill).
// Se carga ANTES que game.js y usa sus globals en tiempo de ejecución (P, en, eb, sh, ef, gems, t, cx, W, H, cam, paused, evo,
// World, burst, endRun, isOnline, isHost). Solo el anfitrión (o el juego local) decide; el cliente recibe el tiempo de la
// secuencia por el sync (`fn`) y la dibuja igual; el final le llega con el mensaje 'end'.
// 30 minutos; para probar la escena, agregá ?finale a la URL y llega al minuto
const FINALE_T = new URLSearchParams(location.search).has('finale') ? 60 : 900;   // 15 min (antes 30; pedido 22/10/2026)
const Finale = {
  on: false,
  rk: 0,             // 1 = pelea contra los Royal Knights en curso
  k: 0,              // segundos desde que empezó la secuencia
  END: 10,           // duración total
  reset() { this.on = false; this.rk = 0; this.k = 0; this.scene(false); },
  // durante la secuencia se esconde el HUD de abajo (skills, leyenda, stats): queda como una escena
  scene(v) { document.body.classList.toggle('finale', !!v); },

  // ---------- Simulación (anfitrión / local) ----------
  // se llama al principio de update: devuelve true mientras la secuencia está en curso (el resto de la simulación no corre)
  tick(dt) {
    if (!this.on) {
      if (gclk() < FINALE_T || World.arena || paused || evo) return false;   // espera a salir de la arena o de las cartas
      if (!this.rk) { this.royals(); return false; }
      if (en.some(e => e.rk)) return false;                                 // pelea en curso: la simulación sigue normal
      this.start();
    }
    this.k += dt;
    if (this.k >= this.END) { this.on = false; endRun('Yggdrasill reinició el Digimundo'); }
    return true;
  },
  // los Royal Knights: se va todo lo demás (Digimon, balas, fisura, cofres) y aparecen los 6 en ronda alrededor del grupo
  royals() {
    this.rk = 1;
    for (const e of en) for (let j = 0; j < 4; j++) burst(e.x, e.y, j % 2 ? '#fff' : '#ffd23f');
    en = []; eb = []; Gate.g = null; Bosses.next = Infinity; if (typeof Explore !== 'undefined') Explore.o = [];
    const al = P.filter(q => !q.dead), ref = al.length ? al : P;
    const mx = ref.reduce((a, q) => a + q.x, 0) / ref.length, my = ref.reduce((a, q) => a + q.y, 0) / ref.length;
    const L = Bosses.data ? Bosses.data.list.map((b, i) => b.royal ? i : -1).filter(i => i >= 0) : [], a0 = Math.random() * 6.283;
    L.forEach((i, j) => {
      Bosses.spawn(i); const b = en[en.length - 1], g = a0 + j / L.length * 6.283, sp = World.freeSpot(mx + Math.cos(g) * 560, my + Math.sin(g) * 420, b);
      b.x = sp[0]; b.y = sp[1]; for (let k = 0; k < 24; k++) burst(b.x, b.y, k % 2 ? '#fff' : '#ffd23f');
    });
    P.forEach(q => q.inv = Math.max(q.inv, 2));
    Sound.play('gate'); setTimeout(() => { if (running && this.rk) Bosses.banner('¡LOS ROYAL KNIGHTS! Vencelos a todos'); }, 50);
  },
  start() {
    this.on = true; this.k = 0; this.scene(true);
    // todos al mismo punto (el promedio de los vivos), en fila
    const al = P.filter(q => !q.dead), ref = al.length ? al : P;
    const mx = ref.reduce((a, q) => a + q.x, 0) / ref.length, my = ref.reduce((a, q) => a + q.y, 0) / ref.length;
    P.forEach((q, i) => { const sp = World.freeSpot(mx + (i - (P.length - 1) / 2) * 70, my, q); q.x = sp[0]; q.y = sp[1]; q.moving = false; q.inv = 0; });
    // los enemigos desaparecen
    for (const e of en) for (let j = 0; j < 6; j++) burst(e.x, e.y, j % 2 ? '#fff' : '#bfe6ff');
    en = []; eb = []; sh = []; ef.length = 0;
  },

  // ---------- Sync online ----------
  sync() { return this.on ? Math.round(this.k * 100) / 100 : null; },
  apply(v) { if (v == null) { if (this.on) this.reset(); return; } if (!this.on) this.scene(true); this.on = true; this.k = v; },
  // cliente: avanza solo entre syncs
  clientTick(dt) { if (this.on) this.k += dt; },

  // ---------- Dibujo (en pantalla, sin cámara) ----------
  draw() {
    if (!this.on) return;
    const k = this.k;
    // 0–3 s: tres pulsos de luz lentos y suaves (1 por segundo, sin cortes bruscos) mientras la pantalla se va oscureciendo
    const dark = Math.min(0.78, k < 3 ? k * 0.15 : 0.45 + (k - 3) * 0.12);
    cx.fillStyle = 'rgba(0,0,12,' + dark + ')'; cx.fillRect(0, 0, W, H);
    if (k < 3) { const pulse = Math.pow(Math.sin(k * Math.PI), 2) * 0.22; cx.fillStyle = 'rgba(220,240,255,' + pulse + ')'; cx.fillRect(0, 0, W, H); }
    // los jugadores se ven por encima del oscurecido
    if (k >= 3) { cx.save(); cx.translate(W / 2 - cam.x, H / 2 - cam.y); for (const q of P) dPl(q); cx.restore(); }
    // 2,6–7 s: un resplandor baja desde arriba y crece (la presencia de Yggdrasill, sin figura)
    if (k >= 2.6) {
      const p = Math.min(1, (k - 2.6) / 4.4), e = 1 - Math.pow(1 - p, 3), r = Math.min(W, H) * (0.25 + 0.45 * e);
      const gy = -r * 0.3 + H * 0.38 * e, a = 0.25 + 0.35 * e + 0.06 * Math.sin(k * 2);
      const g = cx.createRadialGradient(W / 2, gy, 0, W / 2, gy, r);
      g.addColorStop(0, 'rgba(255,250,230,' + Math.min(0.95, a + 0.3) + ')'); g.addColorStop(0.35, 'rgba(255,240,190,' + a + ')'); g.addColorStop(1, 'rgba(255,240,190,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    }
    // 7,2–9 s: toda la pantalla se va a blanco
    if (k >= 7.2) { cx.fillStyle = 'rgba(255,255,255,' + Math.min(1, (k - 7.2) / 1.8) + ')'; cx.fillRect(0, 0, W, H); }
    // texto
    if (k >= 3.4 && k < 8.2) {
      cx.save(); cx.textAlign = 'center'; cx.globalAlpha = Math.min(1, (k - 3.4) / 0.8);
      cx.font = "900 " + Math.round(Math.min(W, H) * 0.05) + "px 'Orbitron','Chakra Petch',sans-serif";
      cx.lineWidth = 6; cx.strokeStyle = '#000'; cx.strokeText('YGGDRASILL', W / 2, H * 0.74); cx.fillStyle = '#fff6c8'; cx.fillText('YGGDRASILL', W / 2, H * 0.74);
      cx.font = "600 " + Math.round(Math.min(W, H) * 0.024) + "px 'Chakra Petch',sans-serif"; cx.fillStyle = '#bfe6ff';
      cx.fillText('El Digimundo será reiniciado', W / 2, H * 0.74 + Math.min(W, H) * 0.045);
      cx.restore();
    }
  }
};

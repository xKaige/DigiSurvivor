// Final de la partida: Yggdrasill. Al llegar a FINALE_T segundos, todos los jugadores van a un mismo punto y quedan quietos,
// desaparecen los enemigos, la pantalla parpadea, Yggdrasill baja al medio y un haz de luz termina la partida.
// Se carga ANTES que game.js y usa sus globals en tiempo de ejecución (P, en, eb, sh, ef, gems, t, cx, W, H, cam, paused, evo,
// World, burst, endRun, isOnline, isHost). Solo el anfitrión (o el juego local) decide; el cliente recibe el tiempo de la
// secuencia por el sync (`fn`) y la dibuja igual; el final le llega con el mensaje 'end'.
// Sprite: si existe assets/sprites/bosses/yggdrasill.png se usa ese; si no, se dibuja un árbol del mundo de luz.
// 30 minutos; para probar la escena, agregá ?finale a la URL y llega al minuto
const FINALE_T = new URLSearchParams(location.search).has('finale') ? 60 : 1800;
const Finale = {
  on: false,
  k: 0,              // segundos desde que empezó la secuencia
  END: 10,           // duración total
  img: null,
  load() { const i = new Image(); i.onload = () => { this.img = i; }; i.src = 'assets/sprites/bosses/yggdrasill.png'; },
  reset() { this.on = false; this.k = 0; this.scene(false); },
  // durante la secuencia se esconde el HUD de abajo (skills, leyenda, stats): queda como una escena
  scene(v) { document.body.classList.toggle('finale', !!v); },

  // ---------- Simulación (anfitrión / local) ----------
  // se llama al principio de update: devuelve true mientras la secuencia está en curso (el resto de la simulación no corre)
  tick(dt) {
    if (!this.on) {
      if (t < FINALE_T || World.arena || paused || evo) return false;   // espera a salir de la arena o de las cartas
      this.start();
    }
    this.k += dt;
    if (this.k >= this.END) { this.on = false; endRun('Yggdrasill reinició el Digimundo'); }
    return true;
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
    // los jugadores se ven por encima del oscurecido (son los que reciben el haz)
    if (k >= 3) { cx.save(); cx.translate(W / 2 - cam.x, H / 2 - cam.y); for (const q of P) dPl(q); cx.restore(); }
    // 3–7 s: Yggdrasill baja desde arriba hasta el medio
    if (k >= 2.6) {
      const p = Math.min(1, (k - 2.6) / 4), e = 1 - Math.pow(1 - p, 3);
      const size = Math.min(W, H) * 0.62, cy = -size * 0.6 + (H * 0.36 + size * 0.6) * e;
      this.drawYgg(W / 2, cy, size, k);
      // 7–9,5 s: haz de luz hacia los jugadores
      if (k >= 7) {
        const b = Math.min(1, (k - 7) / 1.2), w = 30 + b * Math.min(W, H) * 0.5;
        const gr = cx.createLinearGradient(W / 2 - w, 0, W / 2 + w, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,240,' + (0.6 + 0.4 * b) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = gr; cx.fillRect(W / 2 - w, cy, w * 2, H);
        if (k >= 8.2) { cx.fillStyle = 'rgba(255,255,255,' + Math.min(1, (k - 8.2) / 1.2) + ')'; cx.fillRect(0, 0, W, H); }   // todo blanco
      }
    }
    // texto
    if (k >= 3.4 && k < 8.2) {
      cx.save(); cx.textAlign = 'center'; cx.globalAlpha = Math.min(1, (k - 3.4) / 0.8);
      cx.font = "900 " + Math.round(Math.min(W, H) * 0.05) + "px 'Orbitron','Chakra Petch',sans-serif";
      cx.lineWidth = 6; cx.strokeStyle = '#000'; cx.strokeText('YGGDRASILL', W / 2, H * 0.74); cx.fillStyle = '#fff6c8'; cx.fillText('YGGDRASILL', W / 2, H * 0.74);
      cx.font = "600 " + Math.round(Math.min(W, H) * 0.024) + "px 'Chakra Petch',sans-serif"; cx.fillStyle = '#bfe6ff';
      cx.fillText('El Digimundo será reiniciado', W / 2, H * 0.74 + Math.min(W, H) * 0.045);
      cx.restore();
    }
  },
  // Yggdrasill: sprite si hay; si no, un árbol del mundo de luz (tronco, ramas tipo circuito y núcleo)
  drawYgg(x, y, s, k) {
    if (this.img) { const h = s, w = this.img.naturalWidth / this.img.naturalHeight * h; cx.drawImage(this.img, x - w / 2, y - h / 2, w, h); return; }
    cx.save(); cx.translate(x, y);
    const glow = (r, a, col) => { const g = cx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0)); cx.fillStyle = g; cx.beginPath(); cx.arc(0, 0, r, 0, 6.283); cx.fill(); };
    glow(s * 0.75, 0.35, 'rgba(255,240,180,A)');
    // ramas: árbol recursivo determinístico
    cx.lineCap = 'round';
    const branch = (len, ang, depth, w) => {
      if (depth === 0) return;
      cx.save(); cx.rotate(ang);
      cx.strokeStyle = 'rgba(255,250,220,' + (0.35 + depth * 0.1) + ')'; cx.lineWidth = w;
      cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(0, -len); cx.stroke();
      cx.fillStyle = '#bfe6ff'; cx.beginPath(); cx.arc(0, -len, Math.max(1.5, w * 0.6), 0, 6.283); cx.fill();   // nodo (circuito)
      cx.translate(0, -len);
      const sway = Math.sin(k * 1.5 + depth) * 0.04;
      branch(len * 0.72, -0.45 + sway, depth - 1, w * 0.7);
      branch(len * 0.72, 0.45 + sway, depth - 1, w * 0.7);
      if (depth > 3) branch(len * 0.6, sway, depth - 2, w * 0.6);
      cx.restore();
    };
    branch(s * 0.2, 0, 7, s * 0.04);
    // raíces hacia abajo
    cx.save(); cx.scale(1, -0.6); branch(s * 0.16, 0, 5, s * 0.03); cx.restore();
    // núcleo con anillos
    glow(s * 0.22, 0.95, 'rgba(255,255,255,A)');
    cx.strokeStyle = 'rgba(191,230,255,.9)'; cx.lineWidth = 3;
    for (let i = 0; i < 3; i++) { cx.save(); cx.rotate(k * (0.6 + i * 0.4) * (i % 2 ? -1 : 1)); cx.beginPath(); cx.ellipse(0, 0, s * (0.16 + i * 0.05), s * (0.06 + i * 0.02), 0, 0, 6.283); cx.stroke(); cx.restore(); }
    cx.fillStyle = '#ffffff'; cx.beginPath(); cx.arc(0, 0, s * 0.07, 0, 6.283); cx.fill();
    cx.restore();
  }
};
Finale.load();

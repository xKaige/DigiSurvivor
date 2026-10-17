// Ítems canon que caen al piso. Se carga ANTES que game.js y usa sus globals en tiempo de ejecución
// (P, gems, fx, t, cx, xp, need, burst, Bosses, Challenge).
//
// - Los virus comunes sueltan un ítem con probabilidad DROP (sorteo por peso `w`); los jefes, una Recovery Floppy
//   y a veces un X-Antibody. Se levantan pasando por encima. Duran LIFE segundos en el piso.
// - Solo el anfitrión (o el juego local) decide caídas y efectos; el cliente online los ve por el `sync` (`it`).
// - Sprites en assets/sprites/items/ (de Digital Tamers).
const Items = {
  DROP: 0.018,
  LIFE: 30,
  defs: {
    meat:      { n: 'Carne',           w: 60, col: '#ff9a6b', d: 'Cura un 25% de la vida' },
    digicore:  { n: 'Digicore',        w: 14, col: '#ffe14d', d: 'Da un 40% de la experiencia del nivel' },
    magnet:    { n: 'Imán de datos',   w: 10, col: '#5cf2ff', d: 'Atrae toda la experiencia del mapa' },
    floppy:    { n: 'Recovery Floppy', w: 4,  col: '#ff7ad9', d: 'Cura toda la vida y da 2 s de invulnerabilidad' },
    xantibody: { n: 'X-Antibody',      w: 0,  col: '#c05bff', d: 'Despierta el X-Antibody: +25% de daño y +10% de velocidad' }
  },
  img: {},
  on: [],           // ítems en el piso { x, y, k, l }
  magT: 0,          // segundos que queda el imán activo

  load() {
    for (const k in this.defs) { const i = new Image(); i.src = 'assets/sprites/items/' + k + '.png'; this.img[k] = i; }
  },
  reset() { this.on = []; this.magT = 0; },

  // ---------- Caídas (solo anfitrión / local) ----------
  roll() {
    const ks = Object.keys(this.defs).filter(k => this.defs[k].w), tot = ks.reduce((a, k) => a + this.defs[k].w, 0);
    let r = Math.random() * tot;
    for (const k of ks) { r -= this.defs[k].w; if (r <= 0) return k; }
    return ks[0];
  },
  drop(x, y) {
    const luck = Math.max(0, ...P.map(q => q.luck || 0));   // suerte (stats.js): más ítems
    const ch = this.DROP * (1 + luck) * (typeof Challenge !== 'undefined' && Challenge.has('items') ? 3 : 1);
    if (Math.random() < ch) this.on.push({ x, y, k: this.roll(), l: this.LIFE });
  },
  bossDrop(x, y) {
    this.on.push({ x: x - 24, y, k: 'floppy', l: this.LIFE });
    // Prototipo X (rasgo de Dorumon): si alguno lo tiene y todavía no lo despertó, el X-Antibody cae siempre
    if (Math.random() < 0.5 || P.some(q => q.tr === 'prototipo' && !q.xa && !q.dead)) this.on.push({ x: x + 24, y, k: 'xantibody', l: this.LIFE });
  },

  update(dt) {
    this.magT = Math.max(0, this.magT - dt);
    for (const it of this.on) {
      it.l -= dt;
      for (const q of P) {
        if (q.dead || it.l <= 0 || Math.hypot(q.x - it.x, q.y - it.y) > q.r + 22) continue;
        if (it.k === 'xantibody' && q.xa) continue;   // ya lo tiene: queda para el otro jugador
        this.apply(q, it.k); it.l = 0;
      }
    }
    this.on = this.on.filter(it => it.l > 0);
  },
  apply(q, k) {
    const D = this.defs[k];
    const heal = 1 + ((q.m && q.m.healP) || 0);   // curación de ítems (árbol de Vacuna)
    if (k === 'meat') q.hp = Math.min(q.max, q.hp + q.max * 0.25 * heal);
    else if (k === 'floppy') { q.hp = q.max; q.inv = Math.max(q.inv, 2); }
    else if (k === 'digicore') xp += need * 0.4;
    else if (k === 'magnet') this.magT = 1.5;
    else if (k === 'xantibody') { q.xa = 1; Stats.calc(q); if (window.onXAntibody) window.onXAntibody(q); }   // +25% de daño y +10% de velocidad (Stats.calc)
    fx.push({ x: q.x, y: q.y - (q.dh || 96) + 30, txt: D.n, col: D.col, sz: 20, l: 1.2 });
    for (let i = 0; i < 12; i++) burst(q.x, q.y, D.col);
  },

  // ---------- Dibujo (anfitrión y cliente) ----------
  draw() {
    for (const it of this.on) {
      const im = this.img[it.k], D = this.defs[it.k]; if (!im || !im.complete || !D) continue;
      const bob = Math.sin(t * 4 + it.x * 0.05) * 4, s = 2, w = im.naturalWidth * s, h = im.naturalHeight * s;
      if (it.l != null && it.l < 5 && Math.floor(t * 8) % 2) continue;   // parpadea antes de desaparecer
      cx.save(); cx.imageSmoothingEnabled = false;
      cx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 6); cx.fillStyle = D.col;
      cx.beginPath(); cx.ellipse(it.x, it.y + h / 2, w * 0.45, 5, 0, 0, 6.283); cx.fill();
      cx.globalAlpha = 1; cx.drawImage(im, it.x - w / 2, it.y - h / 2 + bob, w, h);
      cx.restore();
    }
  }
};
Items.load();

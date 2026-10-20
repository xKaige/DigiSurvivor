// Weather: clima del Digimundo (0.7). Solo lluvia y tormenta eléctrica (pedido). Cambia cada 50–90 s; en la arena del
// Digital Gate no hay clima. Lluvia: los Digimon enemigos van un 8% más lento (barro). Tormenta: además caen rayos
// marcados con un círculo amarillo cerca de los jugadores; dañan a todos los que estén adentro (también a los enemigos).
// El anfitrión decide y manda el estado en el sync (wx); el rayo viaja como efecto 'bolt'. Se carga antes que game.js.
const Weather = {
  s: 0,            // 0 despejado, 1 lluvia, 2 tormenta
  I: 0,            // intensidad visible (0..1, sube y baja de a poco)
  next: 0, strikeT: 0, flash: 0, skyT: 0, drops: [], hits: [],
  NAMES: ['', 'Empieza a llover', '¡Tormenta eléctrica!'],
  reset() { this.s = 0; this.I = 0; this.next = 60 + Math.random() * 30; this.strikeT = 3; this.flash = 0; this.skyT = 5; this.hits = []; },
  on() { return this.s > 0 && !World.arena && !(typeof Finale !== 'undefined' && Finale.on); },
  slow() { return this.on() ? 0.92 : 1; },   // Enemies.move
  // ---------- Simulación (anfitrión / 1 jugador) ----------
  tick(dt) {
    if (t >= this.next) {
      const r = Math.random(), s = this.s;
      const ns = s === 0 ? (r < 0.55 ? 1 : r < 0.85 ? 2 : 0) : s === 1 ? (r < 0.45 ? 0 : r < 0.85 ? 2 : 1) : (r < 0.5 ? 1 : 0);
      if (ns !== s) { this.s = ns; if (!World.arena) Bosses.banner(ns ? this.NAMES[ns] : 'Paró de llover'); }
      this.next = t + 50 + Math.random() * 40; this.strikeT = 2.5;
    }
    this.fade(dt);
    for (const h of this.hits) if ((h.t -= dt) <= 0) this.strike(h);
    this.hits = this.hits.filter(h => h.t > 0);
    if (this.s !== 2 || !this.on() || this.I < 0.6) return;
    if ((this.strikeT -= dt) <= 0) {
      this.strikeT = 2.2 + Math.random() * 2.8;
      const al = P.filter(q => !q.dead); if (!al.length) return;
      const n = 1 + (Math.random() < 0.35 ? 1 : 0);
      for (let j = 0; j < n; j++) {
        const q = al[(Math.random() * al.length) | 0], g = Math.random() * 6.283, d = 40 + Math.random() * 220;
        const x = q.x + Math.cos(g) * d, y = q.y + Math.sin(g) * d, R = 85;
        const dm = 1.3 * (1 + Math.max(0, t - Enemies.DMT_0) / Enemies.DMT);
        Enemies.bomb(x, y, R, 1.3, { dm, el: NaN }, 1.9, '#fff36b');   // daño a los jugadores (enemies.js), sin atributo
        this.hits.push({ x, y, R, t: 1.3 });
      }
    }
  },
  fade(dt) {
    const goal = this.on() ? 1 : 0; this.I += Math.sign(goal - this.I) * Math.min(Math.abs(goal - this.I), dt / 3);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.s === 2 && this.on() && (this.skyT -= dt) <= 0) { this.skyT = 4 + Math.random() * 6; this.flash = Math.max(this.flash, 0.35); }   // relámpago lejano
  },
  // cae el rayo: efecto, sonido y daño a los enemigos que estén adentro (a los jugadores los daña la bomba)
  strike(h) {
    ef.push({ k: 'bolt', x: h.x, y: h.y, l: 0.35, m: 0.35, R: h.R, s: (Math.random() * 1e4) | 0 });
    this.flash = Math.max(this.flash, 0.8); Sound.play('thunder');
    for (let j = 0; j < 16; j++) burst(h.x, h.y, j % 2 ? '#fff36b' : '#fff');
    for (const e of en) if (e.bo == null && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) < h.R + e.r) hit(e, (e.hp0 || e.hp) * 0.6, 0, null);
  },
  // ---------- Online ----------
  sync() { return [this.s, Math.round(this.flash * 100) / 100]; },
  apply(w) { if (!Array.isArray(w)) return; if (w[0] !== this.s && w[0] && !World.arena) Bosses.banner(this.NAMES[w[0]]); this.s = w[0] | 0; this.flash = Math.max(this.flash, w[1] || 0); },
  clientTick(dt) { this.fade(dt); },
  // ---------- Dibujo (en pantalla, después del mundo) ----------
  draw() {
    if (this.I <= 0.01 && this.flash <= 0) return;
    const I = this.I, st = this.s === 2, n = Math.round((st ? 230 : 150) * I);
    cx.save();
    cx.fillStyle = st ? 'rgba(8,10,30,' + 0.3 * I + ')' : 'rgba(10,22,44,' + 0.18 * I + ')'; cx.fillRect(0, 0, W, H);   // cielo nublado
    while (this.drops.length < n) this.drops.push({ x: Math.random() * (W + 200), y: Math.random() * H, v: 700 + Math.random() * 400, l: 10 + Math.random() * 14 });
    if (this.drops.length > n) this.drops.length = n;
    const dt = paused ? 0 : 1 / 60, wx = st ? -0.32 : -0.18;
    cx.strokeStyle = 'rgba(170,205,255,' + (0.35 * I) + ')'; cx.lineWidth = 1.2; cx.beginPath();
    for (const d of this.drops) {
      d.y += d.v * dt; d.x += d.v * wx * dt;
      if (d.y > H || d.x < -20) { d.y = -20; d.x = Math.random() * (W + 200); }
      cx.moveTo(d.x, d.y); cx.lineTo(d.x - d.l * wx, d.y - d.l);
    }
    cx.stroke();
    cx.strokeStyle = 'rgba(190,220,255,' + (0.3 * I) + ')';   // salpicaduras
    for (let j = 0; j < 10 * I; j++) { const x = (Math.sin(t * 7.3 + j * 91.7) * 0.5 + 0.5) * W, y = (Math.sin(t * 5.1 + j * 37.3) * 0.5 + 0.5) * H;
      cx.beginPath(); cx.ellipse(x, y, 5, 2, 0, 0, 6.283); cx.stroke(); }
    if (this.flash > 0) { cx.fillStyle = 'rgba(235,240,255,' + Math.min(0.55, this.flash * 0.6) + ')'; cx.fillRect(0, 0, W, H); }
    cx.restore();
  },
  // el rayo (efecto 'bolt', en coordenadas del mundo; lo llama SkillSys.drawFx)
  drawBolt(o) {
    const k = Math.max(0, o.l / o.m); let x = o.x, y = o.y - 900, sd = o.s || 1;
    const rnd = () => { sd = (sd * 9301 + 49297) % 233280; return sd / 233280 - 0.5; };
    cx.save(); cx.lineJoin = 'round';
    const pts = [[x, y]]; for (let j = 1; j <= 12; j++) pts.push([o.x + rnd() * 60 * (1 - j / 12), y + 900 * j / 12]);
    for (const [w, c, a] of [[14, '#fff36b', 0.35], [6, '#fffbd0', 0.9], [2.5, '#fff', 1]]) {
      cx.globalAlpha = a * k; cx.strokeStyle = c; cx.lineWidth = w; cx.beginPath(); pts.forEach((p, i) => i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1])); cx.stroke();
    }
    cx.globalAlpha = 0.5 * k; cx.fillStyle = '#fff36b'; cx.beginPath(); cx.arc(o.x, o.y, (o.R || 80) * (1.2 - k * 0.4), 0, 6.283); cx.fill();
    cx.restore();
  }
};

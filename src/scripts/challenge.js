// Desafío diario: una partida de 1 jugador con reglas especiales, iguales para todos ese día, y ranking entre amigos.
// Se carga DESPUÉS de game.js y missions.js (usa Missions.dayKey/rng para el día argentino y el sorteo, y los globals
// selected, unlocked, elOf, ATTR, ELC, CreatureLoader, beginLocal, openMenuPick, running).
//
// - Reglas (MODS): siempre una de atributo (solo Vacuna/Virus/Dato) + 2 más al azar. game.js/bosses.js/items.js
//   preguntan con Challenge.has(id) mientras la partida del desafío está activa.
// - Puntaje = virus + 2 × segundos + 150 × jefes. Se guarda el mejor del día en el navegador ('digisurvivor_chal')
//   y, con sesión iniciada, en Firestore (puente window.challengeCloud de social.js) para el ranking de amigos.
const Challenge = {
  KEY: 'digisurvivor_chal',
  active: null,     // reglas de la partida en curso (o null si no es un desafío)
  MODS: [
    { id: 'a0', n: 'Solo Vacuna', d: 'Solo podés usar Digimon de atributo Vacuna', attr: 0 },
    { id: 'a1', n: 'Solo Virus', d: 'Solo podés usar Digimon de atributo Virus', attr: 1 },
    { id: 'a2', n: 'Solo Dato', d: 'Solo podés usar Digimon de atributo Dato', attr: 2 },
    { id: 'boss60', n: 'Jefes cada minuto', d: 'Los jefes aparecen cada 60 segundos' },
    { id: 'swarm', n: 'Enjambre', d: 'Aparecen 50% más virus' },
    { id: 'fast', n: 'Virus veloces', d: 'Los virus son 30% más rápidos' },
    { id: 'notree', n: 'Sin árbol', d: 'Tus mejoras permanentes no cuentan' },
    { id: 'glass', n: 'Cristal', d: 'Tenés la mitad de vida, pero hacés +50% de daño' },
    { id: 'items', n: 'Lluvia de ítems', d: 'Caen el triple de ítems' }
  ],

  // ---------- Reglas del día ----------
  day() { return typeof Missions !== 'undefined' && Missions.cat ? Missions.dayKey() : new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); },
  today(day = this.day()) {
    const rnd = Missions.rng('desafio-' + day), at = this.MODS.filter(m => m.attr != null), rest = this.MODS.filter(m => m.attr == null);
    const out = [at[Math.floor(rnd() * at.length)]];
    while (out.length < 3) { const m = rest[Math.floor(rnd() * rest.length)]; if (!out.includes(m)) out.push(m); }
    return out;
  },
  has(id) { return !!this.active && this.active.some(m => m.id === id); },
  attr() { const m = this.today().find(x => x.attr != null); return m ? m.attr : null; },
  okPick(id) { return !!id && unlocked(id) && elOf(id) === this.attr(); },
  score(r) { return (r.kills | 0) + 2 * Math.floor(r.secs) + 150 * (r.bosses | 0); },

  // ---------- Récord del día (navegador) ----------
  best() { let s = null; try { s = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) {} return s && s.day === this.day() ? s : { day: this.day(), best: 0, runs: 0 }; },

  // ---------- Partida ----------
  async play() {
    if (running || !this.okPick(selected)) return;
    this.active = this.today(); this.close();
    await beginLocal(1);
    if (!running) this.active = null;   // la partida no arrancó: no dejar las reglas puestas para la próxima
  },
  // la llama endRun. Devuelve el texto para el mensaje final (o '' si no era un desafío)
  onRunEnd(r) {
    if (!this.active) return '';
    this.active = null;
    const sc = this.score(r), b = this.best(), rec = sc > b.best;
    b.runs++; if (rec) { b.best = sc; b.cid = r.cid; }
    try { localStorage.setItem(this.KEY, JSON.stringify(b)); } catch (e) {}
    if (rec && window.challengeCloud) window.challengeCloud.submit(b.day, sc, r.cid).catch(e => console.error('Desafío:', e));
    return ' Desafío diario: ' + sc + ' puntos' + (rec ? ' (¡récord del día!)' : ' (tu mejor: ' + b.best + ')') + '.';
  },

  // ---------- Ventana ----------
  // Dos columnas: a la izquierda las reglas del día; a la derecha tu récord, con quién vas y el ranking de amigos.
  BADGE: { a0: 'VAC', a1: 'VIR', a2: 'DAT', boss60: '60s', swarm: '×1.5', fast: '>>', notree: 'Ø', glass: '½', items: '×3' },
  build() {
    if (document.getElementById('challenge')) return;
    const w = document.createElement('div'); w.id = 'challenge';
    w.innerHTML = '<div class="box"><div class="head"><div class="ttl"><h2>Desafío diario</h2><small id="ch-date"></small></div>' +
      '<div class="ch-reset">Nuevo en<b id="ch-reset">--:--:--</b></div><button id="ch-x" aria-label="Cerrar">X</button></div><div id="ch-body"></div></div>';
    document.body.appendChild(w);
    document.getElementById('ch-x').onclick = () => this.close();
    w.onclick = e => { if (e.target === w) this.close(); };
  },
  open() {
    this.build(); this.render(); document.getElementById('challenge').style.display = 'flex'; this.loadBoard();
    clearInterval(this.timer);
    const tick = () => { const el = document.getElementById('ch-reset'); if (el && typeof Missions !== 'undefined' && Missions.cat) el.textContent = Missions.fmt(Missions.msToReset()); };
    tick(); this.timer = setInterval(tick, 1000);
  },
  close() { const w = document.getElementById('challenge'); if (w) w.style.display = 'none'; clearInterval(this.timer); },
  isOpen() { const w = document.getElementById('challenge'); return !!w && w.style.display === 'flex'; },
  render() {
    const body = document.getElementById('ch-body'); if (!body) return;
    const mods = this.today(), b = this.best(), at = this.attr(), ok = this.okPick(selected);
    const C = selected && CreatureLoader.cache[selected], nm = C ? (C.meta.stages[2] || C.meta.stages[0]).name : null;
    const [y, m, d] = this.day().split('-');
    document.getElementById('ch-date').textContent = 'Reglas del ' + d + '/' + m + '/' + y + ' · iguales para todos';
    const rule = x => '<div class="ch-rule" style="--ac:' + (x.attr != null ? ELC[x.attr] : 'var(--or)') + '"><span class="bd">' + this.BADGE[x.id] + '</span>' +
      '<div><b>' + x.n + '</b><span>' + x.d + '</span></div></div>';
    body.innerHTML =
      '<section class="ch-left"><div class="ch-lbl">Reglas de hoy</div>' + mods.map(rule).join('') +
      '<div class="ch-score"><div class="ch-lbl">Puntaje</div><ul><li><b>1</b> por virus eliminado</li><li><b>2</b> por segundo sobrevivido</li><li><b>150</b> por jefe derrotado</li></ul>' +
      '<small>Solo cuenta tu mejor partida del día. Se juega de a 1 jugador.</small></div></section>' +
      '<section class="ch-right">' +
      '<div class="ch-best"><div><small>Tu récord de hoy</small><b>' + b.best + '</b></div><span>' + b.runs + (b.runs === 1 ? ' intento' : ' intentos') + '</span></div>' +
      '<div class="ch-pick' + (ok ? ' ok' : ' bad') + '" style="--ac:' + ELC[at] + '">' + (C ? thumbOf(C, 'stage_2') : '<span class="ph">?</span>') +
      '<div><small>Tu compañero</small><b>' + (nm || 'Sin elegir') + '</b><span>' + (ok ? 'Cumple: atributo ' + ATTR[at] : 'Necesitás uno de atributo ' + ATTR[at]) + '</span></div></div>' +
      '<button id="ch-go"' + (ok ? '' : ' class="alt"') + '>' + (ok ? 'Jugar desafío' : 'Elegir otro Digimon') + '</button>' +
      '<div class="ch-lbl">Ranking de amigos</div><div id="ch-board" class="ch-board"><span class="dim">' + (window.challengeCloud ? 'Cargando...' : 'Iniciá sesión para competir con tus amigos.') + '</span></div>' +
      '</section>';
    document.getElementById('ch-go').onclick = () => {
      if (ok) return this.play();
      this.close(); openMenuPick();
    };
  },
  async loadBoard() {
    const el = document.getElementById('ch-board'); if (!el || !window.challengeCloud) return;
    try {
      const list = await window.challengeCloud.board(this.day());
      if (!list.length) { el.innerHTML = '<span class="dim">Nadie jugó todavía. ¡Sé el primero!</span>'; return; }
      el.innerHTML = list.map((x, i) => {
        const C = x.cid && CreatureLoader.cache[x.cid], nm = C ? (C.meta.stages[2] || C.meta.stages[0]).name : '';
        return '<div class="ch-p' + (x.me ? ' me' : '') + '"><span class="pos">' + (i + 1) + '</span><b>' + x.nick + '</b><small>' + nm + '</small><span class="sc">' + x.score + '</span></div>';
      }).join('');
    } catch (e) {
      console.error('Ranking del desafío:', e);
      el.innerHTML = '<span class="dim">El ranking no está disponible (revisá las reglas de Firestore para "challenges").</span>';
    }
  }
};

(() => {
  const b = document.getElementById('chb');
  if (b) b.onclick = () => Challenge.open();
})();
addEventListener('keydown', e => { if (e.key === 'Escape' && Challenge.isOpen()) Challenge.close(); });

// Misiones diarias. Se carga DESPUÉS de game.js y usa sus globals en tiempo de ejecución (save, persist, wal, SkillSys).
//
// - Catálogo en src/data/missions.json. Cada día se sortean `perDay` misiones (una por dificultad / tier, sin repetir tipo).
// - El sorteo sale de la fecha, así son las mismas para todos los jugadores.
// - El día cambia a las 00:00 de Argentina (UTC-3, sin horario de verano).
// - El progreso se cuenta al terminar cada partida (endRun → Missions.onRunEnd) y se guarda en el navegador
//   (localStorage 'digisurvivor_daily'). Las monedas de las recompensas van a save.coins (se sincronizan como siempre).
const Missions = {
  cat: null,
  KEY: 'digisurvivor_daily',
  timer: null,

  async load() {
    if (this.cat) return;
    const r = await fetch('src/data/missions.json');
    if (!r.ok) throw new Error('No se encontró src/data/missions.json (' + r.status + ')');
    this.cat = await r.json();
  },

  // ---------- Día argentino ----------
  dayKey(now = Date.now()) { return new Date(now + this.cat.utcOffsetHours * 3600e3).toISOString().slice(0, 10); },
  msToReset(now = Date.now()) {
    const D = 864e5, local = now + this.cat.utcOffsetHours * 3600e3;
    return (Math.floor(local / D) + 1) * D - local;
  },

  // ---------- Sorteo del día (determinístico por fecha) ----------
  rng(seed) {
    let h = 2166136261;
    for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  },
  today(day = this.dayKey()) {
    const rnd = this.rng('digisurvivor-' + day), out = [], usedTypes = new Set();
    const tiers = [...new Set(this.cat.missions.map(m => m.tier))].sort();
    for (let i = 0; i < this.cat.perDay; i++) {
      const tier = tiers[i % tiers.length];
      const pool = this.cat.missions.filter(m => m.tier === tier && !usedTypes.has(m.type) && !out.includes(m));
      if (!pool.length) continue;
      const m = pool[Math.floor(rnd() * pool.length)];
      out.push(m); usedTypes.add(m.type);
    }
    return out;
  },

  // ---------- Progreso guardado ----------
  state() {
    const day = this.dayKey();
    let s = null;
    try { s = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) {}
    if (!s || s.day !== day) s = { day, prog: {}, claimed: {} };   // día nuevo: arranca de cero
    return s;
  },
  saveState(s) { try { localStorage.setItem(this.KEY, JSON.stringify(s)); } catch (e) {} },

  // tipos que se SUMAN entre partidas; el resto guarda el mejor valor de una partida
  ADD: { kills_day: 1, runs_day: 1, local2p_run: 1, online_run: 1, play_attr: 1, coins_day: 1, skill_max: 1 },
  value(m, r) {
    switch (m.type) {
      case 'kills_run': case 'kills_day': return r.kills;
      case 'survive': return Math.floor(r.secs);
      case 'runs_day': return 1;
      case 'reach_stage': return r.stage;
      case 'reach_level': return r.lvl;
      case 'local2p_run': return r.local2p ? 1 : 0;
      case 'online_run': return r.online ? 1 : 0;
      case 'play_attr': return r.attr === m.attr ? 1 : 0;
      case 'coins_day': return r.coins;
      case 'skill_max': return r.skillMax ? 1 : 0;
    }
    return 0;
  },

  // Se llama al terminar una partida. Devuelve las misiones que se completaron recién.
  onRunEnd(r) {
    if (!this.cat) return [];
    const s = this.state(), done = [];
    this.today(s.day).forEach(m => {
      const before = s.prog[m.id] | 0, v = this.value(m, r);
      s.prog[m.id] = this.ADD[m.type] ? before + v : Math.max(before, v);
      if (before < m.goal && s.prog[m.id] >= m.goal) done.push(m);
    });
    this.saveState(s); this.badge();
    return done;
  },

  claim(id) {
    const s = this.state(), m = this.today(s.day).find(x => x.id === id);
    if (!m || s.claimed[id] || (s.prog[id] | 0) < m.goal) return;
    s.claimed[id] = true; this.saveState(s);
    save.coins += m.reward; persist(); wal();
    this.render(); this.badge();
  },

  // ---------- Interfaz ----------
  fmt(ms) {
    const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), mi = Math.floor(t % 3600 / 60), se = t % 60;
    return [h, mi, se].map(x => String(x).padStart(2, '0')).join(':');
  },
  progText(m, p) {
    const g = m.goal, v = Math.min(p, g);
    if (m.type === 'reach_stage') {
      const SN = ['Bebé', 'Bebé II', 'Novato', 'Campeón', 'Perfecto', 'Evolución final'];
      return p >= g ? '¡' + SN[g] + ' lograda!' : 'Tu mejor etapa hoy: ' + (p ? SN[p] : '—');
    }
    if (m.type === 'survive') return Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0') + ' / ' + Math.floor(g / 60) + ':' + String(g % 60).padStart(2, '0');
    return v + ' / ' + g;
  },
  build() {
    if (document.getElementById('missions')) return;
    const w = document.createElement('div'); w.id = 'missions';
    w.innerHTML = '<div class="box"><div class="head"><div class="ttl"><h2>Misiones diarias</h2><small>Se renuevan a las 00:00 (hora argentina)</small></div>' +
      '<div class="reset">Nuevas en <b id="ms-reset">--:--:--</b></div><button id="ms-x" aria-label="Cerrar">X</button></div>' +
      '<div id="ms-list"></div><div class="foot">Las misiones avanzan al terminar cada partida. Cuando cumplas una, reclamá tus monedas acá.</div></div>';
    document.body.appendChild(w);
    document.getElementById('ms-x').onclick = () => this.close();
    w.onclick = e => { if (e.target === w) this.close(); };
  },
  open() {
    this.build(); this.render();
    document.getElementById('missions').style.display = 'flex';
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const el = document.getElementById('ms-reset'); if (el) el.textContent = this.fmt(this.msToReset());
      if (this.state().day !== this.shownDay) this.render();   // pasó la medianoche con la ventana abierta
    }, 1000);
  },
  close() { const w = document.getElementById('missions'); if (w) w.style.display = 'none'; clearInterval(this.timer); },
  isOpen() { const w = document.getElementById('missions'); return !!w && w.style.display === 'flex'; },
  render() {
    const list = document.getElementById('ms-list'); if (!list || !this.cat) return;
    const s = this.state(), TN = { 1: 'Fácil', 2: 'Media', 3: 'Difícil' };
    this.shownDay = s.day;
    document.getElementById('ms-reset').textContent = this.fmt(this.msToReset());
    list.innerHTML = '';
    this.today(s.day).forEach(m => {
      const p = s.prog[m.id] | 0, ok = p >= m.goal, got = !!s.claimed[m.id];
      const row = document.createElement('div'); row.className = 'ms t' + m.tier + (got ? ' got' : ok ? ' ok' : '');
      row.innerHTML = '<div class="info"><span class="tier">' + TN[m.tier] + '</span><b>' + m.name + '</b><span class="desc">' + m.desc + '</span>' +
        '<div class="bar"><i style="width:' + Math.min(100, p / m.goal * 100) + '%"></i><span>' + this.progText(m, p) + '</span></div></div>' +
        '<div class="rw"><span class="coin">● ' + m.reward + '</span></div>';
      const b = document.createElement('button');
      b.textContent = got ? 'Cobrada' : ok ? 'Reclamar' : 'En curso';
      b.disabled = got || !ok;
      b.onclick = () => this.claim(m.id);
      row.querySelector('.rw').appendChild(b);
      list.appendChild(row);
    });
  },
  // aviso en el botón del menú: cuántas misiones hay para reclamar
  badge() {
    const b = document.getElementById('msb'); if (!b || !this.cat) return;
    const s = this.state(), n = this.today(s.day).filter(m => (s.prog[m.id] | 0) >= m.goal && !s.claimed[m.id]).length;
    let bd = b.querySelector('.bd'); if (bd) bd.remove();
    if (n) { bd = document.createElement('span'); bd.className = 'bd'; bd.textContent = n; b.appendChild(bd); }
  }
};

(async () => {
  try { await Missions.load(); } catch (e) { console.error(e); return; }
  const b = document.getElementById('msb');
  if (b) b.onclick = () => Missions.open();
  Missions.badge();
  // si pasa la medianoche con el menú abierto, el aviso del botón se actualiza solo
  setInterval(() => Missions.badge(), 60000);
})();
addEventListener('keydown', e => { if (e.key === 'Escape' && Missions.isOpen()) Missions.close(); });

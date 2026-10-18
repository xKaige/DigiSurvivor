// Achievements: logros de la cuenta (pestaña "Logros" del menú, aviso al conseguir uno).
// Se guardan dentro del progreso de progress.js (Progress.st.ach = { id: fecha } y Progress.st.ax = contadores propios),
// así viajan a la cuenta con el resto (users/{uid}.prog). Se carga después de progress.js.
// Cada logro tiene un valor (v) que sale del progreso guardado y una meta (goal); los que dependen de una sola partida
// guardan su mejor marca o una bandera en ax (onRunEnd, tick y flag).
const Achievements = {
  CATS: [['kill', 'Digimon eliminados'], ['boss', 'Jefes'], ['evo', 'Evolución'], ['surv', 'Supervivencia'], ['col', 'Colección'],
    ['on', 'Online'], ['daily', 'Constancia'], ['secret', 'Secretos']],
  // los ids no se cambian (quedan guardados en la cuenta)
  LIST: [
    { id: 'k100', c: 'kill', n: 'Primer contacto', d: 'Eliminá 100 Digimon', goal: 100, v: S => S.s.kills },
    { id: 'k1000', c: 'kill', n: 'Domador', d: 'Eliminá 1.000 Digimon', goal: 1000, v: S => S.s.kills },
    { id: 'k10000', c: 'kill', n: 'Cortafuegos', d: 'Eliminá 10.000 Digimon', goal: 10000, v: S => S.s.kills },
    { id: 'k50000', c: 'kill', n: 'Purga total', d: 'Eliminá 50.000 Digimon', goal: 50000, v: S => S.s.kills },
    { id: 'krun', c: 'kill', n: 'Sin piedad', d: 'Eliminá 500 Digimon en una sola partida', goal: 500, v: S => S.ax.killsRun },

    { id: 'b1', c: 'boss', n: 'Primera puerta', d: 'Derrotá a tu primer jefe del Digital Gate', goal: 1, v: S => S.bossTot },
    { id: 'b25', c: 'boss', n: 'Cazador de jefes', d: 'Derrotá 25 jefes', goal: 25, v: S => S.bossTot },
    { id: 'dm', c: 'boss', n: 'Dark Masters', d: 'Derrotá a Piemon, MetalSeadramon y Machinedramon', goal: 3, v: S => S.bossesOf(['piemon', 'metalseadramon', 'machinedramon']) },
    { id: 'vamp', c: 'boss', n: 'Señores de la noche', d: 'Derrotá a Vamdemon, NeoVamdemon y BelialVamdemon', goal: 3, v: S => S.bossesOf(['vamdemon', 'neovamdemon', 'belialvamdemon']) },
    { id: 'show', c: 'boss', n: 'Rey del show', d: 'Derrotá a Etemon, MetalEtemon y KingEtemon', goal: 3, v: S => S.bossesOf(['etemon', 'metaletemon', 'kingetemon']) },
    { id: 'allb', c: 'boss', n: 'Bestiario', d: 'Derrotá a todos los jefes al menos una vez', goal: () => Bosses.data ? Bosses.data.list.length : 26, v: S => S.bossesOf(Bosses.data ? Bosses.data.list.map(b => b.id) : []) },
    { id: 'fast', c: 'boss', n: 'Rápido y furioso', d: 'Derrotá a un jefe en menos de 30 segundos', goal: 1, v: S => S.ax.fast },

    { id: 'st3', c: 'evo', n: 'Digievolución', d: 'Llegá a Campeón', goal: 1, v: S => S.s.bestStage >= 3 ? 1 : 0 },
    { id: 'st5', c: 'evo', n: 'Forma final', d: 'Conseguí tu primera forma final', goal: 1, v: S => S.s.bestStage >= 5 ? 1 : 0 },
    { id: 'perf', c: 'evo', n: 'Perfección', d: 'Hacé 4 evoluciones perfectas en una misma partida', goal: 4, v: S => S.ax.perfRun },
    { id: 'dark', c: 'evo', n: 'Lado oscuro', d: 'Conseguí una evolución oscura', goal: 1, v: S => S.ax.dark },
    { id: 'xa', c: 'evo', n: 'Anticuerpo', d: 'Usá el X-Antibody', goal: 1, v: S => S.ax.xa },
    { id: 'branches', c: 'evo', n: 'Todas las ramas', d: 'Conseguí todas las formas finales de un mismo Digimon', goal: 1, v: S => S.allBranches() },

    { id: 's10', c: 'surv', n: 'Aguante', d: 'Sobreviví 10 minutos', goal: 600, t: 1, v: S => S.s.bestSecs },
    { id: 's20', c: 'surv', n: 'Veterano', d: 'Sobreviví 20 minutos', goal: 1200, t: 1, v: S => S.s.bestSecs },
    { id: 'fin', c: 'surv', n: 'Fin del Digimundo', d: 'Llegá al final con Yggdrasill (30 minutos)', goal: 1, v: S => S.ax.fin },
    { id: 'nohit', c: 'surv', n: 'Intocable', d: 'Aguantá 3 minutos seguidos sin recibir daño', goal: 180, t: 1, v: S => S.ax.noHit },
    { id: 'low5', c: 'surv', n: 'Al borde', d: 'Quedá con menos del 5% de vida y aguantá 10 segundos más', goal: 1, v: S => S.ax.low5 },

    { id: 'egg5', c: 'col', n: 'Criador', d: 'Eclosioná 5 Digitamas', goal: 5, v: S => Object.keys(S.s.unl).length },
    { id: 'allmon', c: 'col', n: 'Digidestinado', d: 'Desbloqueá todos los Digimon', goal: () => CREATURES.filter(c => !STARTERS.includes(c.id)).length, v: S => CREATURES.filter(c => !STARTERS.includes(c.id) && Progress.has(c.id)).length },
    { id: 'an150', c: 'col', n: 'Enciclopedia', d: 'Registrá 150 datos en el Digimon Analyzer', goal: 150, v: () => Progress.seenCount() },
    { id: 'tree', c: 'col', n: 'Árbol completo', d: 'Comprá todos los nodos de un árbol de atributo', goal: 100, pc: 1, v: S => S.treePct() },
    { id: 'bond10', c: 'col', n: 'Vínculo eterno', d: 'Llevá a un Digimon al nivel 10 de vínculo', goal: 10, v: () => Math.max(0, ...CREATURES.map(c => Trees.bondLv(c.id))) },

    { id: 'on1', c: 'on', n: 'Equipo', d: 'Jugá una partida online', goal: 1, v: S => S.ax.online },
    { id: 'on4', c: 'on', n: 'Escuadrón completo', d: 'Jugá una partida online de 4 jugadores', goal: 1, v: S => S.ax.on4 },
    { id: 'rev10', c: 'on', n: 'Salvavidas', d: 'Reviví a 10 compañeros', goal: 10, v: S => S.ax.revs },
    { id: 'team15', c: 'on', n: 'Juntos hasta el final', d: 'Lleguen los 4 vivos a los 15 minutos', goal: 1, v: S => S.ax.team15 },

    { id: 'chal1', c: 'daily', n: 'Retador', d: 'Jugá un desafío diario', goal: 1, v: S => S.ax.chal },
    { id: 'streak7', c: 'daily', n: 'Constante', d: 'Entrá 7 días seguidos', goal: 7, v: S => S.ax.streakBest },
    { id: 'daily3', c: 'daily', n: 'Misiones al día', d: 'Reclamá las 3 misiones diarias en un mismo día', goal: 1, v: S => S.ax.daily3 },
    { id: 'coins', c: 'daily', n: 'Coleccionista de monedas', d: 'Ganá 10.000 monedas en total', goal: 10000, v: S => S.ax.coinsTot },

    { id: 'pac', c: 'secret', secret: 1, n: 'Pacifista', d: 'Sobreviví 1 minuto sin eliminar ningún Digimon', goal: 1, v: S => S.ax.pac },
    { id: 'gate', c: 'secret', secret: 1, n: '¿Dónde está el jefe?', d: 'Dejá que la fisura del Digital Gate se cierre sin entrar', goal: 1, v: S => S.ax.gate },
    { id: 'mono', c: 'secret', secret: 1, n: 'Monotema', d: 'Aguantá 5 minutos usando una sola skill', goal: 1, v: S => S.ax.mono },
  ],

  // ---------- Estado ----------
  st() { const s = Progress.read(); s.ach = s.ach || {}; s.ax = s.ax || {}; return s; },
  ctx() {
    const s = this.st(), ax = s.ax;
    const bossTot = Object.values(s.bosses).reduce((a, v) => a + (v | 0), 0);
    return { s, ax, bossTot,
      bossesOf: ids => ids.filter(id => (s.bosses[id] | 0) > 0).length,
      allBranches: () => CREATURES.some(c => { const C = CreatureLoader.cache[c.id]; return C && C.meta.branches.length && C.meta.branches.every(b => s.seen[c.id + ':branch_' + b.id]); }) ? 1 : 0,
      treePct: () => Math.max(0, ...['vac', 'vir', 'dat'].map(k => { const T = Trees.tree(k); if (!T) return 0;
        const ns = T.nodes.filter(n => n.t !== 'start'); return Math.floor(ns.filter(n => Trees.lv(k, n.id) >= n.m).length / ns.length * 100); })) };
  },
  goalOf(a) { return typeof a.goal === 'function' ? a.goal() : a.goal; },
  valOf(a, S) { try { return Number(a.v(S)) || 0; } catch (e) { return 0; } },

  // revisa todos y avisa los nuevos
  check() {
    if (!Progress.data || this.busy) return;
    this.busy = true;
    try {
      const S = this.ctx(), got = [];
      for (const a of this.LIST) if (!S.s.ach[a.id] && this.valOf(a, S) >= this.goalOf(a)) { S.s.ach[a.id] = Date.now(); got.push(a); }
      if (got.length) { Progress.write(); got.forEach(a => this.toast(a)); this.badge(); }
    } finally { this.busy = false; }
  },
  // marca de una partida (lo que pasa una vez: X-Antibody, fisura cerrada, pacifista...)
  flag(k) { const s = this.st(); if (s.ax[k]) return; s.ax[k] = 1; this.check(); },
  max(k, v) { const s = this.st(); s.ax[k] = Math.max(s.ax[k] | 0, v | 0); },
  add(k, v) { const s = this.st(); s.ax[k] = (s.ax[k] | 0) + (v | 0); },

  // ---------- Partida ----------
  run: null,
  onStart() { this.run = { lowAt: null }; },
  // cada cuadro (anfitrión, local e invitado): lo que se cumple en el momento, con TU jugador
  tick() {
    if (!running || !this.run || !Progress.data) return;
    const q = mine()[0]; if (!q) return;
    const s = this.st().ax;
    // al borde: bajó del 5% de vida y siguió vivo 10 segundos más
    if (q.dead) this.run.lowAt = null;
    else if (this.run.lowAt == null && q.max > 0 && q.hp > 0 && q.hp < q.max * 0.05) this.run.lowAt = t;
    if (this.run.lowAt != null && t - this.run.lowAt >= 10 && !s.low5) this.flag('low5');
    if (t >= 60 && kills === 0 && !q.dead && !s.pac) this.flag('pac');
    if (q.xa && !s.xa) this.flag('xa');
    if (q.dark && !s.dark) this.flag('dark');
    if (isOnline && P.length === 4 && t >= 900 && P.every(x => !x.dead) && !s.team15) this.flag('team15');
    if (q.wp && t >= 300 && Object.keys(q.wp).length === 1 && !s.mono) this.flag('mono');
  },
  // al terminar la partida (después de Progress.onRunEnd, antes de Challenge.onRunEnd)
  onRunEnd(r) {
    if (!Progress.data) return;
    const q = r.me || {};
    this.max('killsRun', r.kills);
    this.max('perfRun', q.pfc);
    this.max('noHit', Math.max((q.vp && q.vp.nhb) || 0, (q.vp && q.vp.nh) || 0));
    this.add('coinsTot', r.coins);
    this.add('revs', q.revs);
    if (r.online) { this.add('online', 1); if (r.n >= 4) this.add('on4', 1); }
    if (r.chal) this.add('chal', 1);
    if (r.fin) this.st().ax.fin = 1;
    if (r.fast) this.st().ax.fast = 1;
    Progress.write(); this.check();
    this.run = null;
  },
  // días seguidos jugando (día argentino, el mismo de las misiones)
  streak() {
    if (typeof Missions === 'undefined' || !Missions.dayKey || !Missions.cat) return;
    const s = this.st(), d = Missions.dayKey(), ax = s.ax;
    if (ax.day === d) return;
    const prev = new Date(d + 'T12:00:00Z'); prev.setUTCDate(prev.getUTCDate() - 1);
    ax.streak = ax.day === prev.toISOString().slice(0, 10) ? (ax.streak | 0) + 1 : 1;
    ax.day = d; ax.streakBest = Math.max(ax.streakBest | 0, ax.streak);
    Progress.write();
  },

  // ---------- Pantalla ----------
  isOpen() { const o = document.getElementById('logros'); return !!o && o.style.display === 'flex'; },
  open() { this.check(); this.build(); document.getElementById('logros').style.display = 'flex'; this.render(); },
  close() { const o = document.getElementById('logros'); if (o) o.style.display = 'none'; },
  build() {
    if (document.getElementById('logros')) return;
    const o = document.createElement('div'); o.id = 'logros';
    o.innerHTML = '<div class="lg-box"><div class="head"><div><h2>Logros</h2><span class="sub">De tu cuenta</span></div>' +
      '<div class="lg-tot"></div><button class="lg-x" aria-label="Cerrar">X</button></div><div id="lg-list"></div></div>';
    document.body.appendChild(o);
    o.querySelector('.lg-x').onclick = () => this.close();
    o.addEventListener('click', e => { if (e.target === o) this.close(); });
  },
  render() {
    const S = this.ctx(), L = this.LIST, done = L.filter(a => S.s.ach[a.id]).length;
    document.querySelector('#logros .lg-tot').innerHTML = '<b>' + done + ' / ' + L.length + '</b><span>conseguidos</span>';
    const fmt = (a, v) => a.t ? Math.floor(v / 60) + ':' + String(Math.floor(v % 60)).padStart(2, '0') : a.pc ? v + '%' : Math.floor(v).toLocaleString('es-AR');
    let h = '';
    for (const [c, cn] of this.CATS) {
      const as = L.filter(a => a.c === c), dn = as.filter(a => S.s.ach[a.id]).length;
      h += '<div class="lg-cat"><div class="lg-ct">' + cn + '<span>' + dn + '/' + as.length + '</span></div>';
      for (const a of as) {
        const ok = !!S.s.ach[a.id], g = this.goalOf(a), v = Math.min(this.valOf(a, S), g), hid = a.secret && !ok;
        h += '<div class="lg-a' + (ok ? ' ok' : '') + (hid ? ' hid' : '') + '"><div class="lg-ic">' + (ok ? '★' : hid ? '?' : '☆') + '</div><div class="lg-in"><b>' + (hid ? 'Logro secreto' : a.n) + '</b>' +
          '<span>' + (hid ? 'Seguí jugando para descubrirlo' : a.d) + '</span>' +
          (ok ? '<em>Conseguido el ' + new Date(S.s.ach[a.id]).toLocaleDateString('es-AR') + '</em>'
            : !hid && g > 1 ? '<div class="lg-bar"><i style="width:' + (v / g * 100) + '%"></i><small>' + fmt(a, v) + ' / ' + fmt(a, g) + '</small></div>' : '') +
          '</div></div>';
      }
      h += '</div>';
    }
    document.getElementById('lg-list').innerHTML = h;
  },
  badge() {
    const b = document.getElementById('lgb'); if (!b || !Progress.data) return;
    const s = this.st(), n = this.LIST.filter(a => s.ach[a.id]).length;
    b.textContent = 'Logros ' + n + '/' + this.LIST.length;
  },
  // aviso arriba al conseguir uno (en partida o en el menú)
  q: [], showing: false,
  toast(a) { this.q.push(a); if (!this.showing) this.next(); },
  next() {
    const a = this.q.shift(); if (!a) { this.showing = false; return; }
    this.showing = true;
    let el = document.getElementById('lg-toast');
    if (!el) { el = document.createElement('div'); el.id = 'lg-toast'; document.body.appendChild(el); }
    el.innerHTML = '<span class="lg-ic">★</span><div><small>¡Logro desbloqueado!</small><b>' + a.n + '</b></div>';
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    if (typeof Sound !== 'undefined') Sound.play('win');
    setTimeout(() => { el.classList.remove('on'); setTimeout(() => this.next(), 400); }, 3600);
    if (this.isOpen()) this.render();
  },

  init() {
    const b = document.getElementById('lgb'); if (b) b.onclick = () => this.open();
    addEventListener('keydown', e => { if (e.key === 'Escape' && this.isOpen()) this.close(); });
    // lo que cambia fuera de la partida: eclosiones, árbol, misiones
    const wrap = (o, k, after) => { if (!o || !o[k]) return; const f = o[k].bind(o); o[k] = (...a) => { const r = f(...a); after(); return r; }; };
    wrap(Progress, 'hatchNow', () => this.check());
    wrap(Trees, 'buy', () => this.check());
    if (typeof Missions !== 'undefined') wrap(Missions, 'claim', () => {
      const s = Missions.state(), all = Missions.today(s.day);
      if (all.length && all.every(m => s.claimed[m.id])) this.flag('daily3');
      this.check();
    });
    const ready = () => { if (!Progress.data || (typeof Missions !== 'undefined' && !Missions.cat)) return setTimeout(ready, 300); this.streak(); this.check(); this.badge(); };
    ready();
    // al iniciar o cerrar sesión cambia el progreso (el de la cuenta): se vuelve a revisar
    const lp = window.loadProg; if (lp) window.loadProg = st => { lp(st); if (Progress.data) { this.streak(); this.check(); this.badge(); } };
  },
};
Achievements.init();

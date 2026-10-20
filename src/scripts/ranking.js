// Ranking: las mejores partidas de todos (pedido: que den ganas de llegar arriba). Botón "Ranking" del menú (#rkb).
// Dos tablas: Solo y Party. Cada cuenta guarda SU mejor partida de cada tabla en Firestore (ranking_solo/{uid} y
// ranking_party/{uid}) vía window.rankCloud (social.js). Se guarda: nick, puntaje, Digimon y forma, skills con su nivel,
// Digimon eliminados, jefes, nivel, tiempo y cantidad de jugadores. No entran las partidas del desafío diario.
// Puntaje = Digimon eliminados + 150 × jefes + 2 × segundos (igual que el desafío). Se carga después de challenge.js.
// Requiere reglas de Firestore: leer con sesión iniciada y escribir solo el documento propio.
const Ranking = {
  tab: 'solo', cache: {},
  score(r) { return Math.round(r.kills + 150 * r.bosses + 2 * r.secs); },
  // al terminar una partida (game.js: endRun), con TU jugador
  onRunEnd(o) {
    if (!window.rankCloud || o.chal || !o.q) return;
    const q = o.q, C = typeof CR === 'function' ? CR(q) : null;
    const skills = Object.keys(q.wp || {}).filter(k => (q.wp[k] | 0) > 0 && SkillSys.def(k)).map(k => [SkillSys.def(k).name, q.wp[k] | 0]);
    const r = { kills: o.kills | 0, bosses: o.bosses | 0, secs: Math.round(o.secs), lvl: o.lvl | 0, players: o.n | 0, cid: q.cid,
      dig: C && C.meta ? C.meta.name || q.cid : q.cid, form: typeof formName === 'function' ? formName(q, q.stage | 0) : '', stage: q.stage | 0, skills };
    r.score = this.score(r);
    window.rankCloud.submit(o.n > 1 ? 'party' : 'solo', r).then(best => { if (best) this.cache = {}; }).catch(e => console.error('Ranking:', e));
  },

  // ---------- Ventana ----------
  build() {
    if (document.getElementById('ranking')) return;
    const o = document.createElement('div'); o.id = 'ranking';
    o.innerHTML = '<div class="rk-box"><div class="head"><div><div class="sub">Las mejores partidas</div><h2>Ranking</h2></div>' +
      '<button class="rk-x" aria-label="Cerrar">X</button></div>' +
      '<div class="rk-tabs"><button data-t="solo">Solo</button><button data-t="party">Party</button></div>' +
      '<p class="rk-note">Puntaje = Digimon eliminados + 150 por jefe + 2 por segundo. Cuenta tu mejor partida de cada tabla. Tocá una fila para ver las skills.</p>' +
      '<div id="rk-list"></div></div>';
    document.body.appendChild(o);
    o.querySelector('.rk-x').onclick = () => this.close();
    o.addEventListener('click', e => { if (e.target === o) this.close(); });
    o.querySelectorAll('.rk-tabs button').forEach(b => b.onclick = () => { this.tab = b.dataset.t; this.render(); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && this.isOpen()) this.close(); });
  },
  isOpen() { const o = document.getElementById('ranking'); return !!o && o.style.display === 'flex'; },
  open() { this.build(); document.getElementById('ranking').style.display = 'flex'; this.render(); },
  close() { const o = document.getElementById('ranking'); if (o) o.style.display = 'none'; },
  esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); },
  time(s) { return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); },
  async render() {
    const L = document.getElementById('rk-list'); if (!L) return;
    document.querySelectorAll('#ranking .rk-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === this.tab));
    if (!window.rankCloud) { L.innerHTML = '<p class="rk-msg">Iniciá sesión con Google para ver el ranking y entrar en él.</p>'; return; }
    const tab = this.tab; L.innerHTML = '<p class="rk-msg">Cargando…</p>';
    let rows;
    try { rows = this.cache[tab] || (this.cache[tab] = await window.rankCloud.top(tab)); }
    catch (e) { console.error('Ranking:', e); L.innerHTML = '<p class="rk-msg">No se pudo leer el ranking (¿faltan las reglas de Firestore?).</p>'; return; }
    if (tab !== this.tab) return;
    if (!rows.length) { L.innerHTML = '<p class="rk-msg">Todavía no hay partidas. ¡Jugá una y quedá primero!</p>'; return; }
    L.innerHTML = '<div class="rk-row rk-hd"><span>#</span><span>Tamer</span><span>Digimon</span><span>Puntaje</span><span>Eliminados</span><span>Jefes</span><span>Nivel</span><span>Tiempo</span></div>' +
      rows.map((r, i) => '<div class="rk-row' + (r.me ? ' me' : '') + (i < 3 ? ' top' + (i + 1) : '') + '" data-i="' + i + '">' +
        '<span>' + (i + 1) + '</span><span>' + this.esc(r.nick) + (r.players > 1 ? ' <small>(' + r.players + ' jug.)</small>' : '') + '</span>' +
        '<span>' + this.esc(r.form || r.dig) + '</span><span><b>' + (r.score | 0).toLocaleString('es-AR') + '</b></span>' +
        '<span>' + (r.kills | 0) + '</span><span>' + (r.bosses | 0) + '</span><span>' + (r.lvl | 0) + '</span><span>' + this.time(r.secs | 0) + '</span>' +
        '<div class="rk-sk">' + ((r.skills || []).map(s => '<em>' + this.esc(s[0]) + ' <b>Nv ' + (s[1] | 0) + '</b></em>').join('') || '<em>Sin skills</em>') + '</div></div>').join('');
    L.querySelectorAll('.rk-row[data-i]').forEach(d => d.onclick = () => d.classList.toggle('open'));
  },
  init() { const b = document.getElementById('rkb'); if (b) b.onclick = () => this.open(); }
};
Ranking.init();

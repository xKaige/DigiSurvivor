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
    // Firestore no admite arrays dentro de arrays. El id permite recuperar el ícono y la descripción de cada técnica.
    const skills = Object.keys(q.wp || {}).filter(k => (q.wp[k] | 0) > 0 && SkillSys.def(k)).map(k => ({ id: k, name: SkillSys.def(k).name, level: q.wp[k] | 0 }));
    const r = { kills: o.kills | 0, bosses: o.bosses | 0, secs: Math.round(o.secs), lvl: o.lvl | 0, players: o.n | 0, cid: q.cid,
      dig: C && C.meta ? C.meta.name || q.cid : q.cid, form: typeof formName === 'function' ? formName(q, q.stage | 0) : '', stage: q.stage | 0, skills };
    r.score = this.score(r);
    return window.rankCloud.submit(o.n > 1 ? 'party' : 'solo', r).then(best => { if (best) this.cache = {}; }).catch(e => console.error('Ranking:', e));
  },

  // ---------- Ventana ----------
  build() {
    if (document.getElementById('ranking')) return;
    const o = document.createElement('div'); o.id = 'ranking'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Ranking');
    o.innerHTML = '<div class="rk-box"><div class="head"><div><div class="sub">Las mejores partidas</div><h2>Ranking</h2></div>' +
      '<button class="rk-x" aria-label="Cerrar">X</button></div>' +
      '<div class="rk-tabs"><button data-t="solo">Solo</button><button data-t="party">Party</button></div>' +
      '<p class="rk-note">Tu mejor partida en cada modalidad. Puntaje = Digimon eliminados + 150 por jefe + 2 por segundo.</p>' +
      '<div id="rk-list" aria-live="polite"></div></div>';
    document.body.appendChild(o);
    o.querySelector('.rk-x').onclick = () => this.close();
    o.addEventListener('click', e => { if (e.target === o) this.close(); });
    o.querySelectorAll('.rk-tabs button').forEach(b => b.onclick = () => { this.tab = b.dataset.t; this.render(); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && this.isOpen()) this.close(); });
  },
  isOpen() { const o = document.getElementById('ranking'); return !!o && o.style.display === 'flex'; },
  open() { this.build(); document.getElementById('ranking').style.display = 'flex'; this.render(true); },
  close() { const o = document.getElementById('ranking'); if (o) o.style.display = 'none'; },
  esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); },
  text(s) { return typeof s === 'string' ? s.trim() : ''; },
  number(n) { return n != null && n !== '' && Number.isFinite(Number(n)) && Number(n) >= 0 ? Math.floor(Number(n)) : null; },
  num(n) { const v = this.number(n); return v == null ? '—' : v.toLocaleString('es-AR'); },
  time(s) { s = this.number(s); return s == null ? '—' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },
  // Lee tanto las partidas nuevas como las antiguas, que guardaban [nombre, nivel].
  skillsOf(raw) {
    const cat = (SkillSys.cat && SkillSys.cat.skills) || {};
    return (Array.isArray(raw) ? raw : []).filter(s => s && typeof s === 'object').map(s => {
      const name = this.text(Array.isArray(s) ? s[0] : s.name), key = this.text(s.id);
      const id = Object.hasOwn(cat, key) ? key : Object.keys(cat).find(k => cat[k].name === name) || '';
      return { id, name: (cat[id] && cat[id].name) || name, level: this.number(Array.isArray(s) ? s[1] : s.level), def: cat[id] };
    }).filter(s => s.name);
  },
  skillPreview(raw) {
    const skills = this.skillsOf(raw);
    if (!skills.length) return '<span class="rk-empty-sk">Sin habilidades registradas</span>';
    return '<ul class="rk-sk">' + skills.map(s => {
      const d = s.def, info = d ? SkillSys.typeOf(d) + ' · ' + (this.text(d.desc) || 'Sin descripción disponible') : 'Sin descripción disponible';
      return '<li style="--sk:' + (d ? SkillSys.col(d) : '#9fc0d6') + '"><img src="' + this.esc(SkillSys.iconOf(d || {})) + '" alt="">' +
        '<span><b>' + this.esc(s.name) + '</b><small>Nv ' + this.num(s.level) + '</small></span><span class="rk-tip">' + this.esc(info) + '</span></li>';
    }).join('') + '</ul>';
  },
  row(r, i) {
    const cid = this.text(r.cid), C = Object.hasOwn(CreatureLoader.cache, cid) ? CreatureLoader.cache[cid] : null, st = C && C.meta.stages[this.number(r.stage)];
    const form = this.text(r.form) || (st && st.name) || this.text(r.dig) || 'Sin Digimon registrado';
    const players = this.number(r.players), nick = this.text(r.nick) || 'Sin nombre';
    const stats = [['Eliminados', this.num(r.kills)], ['Jefes', this.num(r.bosses)], ['Nivel', this.num(r.lvl)], ['Tiempo', this.time(r.secs)]];
    return '<tbody class="rk-entry' + (r.me ? ' me' : '') + (i < 3 ? ' top' + (i + 1) : '') + '"><tr class="rk-main">' +
      '<th class="rk-place" scope="row">' + (i + 1) + '</th>' +
      '<td class="rk-tamer"><b>' + this.esc(nick) + '</b><small>' + (r.me ? '<span class="rk-you">Vos</span> ' : '') + (players > 1 ? players + ' jugadores' : 'Individual') + '</small></td>' +
      '<td class="rk-score"><span class="rk-mobile-label">Puntaje</span><strong>' + this.num(r.score) + '</strong><small>puntos</small></td>' +
      '<td class="rk-dig"><span class="rk-mobile-label">Digimon</span>' + this.esc(form) + '</td>' +
      '<td class="rk-stats"><dl>' + stats.map(([label, value]) => '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>').join('') + '</dl></td></tr>' +
      '<tr class="rk-sk-row"><td colspan="5"><span class="rk-sk-label">Habilidades usadas</span>' + this.skillPreview(r.skills) + '</td></tr></tbody>';
  },
  async render(refresh = false) {
    const L = document.getElementById('rk-list'); if (!L) return;
    const cloud = window.rankCloud, seq = this.seq = (this.seq || 0) + 1;
    if (this.source !== cloud) { this.source = cloud; this.cache = {}; }
    document.querySelectorAll('#ranking .rk-tabs button').forEach(b => { b.classList.toggle('on', b.dataset.t === this.tab); b.setAttribute('aria-pressed', b.dataset.t === this.tab); });
    if (!cloud) { L.innerHTML = '<p class="rk-msg">Iniciá sesión con Google para ver el ranking y entrar en él.</p>'; return; }
    const tab = this.tab; L.innerHTML = '<p class="rk-msg">Cargando…</p>';
    let rows;
    try { rows = !refresh && this.cache[tab] || await cloud.top(tab); }
    catch (e) {
      if (seq !== this.seq || cloud !== window.rankCloud) return;
      console.error('Ranking:', e); L.innerHTML = '<p class="rk-msg">No se pudo cargar el ranking. Intentá nuevamente.</p><button class="rk-retry">Reintentar</button>';
      L.querySelector('button').onclick = () => this.render(true); return;
    }
    if (seq !== this.seq || cloud !== window.rankCloud) return;
    rows = this.cache[tab] = (Array.isArray(rows) ? rows : []).filter(r => r && typeof r === 'object' && !Array.isArray(r));
    if (!rows.length) { L.innerHTML = '<p class="rk-msg">Todavía no hay partidas. ¡Jugá una y quedá primero!</p>'; return; }
    L.innerHTML = '<table class="rk-table"><caption>Mejores partidas · ' + (tab === 'party' ? 'Party' : 'Solo') + '</caption>' +
      '<thead><tr><th scope="col">#</th><th scope="col">Tamer</th><th scope="col">Puntaje</th><th scope="col">Digimon</th><th scope="col">Partida</th></tr></thead>' +
      rows.map((r, i) => this.row(r, i)).join('') + '</table>';
    L.querySelectorAll('.rk-sk li').forEach(li => { li.tabIndex = 0; });
    L.querySelectorAll('.rk-sk img').forEach(img => { img.onerror = () => { img.onerror = null; img.src = SkillSys.iconOf({}); }; });
  },
  init() { const b = document.getElementById('rkb'); if (b) b.onclick = () => this.open(); }
};
Ranking.init();

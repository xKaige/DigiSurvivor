// Report: botón "Reportar un error" (menú y pausa). Manda el texto y datos del juego a /api/report (función de Vercel,
// api/report.js), que lo carga como Issue en GitHub. Junta solo: versión, navegador, pantalla, Digimon, minuto de la
// partida, si es online y los últimos errores de la consola. Se carga después de game.js.
const Report = {
  errs: [],
  init() {
    // últimos errores de la consola (van en el reporte para encontrar el problema más rápido)
    addEventListener('error', e => this.errs.push((e.message || 'error') + ' @ ' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || '')));
    addEventListener('unhandledrejection', e => this.errs.push('promesa: ' + String((e.reason && e.reason.message) || e.reason).slice(0, 160)));
    const add = (where, before) => {
      const box = document.getElementById(where); if (!box) return;
      const b = document.createElement('button'); b.className = 'rp-open'; b.textContent = 'Reportar un error';
      b.onclick = () => this.open();
      if (before && document.getElementById(before)) box.insertBefore(b, document.getElementById(before)); else box.appendChild(b);
    };
    add('mnu');
    const pq = document.getElementById('pquit'); if (pq) { const b = document.createElement('button'); b.id = 'prep'; b.textContent = 'Reportar un error'; b.onclick = () => this.open(); pq.before(b); }
  },
  info() {
    const q = typeof P !== 'undefined' && P && (typeof mine === 'function' ? mine()[0] : P[0]);
    const i = {
      'Versión': typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : '?',
      'Navegador': navigator.userAgent,
      'Pantalla': innerWidth + '×' + innerHeight + ' (dpr ' + (devicePixelRatio || 1) + ')' + (matchMedia('(pointer:coarse)').matches ? ' táctil' : ''),
      'Página': location.href.split('#')[0]
    };
    if (typeof running !== 'undefined' && running && q) {
      i['Partida'] = Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0') + ' · nivel ' + lvl + ' · ' + (isOnline ? 'online (' + P.length + ' jugadores)' : '1 jugador');
      i['Digimon'] = q.cid + ' · ' + (typeof formName === 'function' ? formName(q, q.stage | 0) : '') + ' · etapa ' + (q.stage | 0);
      i['Enemigos'] = en.length + (World.arena ? ' (en la arena del jefe)' : '');
    } else if (typeof selected !== 'undefined' && selected) i['Digimon elegido'] = selected;
    if (this.errs.length) i['Errores de la consola'] = this.errs.slice(-5).join(' | ');
    return i;
  },
  build() {
    if (document.getElementById('report')) return;
    const o = document.createElement('div'); o.id = 'report';
    o.innerHTML = '<div class="rp-box"><div class="rp-head"><h2>Reportar</h2><button class="rp-x" aria-label="Cerrar">X</button></div>' +
      '<div class="rp-kinds"><label><input type="radio" name="rpk" value="bug" checked> Error</label><label><input type="radio" name="rpk" value="idea"> Idea</label><label><input type="radio" name="rpk" value="other"> Otro</label></div>' +
      '<textarea id="rp-text" maxlength="4000" placeholder="Contá qué pasó: qué estabas haciendo, qué esperabas y qué pasó en cambio."></textarea>' +
      '<input id="rp-web" name="web" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<p class="rp-note">Junto con tu mensaje se envían la versión, el navegador, la pantalla, tu Digimon, el minuto de la partida y los últimos errores. No se envía nada personal.</p>' +
      '<div class="rp-foot"><span id="rp-msg"></span><button id="rp-send">Enviar</button></div></div>';
    document.body.appendChild(o);
    o.querySelector('.rp-x').onclick = () => this.close();
    o.addEventListener('click', e => { if (e.target === o) this.close(); });
    o.querySelector('#rp-send').onclick = () => this.send();
    // las teclas que escribís no mueven al Digimon
    o.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') this.close(); });
  },
  open() { this.build(); const o = document.getElementById('report'); o.style.display = 'flex'; document.getElementById('rp-msg').textContent = ''; document.getElementById('rp-text').focus(); },
  close() { const o = document.getElementById('report'); if (o) o.style.display = 'none'; },
  async send() {
    const ta = document.getElementById('rp-text'), msg = document.getElementById('rp-msg'), btn = document.getElementById('rp-send');
    const text = ta.value.trim();
    if (text.length < 10) { msg.textContent = 'Contá un poco más (10 letras como mínimo)'; return; }
    if (Date.now() - (this.last || 0) < 30000) { msg.textContent = 'Esperá unos segundos antes de mandar otro'; return; }
    btn.disabled = true; msg.textContent = 'Enviando…';
    const kind = (document.querySelector('#report input[name=rpk]:checked') || {}).value || 'bug';
    try {
      const r = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, kind, info: this.info(), web: document.getElementById('rp-web').value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || ('error ' + r.status));
      this.last = Date.now(); ta.value = '';
      msg.textContent = '¡Gracias! Quedó cargado' + (j.n ? ' (#' + j.n + ')' : '') + '.';
      setTimeout(() => this.close(), 1800);
    } catch (e) {
      msg.textContent = 'No se pudo enviar: ' + e.message;
    }
    btn.disabled = false;
  }
};
Report.init();

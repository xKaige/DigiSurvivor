// Progresión permanente: Digimon bloqueados, Digitamas (huevos), eclosión y el Digimon Analyzer.
// Se carga DESPUÉS de game.js (y de bosses.js) y usa sus globals en tiempo de ejecución
// (CREATURES, CreatureLoader, Bosses, ELC, ATTR, elOf, running, setPick, renderSel).
//
// - Al empezar solo se pueden usar STARTERS (Guilmon, Renamon, Terriermon), como en Digimon Tamers.
// - Cada Digimon bloqueado tiene una misión permanente en src/data/unlocks.json. Al cumplirla ganás su Digitama;
//   el huevo queda listo y lo hacés eclosionar tocándolo en el Digimon Analyzer (solapa Digitamas): animación y desbloqueo.
// - El Analyzer registra cada forma que usaste (etapas y formas finales) y cada jefe que derrotaste.
// - Se guarda en el navegador (localStorage 'digisurvivor_prog') y, con sesión iniciada, en la cuenta
//   (Firestore users/{uid}.prog, vía window.onProgSave de firebase.js). Al iniciar sesión manda lo de la cuenta (loadProg).
const STARTERS = ['001_guilmon', '002_renamon', '003_terriermon'];
const STAGE_NAMES = ['Bebé', 'Bebé II', 'Novato', 'Campeón', 'Perfecto', 'Final'];
// Rango de Tamer: experiencia de cuenta que suma cada partida. Al subir de rango ganás monedas (100 × rango).
const RANKS = [
  { xp: 0, n: 'Tamer Novato' }, { xp: 300, n: 'Tamer Aprendiz' }, { xp: 1000, n: 'Tamer' }, { xp: 2500, n: 'Tamer Veterano' },
  { xp: 5000, n: 'Niño Elegido' }, { xp: 9000, n: 'Guardián del Digimundo' }, { xp: 15000, n: 'Caballero Real' }, { xp: 25000, n: 'Leyenda Digital' }
];

const Progress = {
  KEY: 'digisurvivor_prog',
  data: null,
  st: null,
  hatchQ: [],

  async load() {
    const r = await fetch('src/data/unlocks.json');
    if (!r.ok) throw new Error('No se encontró src/data/unlocks.json (' + r.status + ')');
    this.data = await r.json();
    this.activate();   // en memoria: se guarda en la próxima escritura (no pisar lo de la cuenta antes de loadProg)
  },

  // ---------- Estado guardado ----------
  blank() { return { txp: 0, kills: 0, runs: 0, bestStage: 0, bestSecs: 0, cidKills: {}, cidStage: {}, bosses: {}, seen: {}, eggs: {}, unl: {}, hatchQ: [], act: {}, pv: {} }; },
  read() {
    if (this.st) return this.st;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) {}
    this.st = Object.assign(this.blank(), s || {});
    for (const cid in this.st.unl) this.st.seen[cid + ':stage_0'] = 1;   // al eclosionar ya conocés su forma bebé
    return this.st;
  },
  write() { try { localStorage.setItem(this.KEY, JSON.stringify(this.st)); } catch (e) {} if (window.onProgSave) window.onProgSave(this.st); this.badge(); },
  // aviso en el botón del Analyzer: cuántos Digitamas están listos para eclosionar
  badge() {
    const b = document.getElementById('anb'); if (!b) return;
    const n = Object.keys(this.read().eggs).length;
    let bd = b.querySelector('.bd'); if (bd) bd.remove();
    if (n) { bd = document.createElement('span'); bd.className = 'bd'; bd.textContent = n; b.appendChild(bd); }
  },
  // eclosión a pedido (clic en el Analyzer): desbloquea y muestra la animación
  hatchNow(cid) {
    const s = this.read(); if (!s.eggs[cid] || this.hatching || running) return;
    delete s.eggs[cid]; s.unl[cid] = 1; s.seen[cid + ':stage_0'] = 1; s.hatchQ.push(cid);
    this.write(); this.showHatch();
  },
  reset() { this.st = this.blank(); this.write(); },   // lo usa el reinicio de progreso (RESET_BEFORE en game.js)

  has(cid) { return STARTERS.includes(cid) || !!this.read().unl[cid]; },
  unlockOf(cid) { return this.data && this.data.unlocks.find(u => u.cid === cid); },
  eggOf(cid) { return this.data && this.data.eggs[cid] || 'egg_01'; },

  // ---------- Rango de Tamer ----------
  rank(xpv = this.read().txp) {
    let i = 0; while (i + 1 < RANKS.length && xpv >= RANKS[i + 1].xp) i++;
    const nx = RANKS[i + 1];
    return { i, n: RANKS[i].n, xp: xpv, from: RANKS[i].xp, to: nx ? nx.xp : null };
  },
  renderRank() {
    let el = document.getElementById('rank');
    if (!el) {
      const w = document.getElementById('wal'); if (!w) return;
      el = document.createElement('div'); el.id = 'rank'; w.parentNode.insertBefore(el, w.nextSibling);
    }
    const r = this.rank(), f = r.to ? (r.xp - r.from) / (r.to - r.from) : 1;
    el.innerHTML = '<span class="rk-i">' + (r.i + 1) + '</span><div class="rk-t"><b>' + r.n + '</b><div class="rk-bar"><i style="width:' + (f * 100).toFixed(1) + '%"></i></div>' +
      '<small>' + (r.to ? r.xp + ' / ' + r.to + ' XP de Tamer' : 'Rango máximo · ' + r.xp + ' XP') + '</small></div>';
  },

  // ---------- Analyzer ----------
  see(cid, key) { const s = this.read(), k = cid + ':' + key; if (!s.seen[k]) { s.seen[k] = 1; this.write(); } },
  seenCount() { const s = this.read(); return Object.keys(s.seen).length + Object.keys(s.bosses).length; },
  // formas que registra el Analyzer: etapas, formas finales, evolución oscura y formas X-Antibody
  forms(C) {
    const M = C.meta;
    return [...M.stages.map(x => ({ k: 'stage_' + x.stage, n: x.name })), ...M.branches.map(x => ({ k: 'branch_' + x.id, n: x.name, fin: 1 })),
      { k: 'dark', n: darkName(C), fin: 1, dk: 1 }, ...Object.keys(M.x || {}).map(k => ({ k: 'x_' + k, n: M.x[k].name, fin: 1, xx: 1 }))];
  },
  totalData() {
    let n = 0;
    for (const c of CREATURES) { const C = CreatureLoader.cache[c.id]; if (C) n += this.forms(C).length; }
    return n + (Bosses.data ? Bosses.data.list.length : 0);
  },

  // ---------- Misiones de desbloqueo ----------
  // ---------- Misiones en orden ----------
  // Solo cuentan las primeras `active` (3) sin cumplir, en el orden de unlocks.json. Las de récord (BEST) se cumplen
  // en UNA partida jugada mientras están activas (s.pv); las que suman cuentan desde que se activaron (s.act = base).
  BEST: ['reach_stage', 'survive', 'stage_with'],
  active() {
    const s = this.read(), out = [];
    if (!this.data) return out;
    for (const u of this.data.unlocks) {
      if (this.has(u.cid) || s.eggs[u.cid]) continue;
      out.push(u); if (out.length >= (this.data.active || 3)) break;
    }
    return out;
  },
  isActive(u) { return this.active().includes(u); },
  // fija la base de las misiones que se acaban de activar (las que suman arrancan de 0)
  activate() { const s = this.read(); for (const u of this.active()) if (s.act[u.cid] == null) s.act[u.cid] = this.raw(u); },
  value(u) {
    const s = this.read();
    if (this.BEST.includes(u.type)) return s.pv[u.cid] | 0;
    if (u.type === 'analyzer') return this.raw(u);
    return s.act[u.cid] == null ? 0 : Math.max(0, this.raw(u) - s.act[u.cid]);
  },
  // valor de toda la vida (estadísticas acumuladas)
  raw(u) {
    const s = this.read();
    switch (u.type) {
      case 'reach_stage': return s.bestStage;
      case 'survive': return s.bestSecs;
      case 'kills_total': return s.kills;
      case 'runs_total': return s.runs;
      case 'kills_with': return s.cidKills[u.with] | 0;
      case 'stage_with': return s.cidStage[u.with] | 0;
      case 'boss': return s.bosses[u.boss] | 0;
      case 'analyzer': return this.seenCount();
    }
    return 0;
  },
  progText(u) {
    const v = Math.min(this.value(u), u.goal);
    if (u.type === 'reach_stage' || u.type === 'stage_with') return v >= u.goal ? '¡Lograda!' : 'Mejor etapa: ' + (v ? STAGE_NAMES[v] : '—') + ' / ' + STAGE_NAMES[u.goal];
    if (u.type === 'survive') { const f = x => Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0'); return f(v) + ' / ' + f(u.goal); }
    return v + ' / ' + u.goal;
  },
  // estado de un Digimon: 'open' (desbloqueado), 'egg' (tenés el huevo, incubando) o 'lock' (falta la misión)
  state(cid) { const s = this.read(); return this.has(cid) ? 'open' : s.eggs[cid] ? 'egg' : 'lock'; },
  stateText(cid) {
    const s = this.read(), e = s.eggs[cid];
    if (this.has(cid)) return 'Desbloqueado';
    if (e) return '¡Listo para eclosionar! Tocalo en el Digimon Analyzer (solapa Digitamas)';
    const u = this.unlockOf(cid);
    if (u && !this.isActive(u)) return 'Misión bloqueada: primero cumplí las anteriores (hay ' + (this.data.active || 3) + ' activas a la vez)';
    return 'Misión activa: cumplila para conseguir su Digitama (máximo ' + (this.data.perRun || 1) + ' por partida)';
  },

  // Se llama al terminar cada partida. r = { kills, secs, pl: [{cid, stage}] (tus jugadores), bosses: [ids] }
  // Devuelve { eggs: [unlock] nuevos, hatched: [cid] } y deja en cola la animación de eclosión.
  onRunEnd(r) {
    if (!this.data) return { eggs: [], hatched: [], txp: 0, rankUp: null, reward: 0 };
    this.activate();   // por si alguna recién se activó (su base es lo de antes de esta partida)
    const s = this.read(), hatched = [], eggs = [];
    const r0 = this.rank(s.txp).i, txp = (r.kills | 0) + Math.floor(r.secs / 3) + 40 * r.bosses.length + 15 * Math.max(0, ...r.pl.map(q => q.stage));
    s.txp += txp;
    const r1 = this.rank(s.txp), reward = r1.i > r0 ? 100 * (r1.i - r0) * r1.i : 0;
    if (reward) { save.coins += reward; persist(); wal(); }
    s.kills += r.kills | 0; s.runs++;
    s.bestSecs = Math.max(s.bestSecs, Math.floor(r.secs));
    for (const q of r.pl) {
      s.bestStage = Math.max(s.bestStage, q.stage);
      s.cidStage[q.cid] = Math.max(s.cidStage[q.cid] | 0, q.stage);
      s.cidKills[q.cid] = (s.cidKills[q.cid] | 0) + (r.kills | 0);
    }
    for (const id of r.bosses) s.bosses[id] = (s.bosses[id] | 0) + 1;
    // récords de esta partida para las misiones activas (las de récord se cumplen en una sola partida)
    const act = this.active();
    for (const u of act) {
      if (!this.BEST.includes(u.type)) continue;
      const v = u.type === 'survive' ? Math.floor(r.secs) : u.type === 'reach_stage' ? Math.max(0, ...r.pl.map(q => q.stage))
        : Math.max(0, ...r.pl.filter(q => q.cid === u.with).map(q => q.stage));
      s.pv[u.cid] = Math.max(s.pv[u.cid] | 0, v);
    }
    // como mucho `perRun` Digitamas por partida, en orden (se eclosionan a pedido desde el Analyzer: hatchNow)
    for (const u of act) {
      if (eggs.length >= (this.data.perRun || 1)) break;
      if (this.value(u) < u.goal) continue;
      s.eggs[u.cid] = { left: 1 }; eggs.push(u);
    }
    this.activate();   // las que entran ahora arrancan de cero (no cuenta lo de esta partida)
    this.write(); this.renderRank();
    return { eggs, hatched, txp, rankUp: r1.i > r0 ? r1.n : null, reward };
  },

  // ---------- Dibujos ----------
  // huevo animado (tira de 20 cuadros de 24×29), escalado entero
  eggHtml(cid, sc = 3, cls = '') {
    return '<span class="egg ' + cls + '" style="--s:' + sc + ';background-image:url(assets/sprites/eggs/' + this.eggOf(cid) + '.png)"></span>';
  },
  thumb(C, key, h = 48) {
    const s = C && (key === 'dark' && C.meta ? darkSpr(C) : C.canvases[key]); if (!s) return '';
    const fw = s.canvas.width / s.cols, fh = s.canvas.height / s.rows;
    const c = document.createElement('canvas'); c.width = fw; c.height = fh;
    c.getContext('2d').drawImage(s.canvas, 0, 0, fw, fh, 0, 0, fw, fh);
    return '<img src="' + c.toDataURL() + '" style="height:' + h + 'px" alt="">';
  },
  rookie(cid) { const C = CreatureLoader.cache[cid]; return C ? (C.meta.stages[2] || C.meta.stages[0]).name : '???'; },
  // panel de la selección para un Digimon bloqueado (lo usa pickShow de game.js)
  lockedDetail(cid) {
    const u = this.unlockOf(cid), st = this.state(cid);
    let h = '<div class="pk-spr egg-spr">' + this.eggHtml(cid, 6) + '<span class="pk-viewing">Digitama</span></div>' +
      '<b class="pk-name">' + (st === 'egg' ? 'Digitama' : '???') + '</b>';
    if (u) {
      const v = this.value(u);
      h += '<div class="pk-lbl">Misión de desbloqueo</div><div class="ul-ms"><b>' + u.name + '</b><span>' + u.desc + '</span>' +
        '<div class="ul-bar"><i style="width:' + Math.min(100, v / u.goal * 100) + '%"></i><em>' + this.progText(u) + '</em></div></div>';
    }
    return h + '<span class="pc-type ul-st">' + this.stateText(cid) + '</span>';
  },

  // ---------- Eclosión (en el menú, después de la partida) ----------
  showHatch() {
    const s = this.read();
    if (running || this.hatching || !s.hatchQ.length) return;
    const cid = s.hatchQ[0], C = CreatureLoader.cache[cid];
    if (!C) return;   // todavía no cargaron los sprites: game.js la vuelve a pedir al terminar de cargar
    this.hatching = true;
    let w = document.getElementById('hatch');
    if (!w) { w = document.createElement('div'); w.id = 'hatch'; document.body.appendChild(w); }
    w.innerHTML = '<div class="hbox"><small>Digitama</small><h2>¡Se está moviendo!</h2><div class="hstage">' + this.eggHtml(cid, 7, 'fast') + '</div>' +
      '<p class="hmsg"></p><div class="hbtns"></div></div>';
    w.style.display = 'flex';
    const stage = w.querySelector('.hstage'), M = C.meta;
    setTimeout(() => stage.classList.add('flash'), 1700);
    setTimeout(() => {
      // nace el bebé (etapa 0), dibujado en grande y animado
      const S = C.canvases.stage_0, fw = S.canvas.width / S.cols, fh = S.canvas.height / S.rows, sc = Math.max(1, Math.floor(200 / Math.max(fw, fh)));
      // se cambia el huevo por el bebé (el destello de .flash sigue encima y se desvanece solo)
      stage.querySelector('.egg').remove();
      stage.insertAdjacentHTML('afterbegin', '<canvas width="' + fw * sc + '" height="' + fh * sc + '"></canvas>');
      const g = stage.firstChild.getContext('2d'); g.imageSmoothingEnabled = false;
      let f = 0; const paint = () => { g.clearRect(0, 0, fw * sc, fh * sc); g.drawImage(S.canvas, f * fw, 0, fw, fh, 0, 0, fw * sc, fh * sc); f = 1 - f; };
      paint(); clearInterval(this.ha); this.ha = setInterval(paint, 380);
      w.querySelector('h2').textContent = '¡Nació ' + M.stages[0].name + '!';
      w.querySelector('.hmsg').innerHTML = 'Ya podés elegir a <b style="color:' + ELC[elOf(cid)] + '">' + this.rookie(cid) + '</b> como compañero.';
      const bt = w.querySelector('.hbtns');
      bt.innerHTML = '<button class="hok">Elegir a ' + this.rookie(cid) + '</button><button class="hno">Seguir</button>';
      const done = pick => {
        clearInterval(this.ha); w.style.display = 'none'; this.hatching = false;
        s.hatchQ.shift(); this.write();
        if (pick && window.setPick) window.setPick(cid);
        if (this.isOpen()) this.render();   // el Analyzer se actualiza (el huevo pasa a Compañeros)
        this.showHatch();   // si hay más huevos, sigue el próximo
      };
      bt.querySelector('.hok').onclick = () => done(true);
      bt.querySelector('.hno').onclick = () => done(false);
      bt.querySelector('.hok').focus();
    }, 2100);
  },

  // ---------- Ventana del Digimon Analyzer ----------
  tab: 'mon',
  build() {
    if (document.getElementById('analyzer')) return;
    const w = document.createElement('div'); w.id = 'analyzer';
    w.innerHTML = '<div class="box"><div class="head"><div class="ttl"><h2>Digimon Analyzer</h2><small>Registro de datos digitales</small></div>' +
      '<div class="reset">Datos<b id="an-n">0 / 0</b></div><button id="an-x" aria-label="Cerrar">X</button></div>' +
      '<div class="an-tabs"><button data-t="mon">Compañeros</button><button data-t="egg">Digitamas</button><button data-t="boss">Jefes</button></div>' +
      '<div id="an-list"></div><div class="foot">Cada forma que alcanzás y cada jefe que derrotás quedan registrados. Los Digimon bloqueados se consiguen cumpliendo su misión: ganás su Digitama y lo hacés eclosionar acá, en la solapa Digitamas.</div></div>';
    document.body.appendChild(w);
    document.getElementById('an-x').onclick = () => this.close();
    w.onclick = e => { if (e.target === w) this.close(); };
    w.querySelectorAll('.an-tabs button').forEach(b => b.onclick = () => { this.tab = b.dataset.t; this.render(); });
  },
  open() {
    this.build();
    if (Object.keys(this.read().eggs).length) this.tab = 'egg';   // si hay huevos listos, abre directo en Digitamas
    this.render(); document.getElementById('analyzer').style.display = 'flex';
  },
  close() { const w = document.getElementById('analyzer'); if (w) w.style.display = 'none'; },
  isOpen() { const w = document.getElementById('analyzer'); return !!w && w.style.display === 'flex'; },
  render() {
    const list = document.getElementById('an-list'); if (!list) return;
    const s = this.read();
    document.getElementById('an-n').textContent = this.seenCount() + ' / ' + this.totalData();
    document.querySelectorAll('#analyzer .an-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === this.tab));
    let h = '';
    if (this.tab === 'mon' || this.tab === 'egg') {
      // Compañeros: solo los desbloqueados. Digitamas: los que faltan, con su misión.
      for (const c of CREATURES) {
        const C = CreatureLoader.cache[c.id]; if (!C) continue;
        const M = C.meta, st = this.state(c.id), el = elOf(c.id);
        if ((st === 'open') !== (this.tab === 'mon')) continue;
        if (st !== 'open') {
          const u = this.unlockOf(c.id), v = u ? this.value(u) : 0;
          const ok = st === 'egg';   // misión cumplida: se puede eclosionar con un clic
          h += '<div class="an-row lockd' + (ok ? ' ready" data-cid="' + c.id : '') + '"><div class="an-egg">' + this.eggHtml(c.id, 2, ok ? 'fast' : '') + '</div><div class="an-info"><b>' + (ok ? 'Digitama' : '???') + '</b>' +
            (u ? '<span class="desc">' + u.name + ': ' + u.desc + '</span><div class="ul-bar"><i style="width:' + Math.min(100, v / u.goal * 100) + '%"></i><em>' + this.progText(u) + '</em></div>' : '') +
            '<span class="an-st">' + this.stateText(c.id) + '</span></div>' + (ok ? '<button class="an-hatch">Eclosionar</button>' : '') + '</div>';
          continue;
        }
        const forms = this.forms(C);
        const got = forms.filter(f => s.seen[c.id + ':' + f.k]).length;
        h += '<div class="an-row" style="--ac:' + ELC[el] + '"><div class="an-info"><b>' + this.rookie(c.id) + ' <small>' + ATTR[el] + ' · ' + got + '/' + forms.length + '</small></b><div class="an-forms">' +
          forms.map(f => { const ok = s.seen[c.id + ':' + f.k]; return '<span class="an-f' + (ok ? '' : ' no') + (f.fin ? ' fin' : '') + (f.dk ? ' dk' : '') + (f.xx ? ' xx' : '') + '" title="' + (ok ? f.n : '???') + '">' + this.thumb(C, f.k, 44) + '<small>' + (ok ? f.n : '???') + '</small></span>'; }).join('') +
          '</div></div></div>';
      }
      if (!h && this.tab === 'egg') h ='<div class="an-row"><div class="an-info"><span class="desc">¡Ya eclosionaron todos los Digitamas!</span></div></div>';
    } else if (Bosses.data) {
      Bosses.data.list.forEach((B, i) => {
        const n = s.bosses[B.id] | 0, el = Bosses.elOf(B), S = Bosses.spr[B.id];
        const img = S ? this.thumb({ canvases: { x: S } }, 'x', 64) : '';
        h += '<div class="an-row boss' + (n ? '' : ' no') + '" style="--ac:' + ELC[el] + '"><span class="an-f' + (n ? '' : ' no') + '">' + img + '</span><div class="an-info">' +
          '<b>' + (n ? B.name : '???') + ' <small>' + B.level + ' · ' + B.attribute + '</small></b>' +
          '<span class="desc">' + (n ? B.desc : 'Aparece a los ' + (() => { const s = (i + 1) * Bosses.data.every; return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); })() + ' de partida. Derrotalo para registrar sus datos.') + '</span>' +
          (n ? '<span class="an-st">Técnicas: ' + [...new Set(B.atk.map(a => a.n))].join(', ') + ' · Derrotado ' + n + (n > 1 ? ' veces' : ' vez') + '</span>' : '') +
          '</div></div>';
      });
    }
    list.innerHTML = h;
    list.querySelectorAll('.an-row.ready').forEach(r => r.onclick = () => this.hatchNow(r.dataset.cid));   // clic = eclosionar
  }
};

// Puente con firebase.js: el progreso es de la cuenta logueada
window.getProg = () => Progress.read();
window.loadProg = st => {
  Progress.st = null;
  try { if (st) localStorage.setItem(Progress.KEY, JSON.stringify(st)); else localStorage.removeItem(Progress.KEY); } catch (e) {}
  Progress.read(); if (Progress.data) Progress.activate(); Progress.renderRank();
  if (Progress.isOpen()) Progress.render();
  if (window.onProgressReady && Progress.data) window.onProgressReady();   // revisa el Digimon elegido (puede quedar bloqueado)
};

(async () => {
  try { await Progress.load(); } catch (e) { console.error(e); return; }
  const b = document.getElementById('anb');
  if (b) b.onclick = () => Progress.open();
  Progress.renderRank(); Progress.badge();
  if (window.onProgressReady) window.onProgressReady();   // game.js revisa el Digimon elegido y muestra eclosiones pendientes
})();
addEventListener('keydown', e => { if (e.key === 'Escape' && Progress.isOpen()) Progress.close(); });

const cv=document.getElementById('c'),cx=cv.getContext('2d');
// W,H = tamaño LÓGICO de la vista (en píxeles del mundo). CZ = zoom de la cámara (1,2 en PC; en pantallas angostas, para ver
// unos 480 px de ancho); el canvas real usa devicePixelRatio (CK = escala del contexto, la aplica draw()).
let W,H,CZ=1,CK=1;function rs(){CZ=innerWidth<700?Math.max(.6,Math.min(1.2,innerWidth/480)):1.2;   // cámara: en PC 20% más cerca; en celular ~480 px de ancho
 W=Math.round(innerWidth/CZ);H=Math.round(innerHeight/CZ);const d=Math.min(2,devicePixelRatio||1);cv.width=Math.round(innerWidth*d);cv.height=Math.round(innerHeight*d);CK=cv.width/W}addEventListener('resize',rs);rs();
const keys={};
let P=[],p,cam={x:0,y:0},en=[],sh=[],pt=[],gems=[],fx=[],ef=[],eb=[],t=0,kills=0,running=false,spawnT=0,last=0,xp=0,lvl=1,need=5,paused=false,evo=null,pending=[],cardMode='cards',mode=1,lastMode=1,cur=[],treeOpen=false;
// Hasta MAX_PLAYERS jugadores (hoy el menú ofrece 1 y 2; el código ya acepta 3 y 4: ver inputOf y el HUD)
const MAX_PLAYERS=4,PC=['#2ee6c8','#ff7ad9','#ffd23f','#7aa8ff'],ELC=['#4db8ff','#c05bff','#ffb02e'],$=id=>document.getElementById(id);

// Criaturas jugables. Cada una necesita la carpeta assets/sprites/creatures/<id>/ y el archivo src/data/creatures/<id>.json
// Para sumar otra: agregala acá (y creá su JSON). Si falta el JSON, simplemente no aparece en la selección.
const CREATURES = [
  { id: '001_guilmon' }, { id: '002_renamon' }, { id: '003_terriermon' }, { id: '005_veemon' }, { id: '006_gammamon' },
  { id: '007_pulsemon' }, { id: '008_dorumon' }, { id: '009_ryudamon' }, { id: '010_wormmon' }, { id: '011_zubamon' },
  { id: '012_jellymon' }, { id: '013_loogamon' }, { id: '014_herissmon' }, { id: '015_kudamon' }, { id: '016_commandramon' },
  // líneas del Workshop (oct 2026): se desbloquean con su Digitama (unlocks.json)
  { id: '017_agumon' }, { id: '018_gabumon' }, { id: '019_tentomon' }, { id: '020_biyomon' }, { id: '021_armadillomon' },
  { id: '022_patamon' }, { id: '023_dracomon' }, { id: '024_agumon_savers' }, { id: '025_gaomon' }, { id: '026_lalamon' },
  { id: '027_falcomon' }, { id: '028_coronamon' }, { id: '029_lunamon' }, { id: '030_dracmon' }, { id: '031_bearmon' },
  { id: '032_fanbeemon' }, { id: '033_kokuwamon' }, { id: '034_sunarizamon' }, { id: '035_sangomon' }, { id: '036_ludomon' },
  { id: '037_liollmon' }, { id: '038_blucomon' }
];
// Criatura de un jugador (cada jugador elige la suya; guarda su id en q.cid)
const CR = q => CreatureLoader.cache[(q && q.cid) || '001_guilmon'] || null;
// Línea que se usa para dibujar a los enemigos (no hace falta que sea jugable). Si no carga, se dibujan con formas.
const ENEMY_LINE = '004_impmon';
// Atributos: 0 Vacuna, 1 Virus, 2 Dato. Cada uno es fuerte contra el siguiente: Vacuna > Virus > Dato > Vacuna.
// El atributo de cada Digimon sale de "attribute" en su JSON.
const ATTR = ['Vacuna', 'Virus', 'Dato'];
const elOf = cid => { const C = CreatureLoader.cache[cid], a = C && C.meta.attribute; return a === 'Virus' ? 1 : a === 'Dato' ? 2 : 0; };
// Revivir: un compañero vivo parado sobre tu sprite te revive tras REVIVE_TIME segundos.
// Cada jugador tiene q.revSpd (1 = normal) para que futuras pasivas puedan acelerarlo.
const REVIVE_TIME = 5, REVIVE_R = 48;

// Niveles de evolución. Para probar rápido abrí la página con ?test al final de la URL (ej: index.html?test)
const TEST = new URLSearchParams(location.search).has('test');
// FAST = true: niveles bajos para probar todo rápido. Poné false para los niveles normales (3,6,9,12 y 15).
const FAST = false;
const EVO_LEVELS = FAST ? [2,3,4,5] : [5,10,15,20];  // etapas 1,2,3,4 (cada 5 niveles)
const LINE_LEVEL = FAST ? 6 : 25;                    // elección de la evolución final (rama)
const REQ_FACTOR = FAST ? 0.4 : 1;                   // en modo FAST los requisitos de stats de las ramas se achican
// Experiencia para el próximo nivel: need = need × XP_GROW + XP_ADD (más bajo = se sigue subiendo en el late game)
let XP_GROW = 1.13, XP_ADD = 6, XP_START = 7, XP_GAIN = 0.75;   // XP_GAIN: multiplicador de toda la XP que juntás
// XP para pasar del nivel L al L+1. Con XP_PACE (abajo) la forma final llega cerca del minuto 25 en una partida de 30
// (lo pidió el usuario: antes se llegaba a los 7'). XP_GROW/XP_ADD/XP_START ya no se usan.
const xpNeed = L => Math.round(4 * Math.pow(L, 1.65) + 4);
// Ritmo: nivel esperado según el minuto (Bebé II ~2', Novato ~5', Campeón ~10', Perfecto ~17', forma final ~25', después 1 por minuto).
// Si vas adelantado la XP rinde menos (×0,4 por cada nivel de ventaja); si vas atrasado, más (+80% por nivel, hasta ×8).
const XP_PACE = [[1, 0], [5, 120], [10, 300], [15, 600], [20, 960], [25, 1440], [30, 1800]];   // los dos últimos, un minuto antes: medido con bots, la llegada real se atrasa ~1 min
function paceLvl(s) { for (let i = 1; i < XP_PACE.length; i++) { const [l0, t0] = XP_PACE[i - 1], [l1, t1] = XP_PACE[i]; if (s <= t1) return l0 + (l1 - l0) * (s - t0) / (t1 - t0); } return 30 + (s - 1800) / 60; }
function xpMul() { const d = lvl + xp / Math.max(1, need) - paceLvl(t); return d > 0 ? Math.pow(0.4, d) : Math.min(8, 1 - d * 0.8); }

async function initGame(ids) {
  await SkillSys.load();
  await Promise.all([...new Set(ids)].map(id => CreatureLoader.load(id)));
  await CreatureLoader.load(ENEMY_LINE).catch(e => console.error(e));
  await Bosses.load().catch(e => console.error(e));
  await Enemies.load().catch(e => console.error(e));
  // el mapa se genera en start() (uno nuevo por partida)
}
// Digimon desbloqueados (progress.js). Si progress.js no cargó, se puede usar cualquiera.
const unlocked = id => typeof Progress === 'undefined' || Progress.has(id);
// Jugadores de ESTE navegador (en online, solo el tuyo): para el Analyzer y las misiones
const mine = () => isOnline ? [P[myIdx]].filter(Boolean) : P;
// Clave de canvas de la forma de q en la etapa s: stage_N, branch_<id> o 'dark' (evolución oscura)
const formKey = (q, s) => { if (s < 5) return q.alt && q.alt[s] ? 'alt_' + s + '_' + q.alt[s] : 'stage_' + s; if (q.dark) return 'dark'; const C = CR(q), b = C && C.meta.branches[q.line || 0]; return 'branch_' + (q.branchId || (b ? b.id : '6_1')); };
// Evolución oscura: sprite propio (JSON "dark") o, si no tiene, su primera forma final teñida de violeta (se genera una vez)
function darkSpr(C) {
  if (!C) return null;
  if (C.canvases.dark) return C.canvases.dark;
  if (C.canvases.darkGen) return C.canvases.darkGen;
  const b = C.meta.branches[0], S = b && C.canvases['branch_' + b.id]; if (!S) return null;
  const cv = document.createElement('canvas'); cv.width = S.canvas.width; cv.height = S.canvas.height;
  const g = cv.getContext('2d'); g.drawImage(S.canvas, 0, 0);
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(48,0,72,.62)'; g.fillRect(0, 0, cv.width, cv.height);
  return (C.canvases.darkGen = { canvas: cv, cols: S.cols, rows: S.rows });
}
const darkName = C => (C.meta.dark && C.meta.dark.name) || (C.meta.branches[0].name + ' Oscuro');
// Nombre de la forma (con X-Antibody, el de su forma X si existe)
const formName = (q, s) => { const C = CR(q); if (!C) return ''; const M = C.meta, k = formKey(q, s);
  if (q.xa && M.x && M.x[k]) return M.x[k].name; if (k === 'dark') return darkName(C);
  const o = s < 5 ? (q.alt && q.alt[s] && altOf(M, s, q.alt[s])) || M.stages[s] : (M.branches.find(b => 'branch_' + b.id === k) || M.branches[0]); return o ? o.name : ''; };
// ---------- Evoluciones alternativas (Vital Bracelet, tools/vb/gen_alts.py) ----------
// stages[3|4].alts = [{id, name, file, from, req, vp, bonus, desc}]; q.alt = {3: id, 4: id} (sin id = la forma de siempre).
// La forma de siempre de cada etapa (y la primera forma final) sale solo con experiencia; las demás piden requisitos.
const altOf = (M, s, id) => ((M.stages[s] && M.stages[s].alts) || []).find(a => a.id === id);
const prevForm = (q, s) => (s > 3 && q.alt && q.alt[s - 1]) || 'main';   // forma de la etapa anterior ('main' = la de siempre)
// opciones de q para la etapa s (3, 4 o 5 = formas finales), las que salen de su forma actual
function formOpts(q, s) {
  const C = CR(q); if (!C) return [];
  const M = C.meta, pf = prevForm(q, s), ok = a => !a.from || a.from.includes(pf);
  if (s >= 5) return M.branches.map((b, idx) => ({ b, idx })).filter(o => o.idx === 0 || ok(o.b)).map(o => ({ id: o.b.id, idx: o.idx, name: o.b.name, desc: o.b.desc, req: o.b.req, vp: o.b.vp, key: 'branch_' + o.b.id, xp: o.idx === 0 }));
  const st = M.stages[s]; if (!st) return [];
  return [{ id: null, name: st.name, desc: 'La forma de siempre de la línea', key: 'stage_' + s, xp: true },
    ...(st.alts || []).filter(ok).map(a => ({ id: a.id, name: a.name, desc: a.desc, req: a.req, vp: a.vp, key: 'alt_' + s + '_' + a.id }))];
}
const seeForm = q => { if (typeof Progress === 'undefined' || !q) return; const k = formKey(q, q.stage | 0), C = CR(q);
  Progress.see(q.cid, k); if (q.xa && C && C.canvases['x_' + k]) Progress.see(q.cid, 'x_' + k); };
// Reglas del desafío diario (challenge.js) activas en esta partida
const chal = id => typeof Challenge !== 'undefined' && Challenge.has(id);
window.onXAntibody = q => { Bosses.banner('¡X-Antibody! ' + (formName(q, q.stage | 0) || '')); seeForm(q); };

// ---------- Red: PeerJS + party ----------
// El login, el Nick, la lista de amigos y las ventanas están en social.js; acá vive la conexión entre jugadores.
// Una invitación viaja por una conexión de control; si el invitado acepta, él se conecta al que invitó
// (que pasa a ser el anfitrión/líder) y ahí queda armado el party. El líder inicia la partida.
let peer = null, myPeerId = null, conn = null, isHost = false, isOnline = false;
// Party de hasta MAX_PLAYERS (4). Topología en estrella: el líder es el anfitrión y tiene una conexión por invitado (gs);
// cada invitado tiene una sola conexión (conn), con el anfitrión. roster = todos los del party, lo arma el anfitrión.
let gs = [];       // anfitrión: [{ c, i (índice en P), uid, nick, cid, lo, ready, lost, lt }]
let roster = [];   // [{ i, uid, nick, c }] (índice 0 = líder)
// myIdx: índice de MI jugador en P (online: el anfitrión es 0). rk: teclas de cada jugador remoto (índice -> teclas).
// picked: jugadores que ya eligieron carta / rama en esta ronda (online se espera a todos).
let myIdx = 0, rk = {}, picked = new Set();
// rondas de cartas online: el anfitrión numera cada ronda (rnd) y lo manda en trigger_* / resume_game; el invitado guarda la
// suya (gRnd) y descarta lo viejo (así un resume_game atrasado no le cierra las cartas de la ronda nueva)
let rnd = 0, rndAt = 0, rndOpen = false, gRnd = -1;
// anfitrión: abre una ronda de cartas y se la avisa a todos
function hostRound(type) { rnd++; rndAt = performance.now(); rndOpen = true; gs.forEach(g => g.rs = 0); sendAll({ type, rnd, stage: lineStage }); }
// sync: el anfitrión manda el estado SYNC_HZ veces por segundo (12 con 3 o más jugadores, para no saturar su subida)
const SYNC_HZ = 15, SYNC_HZ_MANY = 12, SYNC_SLOW = 0.5, AOI = 1500;
let syncT = 0, slowT = 0, enId = 0, inSig = '', inT = 0;
// conexiones de juego abiertas: anfitrión = una por invitado conectado; invitado = la del anfitrión
const conns = () => isHost ? gs.filter(g => g.c && !g.lost).map(g => g.c) : [conn].filter(Boolean);
const sendAll = (m, except) => conns().forEach(c => { if (c !== except) sendTo(c, m); });
const guestOf = c => gs.find(g => g.c === c);
// Selección de criatura
let pickRes = null, pickRej = null, pickList = [], picking = false, hostPick = null, hostIds = null;
// Digimon elegido en el menú principal (se recuerda entre partidas)
let selected = null;
try { selected = localStorage.getItem('digisurvivor_pick') || null; } catch (e) {}
// Party
let me = { uid: null, nick: null };   // lo carga social.js al iniciar sesión
let lobbyNote = '';                   // último aviso para mostrar en la ventana (rechazos, cortes, etc.)
const pendingInv = {};                // invitaciones que mandé: uid -> hora
const ctl = {};                       // conexiones de invitación en curso: peerId -> función que las da por fallidas
const inbox = [];                     // invitaciones recibidas { id, uid, nick, peerId, c }
const inParty = () => !!conn || gs.length > 0;

const lobbyChanged = () => { if (window.onLobby) window.onLobby(); };
const lobbyMsg = m => { lobbyNote = m || ''; lobbyChanged(); };
const whenOpen = (c, fn) => { if (c.open) fn(); else c.on('open', fn); };
const sendTo = (c, m) => { if (!c || c.open === false) return; try { c.send(m); } catch (e) {} };
// PeerJS con serialización JSON no manda mensajes de más de ~16 KB ("message-too-big"): los grandes se parten en pedazos
// ('part') y el otro lado los vuelve a armar (joinPart). Se corta en BIG caracteres porque al reenviar se escapan las comillas.
const BIG = 9000;
let bigId = 0;
const bigIn = {};
function sendBigTo(c, m) {
  const str = JSON.stringify(m);
  if (str.length <= BIG) { sendTo(c, m); return; }
  const id = ++bigId, n = Math.ceil(str.length / BIG);
  for (let i = 0; i < n; i++) sendTo(c, { type: 'part', id, i, n, d: str.slice(i * BIG, (i + 1) * BIG) });
}
function joinPart(d) {
  const b = bigIn[d.id] || (bigIn[d.id] = { n: d.n, got: 0, p: [] });
  if (b.p[d.i] == null) { b.p[d.i] = d.d; b.got++; }
  if (b.got < b.n) return null;
  delete bigIn[d.id];
  for (const k in bigIn) if (+k < d.id - 20) delete bigIn[k];   // pedazos viejos que nunca se completaron
  try { return JSON.parse(b.p.join('')); } catch (e) { return null; }
}
const validId = id => CREATURES.some(x => x.id === id) ? id : null;
const dropInvite = id => { const k = inbox.findIndex(x => x.id === id); if (k >= 0) { inbox.splice(k, 1); lobbyChanged(); } };

// Anfitrión: arma la lista del party y se la manda a cada invitado (con su índice)
function sendRoster() {
  roster = [{ i: 0, uid: me.uid, nick: me.nick, c: selected }, ...gs.map(g => ({ i: g.i, uid: g.uid, nick: g.nick, c: g.cid }))];
  for (const g of gs) sendTo(g.c, { type: 'roster', list: roster, you: g.i });
  lobbyChanged();
}
// Anfitrión: un invitado se une al party (índice libre de 1 a MAX_PLAYERS-1)
function addGuest(c, md) {
  let i = 1; while (gs.some(g => g.i === i)) i++;
  const g = { c, i, uid: md.uid, nick: String(md.nick || '').slice(0, 20), cid: null };
  c.pi = i; gs.push(g); isHost = true; isOnline = false; myIdx = 0;
  setupConn(c);
  whenOpen(c, sendRoster);
  lobbyMsg(g.nick + ' se unió al party');
}

window.initPeer = function () {
  if (peer) return;
  peer = new Peer('ds-' + Math.random().toString(36).slice(2, 12));
  peer.on('open', id => { myPeerId = id; if (window.onPeerOpen) window.onPeerOpen(id); lobbyChanged(); });
  peer.on('error', err => {
    if (err && err.type === 'unavailable-id') { try { peer.destroy(); } catch (e) {} peer = null; window.initPeer(); return; }
    if (err && err.type === 'peer-unavailable') { for (const pid in ctl) if (String(err.message || '').includes(pid)) ctl[pid](); return; }
    console.error('PeerJS:', err);
  });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
  peer.on('connection', c => {
    const md = c.metadata || {};
    if (md.kind === 'game') {
      // un invitado vuelve después de un corte (misma partida, mismo jugador)
      const back = md.re && running && gs.find(g => g.lost && g.uid === md.uid);
      if (back) {
        back.c = c; c.pi = back.i; back.lost = false; clearTimeout(back.lt); setupConn(c);
        whenOpen(c, () => Bosses.banner('¡' + (back.nick || 'Tu compañero') + ' volvió!'));
        return;
      }
      // alguien a quien invité se une a mi party: yo soy el líder/anfitrión
      if (conn || running || !pendingInv[md.uid] || gs.length >= MAX_PLAYERS - 1 || gs.some(g => g.uid === md.uid)) { try { c.close(); } catch (e) {} return; }
      delete pendingInv[md.uid];
      addGuest(c, md);
    } else {
      // conexión de control: solo se aceptan invitaciones de amigos
      c.on('data', m => {
        if (!m || m.type !== 'invite' || !m.uid || !m.peerId) return;
        // se consulta en el momento si es amigo (así una amistad recién creada o eliminada se respeta al instante)
        Promise.resolve(window.isFriendUid ? window.isFriendUid(m.uid) : false).then(isF => {
          if (!isF) return;
          if (inParty() || running || inbox.some(i => i.uid === m.uid)) { whenOpen(c, () => sendTo(c, { type: 'decline', busy: 1 })); return; }
          const inv = { id: Math.random().toString(36).slice(2), uid: m.uid, nick: String(m.nick || '').slice(0, 20), peerId: m.peerId, c };
          inbox.push(inv); setTimeout(() => dropInvite(inv.id), 60000); lobbyChanged();
        }).catch(() => {});
      });
    }
  });
};

// Cierra todo lo online (se usa al cerrar sesión)
window.stopPeer = function () {
  if (running && isOnline) endRun('Cerraste sesión');
  dropParty(); clearTimeout(lostT);
  if (peer) { try { peer.destroy(); } catch (e) {} }
  peer = null; myPeerId = null; hostPick = null; inbox.length = 0;
  for (const k in pendingInv) delete pendingInv[k];
  lobbyMsg('');
};

// Acciones que usa la ventana de Amigos / Party
window.Lobby = {
  max: MAX_PLAYERS,
  setSelf(uid, nick) { me = { uid, nick }; },
  state() {
    const role = conn ? 'guest' : gs.length ? 'host' : null;
    const list = role === 'host' ? [{ i: 0, uid: me.uid, nick: me.nick, c: selected }, ...gs.map(g => ({ i: g.i, uid: g.uid, nick: g.nick, c: g.cid }))]
      : role ? roster.map(m => m.i === myIdx ? Object.assign({}, m, { c: selected }) : m) : [];
    return { me, myPeerId, ready: !!myPeerId, role, selected, max: MAX_PLAYERS,
      members: list.map(m => ({ i: m.i, uid: m.uid, nick: m.nick, c: m.c, me: m.i === myIdx, host: m.i === 0 })),
      canInvite: !!myPeerId && !conn && gs.length < MAX_PLAYERS - 1 && !running,
      inbox: inbox.map(i => ({ id: i.id, uid: i.uid, nick: i.nick })), note: lobbyNote, running };
  },
  info(id) {
    const C = id && CreatureLoader.cache[id]; if (!C) return null;
    const M = C.meta, el = elOf(id);
    return { id, name: (M.stages[2] || M.stages[0]).name, attr: ATTR[el], color: ELC[el], img: thumbOf(C, 'stage_2') };
  },
  pick() { openMenuPick(); },
  invite(f) {   // f: { uid, nick, peerId }
    if (!peer || !myPeerId) return lobbyMsg('Todavía conectando con el servidor...');
    if (conn) return lobbyMsg('Solo el líder del party puede invitar');
    if (gs.length >= MAX_PLAYERS - 1) return lobbyMsg('El party está lleno (' + MAX_PLAYERS + ' jugadores)');
    if (gs.some(g => g.uid === f.uid)) return lobbyMsg(f.nick + ' ya está en el party');
    if (!f.peerId) return lobbyMsg(f.nick + ' no está en línea');
    pendingInv[f.uid] = Date.now();
    const c = peer.connect(f.peerId, { metadata: { kind: 'ctl' } });
    let done = false, to = null;
    const fail = msg => { if (done) return; done = true; clearTimeout(to); delete ctl[f.peerId]; delete pendingInv[f.uid]; lobbyMsg(msg); try { c.close(); } catch (e) {} };
    to = setTimeout(() => fail(f.nick + ' no respondió'), 15000);
    ctl[f.peerId] = () => fail(f.nick + ' no está disponible');
    whenOpen(c, () => sendTo(c, { type: 'invite', uid: me.uid, nick: me.nick, peerId: myPeerId }));
    c.on('data', m => {
      if (!m) return;
      if (m.type === 'decline') fail(f.nick + (m.busy ? ' está ocupado' : ' rechazó la invitación'));
      else if (m.type === 'accept') { done = true; clearTimeout(to); delete ctl[f.peerId]; setTimeout(() => { try { c.close(); } catch (e) {} }, 500); }
    });
    c.on('error', () => fail(f.nick + ' no está disponible'));
    setTimeout(() => { if (!gs.some(g => g.uid === f.uid)) delete pendingInv[f.uid]; }, 90000);
    lobbyMsg('Invitación enviada a ' + f.nick);
  },
  accept(id) {
    const k = inbox.findIndex(x => x.id === id); if (k < 0) return;
    const inv = inbox.splice(k, 1)[0];
    if (inParty() || !peer) { sendTo(inv.c, { type: 'decline', busy: 1 }); lobbyChanged(); return; }
    sendTo(inv.c, { type: 'accept' });
    setTimeout(() => { try { inv.c.close(); } catch (e) {} }, 500);
    while (inbox.length) sendTo(inbox.pop().c, { type: 'decline', busy: 1 });   // las demás invitaciones se rechazan
    const c = peer.connect(inv.peerId, { metadata: { kind: 'game', uid: me.uid, nick: me.nick }, serialization: 'json', reliable: true });
    conn = c; isHost = false; isOnline = false; myIdx = 1;
    roster = [{ i: 0, uid: inv.uid, nick: inv.nick, c: null }];
    setupConn(c);
    setTimeout(() => { if (conn === c && !c.open) { try { c.close(); } catch (e) {} connClosed(c); } }, 12000);
    lobbyMsg('Te uniste al party de ' + inv.nick);
  },
  decline(id) {
    const k = inbox.findIndex(x => x.id === id); if (k < 0) return;
    const inv = inbox.splice(k, 1)[0];
    sendTo(inv.c, { type: 'decline' });
    setTimeout(() => { try { inv.c.close(); } catch (e) {} }, 500);
    lobbyChanged();
  },
  leave() { dropParty(); },
  // solo el líder, y solo si todos ya eligieron Digimon
  startOnline() {
    if (!isHost || !gs.length || !selected || running || gs.some(g => !g.cid || g.lost)) return;
    // índices seguidos (si alguien se fue del party quedaba un hueco): 1, 2, 3
    gs.sort((a, b) => a.i - b.i).forEach((g, k) => { g.i = k + 1; g.c.pi = k + 1; g.ready = false; g.lo = null; });
    sendRoster();
    hostPick = selected; isOnline = true; rk = {};
    hostIds = [selected, ...gs.map(g => g.cid)];
    World.nextSeed = (Math.random() * 2 ** 31) | 0;   // el mapa: todos lo generan con la misma semilla
    for (const g of gs) sendTo(g.c, { type: 'start', ids: hostIds, seed: World.nextSeed, you: g.i });
    lobbyMsg('Iniciando partida...');
  }
};

// Corte de la conexión de juego. Si están en partida no termina al instante: el invitado intenta reconectarse solo durante
// RECON_S segundos (el anfitrión sigue jugando y acepta de vuelta a ese mismo jugador). Si no vuelve, su Digimon queda
// fuera de la partida (los demás siguen). Si el que se corta es el anfitrión, los invitados esperan lo mismo y después termina.
// La conexión es directa entre los jugadores (WebRTC vía PeerJS): un corte suele ser un microcorte de internet de alguno.
const RECON_S = 20;
let lost = null, lostT = null;   // invitado: lost = { peerId } mientras se intenta reconectar al anfitrión
function connClosed(c, why) {
  const g = isHost && guestOf(c);
  if (g) {   // anfitrión: se cortó un invitado
    console.warn('DigiSurvivor: se cerró la conexión con ' + g.nick + ' (' + (why || 'close') + ')');
    if (running && isOnline) {
      g.lost = true; g.c = null; rk[g.i] = {};
      Bosses.banner(g.nick + ' se desconectó. Esperando…');
      if (paused && picked.has(myIdx)) allPicked();   // estaba esperando su carta: sigue sin él
      clearTimeout(g.lt);
      g.lt = setTimeout(() => {
        if (!g.lost) return;
        gs.splice(gs.indexOf(g), 1);
        const q = P[g.i]; if (q) { q.dead = true; q.gone = true; q.hp = 0; }   // queda fuera (no se puede revivir)
        if (running) Bosses.banner(g.nick + ' abandonó la partida');
        if (paused && picked.has(myIdx)) allPicked();
      }, RECON_S * 1000);
      return;
    }
    gs.splice(gs.indexOf(g), 1);
    if (gs.length) { sendRoster(); lobbyMsg(g.nick + ' salió del party'); } else dropParty(g.nick + ' salió del party');
    return;
  }
  if (conn !== c) return;
  console.warn('DigiSurvivor: se cerró la conexión de juego (' + (why || 'close') + ')');
  if (running && isOnline) { connLost(c); return; }
  dropParty();
}
function dropParty(msg) {
  const was = roster.length ? roster.find(m => m.i === 0) : null;
  const cs = [conn, ...gs.map(g => g.c)].filter(Boolean);
  gs.forEach(g => clearTimeout(g.lt));
  conn = null; gs = []; roster = []; isHost = false; isOnline = false; hostPick = null; hostIds = null; myIdx = 0; rk = {}; lost = null;
  cs.forEach(c => { try { c.close(); } catch (e) {} });
  lobbyMsg(msg || (was && was.nick && was.nick !== me.nick ? 'El party de ' + was.nick + ' se cerró' : ''));
}
// invitado: se cortó la conexión con el anfitrión
function connLost(c) {
  conn = null; rk = {}; lost = { peerId: c.peer };
  Bosses.banner('Se cortó la conexión. Reconectando…');
  rejoin();
  clearTimeout(lostT);
  lostT = setTimeout(() => { if (lost && !conn) { if (running) endRun('Se perdió la conexión con el anfitrión'); dropParty(); } }, RECON_S * 1000);
}
// invitado: vuelve a conectarse al anfitrión (reintenta cada 3 s mientras dure el plazo)
function rejoin() {
  if (!lost || conn || !peer || !running) return;
  const c = peer.connect(lost.peerId, { metadata: { kind: 'game', uid: me.uid, nick: me.nick, re: 1 }, serialization: 'json', reliable: true });
  let ok = false;
  c.on('open', () => { if (conn || !lost) { try { c.close(); } catch (e) {} return; } ok = true; conn = c; lost = null; clearTimeout(lostT); setupConn(c); Bosses.banner('¡Reconectado!'); });
  c.on('error', () => {});
  setTimeout(() => { if (!ok) { try { c.close(); } catch (e) {} rejoin(); } }, 3000);
}

function setupConn(c) {
  whenOpen(c, () => sendTo(c, { type: 'hello', uid: me.uid, nick: me.nick, c: selected }));
  c.on('close', () => connClosed(c, 'close'));
  c.on('error', e => {
    const why = 'error ' + ((e && (e.type || e.message)) || '');
    if (c.open && /not-open-yet|message-too-big/.test(why)) { console.warn('DigiSurvivor: ' + why + ' (la conexión sigue)'); return; }
    connClosed(c, why);
  });
  c.on('data', data => {
    if (data && data.type === 'part') { data = joinPart(data); if (!data) return; }   // mensaje grande que llegó en pedazos
    const g = isHost ? guestOf(c) : null;
    if (data.type === 'hello' || data.type === 'pick') {
      if (g) { g.cid = validId(data.c); if (data.nick) g.nick = String(data.nick).slice(0, 20); sendRoster(); }
    } else if (data.type === 'roster') {
      if (isHost) return;
      roster = Array.isArray(data.list) ? data.list.slice(0, MAX_PLAYERS) : []; if (!running) myIdx = data.you | 0;
      lobbyChanged();
    } else if (data.type === 'input') {
      rk[c.pi || 1] = data.keys || {};
    } else if (data.type === 'dash') {
      if (isHost) dash(P[c.pi || 1]);
    } else if (data.type === 'start') {
      if (isHost) return;
      isOnline = true; myIdx = data.you | 0;
      World.nextSeed = data.seed | 0;
      joinOnline(data.ids);
    } else if (data.type === 'ready') {
      // un invitado ya está listo: cuando estén todos, arranca la partida
      if (!isHost || !hostPick || !g) return;
      g.lo = Trees.clean(data.lo) || { m: {}, bond: 0 }; g.ready = true;
      if (gs.every(x => x.ready)) {
        const ids = hostIds.map(id => validId(id) || '001_guilmon');
        hostPick = null;
        $('up').style.display = 'none';
        start(ids.length, ids, [Trees.loadout(ids[0]), ...gs.map(x => x.lo)]);
      }
    } else if (data.type === 'sync') {
      applyOnlineSync(data);
    } else if (data.type === 'trigger_levelup') {
      if (data.rnd != null) { if (data.rnd === gRnd) return; gRnd = data.rnd; }   // repetido (el anfitrión lo reenvía si tarda)
      paused = true;
      picked = new Set();
      pending = [P[myIdx]];
      showCards();
    } else if (data.type === 'trigger_line') {
      if (data.rnd != null) { if (data.rnd === gRnd) return; gRnd = data.rnd; }
      lineStage = data.stage || 5;
      paused = true;
      picked = new Set();
      pending = [P[myIdx]];
      chooseLine();
    } else if (data.type === 'trigger_evo') {
      $('up').style.display = 'none';
      startEvo(data.stage);
    } else if (data.type === 'client_choice') {
      // un invitado eligió: el anfitrión lo aplica, se lo pasa a los demás y, si ya eligieron todos, sigue
      const i = c.pi || 1;
      if (data.rnd != null && data.rnd !== rnd) return;   // elección de una ronda que ya terminó
      if (isHost && P[i] && !picked.has(i)) {
        applyCardOp(P[i], data);
        picked.add(i);
        sendAll(Object.assign({}, data, { type: 'host_choice', i }), c);
        allPicked();
      }
    } else if (data.type === 'host_choice') {
      // elección de otro jugador (i; si no viene, es el anfitrión)
      const i = data.i == null ? 0 : data.i;
      if (!isHost && P[i] && (i !== myIdx || data.auto)) {   // auto: el anfitrión eligió por mí porque tardé demasiado
        applyCardOp(P[i], data);
        picked.add(i);
        if (i === myIdx) { pending = []; $('up').style.display = 'none'; }
      }
    } else if (data.type === 'end') {
      if (running) endRun(data.title || 'Run terminada');
    } else if (data.type === 'resume_game') {
      if (data.rnd != null && data.rnd !== gRnd) return;   // de una ronda vieja
      $('up').style.display = 'none';
      paused = false;
      last = performance.now();
    }
  });
}

// Online (anfitrión): jugadores que tienen que elegir carta (él y los invitados conectados que siguen en la partida)
const mustPick = () => [0, ...gs.filter(g => !g.lost && g.c).map(g => g.i)].filter(i => P[i] && !P[i].gone);
// Online (anfitrión): si ya eligieron todos, sigue la partida (o arranca la evolución final)
function allPicked() {
  if (!isHost || !mustPick().every(i => picked.has(i))) return;   // espera solo a los que siguen conectados (si se cortó uno, no lo frena)
  $('up').style.display = 'none';
  rndOpen = false;
  if (cardMode === 'line') { sendAll({ type: 'trigger_evo', stage: lineStage }); startEvo(lineStage); }
  else { paused = false; last = performance.now(); sendAll({ type: 'resume_game', rnd }); }
}
// Anfitrión: si una ronda de cartas tarda, se la reenvía cada 5 s a quien no eligió; a los 30 s elige por él
// (una carta de stat, o la primera forma final) para que la partida nunca quede trabada esperando.
setInterval(() => {
  if (!isHost || !isOnline || !running || !rndOpen) return;
  const late = mustPick().filter(i => i !== myIdx && !picked.has(i)), dt = performance.now() - rndAt;
  if (!late.length) return;
  if (dt < 30000) {
    const ty = cardMode === 'line' ? 'trigger_line' : 'trigger_levelup';
    for (const g of gs) if (late.includes(g.i) && g.c && Math.floor(dt / 5000) > (g.rs | 0)) { g.rs = Math.floor(dt / 5000); sendTo(g.c, { type: ty, rnd, stage: lineStage }); }
    return;
  }
  for (const i of late) {
    const q = P[i]; if (!q) continue;
    let data;
    if (cardMode === 'line') { const C = CR(q), b = C && C.meta.branches[0]; data = lineStage < 5 ? { op: 'line', stage: lineStage, altId: null } : { op: 'line', stage: 5, lineIdx: 0, branchId: b ? b.id : null, weak: false, dark: false }; }
    else { const k = Stats.CARDS[Math.floor(Math.random() * Stats.CARDS.length)]; data = { op: k.op, c: k.c }; }
    applyCardOp(q, data); picked.add(i);
    sendAll(Object.assign({ type: 'host_choice', i, rnd, auto: 1 }, data));
    console.warn('DigiSurvivor: el jugador ' + (i + 1) + ' no eligió carta a tiempo, se eligió sola');
  }
  gs.forEach(g => g.rs = 0);
  allPicked();
}, 1000);
function applyCardOp(targetP, data) {
  if (data.c) targetP.st[data.c]++;
  if (Stats.cardOf(data.op)) Stats.card(targetP, data.op, data.rm || 1);   // carta de stat (stats.js), con su rareza
  else if (data.op === 'wp' && data.wpKey) { SkillSys.forget(targetP, data.rep); const fr = !(targetP.wp[data.wpKey] | 0); if (SkillSys.canTake(targetP, data.wpKey)) { targetP.wp[data.wpKey] = (targetP.wp[data.wpKey] | 0) + 1; rarSkill(targetP, data.wpKey, fr, data.rm || 1); } }
  else if (data.op === 'line' && data.stage && data.stage < 5) { targetP.alt = targetP.alt || {}; targetP.alt[data.stage] = data.altId || null; }   // Campeón / Perfecto alternativo
  else if (data.op === 'line') { targetP.line = data.lineIdx; targetP.branchId = data.branchId; targetP.weak = data.weak; targetP.dark = !!data.dark; }
}

// Anfitrión: arma y manda el sync. Para no saturar su subida con 3 invitados:
// - a cada invitado le manda solo lo que tiene cerca (AOI px alrededor de su jugador; los jefes siempre),
// - los datos que cambian poco (skills, contadores V-Pet, familia…) van cada SYNC_SLOW segundos,
// - con 3 o más jugadores, SYNC_HZ_MANY veces por segundo.
function hostSync(dt) {
  if ((syncT -= dt) > 0) return;
  const cs = gs.filter(g => g.c && !g.lost); if (!cs.length) return;
  syncT = 1 / (P.length > 2 ? SYNC_HZ_MANY : SYNC_HZ);
  const full = (slowT -= 1 / SYNC_HZ) <= 0; if (full) slowT = SYNC_SLOW;
  const r = v => Math.round(v), r2 = v => Math.round(v * 100) / 100;
  const rr = o => { const out = {}; for (const k in o) out[k] = r2(o[k]); return out; };
  const pl = P.map(q => {
    const o = { x: r(q.x), y: r(q.y), hp: r2(q.hp), max: r(q.max), stage: q.stage, alt: q.alt, face: q.face, dead: q.dead, gone: q.gone, moving: q.moving, wt: rr(q.wt || {}), wc: rr(q.wc || {}), oa: r2(q.oa || 0), revP: q.revP, spv: q.spv, emp: q.emp };
    if (full) Object.assign(o, { line: q.line, branchId: q.branchId, wp: q.wp, dark: q.dark, xa: q.xa, vp: q.vp, fam: q.fam, perfect: q.perfect, pfc: q.pfc, revs: q.revs });
    return o;
  });
  // listas de números en vez de objetos (pesa mucho menos): ver unpackEn / applyOnlineSync. a[1], a[2] = posición
  const E = en.map(e => { if (!e.id) e.id = ++enId;   // id para que el cliente pueda deslizar a cada uno
    const a = [e.id, r(e.x), r(e.y), r2(e.r), e.k, e.bo != null ? 0 : e.ti, e.bo != null ? null : e.sk, e.bo != null ? null : e.et, e.st | 0, e.el, r2(e.fl), r2(e.ang), e.gun ? 1 : 0];
    if (e.bo != null) a.push(e.bo, e.cyc, r(e.hp), r(e.mh), r2(e.at), e.p2 ? 1 : 0, e.shd > 0 ? 1 : 0, e.ag == null ? -1 : e.ag);
    return a; });
  const G = gems.map(g => [r(g.x), r(g.y), r2(g.v)]);
  const S = sh.map(s => [r(s.x), r(s.y), r(s.vx), r(s.vy), s.c || 0, r2(s.r || 5), s.fx || 0, r(s.sz || 0)]);
  const B = eb.map(b => [r(b.x), r(b.y), r(b.vx), r(b.vy), b.el, b.r || 0, b.bf || 0]);
  const F = ef.map(o => ({ k: o.k, x: o.x == null ? null : r(o.x), y: o.y == null ? null : r(o.y), R: o.R && r(o.R), R0: o.R0 && r(o.R0), l: r2(o.l), m: o.m, a: o.a && r2(o.a), Lg: o.Lg && r(o.Lg), s: o.s, w: o.w, col: o.col, fx: o.fx }));
  // números de daño y textos nuevos desde el sync anterior (se marcan una sola vez y se reparten por cercanía)
  const X = fx.filter(f => !f.s).slice(-40).map(f => { f.s = 1; return { x: r(f.x), y: r(f.y), txt: f.txt, col: f.col, sz: f.sz, l: r2(f.l) }; });
  const common = { type: 'sync', P: pl, it: Items.on.map(i => ({ x: r(i.x), y: r(i.y), k: i.k, l: r2(i.l) })), gt: Gate.sync(), fn: Finale.sync(), wx: Weather.sync(),
    t: r2(t), kills, lvl, need, xp: r2(xp), bd: Bosses.down, bf: Bosses.fast ? 1 : 0 };
  const al = P.filter(q => !q.dead);
  for (const g of cs) {
    const q = P[g.i], c0 = q && !q.dead ? q : al[0] || q; if (!c0) continue;   // caído: lo que ve la cámara (un compañero vivo)
    const cx0 = c0.x, cy0 = c0.y, near = (x, y, R) => Math.abs(x - cx0) < R && Math.abs(y - cy0) < R;
    sendBigTo(g.c, Object.assign({}, common, {
      en: E.filter(a => a.length > 13 || near(a[1], a[2], AOI)),
      gems: G.filter(a => near(a[0], a[1], AOI)).flat(),
      sh: S.filter(a => near(a[0], a[1], AOI)), eb: B.filter(a => near(a[0], a[1], AOI)),
      ef: F.filter(o => o.x == null || near(o.x, o.y, AOI + 400)),
      fx: X.filter(f => near(f.x, f.y, AOI))
    }));
  }
}

// Invitado: responde con su Digimon y arranca
// enemigo que llegó como lista de números (ver el sync del anfitrión)
function unpackEn(a) {
  const e = { id: a[0], x: a[1], y: a[2], r: a[3], k: a[4], ti: a[5], sk: a[6], et: a[7], st: a[8], el: a[9], fl: a[10], ang: a[11], gun: !!a[12] };
  if (a.length > 13) { e.p2 = a[18]; e.shd = a[19]; e.ag = a[20]; e.bo = a[13]; e.cyc = a[14]; e.hp = a[15]; e.mh = a[16]; e.at = a[17]; }
  return e;
}
function onlineSmooth(dt) {
  const k = Math.min(1, dt * 12);
  for (const q of P) { if (q.tx == null || q.dead) continue;
    // el propio se mueve con el teclado acá mismo: solo se corrige si se fue lejos de donde lo tiene el anfitrión
    const f = q.id === myIdx ? (Math.hypot(q.tx - q.x, q.ty - q.y) > 70 ? Math.min(1, dt * 6) : Math.min(1, dt * 1.5)) : k;
    q.x += (q.tx - q.x) * f; q.y += (q.ty - q.y) * f; }
  for (const e of en) if (e.tx != null) { e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; }
  for (const o of sh) if (o.vx != null) { o.x += o.vx * dt; o.y += o.vy * dt; }   // disparos y balas siguen solos entre un sync y otro
  for (const b of eb) if (b.vx != null) { b.x += b.vx * dt; b.y += b.vy * dt; }
  for (const f of fx) { f.y -= 45 * dt; f.l -= dt; } fx = fx.filter(f => f.l > 0);   // los números de daño suben y se van
}
function joinOnline(ids) {
  const id = selected || '001_guilmon', L = (Array.isArray(ids) ? ids : []).slice(0, MAX_PLAYERS).map(x => validId(x) || '001_guilmon');
  if (!L[myIdx]) return;
  L[myIdx] = id;
  const los = L.map((_, i) => i === myIdx ? Trees.loadout(id) : null);
  if (conn) sendTo(conn, { type: 'ready', lo: los[myIdx] });
  start(L.length, L, los).catch(e => console.error(e));
}

// Cliente: el anfitrión manda el estado SYNC_HZ veces por segundo. Las posiciones no se pisan de golpe: se guardan como
// destino (tx, ty) y onlineSmooth las va acercando en cada cuadro (si algo saltó muy lejos, se pone directo).
function applyOnlineSync(data) {
  if (isHost) return;
  t = data.t; kills = data.kills; lvl = data.lvl; need = data.need; xp = data.xp;
  if (data.P && P.length === data.P.length) {
    data.P.forEach((sq, i) => { const q = P[i]; if (!q) return;
      const { x, y, ...rest } = sq; Object.assign(q, rest); q.tx = x; q.ty = y;
      if (!q.synced || Math.hypot(x - q.x, y - q.y) > 250) { q.x = x; q.y = y; q.synced = 1; } });
  }
  if (data.en) { const old = new Map(en.map(e => [e.id, e]));
    en = data.en.map(a => { const se = unpackEn(a), o = old.get(se.id); se.tx = se.x; se.ty = se.y;
      if (o && Math.hypot(o.x - se.x, o.y - se.y) < 200) { se.x = o.x; se.y = o.y; } return se; }); }
  if (data.gems) { const g = data.gems; gems = []; for (let i = 0; i < g.length; i += 3) gems.push({ x: g[i], y: g[i + 1], v: g[i + 2] }); }
  if (data.sh) sh = data.sh.map(a => ({ x: a[0], y: a[1], vx: a[2], vy: a[3], c: a[4] || undefined, r: a[5], fx: a[6] || undefined, sz: a[7] || undefined, a: Math.atan2(a[3], a[2]) }));
  if (data.eb) eb = data.eb.map(a => ({ x: a[0], y: a[1], vx: a[2], vy: a[3], el: a[4], r: a[5] || undefined, bf: a[6] || 0 }));
  if (data.ef) ef = data.ef;
  if (data.bd) Bosses.down = data.bd;
  if (data.bf) Bosses.fast = true;
  if (data.it) Items.on = data.it;
  if (data.gt) Gate.apply(data.gt);
  if ('fn' in data) Finale.apply(data.fn);
  if (data.wx) Weather.apply(data.wx);
  if (data.fx) for (const f of data.fx) if (fx.length < MAX_FX) fx.push(f);
}

// sin zoom del navegador (Ctrl + ruedita, Ctrl +/-/0, pellizco en iOS): el juego maneja su propia cámara
addEventListener('wheel',e=>{if(e.ctrlKey)e.preventDefault()},{passive:false});
addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&['+','-','=','_','0'].includes(e.key))e.preventDefault()});
['gesturestart','gesturechange'].forEach(ev=>addEventListener(ev,e=>e.preventDefault(),{passive:false}));
addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=1;if(e.key.startsWith('Arrow'))e.preventDefault();
 if(pickRes){if(pickKey(e.key))e.preventDefault();else if(e.key==='Escape'&&!isOnline)pickCancel();return}
 if(e.key==='Enter'&&!running&&!treeOpen&&!picking&&!isOnline&&!(typeof Progress!=='undefined'&&(Progress.isOpen()||Progress.hatching))&&!document.querySelector('#news[style*="flex"],#challenge[style*="flex"],#missions[style*="flex"]')){if(selected)beginLocal(lastMode);else openMenuPick()}
 if(e.key==='Escape'){if(treeOpen)$('tx').click();else if(running)togglePause()}
 if(paused&&!evo&&!menuPause&&/^[1-5]$/.test(e.key)&&cur[e.key-1]&&!cur[e.key-1].lock)choose(cur[e.key-1]);
 if(paused&&!evo&&!menuPause&&e.key.toLowerCase()==='r'&&cardMode==='cards')reroll();
 if((e.key===' '||e.key==='Shift')&&running&&!paused&&!e.repeat){e.preventDefault();myDash()}});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=0);
function mult(a,d){return d===(a+1)%3?1.5:a===(d+1)%3?.5:1}
// Topes para que no se acumulen miles de objetos (lag): números de daño, partículas y gemas
const MAX_FX=70,MAX_PT=450,MAX_GEMS=220,MAX_EF=160,MAX_EN=matchMedia('(pointer:coarse)').matches?210:320;   // MAX_EN: enemigos a la vez con 1 jugador (+60 por cada jugador más; en celular menos). Con la grilla espacial (buildEG) aguanta
function dmgNum(x,y,v,col,sz,txt){if(fx.length>=MAX_FX)return;fx.push({x:x+(Math.random()-.5)*12,y:y-8,txt:txt||String(Math.max(1,Math.round(v*10))),col,sz,l:.8})}
// q: quién golpea (para el crítico, las pasivas y a quién se le cuenta la muerte; ver stats.js)
function hit(e,d,el,q){if(e.shd>0){if(Math.random()<.12)dmgNum(e.x,e.y-e.r,0,'#9fe8ff',18,'INMUNE');return}const m=mult(el|0,e.el);let v=d*m,cr=0;if(e.hp0==null)e.hp0=e.hp;
 if(q&&q.m){v=Stats.onHit(q,e,v);if(Math.random()<q.crit){v*=q.critD;cr=1}e.lh=q.id}
 e.hp-=v;if(e.bo!=null&&q){e.dmg=e.dmg||{};e.dmg[q.id]=(e.dmg[q.id]||0)+v}e.fl=.1;dmgNum(e.x,e.y-e.r,v,cr?'#ffd23f':m>1?'#43ff7a':m<1?'#ff4a4a':'#fff',cr?32:m>1?30:m<1?14:18,cr?String(Math.max(1,Math.round(v*10)))+'!':0);
 if(q&&q.m)Stats.afterHit(q,e,v)}
// Dash (0.7): hasta DASH_N cargas, cada una se recarga en DASH_CD s; mientras dura (DASH_T) sos invulnerable.
// Espacio o Shift (celular: botón #dbtn). El invitado online lo hace en su pantalla y le avisa al anfitrión (mensaje 'dash').
const DASH_N=2,DASH_CD=2.6,DASH_T=.17,DASH_V=1000;
function dash(q){if(!q||q.dead||!running||paused||evo||Finale.on)return;if(q.dc==null)q.dc=DASH_N;if(q.dc<1||q.dsT>0)return;q.dc--;
 let [dx,dy]=inputOf(q);if(!dx&&!dy){dx=q.face||1;dy=0}const l=Math.hypot(dx,dy);q.ddx=dx/l;q.ddy=dy/l;q.dsT=DASH_T;q.gh=[];if(!isOnline||q.id===myIdx)Sound.play('dash');return 1}
function myDash(){if(!running)return;if(isOnline){const q=P[myIdx];if(dash(q)&&!isHost&&conn)sendTo(conn,{type:'dash'})}else dash(P[0])}
function hurt(q,d,el,src){if(q.dead||q.dsT>0)return;const m=mult(el,q.el|0);let v=d*m*(1-q.arm);v=Stats.onHurt(q,v,src);if(v<=0)return;q.hp-=v;q.inv=.45;if(!isOnline||q.id===myIdx)Sound.play('hurt');burst(q.x,q.y,'#ff3d81');dmgNum(q.x,q.y-q.r-6,v,m>1?'#ff4a4a':m<1?'#43ff7a':'#ffb0b0',20);if(q.hp<=0){q.hp=0;if(Stats.onDeath(q))return;q.dead=true;q.revP=0;for(let i=0;i<20;i++)burst(q.x,q.y,PC[q.id])}}
function tot(q,k){return Stats.pts(q,k)}   // puntos de stat: especie + partida + árbol (stats.js)
function np(i,cid){return{id:i,cid:cid||'001_guilmon',el:elOf(cid||'001_guilmon'),revP:0,revSpd:1,x:0,y:0,hp:100,max:100,r:16,sp:210,face:1,inv:0,dmg:1,rate:.6,multi:1,pierce:0,mag:70,stage:0,alt:{},line:0,branchId:null,weak:false,dead:false,moving:false,atkT:0,arm:0,xpm:1,coin:1,st:{FUE:0,VEL:0,VIT:0,INT:0},wp:{},wt:{},oa:0,skT:0}}

// ids: criatura de cada jugador, ej. ['002_renamon'] o ['001_guilmon','003_terriermon']
// los: "loadout" de cada jugador (árbol y vínculo de SU guardado, ver trees.js). Si falta, se arma con el de este navegador.
async function start(m,ids,los){
  ids=ids&&ids.length?ids:['001_guilmon'];los=los||[];
  await initGame(ids);
  { const sd = World.nextSeed != null ? World.nextSeed : (Math.random() * 2 ** 31) | 0; World.nextSeed = null; await World.gen(sd).catch(e => { console.error(e); return World.load(); }).catch(e => console.error(e)); }   // mapa nuevo (map.js)
  mode=lastMode=m;P=[];for(let i=0;i<m;i++){const q=np(i,ids[i]||ids[0]);{const s0=World.startPos(),a=i/m*6.283,sp=World.freeSpot(s0[0]+(m===1?0:Math.cos(a+Math.PI)*45),s0[1]+(m===1?0:Math.sin(a+Math.PI)*30),q);q.x=sp[0];q.y=sp[1]}Stats.init(q,chal('notree')?null:(los[i]||Trees.loadout(q.cid)));if(chal('glass')){q.m.hpX*=.5;q.m.dmgX*=1.5;Stats.calc(q,true)}P.push(q)}
  p=P[0];cam={x:P[0].x,y:P[0].y};en=[];sh=[];pt=[];gems=[];fx=[];ef=[];eb=[];pending=[];xp=0;lvl=1;need=xpNeed(1);paused=false;evo=null;t=0;kills=0;spawnT=0;running=true;
  menuPause=false;$('pause').style.display='none';document.body.classList.add('ingame');Bosses.reset();Gate.reset();Finale.reset();Weather.reset();Items.reset();Enemies.newRun();await Enemies.prepare();await Promise.all(P.map(q=>CreatureLoader.loadAlts(q.cid).catch(e=>console.error(e))));   // evoluciones alternativasif(P.some(q=>q.m.itemStart))Items.on.push({x:P[0].x+50,y:P[0].y+30,k:'meat',l:Items.LIFE});mine().forEach(seeForm);   // el HUD solo se ve en partida
  $('ov').style.display='none';$('up').style.display='none';$('evt').style.display='none';
  hudBoxes(m);rk={};picked=new Set();
  renderLegend();Sound.music(true);if(typeof Achievements!=='undefined')Achievements.onStart();if(isOnline)bgStart();syncT=0;if(window.onRunStart)window.onRunStart();last=performance.now();requestAnimationFrame(loop);
}

// ---------- Selección de criatura ----------
// Muestra una pantalla con una carta por criatura. Devuelve (promesa) el id elegido.
async function askCreature(title, color) {
  await Promise.all(CREATURES.map(c => CreatureLoader.load(c.id).catch(e => console.error(e))));
  const list = CREATURES.filter(c => CreatureLoader.cache[c.id]);
  if (!list.length) throw new Error('No hay criaturas cargadas');
  return new Promise((res, rej) => {
    pickRes = res; pickRej = rej; pickList = list;
    $('up').classList.add('pick');   // estilo "pantalla de Digivice" (ver style.css)
    const h = $('up').querySelector('h2'); h.textContent = title; h.style.color = color || '';
    const nums = list.map((_, i) => i + 1);
    $('up').querySelector('p').textContent = TOUCH ? 'Tocá un Digimon para ver su detalle y después «Elegir».' : 'Hacé clic en un Digimon (o usá las flechas) y confirmá con Enter. Atajo: teclas ' + nums.slice(0, 9).join(', ');
    const c = $('cards'); c.innerHTML = '';
    // Grilla: los Digimon que hay + casillas vacías ("en negro") para los que se vayan sumando
    const grid = document.createElement('div'); grid.className = 'pk-grid';
    const slots = Math.max(PICK_SLOTS, Math.ceil(list.length / PICK_COLS) * PICK_COLS);
    for (let i = 0; i < slots; i++) {
      const cr = list[i];
      if (!cr) { const d = document.createElement('div'); d.className = 'pk-slot lock'; d.innerHTML = '<span class="q">?</span><small>???</small>'; grid.appendChild(d); continue; }
      const C = CreatureLoader.cache[cr.id], M = C.meta, nm = (M.stages[2] || M.stages[0]).name, el = elOf(cr.id);
      const b = document.createElement('button'); b.className = 'pk-slot'; b.dataset.i = i;
      if (!unlocked(cr.id)) {   // bloqueado: se ve su Digitama; al tocarlo muestra la misión para conseguirlo
        b.classList.add('egg-slot'); b.style.setProperty('--ac', '#5a6f84');
        b.innerHTML = '<span class="pk-n">' + String(i + 1).padStart(2, '0') + '</span>' + Progress.eggHtml(cr.id, 2) + '<small>' + (Progress.state(cr.id) === 'egg' ? 'Digitama' : '???') + '</small>';
        b.onclick = () => { pickShow(i); pickTop(); }; grid.appendChild(b); continue;
      }
      b.style.setProperty('--ac', ELC[el]);
      b.innerHTML = '<span class="pk-n">' + String(i + 1).padStart(2, '0') + '</span>' + thumbOf(C, 'stage_2') + '<small>' + nm.replace(/-/g, '‑') + '</small>';
      b.onclick = () => { if (pickSel === i) pickDone(cr.id); else { pickShow(i); pickTop(); } };   // segundo clic = elegir
      b.ondblclick = () => pickDone(cr.id);
      grid.appendChild(b);
    }
    const det = document.createElement('div'); det.className = 'pk-detail'; det.id = 'pk-detail';
    c.appendChild(grid); c.appendChild(det);
    const prev = list.findIndex(x => x.id === selected && unlocked(x.id));
    pickShow(prev >= 0 ? prev : 0);
    showUp();
  });
}
// ---------- Panel de detalle de la selección ----------
const PICK_COLS = 8, PICK_SLOTS = 40;
let pickSel = 0, pickAnim = null;
// celular (detalle arriba de la grilla): al tocar un Digimon se sube a ver su detalle y el botón de elegir
const pickTop = () => { if (innerWidth <= 900) $('up').scrollTo({ top: 0, behavior: 'smooth' }); };
// Muestra el Digimon i de la lista. key = qué forma se ve en grande ('stage_0'..'stage_4' o 'branch_<id>')
function pickShow(i, key) {
  const cr = pickList[i]; if (!cr) return;
  pickSel = i;
  document.querySelectorAll('#cards .pk-slot').forEach(s => s.classList.toggle('on', +s.dataset.i === i));
  const C = CreatureLoader.cache[cr.id], M = C.meta, el = elOf(cr.id), nm = (M.stages[2] || M.stages[0]).name;
  if (!unlocked(cr.id)) { clearInterval(pickAnim); const d = $('pk-detail'); d.style.setProperty('--ac', '#5a6f84'); d.innerHTML = Progress.lockedDetail(cr.id); return; }
  key = key || 'stage_2';
  const forms = M.stages.map(s => ({ key: 'stage_' + s.stage, name: s.name }));
  const finals = M.branches.map(b => ({ key: 'branch_' + b.id, name: b.name }));
  const alts = M.stages.flatMap(st => (st.alts || []).map(a => ({ key: 'alt_' + st.stage + '_' + a.id, name: a.name })));   // evoluciones alternativas (Vital Bracelet)
  const shown = [...forms, ...alts, ...finals].find(f => f.key === key) || forms[0];
  const chip = f => '<button class="pk-f' + (f.key === shown.key ? ' on' : '') + '" data-k="' + f.key + '">' + f.name.replace(/-/g, '‑') + '</button>';
  const d = $('pk-detail'); d.style.setProperty('--ac', ELC[el]);
  d.innerHTML = '<div class="pk-spr"><canvas id="pk-cv"></canvas><span class="pk-viewing">' + shown.name + '</span></div>' +
    '<b class="pk-name">' + String(i + 1).padStart(2, '0') + '. ' + nm.replace(/-/g, '‑') + '</b>' +
    '<div class="pk-lbl">Evoluciones <small>(tocá una para verla)</small></div>' +
    '<div class="pk-evo">' + forms.map(chip).join('<i>→</i>') + '</div>' +
    (alts.length ? '<div class="pk-lbl">Evoluciones alternativas <small>(con requisitos)</small></div><div class="pk-evo fin">' + alts.map(chip).join('') + '</div>' : '') +
    '<div class="pk-lbl">Formas finales</div><div class="pk-evo fin">' + finals.map(chip).join('') + '</div>' +
    pickStats(cr.id, shown.key) +
    '<span class="pc-type">Tipo ' + ATTR[el] + '</span>' +
    '<button class="pk-ok">Elegir a ' + nm.replace(/-/g, '‑') + '</button>';
  d.querySelectorAll('.pk-f').forEach(b => b.onclick = () => pickShow(i, b.dataset.k));
  d.querySelector('.pk-ok').onclick = () => pickDone(cr.id);
  // sprite en grande, animado (fila 0 = quieto, alterna las dos columnas), escala entera para que no se deforme el pixel art
  clearInterval(pickAnim);
  // los sprites de las alternativas se cargan recién ahora: cuando llegan, se vuelve a dibujar
  if (!C.altsOk) CreatureLoader.loadAlts(cr.id).then(() => { C.altsOk = 1; if (pickSel === i && $('pk-detail') && $('up').style.display !== 'none') pickShow(i, key); }).catch(() => {});
  const S = C.canvases[shown.key], cv = $('pk-cv'); if (!S || !cv) return;
  const fw = S.canvas.width / S.cols, fh = S.canvas.height / S.rows, sc = Math.max(1, Math.floor(200 / Math.max(fw, fh)));
  cv.width = fw * sc; cv.height = fh * sc;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  let f = 0;
  const paint = () => { g.clearRect(0, 0, cv.width, cv.height); g.drawImage(S.canvas, f * fw, 0, fw, fh, 0, 0, fw * sc, fh * sc); f = 1 - f; };
  paint(); pickAnim = setInterval(paint, 380);
}
// Stats base de la especie, su rasgo, la familia de la forma que se está viendo y el vínculo (0.6: stats.js / trees.js)
function pickStats(id, key) {
  const M = CreatureLoader.cache[id].meta, st = M.stats || {}, tr = M.trait, bi = Trees.bondInfo(id);
  const form = key.startsWith('branch_') ? M.branches.find(b => 'branch_' + b.id === key) : M.stages[+key.split('_')[1]];
  const F = form && Stats.FAM[form.family];
  return '<div class="pk-lbl">Stats base</div><div class="pk-st">' + Stats.KEYS.map(k => '<span title="' + Stats.NAME[k] + ': ' + Stats.PT[k] + ' por punto"><b>' + k + '</b><i><u style="width:' + Math.min(100, (st[k] | 0) * 20) + '%"></u></i><small>' + (st[k] | 0) + '</small></span>').join('') + '</div>' +
    (tr && tr.desc ? '<div class="pk-tr"><b>' + tr.name + ':</b> ' + tr.desc + '</div>' : '') +
    (F ? '<div class="pk-fam" title="' + F.d + '"><b>' + F.n + '</b> · ' + F.d + '</div>' : '') +
    '<div class="pk-bond">Vínculo nivel ' + bi.lv + (bi.next ? ' <small>(' + bi.xp + ' / ' + bi.next + ')</small>' : ' <small>(máximo)</small>') + '</div>';
}
// Teclado en la selección: flechas mueven, Enter elige, 1-9 elige directo. Devuelve true si usó la tecla.
function pickKey(k) {
  if (!pickRes) return false;
  const n = pickList.length;
  if (/^[1-9]$/.test(k)) { if (pickList[k - 1]) pickDone(pickList[k - 1].id); return true; }
  if (k === 'Enter') { if (pickList[pickSel]) pickDone(pickList[pickSel].id); return true; }
  const gr = document.querySelector('#cards .pk-grid'), cols = gr ? getComputedStyle(gr).gridTemplateColumns.split(' ').length : PICK_COLS;   // columnas reales (cambian en pantallas angostas)
  const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[k];
  if (mv) { const j = pickSel + mv; if (j >= 0 && j < n) pickShow(j); return true; }
  return false;
}
function pickDone(id) {
  if (!pickRes || performance.now() - cardsAt < 400 || !unlocked(id)) return;   // evita clicks accidentales al aparecer (y elegir uno bloqueado)
  clearInterval(pickAnim);
  const r = pickRes; pickRes = pickRej = null; pickList = []; $('up').classList.remove('pick'); r(id);
}
function pickCancel() {
  if (!pickRej) return;
  clearInterval(pickAnim);
  const j = pickRej; pickRes = pickRej = null; pickList = [];
  $('up').classList.remove('pick'); $('up').style.display = 'none'; j(new Error('cancel'));
}
// Partida local. El Jugador 1 usa el Digimon elegido en el menú; en 2 jugadores, el Jugador 2 elige el suyo acá.
async function beginLocal(m) {
  if (picking || running) return;
  if (!selected) return openMenuPick();
  picking = true;
  try {
    const ids = [selected];
    for (let i = 1; i < m; i++) ids.push(await askCreature('Jugador ' + (i + 1) + ': elegí tu Digimon', PC[i]));
    $('up').style.display = 'none';
    await start(m, ids);
  } catch (e) { if (e && e.message !== 'cancel') console.error(e); }
  finally { picking = false; }
}
$('go').onclick=()=>{isOnline=false;beginLocal(1)}

// ---------- Menú: Digimon elegido ----------
function buildMenuSel() {
  const st = document.createElement('style');
  st.textContent = '#up{z-index:30}#ov button:disabled{opacity:.4;cursor:not-allowed}#selrow{display:flex;align-items:center;gap:16px;justify-content:center;flex-wrap:wrap;margin:6px 0}#selinfo{display:flex;align-items:center;gap:10px;font-weight:700;font-size:20px}#selinfo img{height:56px!important;margin:0!important;image-rendering:pixelated}#selrow button{margin-top:0!important}';
  document.head.appendChild(st);
  const row = document.createElement('div'); row.id = 'selrow';
  row.innerHTML = '<div id="selinfo"></div><button id="selbtn" class="alt">Elegir Digimon</button>';
  const bar = $('go').parentNode; bar.parentNode.insertBefore(row, bar);
  // menú nuevo: tu Digimon va en la pantalla del Digivice y "Elegir Digimon" queda debajo de las partidas
  if ($('dvscreen')) $('dvscreen').appendChild($('selinfo'));
  if ($('mnu')) { $('go').after($('selbtn')); row.remove(); }   // va debajo de "Nueva Partida" (ya no hay 2 jugadores local)
  $('selbtn').onclick = openMenuPick;
}
function renderSel() {
  const C = selected && CreatureLoader.cache[selected], info = $('selinfo');
  if (C) {
    const M = C.meta, nm = (M.stages[2] || M.stages[0]).name, el = elOf(selected);
    info.innerHTML = thumbOf(C, 'stage_2') + '<span>' + nm + ' <span style="color:' + ELC[el] + '">● ' + ATTR[el] + '</span></span>';
  } else {
    info.innerHTML = '<span style="color:var(--gold)">Elegí tu Digimon para poder jugar</span>';
  }
  ['go'].forEach(id => { if ($(id)) $(id).disabled = !C; });
  if (C && !running) { P = [np(0, selected)]; p = P[0]; draw(); }   // el fondo muestra a tu Digimon
}
// Cambia tu Digimon elegido (lo usan la selección y la eclosión de un Digitama)
window.setPick = function (id) {
  if (!unlocked(id) || running) return;
  selected = id; try { localStorage.setItem('digisurvivor_pick', id); } catch (e) {}
  renderSel(); if (conn) sendTo(conn, { type: 'pick', c: selected }); else if (gs.length) sendRoster(); lobbyChanged();
};
// progress.js terminó de cargar: si tenías elegido uno que ahora está bloqueado, se saca; y se muestran eclosiones pendientes
window.onProgressReady = function () {
  if (selected && !unlocked(selected)) { selected = null; try { localStorage.removeItem('digisurvivor_pick'); } catch (e) {} }
  renderSel(); Progress.showHatch();
};
async function openMenuPick() {
  if (picking || running || pickRes) return;
  picking = true;
  try {
    const id = await askCreature('Elegí tu Digimon', '');
    $('up').style.display = 'none';
    window.setPick(id);
  } catch (e) { if (e && e.message !== 'cancel') console.error(e); }
  finally { picking = false; }
}
// Leyenda de atributos (cada uno es fuerte contra el siguiente), empezando por el tuyo
// Triángulo de atributos: arriba el tuyo; cada flecha va del que gana al que pierde (x1,5 de daño)
// íconos oficiales de los atributos (Wikimon: Vaccine_Icon, Virus_Icon, Data_Icon)
const ATTR_ICON = ['vaccine', 'virus', 'data'].map(n => 'assets/sprites/attr/' + n + '.png');
function renderLegend() {
  const e0 = P[0].el | 0, o = [e0, (e0 + 1) % 3, (e0 + 2) % 3];
  const pt = [[60, 22], [104, 98], [16, 98]];   // vértices: arriba, abajo-der, abajo-izq
  const arrow = (a, b, col) => {   // flecha de a hacia b, recortada para no pisar los íconos
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, r = 17;
    return '<line x1="' + (a[0] + ux * r) + '" y1="' + (a[1] + uy * r) + '" x2="' + (b[0] - ux * (r + 4)) + '" y2="' + (b[1] - uy * (r + 4)) + '" stroke="' + col + '" stroke-width="2.5" marker-end="url(#lgar' + col.slice(1) + ')"/>';
  };
  let s = '<svg viewBox="-4 0 128 122" aria-label="Triángulo de atributos"><defs>';
  ELC.forEach(c => { s += '<marker id="lgar' + c.slice(1) + '" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="' + c + '"/></marker>'; });
  s += '</defs>';
  for (let i = 0; i < 3; i++) s += arrow(pt[i], pt[(i + 1) % 3], ELC[o[i]]);
  o.forEach((e, i) => {
    const [x, y] = pt[i], r = i ? 15 : 19;
    s += '<image href="' + ATTR_ICON[e] + '" x="' + (x - r) + '" y="' + (y - r) + '" width="' + r * 2 + '" height="' + r * 2 + '"><title>' + ATTR[e] + '</title></image>';
  });
  s += '<text x="60" y="76" text-anchor="middle" class="lgx">x1,5</text></svg>';
  $('leg').innerHTML = s;
}

// ---------- Versión y reinicio del progreso ----------
// GAME_VERSION se muestra en el menú. Para reiniciar el progreso de TODOS (ej. al lanzar la versión final),
// poné en RESET_BEFORE la fecha del lanzamiento: todo guardado (navegador o cuenta) con 'updated' anterior
// a esa fecha vuelve a 0 una sola vez (monedas, árbol y misiones del día). Nick, amigos y Digimon elegido no se tocan.
// Ej.: const RESET_BEFORE = Date.parse('2027-03-01T00:00:00-03:00');
const GAME_VERSION = '0.7';
const RESET_BEFORE = Date.parse('2026-10-17T22:42:00-03:00');   // 0.6: todo el progreso anterior vuelve a cero
if($('gver'))$('gver').textContent='v'+GAME_VERSION;
function wipeIfOld(s){if(!RESET_BEFORE||(s.updated||0)>=RESET_BEFORE)return false;
 s.coins=0;s.lv={};s.ac=[0,0,0];s.rc=0;s.tr={};s.bond={};try{localStorage.removeItem('digisurvivor_daily');localStorage.removeItem('digisurvivor_prog')}catch(e){}if(typeof Progress!=='undefined')Progress.st=null;return true}
let save={coins:0,lv:{},ac:[0,0,0],rc:0,tr:{},bond:{}};
try{const s=JSON.parse(localStorage.getItem('digisurvivor'));if(s&&s.lv)save=s}catch(e){}
if(wipeIfOld(save)){save.updated=Date.now();try{localStorage.setItem('digisurvivor',JSON.stringify(save))}catch(e){}}
function persist(){save.updated=Date.now();try{localStorage.setItem('digisurvivor',JSON.stringify(save))}catch(e){}if(window.onSave)window.onSave(save)}
window.getSave=()=>save;
window.loadSave=s=>{save=s;if(typeof Trees!=='undefined')Trees.ensure(save);const w=wipeIfOld(save);if(w){persist()}else{try{localStorage.setItem('digisurvivor',JSON.stringify(save))}catch(e){}}wal();return w};   // devuelve true si lo reinició (firebase.js reinicia también el progreso de la cuenta)   // si la cuenta tenía progreso viejo, se reinicia y se guarda en la nube
function wal(){$('wal').textContent='Monedas: '+save.coins;if(treeOpen&&typeof Trees!=='undefined')$('tw').textContent='Chips de Reformateo: '+(save.rc|0)}
// Árbol de mejoras (trees.js)
$('tb').onclick=()=>Trees.open();
$('tx').onclick=()=>Trees.close();
// Pausa con Escape. En online no se frena la simulación (el otro jugador sigue): solo se abre el menú.
let menuPause=false;
function togglePause(){if(menuPause){menuPause=false;$('pause').style.display='none';if(!isOnline){paused=false;last=performance.now()}return}
 if(paused||evo||pickRes)return;   // con cartas o digievolución en pantalla, Escape no hace nada
 menuPause=true;if(!isOnline)paused=true;
 $('pnote').textContent=isOnline?'Partida online: el juego sigue corriendo mientras estás acá':'El juego está en pausa';
 $('pause').style.display='flex';$('pcont').focus()}
$('pcont').onclick=()=>{if(menuPause)togglePause()};
$('pbtn').onclick=()=>{if(running)togglePause()};
$('dbtn').addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();myDash()},{passive:false});$('dbtn').onclick=()=>myDash();   // dash en celular   // botón de pausa (celular: no hay Escape)
$('pquit').onclick=()=>{if(running)endRun('Run terminada')};
function endRun(title){if(!running)return;
 // si termina el anfitrión, avisa al otro jugador para que también termine (si no, queda jugando con todo congelado)
 if(isOnline&&isHost)sendAll({type:'end',title:title});
 running=false;paused=false;evo=null;pending=[];SkillSys.clearBar();Sound.music(false);Gate.reset();Finale.reset();
 menuPause=false;$('pause').style.display='none';document.body.classList.remove('ingame');
 $('evt').style.display='none';$('up').style.display='none';
 const bc=Math.round(Bosses.coins()*(1+((P[0].m&&P[0].m.bossCoin)||0))),m=Math.floor(t/60),s=Math.floor(t%60),c=Math.floor((kills*.5+t/6+lvl*8)*P[0].coin)+bc;save.coins+=c;persist();Bosses.hideBar();
 $('t').textContent=title;
 const trTxt=Trees.onRunEnd(mine(),t);
 $('m').textContent='Aguantaste '+m+':'+String(s).padStart(2,'0')+' y eliminaste '+kills+' Digimon. Ganaste '+c+' monedas'+(bc?' ('+bc+' por jefes)':'')+'.'+trTxt;
 // misiones diarias (missions.js): cuenta la partida con los datos de TU jugador (en online el invitado es P[1])
 if(typeof Missions!=='undefined'){const me=(isOnline&&P[myIdx])||P[0],done=Missions.onRunEnd({kills,secs:t,lvl,stage:me.stage|0,online:isOnline,local2p:!isOnline&&mode>1,attr:me.el|0,coins:c,skillMax:Object.entries(me.wp).some(([k,v])=>v>=SkillSys.maxOf(k))});
  if(done.length)$('m').textContent+=' ¡'+(done.length>1?'Misiones cumplidas':'Misión cumplida')+': '+done.map(x=>x.name).join(', ')+'! '+(done.length>1?'Reclamalas':'Reclamala')+' en Misiones diarias.'}
 // progresión permanente (progress.js): Digitamas y desbloqueos
 if(typeof Progress!=='undefined'){const r=Progress.onRunEnd({kills,secs:t,pl:mine().map(q=>({cid:q.cid,stage:q.stage|0})),bosses:Bosses.down.slice()});
  if(r.eggs.length)$('m').textContent+=' ¡Conseguiste '+(r.eggs.length>1?r.eggs.length+' Digitamas':'un Digitama')+' ('+r.eggs.map(u=>u.name).join(', ')+')! '+(r.eggs.length>1?'Hacelos':'Hacelo')+' eclosionar en el Digimon Analyzer.';
  $('m').textContent+=' +'+r.txp+' XP de Tamer'+(r.rankUp?'. ¡Subiste a '+r.rankUp+'! (+'+r.reward+' monedas)':'')+'.';
  if(r.hatched.length)setTimeout(()=>Progress.showHatch(),700)}
 // logros (achievements.js): antes que Challenge.onRunEnd, que borra las reglas del desafío
 if(typeof Achievements!=='undefined')Achievements.onRunEnd({kills,coins:c,online:isOnline,n:P.length,chal:typeof Challenge!=='undefined'&&!!Challenge.active,fin:title==='Yggdrasill reinició el Digimundo',fast:Bosses.fast,me:mine()[0]});
 if(typeof Challenge!=='undefined')$('m').textContent+=Challenge.onRunEnd({kills,secs:t,bosses:Bosses.down.length,cid:(mine()[0]||P[0]).cid});
 wal();isOnline=false;$('ov').style.display='flex';lobbyChanged()}

// Alto en pantalla del dibujo de un compañero según su etapa (Bebé, Bebé II, Novato, Campeón, Perfecto, forma final)
const BUDDY_H=[34,42,62,82,98,114];
// Caja del dibujo real (sin transparencia) en el cuadro "quieto" de una hoja; se calcula una vez y queda guardada en S.cb
function cbox(S){if(S.cb)return S.cb;const fw=Math.floor(S.canvas.width/S.cols),fh=Math.floor(S.canvas.height/S.rows);let x0=fw,y0=fh,x1=-1,y1=-1;
 try{const d=S.canvas.getContext('2d').getImageData(0,0,fw,fh).data;for(let y=0;y<fh;y++)for(let x=0;x<fw;x++)if(d[(y*fw+x)*4+3]>24){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}catch(e){}
 if(x1<x0){x0=0;y0=0;x1=fw-1;y1=fh-1}return S.cb={x0,y0,x1:x1+1,y1:y1+1}}
function drawBuddy(q,s,x,y,f,a){
 const C=CR(q);
 if(!C)return;

 // forma actual; con X-Antibody usa su forma X si la línea la tiene
 const fk = formKey(q, s), xs = q.xa && C.canvases['x_' + fk];
 const spriteInfo = xs || (fk === 'dark' ? darkSpr(C) : C.canvases[fk]);

 if(!spriteInfo) return;

 const cv = spriteInfo.canvas;
 const cols = spriteInfo.cols, rows = spriteInfo.rows;
 const fw = cv.width / cols, fh = cv.height / rows;
 // Tamaño parejo por etapa: se mide el dibujo real (sin el relleno transparente, cbox) y se escala para que mida
 // BUDDY_H[etapa] de alto (o su ancho, si es muy ancho). Así no importa de qué pack venga ni cuánto relleno tenga la hoja.
 // Los pies (el borde de abajo del dibujo) quedan siempre a +48 de q.y.
 const B = cbox(spriteInfo), k = BUDDY_H[Math.min(5, s)] / Math.max(B.y1 - B.y0, (B.x1 - B.x0) * 0.75);
 const h = (B.y1 - B.y0) * k, w = (B.x1 - B.x0) * k, ox = (B.x0 + B.x1) / 2 * k;
 q.dh = h;

 let row = 0, col = 0;
 if(q.dead){
  row = 2; col = 0;
 }else if(!q.moving && (q.atkT > q.rate - 0.25 || q.skT > 0)){   // pose de ataque solo quieto (caminando con la pose fija parecía que patinaba)
  row = 5; col = 0;
 }else if(q.moving){
  row = 1; col = Math.floor(t * 6) % 2;
 }else{
  row = 0; col = Math.floor(t * 4) % 2;
 }

 cx.save();
 cx.globalAlpha = a;
 cx.imageSmoothingEnabled = false;
 cx.translate(x, y);

 cx.fillStyle = 'rgba(0,0,0,.35)';
 cx.beginPath();
 cx.ellipse(0, 46, w * .35, 5, 0, 0, 6.283);
 cx.fill();

 if(q.xa){cx.strokeStyle='#c05bff';cx.lineWidth=2;cx.beginPath();cx.ellipse(0,46,w*.46,9,0,0,6.283);cx.stroke()}   // X-Antibody
 if(fk === 'dark' && !q.dead){cx.globalAlpha=a*(.3+.15*Math.sin(t*5));cx.fillStyle='#6a12d8';cx.beginPath();cx.ellipse(0,48-h*.45,w*.42,h*.5,0,0,6.283);cx.fill();cx.globalAlpha=a}   // aura oscura

 if(mode > 1){
  cx.strokeStyle = PC[q.id];
  cx.lineWidth = 3;
  cx.beginPath();
  cx.ellipse(0, 46, w * .4, 7, 0, 0, 6.283);
  cx.stroke();
 }

 if(f < 0) cx.scale(-1, 1);
 cx.drawImage(cv, col * fw, row * fh + 1, fw, fh - 2, -ox, 48 - B.y1 * k + k, fw * k, (fh - 2) * k);   // 1 px menos arriba y abajo: con zoom no entero se colaba la fila vecina de la hoja (líneas)
 // X-Antibody sin forma X propia: "glitch" violeta intermitente
 if(q.xa && !xs && !q.dead && Math.floor(t * 10) % 3 === 0){cx.globalAlpha=a*.45;cx.filter='hue-rotate(260deg) saturate(3)';cx.drawImage(cv, col * fw, row * fh + 1, fw, fh - 2, -ox + (Math.random() * 6 - 3), 48 - B.y1 * k + k, fw * k, (fh - 2) * k);cx.filter='none'}
 cx.restore();
}

// ---------- Enemigos con sprites (ENEMY_LINE) ----------
// El tamaño sale del radio de colisión; el atributo se ve en el aro de color de la sombra.
const enSpr=e=>{if(e.bo!=null)return Bosses.sprite(e.bo);if(e.et!=null)return Enemies.sprite(e.et);const C=CreatureLoader.cache[ENEMY_LINE];return C&&e.sk?C.canvases[e.sk]:null};
const enH=e=>e.bo!=null?Bosses.h(e):Math.max(50,e.r*4.2);
const enTop=e=>enSpr(e)?enH(e)/2:e.r;
// silueta blanca de una hoja (se genera una vez): reemplaza a cx.filter='brightness(3)', que es muy lento
function whiteOf(S){if(S.white)return S.white;const c=document.createElement('canvas');c.width=S.canvas.width;c.height=S.canvas.height;const g=c.getContext('2d');g.drawImage(S.canvas,0,0);g.globalCompositeOperation='source-atop';g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);return S.white=c}
// Alto en pantalla del dibujo de un enemigo según el nivel de su especie (un poco más chicos que los compañeros)
const ENEMY_H=[38,44,58,72,86,100];
// piso: ningún enemigo común se ve más chico que la mitad de tu Digimon (al evolucionar, los chiquitos crecen con vos)
const enMin=()=>{let s=0;for(const q of P)if(q.stage>s)s=q.stage;return BUDDY_H[Math.min(5,s)]*.5};
function drawEnemy(e){
 const S=enSpr(e);if(!S||!S.canvas)return false;
 // alto del dibujo real: enemigos según el nivel de su especie (ENEMY_H, tanques más grandes y enjambres más chicos),
 // jefes según su tamaño; los pies quedan donde siempre (abajo, en h/2), que es donde chocan con las paredes
 const cv=S.canvas,fw=cv.width/S.cols,fh=cv.height/S.rows,h=enH(e),B=cbox(S),dd=e.et!=null&&Enemies.def(e.et);
 const th=e.bo!=null?h*.68:dd?Math.max(enMin()*(e.kd==='swarm'?.9:1),ENEMY_H[Math.min(5,dd.tier)]*(e.kd==='tank'?1.25:e.kd==='swarm'?.9:1)):h*.62;
 const kk=th/Math.max(B.y1-B.y0,(B.x1-B.x0)*.75),w=(B.x1-B.x0)*kk*1.35;
 const stop=e.bo!=null?e.at>0:e.et!=null?e.st>0:e.gun&&e.cd>1.9,row=stop?5:1,col=Math.floor(t*(e.k===1?9:6)+e.x*.01)&1;
 if(e.mn){cx.save();cx.strokeStyle='#c05bff';cx.lineWidth=2.5;cx.globalAlpha=.8;cx.beginPath();cx.ellipse(e.x,e.y+h/2-2,e.r*1.3,6,0,0,6.283);cx.stroke();cx.restore()}   // refuerzo del jefe: aro violeta
 if(e.bo!=null&&e.p2){cx.save();cx.globalAlpha=.22+.1*Math.sin(t*8);cx.fillStyle='#ff2d2d';cx.beginPath();cx.ellipse(e.x,e.y+h/2-th*.45,th*.55,th*.6,0,0,6.283);cx.fill();cx.restore()}   // jefe enfurecido (fase 2): aura roja
 if(e.bo!=null&&e.shd){cx.save();const R=th*.62,yy=e.y+h/2-th*.45;cx.globalAlpha=.18+.06*Math.sin(t*10);cx.fillStyle='#7fdcff';cx.beginPath();cx.arc(e.x,yy,R,0,6.283);cx.fill();cx.globalAlpha=.85;cx.strokeStyle='#bff0ff';cx.lineWidth=3;cx.setLineDash([14,8]);cx.lineDashOffset=-t*40;cx.stroke();cx.setLineDash([]);cx.restore()}   // escudo (Cruz giratoria): inmune
 cx.save();cx.translate(e.x,e.y);cx.imageSmoothingEnabled=false;
 cx.fillStyle='rgba(0,0,0,.35)';cx.beginPath();cx.ellipse(0,h/2-2,w*.32,4,0,0,6.283);cx.fill();
 cx.strokeStyle=ELC[e.el];cx.lineWidth=e.bo!=null?5:2;cx.beginPath();cx.ellipse(0,h/2-2,w*.36,e.bo!=null?10:6,0,0,6.283);cx.stroke();
 if(Math.cos(e.ang)<0)cx.scale(-1,1);
 cx.drawImage(e.fl>0?whiteOf(S):cv,col*fw,row*fh+1,fw,fh-2,-(B.x0+B.x1)/2*kk,h/2-2-B.y1*kk+kk,fw*kk,(fh-2)*kk);   // golpeado: silueta blanca
 cx.restore();return true}

function startEvo(s){evo={t:0,s,done:0};Sound.play('evo');const v=$('evt');v.style.display='block';v.textContent='¡Tu compañero está digievolucionando!'}
function stepEvo(dt){evo.t+=dt;
 if(!evo.done&&evo.t>=1.3){evo.done=1;
  for(const q of P){
   const s=q.stage=evo.s;q.r=[14,16,19,22,25,28][s] || 20;
   Stats.evolve(q,s);   // perfil de la especie, bono de etapa / rama ("bonus" en el JSON), familia nueva y evolución perfecta
   for(let i=0;i<30;i++)burst(q.x,q.y,i%2?'#fff':'#ffd23f');
  }
  mine().forEach(seeForm);   // Digimon Analyzer
  // nombre(s) de la nueva forma de cada jugador (sin repetir)
  const names=P.map(q=>formName(q,evo.s)).filter((n,i,a)=>n&&a.indexOf(n)===i);
  $('evt').textContent='¡'+names.join(' y ')+'!'+(evo.s<5&&P.some(q=>q.perfect)?' · Evolución perfecta':'');
 }
 if(evo.t>=2.8){
  const s=evo.s;evo=null;const v=$('evt');
  v.textContent='¡Enemigos reforzados!';
  setTimeout(()=>{if(!evo)v.style.display='none'},2600);
  if (isOnline) {
    if (isHost) {
      hostRound('trigger_levelup');
      startCards();
    }
  } else {
    startCards();
  }
 }}

const SN={FUE:'Fuerza',VEL:'Velocidad',VIT:'Vitalidad',INT:'Inteligencia'};
function setHead(txt){$('up').classList.remove('pick');const h=$('up').querySelector('h2');h.textContent=txt+(mode>1&&!isOnline&&!txt.startsWith('ESPERANDO')?' · '+pname(p.id):'');h.style.color=mode>1?PC[p.id]:''}

// Evita que un click o tecla de la pantalla anterior elija una carta sin querer
// (en modo FAST los niveles se encadenan y la elección aparece justo donde estaba la carta anterior).
let cardsAt = 0;
function showUp(){ cardsAt = performance.now(); $('up').style.display = 'flex'; }
function thumbOf(C, key){
  const s = C && (key === 'dark' ? darkSpr(C) : C.canvases[key]); if(!s) return '';
  const fw = s.canvas.width / s.cols, fh = s.canvas.height / s.rows;
  const c = document.createElement('canvas'); c.width = fw; c.height = fh;
  c.getContext('2d').drawImage(s.canvas, 0, 0, fw, fh, 0, 0, fw, fh);
  return '<img src="' + c.toDataURL() + '" style="display:block;height:72px;image-rendering:pixelated;margin-bottom:6px">';
}

// Elegir evolución: en Campeón y Perfecto (si la línea tiene alternativas) y en la forma final. lineStage = etapa que se elige.
// La forma de siempre (y la primera forma final) sale solo con experiencia; las demás se ven bloqueadas hasta cumplir requisitos.
let lineStage = 5;
const STAGE_NAMES_UP = ['Bebé', 'Bebé II', 'Novato', 'Campeón', 'Perfecto', 'forma final'];
function chooseLine(){
  paused = true;
  p = isOnline ? P[myIdx] : pending[0];
  const s = lineStage;
  cardMode='line'; setHead(s >= 5 ? '¡Elegí tu evolución final!' : '¡Elegí tu evolución a ' + STAGE_NAMES_UP[s] + '!');
  const C = CR(p), need = v => Math.ceil(v * REQ_FACTOR);
  const meets = o => o.xp || TEST || (Object.entries(o.req || {}).every(([k, v]) => (p.st[k] | 0) >= need(v)) && Object.entries(o.vp || {}).every(([k, v]) => Stats.vpVal(p, k) >= need(v)));
  cur = formOpts(p, s).map(o => ({
    n: o.name, lock: !meets(o), weak: false, op: 'line', stage: s, lineIdx: o.idx, branchId: s >= 5 ? o.id : null, altId: s < 5 ? o.id : null, key: o.key, xp: o.xp,
    d: o.desc || '',
    req: o.xp ? 'solo experiencia' + (s >= 5 ? ' (llegar al nivel ' + LINE_LEVEL + ')' : '') : [...Object.entries(o.req || {}).map(([k, v]) => `${SN[k]} ${Math.min(p.st[k] | 0, need(v))}/${need(v)}`),
      ...Object.entries(o.vp || {}).map(([k, v]) => `${Stats.VPN[k]} ${Math.min(Stats.vpVal(p, k), need(v))}/${need(v)}`)].join(' · '),
    f: s >= 5 ? () => { p.line = o.idx; p.branchId = o.id; p.weak = false; p.dark = false; } : () => { p.alt = p.alt || {}; p.alt[s] = o.id; }
  }));
  const c=$('cards');c.innerHTML='';
  cur.forEach((u,i)=>{
    const b=document.createElement('button');
    b.className='card lv line'+(u.lock?' locked':'');
    b.disabled=u.lock;
    b.innerHTML='<span class="kn">'+(i+1)+'</span><span class="kt">'+(u.lock?'Bloqueada':u.xp?'Por experiencia':'Evolución alternativa')+'</span>'+thumbOf(C,u.key)+'<b>'+u.n+'</b><span class="kd">'+u.d+'</span><em>'+(u.lock?'Te falta: ':'Requiere: ')+u.req+'</em>';
    b.onclick=()=>choose(u);
    c.appendChild(b);
  });
  if($('up').querySelector('p')) $('up').querySelector('p').textContent='La primera sale solo con experiencia; las demás se desbloquean cumpliendo sus requisitos en esta partida';
  showUp();
}

// al subir de nivel: una onda de poder alrededor de cada jugador que empuja a los enemigos cercanos y los daña un poco
function powerPulse(){if(isOnline&&!isHost)return;for(const q of P){if(q.dead)continue;const R=200+12*(q.stage|0)*(q.area||1);
 ef.push({k:'ring',x:q.x,y:q.y,R,col:'#ffe066',l:.45,m:.45});for(let i=0;i<18;i++)burst(q.x,q.y,i%2?'#fff':'#ffd23f');
 for(const e of en){if(e.bo!=null)continue;const dx=e.x-q.x,dy=e.y-q.y,d=Math.hypot(dx,dy);if(d<R&&d>0){World.move(e,dx/d*90,dy/d*90);hit(e,q.dmg*3,q.el,q)}}}}
function levelUp(){
  xp-=need;lvl++;need=xpNeed(lvl);paused=true;powerPulse();

  const EL=evoLevels();
  if(EL.includes(lvl)){
    const nextStage = EL.indexOf(lvl) + 1;
    // con evoluciones alternativas para alguno: primero se elige (como la forma final), después evoluciona
    if (nextStage >= 3 && P.some(q => !q.gone && formOpts(q, nextStage).length > 1)) { lineStage = nextStage; openLine(); return; }
    startEvo(nextStage);
    if (isOnline && isHost) sendAll({ type: 'trigger_evo', stage: nextStage });
    return;
  }
  if(lvl===LINE_LEVEL){ lineStage = 5; openLine(); return; }
  if (isOnline) {
    pending = [P[myIdx]];
    if (isHost) hostRound('trigger_levelup');
  } else {
    pending = [...P];
  }
  startCards();
}
// abre la elección de evolución (lineStage) para todos
function openLine(){
  if (isOnline) {
    pending = [P[myIdx]]; picked = new Set();
    if (isHost) hostRound('trigger_line');
  } else {
    pending = [...P];
  }
  chooseLine();
}

function startCards(){
  picked = new Set();
  if (isOnline) {
    pending = [P[myIdx]];
  } else {
    pending = [...P];
  }
  showCards();
}

// keep: volver a mostrar las mismas cartas (al cancelar un reemplazo de skill)
// ---------- Rareza de las cartas (0.7) ----------
// blanca (común) · verde (estándar) · azul (rara) · violeta (excelente) · naranja ★ (épica). La chance depende de la
// etapa: de bebé no sale naranja y en la forma final es mucho más probable. La rareza multiplica lo que da la carta:
// skill nueva (poder de la skill, q.wm), mejora de skill (poder extra) o carta de stat (efecto). La naranja además
// escala con la etapa. El poder extra de una skill también la agranda (skills.js), así se nota.
const RAR=[{n:'Común',c:'#e8eef5'},{n:'Estándar',c:'#4dff7a'},{n:'Rara',c:'#3fa8ff'},{n:'Excelente',c:'#b35cff'},{n:'Épica',c:'#ff9a2e'}];
const RAR_W=[[50,38,12,0,0],[45,38,15,2,0],[35,38,20,6,1],[25,35,25,11,4],[15,30,30,17,8],[8,25,30,22,15]];
const RAR_NEW=[.85,1,1.15,1.3,1.5],RAR_UP=[1,1.04,1.08,1.14,1.22],RAR_ST=[.8,1,1.3,1.6,2];
function rollRar(q){const w=RAR_W[Math.min(5,q.stage|0)];let r=Math.random()*w.reduce((a,b)=>a+b,0);for(let i=0;i<5;i++){r-=w[i];if(r<0)return i}return 1}
function rarMul(u,q){const r=u.rar|0,s=q.stage|0;return u.op==='wp'?(u.fresh?RAR_NEW[r]*(r===4?1+.08*s:1):RAR_UP[r]*(r===4?1+.03*s:1)):RAR_ST[r]*(r===4?1+.1*s:1)}
// aplica el poder extra de una carta de skill (fresh: skill nueva; si no, mejora)
function rarSkill(q,k,fresh,m){if(!k||!m)return;q.wm=q.wm||{};q.wm[k]=fresh?m:(q.wm[k]||1)*m}
const pct=m=>(m>=1?'+':'')+Math.round((m-1)*100)+'%';
function showCards(keep){
  if(!keep)Sound.play('level');paused=true; p=pending[0]; cardMode='cards'; setHead('¡Subiste de nivel!');
  $('up').querySelector('p').textContent=TOUCH?'Tocá la carta que quieras':'Elegí con el mouse o con las teclas 1 a '+nCards(p);
  if(keep)cur=keep;else{const sk=SkillSys.cards(p).slice(0,2),st=Stats.CARDS.map(c=>({c:c.c,n:c.n,d:c.d,op:c.op,f:()=>{}})).sort(()=>Math.random()-.5);cur=[...sk,...st].slice(0,nCards(p));for(const u of cur){u.rar=rollRar(p);u.rm=rarMul(u,p)}}
  const c=$('cards');c.innerHTML='';
  // tipo de carta: skill nueva / mejora de skill / mejora de stat (cada una con su etiqueta y color)
  cur.forEach((u,i)=>{const b=document.createElement('button'),sk=u.op==='wp',nw=sk&&u.tag==='Skill NUEVA',sd=sk&&SkillSys.def(u.wpKey),R=RAR[u.rar|0];
   b.className='card lv '+(nw?'new':sk?'skup':'stat')+' rar'+(u.rar|0);if(sd)b.style.setProperty('--ac',SkillSys.col(sd));b.style.setProperty('--rar',R.c);
   const bon=u.rm&&Math.abs(u.rm-1)>.005?(sk?pct(u.rm)+' de poder':'Efecto '+pct(u.rm)):'';
   b.innerHTML=((u.rar|0)===4?'<span class="rstar">★</span>':'')+'<span class="kn">'+(i+1)+'</span><span class="kt">'+(nw?'Skill nueva':sk?'Mejora de skill':'Mejora')+'</span><span class="rlab">'+R.n+(bon?' · '+bon:'')+'</span><b>'+u.n+'</b><span class="kd">'+u.d+'</span>'+(u.c?'<em>Suma a '+SN[u.c]+'</em>':u.tag&&!nw?'<em>'+u.tag+'</em>':nw&&u.full?'<em>Tenés las 4 ocupadas: elegís cuál reemplazar</em>':'');
   b.onclick=()=>choose(u);c.appendChild(b)});
  // Reroll (árbol de Tamer): un cartelito abajo de las cartas (tecla R); cambia las cartas que salieron
  if(p.rr>0){const r=document.createElement('button');r.className='rr-btn';r.innerHTML='<b>R</b> Reroll <small>· te quedan '+p.rr+'</small>';
   r.onclick=()=>reroll();c.appendChild(r)}
  // online: si tu jugador está caído, se elige una carta de stat sola (así no frena a los demás)
  if(isOnline&&p.dead&&!keep){const me=p;$('up').querySelector('p').textContent='Estás caído: se elige una carta sola';
   setTimeout(()=>{if(pending[0]===me&&cardMode==='cards'){cardsAt=0;choose(cur.find(u=>u.c)||cur[0])}},900)}
  showUp();
}
// Con las 4 skills ocupadas: elegir cuál olvidar para aprender la nueva (u). "Volver" regresa a las cartas.
function showReplace(u){
  const q=pending[0],prev=cur;setHead('Reemplazá una skill');
  $('up').querySelector('p').textContent='Para aprender '+u.n+' tenés que olvidar una de estas'+(TOUCH?'':' (teclas 1 a 5)');
  cur=Object.keys(q.wp).filter(k=>SkillSys.def(k)&&q.wp[k]>0).map(k=>({n:SkillSys.def(k).name,k,pickRep:u}));
  cur.push({n:'Volver',back:prev});
  const c=$('cards');c.innerHTML='';
  cur.forEach((o,i)=>{const b=document.createElement('button'),d=o.k&&SkillSys.def(o.k);
   b.className='card lv '+(d?'rep':'stat');if(d)b.style.setProperty('--ac',SkillSys.col(d));
   b.innerHTML='<span class="kn">'+(i+1)+'</span><span class="kt">'+(d?'Olvidar':'Cancelar')+'</span>'+(d?'<img class="kic" src="'+SkillSys.iconOf(d)+'" alt="">':'')+'<b>'+o.n+'</b>'+
    (d?'<em>Nivel '+q.wp[o.k]+'/'+SkillSys.maxOf(o.k)+' · se reemplaza por '+u.n+'</em>':'<span class="kd">Volver a las cartas</span>');
   b.onclick=()=>choose(o);c.appendChild(b)});
  showUp();
}

function reroll(){if(!paused||cardMode!=='cards'||!p||!(p.rr>0)||performance.now()-cardsAt<400||!pending.length)return;p.rr--;showCards()}
function choose(u){
  if(performance.now() - cardsAt < 800) return;   // ignora clicks/teclas accidentales justo al aparecer
  if(!pending.length) return;                      // ya elegiste (esperando al otro jugador): ignora teclas repetidas
  if(!u||u.lock) return;                            // forma final bloqueada (también por teclado)
  if(u.back){showCards(u.back);return}             // cancelar el reemplazo
  if(u.pickRep){const o=u.pickRep;o.rep=u.k;choose(o);return}   // eligió qué skill olvidar
  if(u.op==='wp'&&u.fresh&&u.full&&!u.rep&&!SkillSys.canTake(pending[0],u.wpKey)){showReplace(u);return}   // 4 ocupadas: preguntar cuál reemplazar
  const q=pending[0],modo=cardMode;p=q;const fr=u.op==='wp'&&!(q.wp[u.wpKey]|0);u.f();if(modo==='cards'&&u.c){q.st[u.c]++;Stats.card(q,u.op,u.rm||1)}else if(modo==='cards'&&u.op==='wp')rarSkill(q,u.wpKey,fr,u.rm||1);p=P[0];pending.shift();

  if (isOnline) {
    const payload = { type: isHost ? 'host_choice' : 'client_choice', rnd: isHost ? rnd : gRnd, i: myIdx, op: u.op, c: u.c, wpKey: u.wpKey, lineIdx: u.lineIdx, branchId: u.branchId, stage: u.stage, altId: u.altId, rm: u.rm, weak: u.weak, dark: u.dark, rep: u.rep };
    sendAll(payload);
    picked.add(myIdx);
    if (isHost ? !mustPick().every(i => picked.has(i)) : picked.size < P.filter(q => !q.gone).length) {
      setHead('ESPERANDO A LOS DEMÁS');
      $('cards').innerHTML = '<p style="font-size:20px;color:var(--gold);padding:20px;">' + pname(myIdx) + ' listo. Esperando a que elijan los demás (' + picked.size + '/' + P.length + ')...</p>';
      return;
    }
  }

  if(pending.length){modo==='line'?chooseLine():showCards();return}

  if (isOnline) {
    allPicked();
  } else {
    $('up').style.display = 'none';
    if (modo === 'line') startEvo(lineStage);
    else { paused = false; last = performance.now(); }
  }
}

// Enemigos comunes: los arma enemies.js con el plantel sorteado de la partida (group: los "swarm" vienen de a 3).
// Si enemies.json no cargó, queda la aparición vieja con la línea de Impmon (spawnOld).
// ---------- Grilla espacial de enemigos (rendimiento: choques y disparos solo miran a los que están cerca) ----------
const EG_C=96;let EG=new Map();
function buildEG(){EG=new Map();for(let i=0;i<en.length;i++){const e=en[i];e._i=i;const k=(Math.floor(e.x/EG_C)+50000)*100000+Math.floor(e.y/EG_C)+50000;let c=EG.get(k);if(!c)EG.set(k,c=[]);c.push(e)}}
// llama fn(e) para cada enemigo con alguna celda a menos de R de (x,y); fn puede devolver true para cortar
function enNear(x,y,R,fn){const c0=Math.floor((x-R)/EG_C),c1=Math.floor((x+R)/EG_C),r0=Math.floor((y-R)/EG_C),r1=Math.floor((y+R)/EG_C);
 for(let cx_=c0;cx_<=c1;cx_++)for(let cy_=r0;cy_<=r1;cy_++){const c=EG.get((cx_+50000)*100000+cy_+50000);if(c)for(const e of c)if(fn(e))return}}
function spawn(ti,group){if(Enemies.data&&Enemies.roster.length)Enemies.spawn(ti,group);else spawnOld(ti)}
function spawnOld(ti){const a=Math.random()*6.283,d=Math.hypot(W,H)/2+40;
 const q=Math.random(),k=t>25&&q<.15?2:t>10&&q<.4?1:0,b=2+Math.floor(t/40);
 // sk: sprite de ENEMY_LINE. Etapa = tier; los tanques van una etapa arriba (en el tope, una de las ramas finales al azar)
 const es=ti+(k===2?1:0),sk=es<5?'stage_'+es:'branch_6_'+(1+Math.floor(Math.random()*3));
 const HM=[1,1.5,2.2,3,4,5.5][ti],T=[{hp:b,sp:1,r:12,v:3},{hp:Math.max(1,Math.ceil(b/2)),sp:1.9,r:9,v:4},{hp:b*4,sp:.55,r:21,v:10}][k];
 en.push({x:cam.x+Math.cos(a)*d,y:cam.y+Math.sin(a)*d,k,ti,sk,hp:T.hp*HM,sp:(55+Math.random()*25+t*.4)*T.sp*(1+.05*ti)*(chal('fast')?1.3:1),r:T.r*(1+.12*ti),v:T.v*(1+.5*ti),dm:[1,1.2,1.4,1.7,2,2.4][ti],fl:0,ang:0,el:Math.floor(Math.random()*3),gun:k!==1&&t>15&&Math.random()<Math.min(.4,(t-15)/150)+.08*ti,cd:1+Math.random()*2})}
function burst(x,y,c){if(pt.length>=MAX_PT)return;for(let i=0;i<8;i++){const a=Math.random()*6.283,s=60+Math.random()*120;pt.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:.4,c})}}

// Gema de XP (se ve dorada si vale más de 5). Con MAX_GEMS en el piso, la nueva cae igual donde murió el virus y se recicla
// la que está más lejos de todos los jugadores (su XP pasa a la nueva). Antes se sumaba a una al azar, que en partidas largas
// solía estar lejísimos: no se veía caer ninguna y la XP se perdía.
function dropGem(x,y,v){if(gems.length<MAX_GEMS){gems.push({x,y,v});return}
 let far=0,fd=-1;for(let i=0;i<gems.length;i++){const g=gems[i];let d=1e12;for(const q of P){const dd=(q.x-g.x)**2+(q.y-g.y)**2;if(dd<d)d=dd}if(d>fd){fd=d;far=i}}
 const old=gems[far];gems[far]={x,y,v:v+old.v}}
// Dirección que elige cada jugador. Local: J1 WASD (con 1 jugador también flechas o joystick), J2 flechas, J3 y J4 joysticks
// (el primero y el segundo que estén conectados). Online: el anfitrión mueve a los remotos con las teclas que mandan (rk).
// ---------- Control táctil (celular): apoyás el dedo donde quieras y arrastrás para moverte ----------
const TOUCH=matchMedia('(pointer:coarse)').matches;   // celular/tablet (una notebook con pantalla táctil sigue siendo escritorio; el dedo igual mueve)if(TOUCH)document.body.classList.add('touch');
let TJ=null,tjId=null,tjO=null;   // TJ = dirección [dx,dy] mientras hay un dedo apoyado; tjO = dónde se apoyó
const JOY_R=46;
function joyShow(){const j=$('joy');if(!j)return;if(!tjO){j.style.display='none';return}j.style.display='block';j.style.left=tjO[0]+'px';j.style.top=tjO[1]+'px';const k=j.firstElementChild;k.style.transform='translate('+(TJ?TJ[0]*TJ[2]:0)+'px,'+(TJ?TJ[1]*TJ[2]:0)+'px)'}
cv.addEventListener('touchstart',e=>{if(!running)return;e.preventDefault();if(tjId!=null)return;const t0=e.changedTouches[0];tjId=t0.identifier;tjO=[t0.clientX,t0.clientY];TJ=null;joyShow()},{passive:false});
cv.addEventListener('touchmove',e=>{e.preventDefault();for(const t1 of e.changedTouches){if(t1.identifier!==tjId)continue;let dx=t1.clientX-tjO[0],dy=t1.clientY-tjO[1];const L=Math.hypot(dx,dy);
 if(L>JOY_R){tjO[0]+=dx/L*(L-JOY_R);tjO[1]+=dy/L*(L-JOY_R)}   // el centro sigue al dedo si se aleja mucho
 TJ=L>8?[dx/L,dy/L,Math.min(L,JOY_R)]:null;joyShow()}},{passive:false});
const tjEnd=e=>{for(const t1 of e.changedTouches)if(t1.identifier===tjId){tjId=null;tjO=null;TJ=null;joyShow()}};
cv.addEventListener('touchend',tjEnd);cv.addEventListener('touchcancel',tjEnd);
const TJV=()=>TJ&&[TJ[0],TJ[1]];
const KB=k=>[(k.d||k.arrowright?1:0)-(k.a||k.arrowleft?1:0),(k.s||k.arrowdown?1:0)-(k.w||k.arrowup?1:0)];
function pad(n){const g=navigator.getGamepads?[...navigator.getGamepads()].filter(Boolean)[n]:null;if(!g)return[0,0];let x=g.axes[0]||0,y=g.axes[1]||0;if(Math.hypot(x,y)<.25){x=0;y=0}
 const b=g.buttons;if(b[15]&&b[15].pressed)x=1;if(b[14]&&b[14].pressed)x=-1;if(b[13]&&b[13].pressed)y=1;if(b[12]&&b[12].pressed)y=-1;return[x,y]}
function inputOf(q){
 if(isOnline){if(q.id===myIdx)return TJV()||KB(keys);const r=rk[q.id]||{};return isHost?(r.tj||KB(r)):[0,0]}
 if(mode===1){if(TJ)return TJV();const k=KB(keys);return k[0]||k[1]?k:pad(0)}
 if(q.id===0)return[(keys.d?1:0)-(keys.a?1:0),(keys.s?1:0)-(keys.w?1:0)];
 if(q.id===1)return[(keys.arrowright?1:0)-(keys.arrowleft?1:0),(keys.arrowdown?1:0)-(keys.arrowup?1:0)];
 return pad(q.id-2)}
// cuántas cartas se muestran al subir de nivel (3 + pasivas del árbol, hasta 5)
function nCards(q){return Math.min(5,3+((q&&q.m&&q.m.cards)|0))}
// Momentai (Terriermon): el disparo básico rebota al enemigo más cercano que todavía no golpeó
function bounce(s,e){let b=null,bd=320;for(const o of en){if(o===e||s.h.has(o)||o.hp<=0)continue;const d=Math.hypot(o.x-e.x,o.y-e.y);if(d<bd){bd=d;b=o}}
 if(!b){s.l=0;return}s.rb--;const a=Math.atan2(b.y-e.y,b.x-e.x),v=Math.hypot(s.vx,s.vy);s.x=e.x;s.y=e.y;s.vx=Math.cos(a)*v;s.vy=Math.sin(a)*v;s.l=.7}
// jefe derrotado: cuenta para las ramas (V-Pet) y puede soltar un Chip de Reformateo a cada jugador (sirve para reiniciar un árbol)
function bossReward(e){for(const q of P){if(!q.vp)continue;q.vp.bo++;if(Math.random()<.35*(1+(q.luck||0)+((q.m&&q.m.rcChance)||0))){q.vp.rc++;Stats.flash(q,'Chip de Reformateo','#9dff6b')}}}
// niveles de evolución de esta partida (Inicio rápido, del árbol de Tamer: la primera llega un nivel antes)
function evoLevels(){return P.some(q=>q.m&&q.m.quick)?[EVO_LEVELS[0]-1,...EVO_LEVELS.slice(1)]:EVO_LEVELS}
// HUD: vida (con rastro del daño recibido), experiencia con el nivel y virus eliminados. Lo usan el host y el cliente online.
// Cajas de vida: la 1 y la 2 están en index.html; la 3 y la 4 se crean copiando la 2 (mismos ids con otro número)
function hudBoxes(m){for(let i=3;i<=MAX_PLAYERS;i++){if($('hp'+i+'box')||i>m)continue;const b=$('hp2box').cloneNode(true);b.id='hp'+i+'box';b.className='hpbox p'+i;
  b.querySelectorAll('[id]').forEach(e=>{e.id=e.id.replace(/2$/,String(i))});$('hp'+(i-1)+'box').after(b)}
 for(let i=1;i<=MAX_PLAYERS;i++){const b=$('hp'+i+'box');if(!b)continue;b.style.display=i<=m?'':'none';const l=$('l'+i);if(l)l.textContent=m>1?pname(i-1):''};document.body.classList.toggle('p1',m===1);document.body.classList.toggle('p3',m===3);document.body.classList.toggle('p4',m===4)}
function hudBars(){const hb=(i,q)=>{if(!q)return;const f=Math.max(0,q.hp/q.max),w=f*100+'%',n=i+1;$(i?'fill'+n:'fill').style.width=w;$('lag'+n).style.width=w;$('hpt'+n).textContent=Math.ceil(Math.max(0,q.hp))+' / '+Math.round(q.max);$('hp'+n+'box').classList.toggle('low',f>0&&f<.3);
 const sp=$('sp'+n),dp=$('dp'+n);if(sp){sp.style.width=(q.spv||0)+'%';sp.classList.toggle('full',!!q.emp)}if(dp){const nd=Stats.DP_NEED[q.stage|0];dp.style.width=nd&&q.vp?Math.min(100,q.vp.dp/nd*100)+'%':'0'}};
 P.forEach((q,i)=>hb(i,q));Gate.hud();
 $('xpf').style.width=Math.min(100,xp/need*100)+'%';$('xpl').textContent='NV '+lvl;$('xpt').textContent=Math.floor(xp)+' / '+need+' XP';$('info').textContent=kills;Bosses.hud()}

function update(dt){
 t+=dt;SkillSys.renderBar(isOnline?mine():P);if(typeof Achievements!=='undefined')Achievements.tick();
 if (isOnline) {
   if (!isHost && conn) {
     // teclas: solo cuando cambian (y cada 0,25 s por las dudas)
     const ks = { w: keys.w, a: keys.a, s: keys.s, d: keys.d, arrowup: keys.arrowup, arrowleft: keys.arrowleft, arrowdown: keys.arrowdown, arrowright: keys.arrowright, tj: TJ ? [Math.round(TJ[0] * 10) / 10, Math.round(TJ[1] * 10) / 10] : null }, sg = JSON.stringify(ks);
     if (sg !== inSig || t - inT > 0.25) { conn.send({ type: 'input', keys: ks }); inSig = sg; inT = t; }
   } else if (isHost) hostSync(dt);   // estado para los invitados (ver hostSync)
 }

 // final con Yggdrasill (finale.js): mientras dura, los jugadores quedan quietos y no corre el resto de la simulación
 if(!isOnline||isHost){if(Finale.tick(dt)){for(const o of pt){o.x+=o.vx*dt;o.y+=o.vy*dt;o.l-=dt}pt=pt.filter(o=>o.l>0);for(const f of fx){f.y-=45*dt;f.l-=dt}fx=fx.filter(f=>f.l>0);hudBars();return}}
 else {Finale.clientTick(dt);Weather.clientTick(dt)}
 for(const q of P){
  if(q.dead||Finale.on)continue;
  if(q.dc==null)q.dc=DASH_N;if(q.dc<DASH_N)q.dc=Math.min(DASH_N,q.dc+dt/DASH_CD);
  if(q.dsT>0){q.dsT-=dt;q.gh.push({x:q.x,y:q.y,l:.22});World.move(q,q.ddx*DASH_V*dt,q.ddy*DASH_V*dt);if(q.ddx)q.face=Math.sign(q.ddx);q.moving=true;q.inv-=dt;continue}   // dash: va derecho, sin control
  const [dx,dy]=inputOf(q);
  q.moving = !!(dx || dy);
  if(dx||dy){const l=Math.hypot(dx,dy),v=Stats.speedOf(q);World.move(q,dx/l*v*dt,dy/l*v*dt);if(dx)q.face=dx;q.vx=dx/l*v;q.vy=dy/l*v}else{q.vx=0;q.vy=0}   // choca con las paredes (map.js); vx/vy: para los enemigos que interceptan
  q.inv-=dt;
 }

 const al=P.filter(q=>!q.dead);
 if(al.length && mode>1 && !isOnline){
   for(const q of al){
     q.x=Math.max(cam.x-W/2+40,Math.min(cam.x+W/2-40,q.x));
     q.y=Math.max(cam.y-H/2+40,Math.min(cam.y+H/2-40,q.y));
   }
 }

 if (isOnline && !isHost) {
   onlineSmooth(dt);
   hudBars();$('tm').textContent=Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
   return;
 }

 // revivir: si un compañero vivo está parado sobre un jugador caído, se va llenando el progreso
 for(const d of P){if(!d.dead||d.gone)continue;   // gone: se fue de la partida online (no se revive)

  let rv=0,rh=0;for(const a of al)if(Math.hypot(a.x-d.x,a.y-d.y)<REVIVE_R){rv=Math.max(rv,a.revSpd||1);rh=Math.max(rh,(a.m&&a.m.revHP)||0)}
  d.revP=rv?(d.revP||0)+dt*rv:Math.max(0,(d.revP||0)-dt);
  if(d.revP>=REVIVE_TIME){for(const a of al)if(Math.hypot(a.x-d.x,a.y-d.y)<REVIVE_R)a.revs=(a.revs|0)+1;   // logro Salvavidas
   d.dead=false;d.hp=d.max*Math.min(1,.5+rh);d.inv=2;d.revP=0;for(let i=0;i<24;i++)burst(d.x,d.y,i%2?'#fff':'#ffd23f')}}
 // ritmo de aparición: intervalo de 0,75 s que baja hasta 0,3 s, tandas que crecen cada 2 minutos y tope de enemigos en pantalla
 // (más densidad, pedido: intervalo de 0,6 s que baja hasta 0,15 s y tandas +1 cada 90 s; además, oleadas: Enemies.events)
 spawnT-=dt;const iv=Math.max(.15,.6-t*.003)/(1+.4*(P.length-1))/(chal('swarm')?1.5:1),mt=Math.max(...P.map(q=>q.stage|0));
 while(spawnT<=0){for(let i=0,n=1+Math.floor(t/90);!World.arena&&i<n&&en.length<MAX_EN+60*(P.length-1);i++)spawn(Math.max(0,mt-1),1);spawnT+=iv}
 if(!World.arena)Enemies.events(dt,Math.max(0,mt-1));
 Gate.tick(dt);Weather.tick(dt);Enemies.tick(dt);World.updateFlow(dt);World.relocate(dt);for(const q of al)Stats.tick(q,dt);for(const e of en)Stats.enemyTick(e,dt);
 for(const q of al){q.atkT-=dt;
  if(q.atkT<=0){let b=null,bd=420;for(const e of en){const d=Math.hypot(e.x-q.x,e.y-q.y);if(d<bd){bd=d;b=e}}
   if(b){const a0=Math.atan2(b.y-q.y,b.x-q.x),n=q.multi;for(let i=0;i<n;i++){const a=a0+(i-(n-1)/2)*.22;sh.push({x:q.x,y:q.y,vx:Math.cos(a)*460,vy:Math.sin(a)*460,l:1,pi:q.pierce,h:new Set(),d:q.dmg,el:q.el,q:q.id,rb:q.tr==='momentai'?1:0,r:5+Math.min(9,Math.log2(Math.max(1,q.dmg))*2.2)})}q.atkT=q.rate}}}
 buildEG();
 for(const s of sh){s.x+=s.vx*dt;s.y+=s.vy*dt;s.l-=dt;const sr=(s.r||5)+1;
  enNear(s.x,s.y,70,e=>{if(s.l<=0)return true;if(e.hp>0&&!s.h.has(e)&&Math.hypot(e.x-s.x,e.y-s.y)<e.r+sr){hit(e,s.d,s.el,P[s.q]);s.h.add(e);if(s.pi>0)s.pi--;else if(s.rb>0)bounce(s,e);else s.l=0;if(s.ex)SkillSys.explode(s,e);burst(s.x,s.y,'#ffd23f')}})}
 sh=sh.filter(s=>s.l>0);
 for(const q of al)SkillSys.update(q,dt);
 for(const e of en){let tg=null,dd=1e9;for(const q of al){if(q.dead)continue;const d=Math.hypot(q.x-e.x,q.y-e.y);if(d<dd){dd=d;tg=q}}
  if(!tg)break;const a=Math.atan2(tg.y-e.y,tg.x-e.x);e.ang=a;
  if(e.bo!=null)Bosses.act(e,dt,tg,dd,a);   // jefes: su propio movimiento y ataques (bosses.js)
  else if(e.kd!=null||!e.gun)Enemies.act(e,dt,tg,dd,a);   // enemigos comunes: movimiento y ataques con aviso (enemies.js)
  else{if(dd>=230){e.x+=Math.cos(a)*e.sp*dt;e.y+=Math.sin(a)*e.sp*dt}e.cd-=dt;if(e.cd<=0&&dd<520){e.cd=2.2+Math.random();const n=e.ti>=3?5:e.ti>=2?3:1,vb=230+25*e.ti;for(let j=0;j<n;j++){const aa=a+(j-(n-1)/2)*.28;eb.push({x:e.x,y:e.y,vx:Math.cos(aa)*vb,vy:Math.sin(aa)*vb,l:3,el:e.el,dm:e.dm})}}}   // aparición vieja (spawnOld)
  e.fl-=dt;
  for(const q of al)if(!q.dead&&q.inv<=0&&Math.hypot(e.x-q.x,e.y-q.y)<e.r+q.r-4){Stats.lastTouch=e;hurt(q,e.bo!=null?12*e.dm:Enemies.touch(e),e.el);Stats.lastTouch=null}}
 for(const b of eb){if(b.hm>0){b.hm-=dt;let tq=null,td=1e9;for(const q of al){const d=Math.hypot(q.x-b.x,q.y-b.y);if(d<td){td=d;tq=q}}if(tq){const sp=Math.hypot(b.vx,b.vy),cur=Math.atan2(b.vy,b.vx),want=Math.atan2(tq.y-b.y,tq.x-b.x);let da=want-cur;da=Math.atan2(Math.sin(da),Math.cos(da));const na=cur+Math.max(-2.2*dt,Math.min(2.2*dt,da));b.vx=Math.cos(na)*sp;b.vy=Math.sin(na)*sp}}   // orbes teledirigidos de los jefes (giran de a poco)
  b.x+=b.vx*dt;b.y+=b.vy*dt;b.l-=dt;for(const q of al)if(b.l>0&&!q.dead&&q.inv<=0&&Math.hypot(b.x-q.x,b.y-q.y)<q.r+(b.r||6)-2){hurt(q,6*b.dm,b.el,'b');b.l=0}}eb=eb.filter(b=>b.l>0);
 buildEG();
 // empuje entre enemigos (solo vecinos de la grilla). 0.7: separa según el tamaño de los dos (antes 1,6× el radio de uno:
 // los dibujos quedaban casi encimados y unos tapaban a otros) y si quedaron justo en el mismo punto los aparta al azar
 for(const a of en){if(a.st===2)continue;enNear(a.x,a.y,a.r*2.8,b=>{if(b._i<=a._i||b.st===2)return;const R=(a.r+b.r)*1.25,d=Math.hypot(a.x-b.x,a.y-b.y);
  if(d<.5){const g=Math.random()*6.283;World.move(a,Math.cos(g)*4,Math.sin(g)*4);return}
  if(d<R){const k=(R-d)/4/d,px=(a.x-b.x)*k,py=(a.y-b.y)*k;World.move(a,px,py);World.move(b,-px,-py)}})}
 for(const e of en)if(e.hp<=0&&!e.nr){kills++;if(e.lh!=null)Stats.onKill(P[e.lh],e);if(e.bo!=null){Bosses.onDeath(e);bossReward(e)}else{dropGem(e.x,e.y,e.v);Items.drop(e.x,e.y)}burst(e.x,e.y,ELC[e.el])}
 en=en.filter(e=>e.hp>0);
 const al2=P.filter(q=>!q.dead);
 for(const g of gems){let tg=null,td=1e9;for(const q of al2){const d=Math.hypot(q.x-g.x,q.y-g.y);if(d<td){td=d;tg=q}}
  if(tg){if(td<tg.mag||Items.magT>0||g.mg){const a=Math.atan2(tg.y-g.y,tg.x-g.x),gv=Items.magT>0||g.mg?900:380;g.x+=Math.cos(a)*gv*dt;g.y+=Math.sin(a)*gv*dt}if(td<tg.r+8){xp+=g.v*tg.xpm*XP_GAIN*xpMul();g.dead=1;Sound.play('gem')}}}
 gems=gems.filter(g=>!g.dead);
 Items.update(dt);
 if(xp>=need)levelUp();
 for(const f of fx){f.y-=45*dt;f.l-=dt}fx=fx.filter(f=>f.l>0);for(const o of ef)o.l-=dt;ef=ef.filter(o=>o.l>0);if(ef.length>MAX_EF){const wn=ef.filter(o=>o.k==='wline'||o.k==='wcirc'||o.k==='pool'),vi=ef.filter(o=>o.k!=='wline'&&o.k!=='wcirc'&&o.k!=='pool');ef=wn.concat(vi.slice(Math.max(0,vi.length-(MAX_EF-wn.length))))}   // tope de efectos (los avisos de ataque nunca se descartan)
 for(const q of pt){q.x+=q.vx*dt;q.y+=q.vy*dt;q.l-=dt}pt=pt.filter(q=>q.l>0);
 if(P.every(q=>q.dead))endRun('Fuiste borrado');
 hudBars();$('tm').textContent=Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
 $('pst').textContent=(isOnline?mine():P).map(q=>(mode>1&&!isOnline?pname(q.id)+' · ':'')+'FUE '+tot(q,'FUE')+' VEL '+tot(q,'VEL')+' INT '+tot(q,'INT')+' VIT '+tot(q,'VIT')).join('\n');
}

// la cámara sigue al promedio de los jugadores vivos
function camFollow(){const al=P.filter(q=>!q.dead);
 if(isOnline){const q=P[myIdx]&&!P[myIdx].dead?P[myIdx]:al[0]||P[myIdx];if(q){cam.x=q.x;cam.y=q.y}return}
 if(al.length){cam.x=al.reduce((a,q)=>a+q.x,0)/al.length;cam.y=al.reduce((a,q)=>a+q.y,0)/al.length}}
function draw(){
 camFollow();cx.setTransform(CK,0,0,CK,0,0);

 cx.fillStyle='#050b1a';cx.fillRect(0,0,W,H);
 const ox=W/2-cam.x,oy=H/2-cam.y;
 if(!World.ready()){cx.strokeStyle='#0e2a4a';cx.lineWidth=1;cx.beginPath();
  for(let x=-((cam.x%64)+64)%64;x<W;x+=64){cx.moveTo(x,0);cx.lineTo(x,H)}
  for(let y=-((cam.y%64)+64)%64;y<H;y+=64){cx.moveTo(0,y);cx.lineTo(W,y)}
  cx.stroke()}
 cx.save();cx.translate(ox,oy);
 World.draw();   // mapa del Digimundo (map.js)
 Gate.drawWorld();   // Digital Gate (gate.js)
 for(const q of pt){cx.globalAlpha=q.l*2.5;cx.fillStyle=q.c;cx.fillRect(q.x-2,q.y-2,4,4)}cx.globalAlpha=1;
 for(const g of gems){cx.fillStyle=g.v>5?'#ffd23f':'#5cf2ff';const s=g.v>5?7:4;cx.beginPath();cx.arc(g.x,g.y,s,0,6.283);cx.fill()}
 Items.draw();
 const vx0=cam.x-W/2-160,vx1=cam.x+W/2+160,vy0=cam.y-H/2-200,vy1=cam.y+H/2+200;
 const ents=[];   // lo que puede quedar detrás de un árbol (World.drawTall)
 const vis=en.filter(e=>e.bo!=null||!(e.x<vx0||e.x>vx1||e.y<vy0||e.y>vy1)).sort((a,b)=>a.y-b.y);   // fuera de pantalla no se dibuja; de atrás para adelante (el de más abajo queda delante)
 for(const e of vis){
  dEn(e);const hw=Math.max(30,e.r*1.6);ents.push({e,x0:e.x-hw,x1:e.x+hw,y0:e.y-enTop(e),fy:e.y+World.foot(e)})}
 for(const s of sh){if(SkillSys.drawShot(s))continue;cx.fillStyle=s.c||'#ffd23f';cx.beginPath();cx.arc(s.x,s.y,s.r||5,0,6.283);cx.fill()}
 for(const b of eb){if(SkillSys.drawEB(b))continue;cx.fillStyle=ELC[b.el];cx.strokeStyle=b.r?'#ff9a2e':'#fff';cx.lineWidth=b.r?4:2;cx.beginPath();cx.arc(b.x,b.y,b.r||6,0,6.283);cx.fill();cx.stroke()}
 for(const o of ef)SkillSys.drawFx(o);
 for(const q of P)if(!q.dead)SkillSys.drawOrbits(q);
 for(const q of P){dPl(q);if(!evo)ents.push({e:q,pl:!q.dead,x0:q.x-40,x1:q.x+40,y0:q.y+48-(q.dh||96),fy:q.y+48})}
 World.drawTall(ents,e=>e.cid?dPl(e):dEn(e));   // árboles por encima (map.js)
 if(evo){const e0=evo.t,sw=e0>=1.3,pul=Math.sin(e0*Math.PI/2.8);
  for(const q of P){
   drawBuddy(q,sw?evo.s:evo.s-1,q.x,q.y,q.face,sw?Math.min(1,(e0-1.3)*2):Math.max(0,1-e0*.9));
   cx.fillStyle='rgba(255,255,255,'+(.25+pul*.7)+')';cx.beginPath();cx.arc(q.x,q.y,18+pul*34,0,6.283);cx.fill();
   cx.strokeStyle='#ffd23f';cx.lineWidth=3;for(let i=0;i<3;i++){const r=(e0*1.2+i/3)%1;cx.globalAlpha=1-r;cx.beginPath();cx.arc(q.x,q.y,10+r*110,0,6.283);cx.stroke()}cx.globalAlpha=1}}
 cx.textAlign='center';cx.lineJoin='round';for(const f of fx){cx.globalAlpha=Math.min(1,f.l*2);cx.font='bold '+f.sz+'px Chakra Petch,system-ui,sans-serif';cx.lineWidth=4;cx.strokeStyle='#000';cx.strokeText(f.txt,f.x,f.y);cx.fillStyle=f.col;cx.fillText(f.txt,f.x,f.y)}cx.globalAlpha=1;
 cx.restore();
 if(running){Weather.draw();if(!Finale.on)drawPointers();Gate.drawOverlay();Finale.draw()}
}
// Flechas en el borde de la pantalla hacia lo que no se ve: compañeros (nombre y distancia en metros; ✝ si están caídos)
// y el Digital Gate. 1 metro = 40 px.
// nombre de cada jugador: online, el nick que eligió cada uno (también el tuyo); en local, J1, J2…
function pname(i){const m=isOnline&&roster.find(x=>x.i===i);return(m&&m.nick)||(isOnline&&i===myIdx&&me.nick)||'J'+(i+1)}
function drawPointers(){
 const me=isOnline?P[myIdx]:null,ox=me&&!me.dead?me.x:cam.x,oy=me&&!me.dead?me.y:cam.y,list=[];
 if(mode>1)P.forEach((q,i)=>{if(isOnline&&i===myIdx)return;list.push({x:q.x,y:q.y-30,col:PC[i],txt:(q.dead?'✝ ':'')+pname(i)})});
 if(Gate.g&&!World.arena)list.push({x:Gate.g[0],y:Gate.g[1]-60,col:'#3dff7a',txt:'Digital Gate'});
 for(const o of list){const sx=o.x-cam.x+W/2,sy=o.y-cam.y+H/2;if(sx>20&&sx<W-20&&sy>20&&sy<H-20)continue;
  const a=Math.atan2(sy-H/2,sx-W/2),mg=46,k=Math.min((W/2-mg)/Math.max(1e-6,Math.abs(Math.cos(a))),(H/2-mg)/Math.max(1e-6,Math.abs(Math.sin(a)))),px=W/2+Math.cos(a)*k,py=H/2+Math.sin(a)*k;
  const txt=o.txt+' · '+Math.round(Math.hypot(o.x-ox,o.y-oy)/40)+' m';
  cx.save();cx.translate(px,py);cx.rotate(a);cx.fillStyle=o.col;cx.strokeStyle='#000';cx.lineWidth=3;cx.beginPath();cx.moveTo(18,0);cx.lineTo(-10,-13);cx.lineTo(-4,0);cx.lineTo(-10,13);cx.closePath();cx.stroke();cx.fill();cx.restore();
  cx.save();cx.textAlign='center';cx.font="bold 13px 'Chakra Petch',sans-serif";const tx=Math.max(80,Math.min(W-80,px)),ty=py+(Math.sin(a)>0.5?-26:28);
  cx.lineWidth=4;cx.lineJoin='round';cx.strokeStyle='#000';cx.strokeText(txt,tx,ty);cx.fillStyle=o.col;cx.fillText(txt,tx,ty);cx.restore()}}
// dibuja un enemigo (sprite o figura de respaldo)
function dEn(e){
  const C=e.fl>0?'#fff':ELC[e.el],D='#050b1a';cx.fillStyle=C;
  if(drawEnemy(e)){}
  else if(e.k===1){cx.save();cx.translate(e.x,e.y);cx.rotate(e.ang);cx.beginPath();cx.moveTo(e.r*1.4,0);cx.lineTo(-e.r,-e.r);cx.lineTo(-e.r*.5,0);cx.lineTo(-e.r,e.r);cx.fill();cx.restore()}
  else if(e.k===2){cx.fillRect(e.x-e.r,e.y-e.r,e.r*2,e.r*2);cx.fillStyle=D;cx.fillRect(e.x-e.r+4,e.y-e.r+4,e.r*2-8,e.r*2-8);cx.fillStyle=C;cx.fillRect(e.x-8,e.y-7,5,6);cx.fillRect(e.x+3,e.y-7,5,6);cx.fillRect(e.x-8,e.y+4,16,3)}
  else{cx.fillRect(e.x-e.r,e.y-e.r,e.r*2,e.r*2);cx.fillStyle=D;cx.fillRect(e.x-7,e.y-4,5,5);cx.fillRect(e.x+2,e.y-4,5,5);cx.fillRect(e.x-6,e.y+4,12,3)}
  for(let i=0;i<e.ti;i++){cx.fillStyle='#ffd23f';cx.fillRect(e.x-(e.ti*5-1)+i*10,e.y-enTop(e)-10,7,5)}
  if(e.gun){cx.strokeStyle='rgba(255,255,255,.75)';cx.lineWidth=2;cx.beginPath();cx.arc(e.x,e.y,e.r+5,0,6.283);cx.stroke()}}
// dibuja un jugador (con su etiqueta y el anillo de revivir en 2J)
function dPl(q){const s=q.stage|0,hh=96;
  // dash: estela de imágenes que se apagan; y las cargas (dos rayitas bajo tus pies)
  if(q.gh&&q.gh.length){for(const g of q.gh){g.l-=1/60;if(g.l>0){cx.globalAlpha=g.l*1.6;drawBuddy(q,s,g.x,g.y,q.face,1);cx.globalAlpha=1}}q.gh=q.gh.filter(g=>g.l>0)}
  // aggro del jefe: mira roja sobre el jugador que persigue (solo con más de un jugador)
  if(!q.dead&&P.length>1&&en.some(e=>e.bo!=null&&e.ag===q.id)){const y=q.y+48-(q.dh||96)-26,s=7+Math.sin(t*8);cx.strokeStyle='#ff3d3d';cx.lineWidth=2.5;cx.beginPath();cx.arc(q.x,y,s,0,6.283);cx.moveTo(q.x-s-5,y);cx.lineTo(q.x+s+5,y);cx.moveTo(q.x,y-s-5);cx.lineTo(q.x,y+s+5);cx.stroke()}
  if(!q.dead&&(!isOnline||q.id===myIdx)&&q.dc!=null&&q.dc<DASH_N){for(let i=0;i<DASH_N;i++){const f=Math.max(0,Math.min(1,q.dc-i));cx.fillStyle='rgba(0,0,0,.5)';cx.fillRect(q.x-17+i*18,q.y+54,16,4);cx.fillStyle=f>=1?'#3fd0ff':'rgba(63,208,255,.45)';cx.fillRect(q.x-17+i*18,q.y+54,16*f,4)}}
  if(q.dead)drawBuddy(q,s,q.x,q.y,q.face,.25);
  else if(!evo&&(q.inv<=0||Math.floor(t*20)%2))drawBuddy(q,s,q.x,q.y,q.face,1);
  if(mode>1){cx.textAlign='center';cx.font='bold 13px Chakra Petch,system-ui,sans-serif';cx.fillStyle=PC[q.id];cx.fillText(q.dead?pname(q.id)+' ✝ (pararse encima para revivir)':pname(q.id),q.x,q.y+48-(q.dh||hh)-8)}
  if(q.dead&&mode>1){const pr=Math.min(1,(q.revP||0)/REVIVE_TIME);cx.lineWidth=3;cx.strokeStyle='rgba(255,210,63,.35)';cx.beginPath();cx.arc(q.x,q.y,REVIVE_R,0,6.283);cx.stroke();if(pr>0){cx.strokeStyle='#ffd23f';cx.lineWidth=6;cx.beginPath();cx.arc(q.x,q.y,REVIVE_R,-Math.PI/2,-Math.PI/2+6.283*pr);cx.stroke()}}}

// Loop principal. Si algo tira un error, se registra en la consola y el juego SIGUE (antes se congelaba para siempre).
let loopErrs=0;
function loop(n){const dt=Math.min(.05,(n-last)/1000);last=n;rafAt=performance.now();
 try{if(evo)stepEvo(dt);else if(!paused)update(dt)}catch(e){if(loopErrs++<20)console.error('Error en la simulación:',e)}
 try{draw()}catch(e){if(loopErrs++<20)console.error('Error al dibujar:',e)}
 if(running)requestAnimationFrame(loop)}
// Anfitrión online con la ventana oculta o minimizada: el navegador frena requestAnimationFrame (y los setInterval de la página)
// y la partida se congelaría para los demás. Un Worker, que el navegador no frena, da el ritmo y la simulación sigue sin dibujar.
// Se activa cuando el loop normal no corrió en los últimos 250 ms (no siempre avisa document.hidden).
let bgW=null,rafAt=0;
function bgTick(){if(!running||!isOnline||!isHost||performance.now()-rafAt<250)return;const n=performance.now(),dt=Math.min(.05,(n-last)/1000);last=n;camFollow();
 try{if(evo)stepEvo(dt);else if(!paused)update(dt)}catch(e){if(loopErrs++<20)console.error('Error en la simulación:',e)}}
function bgStart(){if(bgW)return;try{bgW=new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),33)'],{type:'text/javascript'})));bgW.onmessage=bgTick}catch(e){console.error('Sin Worker para el segundo plano:',e)}}
P=[np(0,'001_guilmon')];p=P[0];
if($('party-panel'))$('party-panel').style.display='none';   // reemplazado por la ventana Amigos / Party (social.js)
buildMenuSel();
(async()=>{
  try{await SkillSys.load();Bosses.load().catch(e=>console.error(e));Enemies.load().catch(e=>console.error(e));await Promise.all(CREATURES.map(c=>CreatureLoader.load(c.id).catch(e=>console.error(e))))}catch(e){console.error(e)}
  if(selected&&(!CreatureLoader.cache[selected]||!unlocked(selected)))selected=null;
  renderSel();wal();draw();
  if(typeof Progress!=='undefined')Progress.showHatch();   // eclosión pendiente (necesita los sprites cargados)
})();

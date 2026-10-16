const cv=document.getElementById('c'),cx=cv.getContext('2d');
let W,H;function rs(){W=cv.width=innerWidth;H=cv.height=innerHeight}addEventListener('resize',rs);rs();
const keys={};
let P=[],p,cam={x:0,y:0},en=[],sh=[],pt=[],gems=[],fx=[],ef=[],eb=[],t=0,kills=0,running=false,spawnT=0,last=0,xp=0,lvl=1,need=5,paused=false,evo=null,pending=[],cardMode='cards',mode=1,lastMode=1,cur=[],treeOpen=false;
const PC=['#2ee6c8','#ff7ad9'],ELC=['#4db8ff','#c05bff','#ffb02e'],$=id=>document.getElementById(id);

// Criaturas jugables. Cada una necesita la carpeta assets/sprites/creatures/<id>/ y el archivo src/data/creatures/<id>.json
// Para sumar otra: agregala acá (y creá su JSON). Si falta el JSON, simplemente no aparece en la selección.
const CREATURES = [{ id: '001_guilmon' }, { id: '002_renamon' }, { id: '003_terriermon' }];
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
const FAST = true;
const EVO_LEVELS = FAST ? [2,3,4,5] : [3,6,9,12];   // etapas 1,2,3,4
const LINE_LEVEL = FAST ? 6 : 15;                    // elección de la evolución final (rama)
const REQ_FACTOR = FAST ? 0.4 : 1;                   // en modo FAST los requisitos de stats de las ramas se achican

async function initGame(ids) {
  await SkillSys.load();
  await Promise.all([...new Set(ids)].map(id => CreatureLoader.load(id)));
  await CreatureLoader.load(ENEMY_LINE).catch(e => console.error(e));
}

// ---------- Red: PeerJS + party ----------
// El login, el Nick, la lista de amigos y las ventanas están en social.js; acá vive la conexión entre jugadores.
// Una invitación viaja por una conexión de control; si el invitado acepta, él se conecta al que invitó
// (que pasa a ser el anfitrión/líder) y ahí queda armado el party. El líder inicia la partida.
let peer = null, myPeerId = null, conn = null, isHost = false, isOnline = false, remoteKeys = {};
let hostDone = false, clientDone = false;
// Selección de criatura
let pickRes = null, pickRej = null, pickList = [], picking = false, hostPick = null;
// Digimon elegido en el menú principal (se recuerda entre partidas)
let selected = null;
try { selected = localStorage.getItem('digisurvivor_pick') || null; } catch (e) {}
// Party
let me = { uid: null, nick: null };   // lo carga social.js al iniciar sesión
let party = null;                     // { uid, nick, c } del otro jugador mientras hay party
let lobbyNote = '';                   // último aviso para mostrar en la ventana (rechazos, cortes, etc.)
const pendingInv = {};                // invitaciones que mandé: uid -> hora
const ctl = {};                       // conexiones de invitación en curso: peerId -> función que las da por fallidas
const inbox = [];                     // invitaciones recibidas { id, uid, nick, peerId, c }

const lobbyChanged = () => { if (window.onLobby) window.onLobby(); };
const lobbyMsg = m => { lobbyNote = m || ''; lobbyChanged(); };
const whenOpen = (c, fn) => { if (c.open) fn(); else c.on('open', fn); };
const sendTo = (c, m) => { try { c.send(m); } catch (e) {} };
const validId = id => CREATURES.some(x => x.id === id) ? id : null;
const dropInvite = id => { const k = inbox.findIndex(x => x.id === id); if (k >= 0) { inbox.splice(k, 1); lobbyChanged(); } };

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
      // alguien a quien invité se une a mi party: yo soy el líder/anfitrión
      if (conn || !pendingInv[md.uid]) { try { c.close(); } catch (e) {} return; }
      delete pendingInv[md.uid];
      conn = c; isHost = true; isOnline = false;
      party = { uid: md.uid, nick: String(md.nick || '').slice(0, 20), c: null };
      setupConn(c);
      lobbyMsg(party.nick + ' se unió al party');
    } else {
      // conexión de control: solo se aceptan invitaciones de amigos
      c.on('data', m => {
        if (!m || m.type !== 'invite' || !m.uid || !m.peerId) return;
        // se consulta en el momento si es amigo (así una amistad recién creada o eliminada se respeta al instante)
        Promise.resolve(window.isFriendUid ? window.isFriendUid(m.uid) : false).then(isF => {
          if (!isF) return;
          if (conn || running || inbox.some(i => i.uid === m.uid)) { whenOpen(c, () => sendTo(c, { type: 'decline', busy: 1 })); return; }
          const inv = { id: Math.random().toString(36).slice(2), uid: m.uid, nick: String(m.nick || '').slice(0, 20), peerId: m.peerId, c };
          inbox.push(inv); setTimeout(() => dropInvite(inv.id), 60000); lobbyChanged();
        }).catch(() => {});
      });
    }
  });
};

// Cierra todo lo online (se usa al cerrar sesión)
window.stopPeer = function () {
  if (conn) { const c = conn; try { c.close(); } catch (e) {} connClosed(c); }
  if (peer) { try { peer.destroy(); } catch (e) {} }
  peer = null; myPeerId = null; hostPick = null; inbox.length = 0;
  for (const k in pendingInv) delete pendingInv[k];
  lobbyMsg('');
};

// Acciones que usa la ventana de Amigos / Party
window.Lobby = {
  setSelf(uid, nick) { me = { uid, nick }; },
  state() {
    return { me, myPeerId, ready: !!myPeerId, role: conn ? (isHost ? 'host' : 'guest') : null, party, selected,
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
    if (conn) return lobbyMsg('Ya estás en un party');
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
    setTimeout(() => { if (!conn) delete pendingInv[f.uid]; }, 90000);
    lobbyMsg('Invitación enviada a ' + f.nick);
  },
  accept(id) {
    const k = inbox.findIndex(x => x.id === id); if (k < 0) return;
    const inv = inbox.splice(k, 1)[0];
    if (conn || !peer) { sendTo(inv.c, { type: 'decline', busy: 1 }); lobbyChanged(); return; }
    sendTo(inv.c, { type: 'accept' });
    setTimeout(() => { try { inv.c.close(); } catch (e) {} }, 500);
    while (inbox.length) sendTo(inbox.pop().c, { type: 'decline', busy: 1 });   // las demás invitaciones se rechazan
    const c = peer.connect(inv.peerId, { metadata: { kind: 'game', uid: me.uid, nick: me.nick } });
    conn = c; isHost = false; isOnline = false;
    party = { uid: inv.uid, nick: inv.nick, c: null };
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
  leave() { if (conn) { const c = conn; try { c.close(); } catch (e) {} connClosed(c); } },
  // solo el líder, y solo si los dos ya eligieron Digimon
  startOnline() {
    if (!conn || !isHost || !selected || !party || !party.c || running) return;
    hostPick = selected; isOnline = true;
    sendTo(conn, { type: 'start', c0: selected });
    lobbyMsg('Iniciando partida...');
  }
};

function connClosed(c) {
  if (conn !== c) return;
  const was = party && party.nick;
  if (running && isOnline) endRun('Se perdió la conexión con el otro jugador');
  conn = null; isHost = false; isOnline = false; hostPick = null; party = null;
  lobbyMsg(was ? 'El party con ' + was + ' se cerró' : '');
}

function setupConn(c) {
  whenOpen(c, () => sendTo(c, { type: 'hello', uid: me.uid, nick: me.nick, c: selected }));
  c.on('close', () => connClosed(c));
  c.on('error', () => connClosed(c));
  c.on('data', data => {
    if (data.type === 'hello') {
      if (party) { party.c = validId(data.c); if (data.nick) party.nick = String(data.nick).slice(0, 20); }
      lobbyChanged();
    } else if (data.type === 'pick') {
      if (party) party.c = validId(data.c);
      lobbyChanged();
    } else if (data.type === 'input') {
      remoteKeys = data.keys || {};
    } else if (data.type === 'start') {
      if (isHost) return;
      isOnline = true;
      joinOnline(data.c0);
    } else if (data.type === 'ready') {
      // el invitado ya eligió: arranca la partida con las dos criaturas
      if (isHost && hostPick) {
        const ids = [hostPick, validId(data.c1) || '001_guilmon'];
        hostPick = null;
        $('up').style.display = 'none';
        start(2, ids);
      }
    } else if (data.type === 'sync') {
      applyOnlineSync(data);
    } else if (data.type === 'trigger_levelup') {
      paused = true;
      hostDone = false; clientDone = false;
      pending = [P[1]];
      showCards();
    } else if (data.type === 'trigger_line') {
      paused = true;
      hostDone = false; clientDone = false;
      pending = [P[1]];
      chooseLine();
    } else if (data.type === 'trigger_evo') {
      $('up').style.display = 'none';
      startEvo(data.stage);
    } else if (data.type === 'client_choice') {
      if (isHost && P[1]) {
        applyCardOp(P[1], data);
        clientDone = true;
        if (hostDone) {
          if (cardMode === 'line') {
            if (conn) conn.send({ type: 'trigger_evo', stage: 5 });
            $('up').style.display = 'none';
            startEvo(5);
          } else {
            $('up').style.display = 'none';
            paused = false;
            last = performance.now();
            if (conn) conn.send({ type: 'resume_game' });
          }
        }
      }
    } else if (data.type === 'host_choice') {
      if (!isHost && P[0]) {
        applyCardOp(P[0], data);
        hostDone = true;
      }
    } else if (data.type === 'end') {
      if (running) endRun(data.title || 'Run terminada');
    } else if (data.type === 'resume_game') {
      $('up').style.display = 'none';
      paused = false;
      last = performance.now();
    }
  });
}

function applyCardOp(targetP, data) {
  if (data.c) targetP.st[data.c]++;
  if (data.op === 'dmg') targetP.dmg++;
  else if (data.op === 'rate') targetP.rate *= .8;
  else if (data.op === 'multi') targetP.multi++;
  else if (data.op === 'pierce') targetP.pierce++;
  else if (data.op === 'sp') targetP.sp *= 1.15;
  else if (data.op === 'hp') { targetP.max += 25; targetP.hp = Math.min(targetP.max, targetP.hp + 25); }
  else if (data.op === 'mag') targetP.mag *= 1.6;
  else if (data.op === 'wp' && data.wpKey) { if (SkillSys.canTake(targetP, data.wpKey)) targetP.wp[data.wpKey] = (targetP.wp[data.wpKey] | 0) + 1; }
  else if (data.op === 'line') { targetP.line = data.lineIdx; targetP.branchId = data.branchId; targetP.weak = data.weak; }
}

// Invitado: responde con su Digimon y arranca
function joinOnline(c0) {
  const id = selected || '001_guilmon';
  if (conn) sendTo(conn, { type: 'ready', c1: id });
  start(2, [validId(c0) || '001_guilmon', id]).catch(e => console.error(e));
}

function applyOnlineSync(data) {
  if (isHost) return;
  t = data.t; kills = data.kills; lvl = data.lvl; need = data.need; xp = data.xp;
  if (data.P && P.length === data.P.length) {
    data.P.forEach((sq, i) => { if (P[i]) Object.assign(P[i], sq); });
  }
  if (data.en) en = data.en;
  if (data.gems) gems = data.gems;
  if (data.sh) sh = data.sh;
  if (data.eb) eb = data.eb;
  if (data.ef) ef = data.ef;
}

addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=1;if(e.key.startsWith('Arrow'))e.preventDefault();
 if(pickRes){if(/^[1-3]$/.test(e.key)&&pickList[e.key-1])pickDone(pickList[e.key-1].id);else if(e.key==='Escape'&&!isOnline)pickCancel();return}
 if(e.key==='Enter'&&!running&&!treeOpen&&!picking&&!isOnline){if(selected)beginLocal(lastMode);else openMenuPick()}
 if(e.key==='Escape'){if(treeOpen)$('tx').click();else if(running)endRun('Run terminada')}
 if(paused&&!evo&&/^[1-3]$/.test(e.key)&&cur[e.key-1]&&!cur[e.key-1].lock)choose(cur[e.key-1])});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=0);
function mult(a,d){return d===(a+1)%3?1.5:a===(d+1)%3?.5:1}
function dmgNum(x,y,v,col,sz){fx.push({x:x+(Math.random()-.5)*12,y:y-8,txt:String(Math.max(1,Math.round(v*10))),col,sz,l:.8})}
function hit(e,d,el){const m=mult(el|0,e.el),v=d*m;e.hp-=v;e.fl=.1;dmgNum(e.x,e.y-e.r,v,m>1?'#43ff7a':m<1?'#ff4a4a':'#fff',m>1?30:m<1?14:18)}
function hurt(q,d,el){if(q.dead)return;const m=mult(el,q.el|0),v=d*m*(1-q.arm);q.hp-=v;q.inv=.45;burst(q.x,q.y,'#ff3d81');dmgNum(q.x,q.y-q.r-6,v,m>1?'#ff4a4a':m<1?'#43ff7a':'#ffb0b0',20);if(q.hp<=0){q.dead=true;q.hp=0;q.revP=0;for(let i=0;i<20;i++)burst(q.x,q.y,PC[q.id])}}
function permS(k){return {FUE:L('tf'),VEL:L('tv'),INT:L('ti'),VIT:L('th')}[k]|0}
function tot(q,k){return permS(k)+q.st[k]}
function np(i,cid){return{id:i,cid:cid||'001_guilmon',el:elOf(cid||'001_guilmon'),revP:0,revSpd:1,x:0,y:0,hp:100,max:100,r:16,sp:210,face:1,inv:0,dmg:1,rate:.6,multi:1,pierce:0,mag:70,stage:0,line:0,branchId:null,weak:false,dead:false,moving:false,atkT:0,arm:0,xpm:1,coin:1,st:{FUE:0,VEL:0,VIT:0,INT:0},wp:{},wt:{},oa:0,skT:0}}

// ids: criatura de cada jugador, ej. ['002_renamon'] o ['001_guilmon','003_terriermon']
async function start(m,ids){
  ids=ids&&ids.length?ids:['001_guilmon'];
  await initGame(ids);
  mode=lastMode=m;P=[];for(let i=0;i<m;i++){const q=np(i,ids[i]||ids[0]);q.x=m===1?0:(i?40:-40);applyTree(q);P.push(q)}
  p=P[0];cam={x:P[0].x,y:0};en=[];sh=[];pt=[];gems=[];fx=[];ef=[];eb=[];pending=[];xp=0;lvl=1;need=5;paused=false;evo=null;t=0;kills=0;spawnT=0;running=true;
  $('ov').style.display='none';$('up').style.display='none';$('evt').style.display='none';
  $('bar2').style.display=$('l2').style.display=m===2?'block':'none';$('l1').textContent=m===2?'J1':'';$('l2').textContent=m===2?'J2':'';
  renderLegend();if(window.onRunStart)window.onRunStart();last=performance.now();requestAnimationFrame(loop);
}

// ---------- Selección de criatura ----------
// Muestra una pantalla con una carta por criatura. Devuelve (promesa) el id elegido.
async function askCreature(title, color) {
  await Promise.all(CREATURES.map(c => CreatureLoader.load(c.id).catch(e => console.error(e))));
  const list = CREATURES.filter(c => CreatureLoader.cache[c.id]);
  if (!list.length) throw new Error('No hay criaturas cargadas');
  return new Promise((res, rej) => {
    pickRes = res; pickRej = rej; pickList = list;
    const h = $('up').querySelector('h2'); h.textContent = title; h.style.color = color || '';
    $('up').querySelector('p').textContent = 'Elegí con el mouse o con las teclas 1, 2 o 3';
    const c = $('cards'); c.innerHTML = '';
    list.forEach((cr, i) => {
      const C = CreatureLoader.cache[cr.id], M = C.meta, nm = (M.stages[2] || M.stages[0]).name;
      const b = document.createElement('button'); b.className = 'card';
      b.innerHTML = thumbOf(C, 'stage_2') + '<b>' + (i + 1) + '. ' + nm + '</b>' + M.stages.map(s => s.name).join(' → ') + '<em><span style="color:' + ELC[elOf(cr.id)] + '">●</span> ' + ATTR[elOf(cr.id)] + '</em>';
      b.onclick = () => pickDone(cr.id);
      c.appendChild(b);
    });
    showUp();
  });
}
function pickDone(id) {
  if (!pickRes || performance.now() - cardsAt < 400) return;   // evita clicks accidentales al aparecer
  const r = pickRes; pickRes = pickRej = null; pickList = []; r(id);
}
function pickCancel() {
  if (!pickRej) return;
  const j = pickRej; pickRes = pickRej = null; pickList = [];
  $('up').style.display = 'none'; j(new Error('cancel'));
}
// Partida local. El Jugador 1 usa el Digimon elegido en el menú; en 2 jugadores, el Jugador 2 elige el suyo acá.
async function beginLocal(m) {
  if (picking || running) return;
  if (!selected) return openMenuPick();
  picking = true;
  try {
    const ids = [selected];
    if (m === 2) ids.push(await askCreature('Jugador 2: elegí tu Digimon', PC[1]));
    $('up').style.display = 'none';
    await start(m, ids);
  } catch (e) { if (e && e.message !== 'cancel') console.error(e); }
  finally { picking = false; }
}
$('go').onclick=()=>{isOnline=false;beginLocal(1)};$('go2').onclick=()=>{isOnline=false;beginLocal(2)};

// ---------- Menú: Digimon elegido ----------
function buildMenuSel() {
  const st = document.createElement('style');
  st.textContent = '#up{z-index:30}#ov button:disabled{opacity:.4;cursor:not-allowed}#selrow{display:flex;align-items:center;gap:16px;justify-content:center;flex-wrap:wrap;margin:6px 0}#selinfo{display:flex;align-items:center;gap:10px;font-weight:700;font-size:20px}#selinfo img{height:56px!important;margin:0!important;image-rendering:pixelated}#selrow button{margin-top:0!important}';
  document.head.appendChild(st);
  const row = document.createElement('div'); row.id = 'selrow';
  row.innerHTML = '<div id="selinfo"></div><button id="selbtn" class="alt">Elegir Digimon</button>';
  const bar = $('go').parentNode; bar.parentNode.insertBefore(row, bar);
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
  ['go', 'go2'].forEach(id => { if ($(id)) $(id).disabled = !C; });
  if (C && !running) { P = [np(0, selected)]; p = P[0]; draw(); }   // el fondo muestra a tu Digimon
}
async function openMenuPick() {
  if (picking || running || pickRes) return;
  picking = true;
  try {
    const id = await askCreature('Elegí tu Digimon', '');
    selected = id; $('up').style.display = 'none';
    try { localStorage.setItem('digisurvivor_pick', id); } catch (e) {}
    renderSel();
    if (conn) sendTo(conn, { type: 'pick', c: selected });
    lobbyChanged();
  } catch (e) { if (e && e.message !== 'cancel') console.error(e); }
  finally { picking = false; }
}
// Leyenda de atributos (cada uno es fuerte contra el siguiente), empezando por el tuyo
function renderLegend() {
  const e0 = P[0].el | 0, o = [e0, (e0 + 1) % 3, (e0 + 2) % 3];
  $('leg').innerHTML = o.map((e, i) => '<span style="color:' + ELC[e] + '">● ' + ATTR[e] + (i === 0 ? (mode === 2 ? ' (J1)' : ' (vos)') : '') + '</span>').join('›') + '›<span style="color:' + ELC[e0] + '">' + ATTR[e0] + '</span>';
}

const UP=[
{c:'FUE',n:'Más daño',d:'+1 de daño por disparo',op:'dmg',f:()=>p.dmg++},
{c:'VEL',n:'Disparo rápido',d:'Ataca un 20% más seguido',op:'rate',f:()=>p.rate*=.8},
{c:'VEL',n:'Disparo doble',d:'+1 proyectil por ataque',op:'multi',f:()=>p.multi++},
{c:'FUE',n:'Perforante',d:'Los disparos atraviesan 1 enemigo más',op:'pierce',f:()=>p.pierce++},
{c:'VEL',n:'Patas veloces',d:'+15% de velocidad',op:'sp',f:()=>p.sp*=1.15},
{c:'VIT',n:'Reparación',d:'+25 de vida máxima y cura 25',op:'hp',f:()=>{p.max+=25;p.hp=Math.min(p.max,p.hp+25)}},
{c:'INT',n:'Imán de datos',d:'Atrae el XP desde más lejos',op:'mag',f:()=>p.mag*=1.6}];
const TREE=[
{c:'Ataque',n:[{k:'a1',n:'Poder',d:'+20% de daño',m:5,b:30},{k:'a2',n:'Cadencia',d:'Ataca un 6% más rápido',m:5,b:40,r:'a1'},{k:'a3',n:'Disparo extra',d:'+1 proyectil desde el inicio',m:1,b:150,r:'a2'}]},
{c:'Defensa',n:[{k:'d1',n:'Vitalidad',d:'+15 de vida máxima',m:5,b:25},{k:'d2',n:'Agilidad',d:'+5% de velocidad',m:5,b:35,r:'d1'},{k:'d3',n:'Coraza',d:'-8% de daño recibido',m:3,b:60,r:'d2'}]},
{c:'Datos',n:[{k:'x1',n:'Imán',d:'+20% de alcance para juntar XP',m:3,b:25},{k:'x2',n:'Sintonía',d:'+15% de XP recibida',m:5,b:50,r:'x1'},{k:'x3',n:'Botín',d:'+20% de monedas por partida',m:3,b:60,r:'x2'}]},
{c:'Entrenamiento',n:[{k:'tf',n:'Fuerza',d:'+1 punto permanente y +4% de daño',m:5,b:40},{k:'tv',n:'Velocidad',d:'+1 punto permanente y +3% de velocidad',m:5,b:40},{k:'ti',n:'Inteligencia',d:'+1 punto permanente y +6% de XP',m:5,b:40},{k:'th',n:'Vitalidad',d:'+1 punto permanente y +8 de vida',m:5,b:40}]}];
let save={coins:0,lv:{}};
try{const s=JSON.parse(localStorage.getItem('digisurvivor'));if(s&&s.lv)save=s}catch(e){}
function persist(){try{localStorage.setItem('digisurvivor',JSON.stringify(save))}catch(e){}if(window.onSave)window.onSave(save)}
window.getSave=()=>save;
window.loadSave=s=>{save=s;try{localStorage.setItem('digisurvivor',JSON.stringify(save))}catch(e){}wal()};
function L(k){return save.lv[k]|0}
function applyTree(q){q.dmg*=(1+.2*L('a1'))*(1+.04*L('tf'));q.rate*=Math.pow(.94,L('a2'));q.multi+=L('a3');q.max+=15*L('d1')+8*L('th');q.hp=q.max;q.sp*=(1+.05*L('d2'))*(1+.03*L('tv'));q.arm=.08*L('d3');q.mag*=1+.2*L('x1');q.xpm=(1+.15*L('x2'))*(1+.06*L('ti'));q.coin=1+.2*L('x3')}
function wal(){$('wal').textContent='Monedas: '+save.coins;$('tw').textContent='Monedas: '+save.coins}
function renderTree(){const c=$('cols');c.innerHTML='';
 TREE.forEach(br=>{const col=document.createElement('div');col.className='col';col.innerHTML='<h3>'+br.c+'</h3>';
  br.n.forEach(n=>{const lv=L(n.k),maxed=lv>=n.m,locked=n.r&&!L(n.r),cost=n.b*(lv+1);
   const b=document.createElement('button');b.className='node';b.disabled=maxed||!!locked||save.coins<cost;
   b.innerHTML='<b>'+n.n+' '+lv+'/'+n.m+'</b>'+n.d+'<i>'+(maxed?'Máximo':locked?'Requiere mejorar la anterior':cost+' monedas')+'</i>';
   b.onclick=()=>{save.coins-=cost;save.lv[n.k]=lv+1;persist();wal();renderTree()};col.appendChild(b)});c.appendChild(col)})}
$('tb').onclick=()=>{treeOpen=true;renderTree();wal();$('tree').style.display='flex'};
$('tx').onclick=()=>{treeOpen=false;$('tree').style.display='none'};
function endRun(title){if(!running)return;
 // si termina el anfitrión, avisa al otro jugador para que también termine (si no, queda jugando con todo congelado)
 if(isOnline&&isHost&&conn){try{conn.send({type:'end',title:title})}catch(e){}}
 running=false;paused=false;evo=null;pending=[];SkillSys.clearBar();
 $('evt').style.display='none';$('up').style.display='none';
 const m=Math.floor(t/60),s=Math.floor(t%60),c=Math.floor((kills*.5+t/6+lvl*8)*P[0].coin);save.coins+=c;persist();
 $('t').textContent=title;
 $('m').textContent='Aguantaste '+m+':'+String(s).padStart(2,'0')+' y eliminaste '+kills+' virus. Ganaste '+c+' monedas.';
 wal();isOnline=false;$('ov').style.display='flex';lobbyChanged()}

function drawBuddy(q,s,x,y,f,a){
 const C=CR(q);
 if(!C)return;

 let spriteInfo = null;
 if(s < 5){
  spriteInfo = C.canvases[`stage_${s}`];
 }else{
  const bi = C.meta.branches[q.line || 0];
  const branchKey = q.branchId || (bi ? bi.id : '6_1');
  spriteInfo = C.canvases[`branch_${branchKey}`];
 }

 if(!spriteInfo) return;

 const cv = spriteInfo.canvas;
 const cols = spriteInfo.cols, rows = spriteInfo.rows;
 const fw = cv.width / cols, fh = cv.height / rows;
 const h = 96, w = fw * h / fh;

 let row = 0, col = 0;
 if(q.dead){
  row = 2; col = 0;
 }else if(q.atkT > q.rate - 0.25 || q.skT > 0){
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
 cx.ellipse(0, h / 2 - 2, w * .35, 5, 0, 0, 6.283);
 cx.fill();

 if(mode === 2){
  cx.strokeStyle = PC[q.id];
  cx.lineWidth = 3;
  cx.beginPath();
  cx.ellipse(0, h / 2 - 2, w * .4, 7, 0, 0, 6.283);
  cx.stroke();
 }

 if(f < 0) cx.scale(-1, 1);
 cx.drawImage(cv, col * fw, row * fh, fw, fh, -w / 2, -h / 2, w, h);
 cx.restore();
}

// ---------- Enemigos con sprites (ENEMY_LINE) ----------
// El tamaño sale del radio de colisión; el atributo se ve en el aro de color de la sombra.
const enSpr=e=>{const C=CreatureLoader.cache[ENEMY_LINE];return C&&e.sk?C.canvases[e.sk]:null};
const enH=e=>Math.max(50,e.r*4.2);
const enTop=e=>enSpr(e)?enH(e)/2:e.r;
function drawEnemy(e){
 const S=enSpr(e);if(!S||!S.canvas)return false;
 const cv=S.canvas,fw=cv.width/S.cols,fh=cv.height/S.rows,h=enH(e),w=fw*h/fh;
 const stop=e.gun&&e.cd>1.9,row=stop?5:1,col=Math.floor(t*(e.k===1?9:6)+e.x*.01)&1;
 cx.save();cx.translate(e.x,e.y);cx.imageSmoothingEnabled=false;
 cx.fillStyle='rgba(0,0,0,.35)';cx.beginPath();cx.ellipse(0,h/2-2,w*.32,4,0,0,6.283);cx.fill();
 cx.strokeStyle=ELC[e.el];cx.lineWidth=2;cx.beginPath();cx.ellipse(0,h/2-2,w*.36,6,0,0,6.283);cx.stroke();
 if(Math.cos(e.ang)<0)cx.scale(-1,1);
 if(e.fl>0)cx.filter='brightness(3)';
 cx.drawImage(cv,col*fw,row*fh,fw,fh,-w/2,-h/2,w,h);
 cx.restore();return true}

function startEvo(s){evo={t:0,s,done:0};const v=$('evt');v.style.display='block';v.textContent='¡Tu compañero está digievolucionando!'}
function stepEvo(dt){evo.t+=dt;
 if(!evo.done&&evo.t>=1.3){evo.done=1;
  for(const q of P){
   const s=q.stage=evo.s;q.r=[14,16,19,22,25,28][s] || 20;
   const wk=q.weak?.5:1;
   if(s<5){q.dmg+=1.5;q.max+=30}
   else if(q.line===0){q.dmg+=3*wk;q.max+=60*wk;if(!q.weak)q.pierce++}            // línea 0: pesado
   else if(q.line===1){q.dmg+=1*wk;q.multi+=q.weak?1:2;q.sp*=q.weak?1.07:1.15}   // línea 1: veloz
   else{q.dmg+=5*wk}                                                              // línea 2: poderoso
   q.hp=q.max;
   for(let i=0;i<30;i++)burst(q.x,q.y,i%2?'#fff':'#ffd23f');
  }
  // nombre(s) de la nueva forma de cada jugador (sin repetir)
  const names=P.map(q=>{const C=CR(q);if(!C)return '';const M=C.meta;const o=evo.s<5?M.stages[evo.s]:(M.branches[q.line]||M.branches[0]);return o?o.name:''}).filter((n,i,a)=>n&&a.indexOf(n)===i);
  $('evt').textContent='¡'+names.join(' y ')+'!';
 }
 if(evo.t>=2.8){
  const s=evo.s;evo=null;const v=$('evt');
  v.textContent='¡Enemigos reforzados!';
  setTimeout(()=>{if(!evo)v.style.display='none'},2600);
  if (isOnline) {
    if (isHost) {
      if (conn) conn.send({ type: 'trigger_levelup' });
      startCards();
    }
  } else {
    startCards();
  }
 }}

const SN={FUE:'Fuerza',VEL:'Velocidad',VIT:'Vitalidad',INT:'Inteligencia'};
function setHead(txt){const h=$('up').querySelector('h2');h.textContent=txt+(mode===2&&!txt.startsWith('ESPERANDO')?' · Jugador '+(p.id+1):'');h.style.color=mode===2?PC[p.id]:''}

// Evita que un click o tecla de la pantalla anterior elija una carta sin querer
// (en modo FAST los niveles se encadenan y la elección aparece justo donde estaba la carta anterior).
let cardsAt = 0;
function showUp(){ cardsAt = performance.now(); $('up').style.display = 'flex'; }
function thumbOf(C, key){
  const s = C && C.canvases[key]; if(!s) return '';
  const fw = s.canvas.width / s.cols, fh = s.canvas.height / s.rows;
  const c = document.createElement('canvas'); c.width = fw; c.height = fh;
  c.getContext('2d').drawImage(s.canvas, 0, 0, fw, fh, 0, 0, fw, fh);
  return '<img src="' + c.toDataURL() + '" style="display:block;height:72px;image-rendering:pixelated;margin-bottom:6px">';
}

function chooseLine(){
  hostDone = false; clientDone = false; paused = true;
  p = isOnline ? (isHost ? P[0] : P[1]) : pending[0];
  cardMode='line'; setHead('¡Elegí tu evolución final!');

  const C = CR(p), branches = C.meta.branches;
  const meets = b => TEST || Object.entries(b.req).every(([stat, val]) => tot(p, stat) >= Math.ceil(val * REQ_FACTOR));
  const anyOk = branches.some(meets);
  cur = branches.map((b, idx) => {
    const ok = meets(b);
    return {
      n: b.name,
      lock: !ok && anyOk,   // si no cumplís ninguna, quedan todas disponibles (inestables)
      weak: !anyOk,
      op: 'line',
      lineIdx: idx,
      branchId: b.id,
      d: b.desc,
      req: Object.entries(b.req).map(([k, v]) => `${SN[k]} ${Math.min(tot(p, k), Math.ceil(v * REQ_FACTOR))}/${Math.ceil(v * REQ_FACTOR)}`).join(' · '),
      f: () => { p.line = idx; p.branchId = b.id; p.weak = !anyOk; }
    };
  });

  const c=$('cards');c.innerHTML='';
  cur.forEach((u,i)=>{
    const b=document.createElement('button');
    b.className='card';
    b.disabled=u.lock;
    b.innerHTML=thumbOf(C,'branch_'+u.branchId)+'<b>'+(i+1)+'. '+u.n+'</b>'+u.d+'<em>Requiere: '+u.req+'</em>';
    b.onclick=()=>choose(u);
    c.appendChild(b);
  });
  if(!anyOk && $('up').querySelector('p')) $('up').querySelector('p').textContent='No cumplís ningún requisito: la evolución será inestable (bonos a la mitad)';
  showUp();
}

function levelUp(){
  xp-=need;lvl++;need=Math.round(need*1.3+2);paused=true;

  if(EVO_LEVELS.includes(lvl)){
    const nextStage = EVO_LEVELS.indexOf(lvl) + 1;
    startEvo(nextStage);
    if (isOnline && isHost && conn) conn.send({ type: 'trigger_evo', stage: nextStage });
    return;
  }
  if(lvl===LINE_LEVEL){
    if (isOnline) {
      pending = [isHost ? P[0] : P[1]];
      if (isHost && conn) conn.send({ type: 'trigger_line' });
    } else {
      pending = [...P];
    }
    chooseLine();
    return;
  }
  if (isOnline) {
    pending = [isHost ? P[0] : P[1]];
    if (isHost && conn) conn.send({ type: 'trigger_levelup' });
  } else {
    pending = [...P];
  }
  startCards();
}

function startCards(){
  hostDone = false; clientDone = false;
  if (isOnline) {
    pending = [isHost ? P[0] : P[1]];
  } else {
    pending = [...P];
  }
  showCards();
}

function showCards(){
  paused=true; p=pending[0]; cardMode='cards'; setHead('¡Subiste de nivel!');
  $('up').querySelector('p').textContent='Elegí con el mouse o con las teclas 1, 2 o 3';
  {const sk=SkillSys.cards(p).slice(0,2),st=UP.filter(u=>['dmg','sp','hp','mag'].includes(u.op)).sort(()=>Math.random()-.5);cur=[...sk,...st].slice(0,3)}
  const c=$('cards');c.innerHTML='';
  cur.forEach((u,i)=>{const b=document.createElement('button');b.className='card';b.innerHTML='<b>'+(i+1)+'. '+u.n+'</b>'+u.d+(u.c?'<em>Suma a '+SN[u.c]+'</em>':u.tag?'<em>'+u.tag+'</em>':'');b.onclick=()=>choose(u);c.appendChild(b)});
  showUp();
}

function choose(u){
  if(performance.now() - cardsAt < 800) return;   // ignora clicks/teclas accidentales justo al aparecer
  if(!pending.length) return;                      // ya elegiste (esperando al otro jugador): ignora teclas repetidas
  const q=pending[0],modo=cardMode;p=q;u.f();if(modo==='cards'&&u.c)q.st[u.c]++;p=P[0];pending.shift();

  if (isOnline) {
    const payload = { type: isHost ? 'host_choice' : 'client_choice', op: u.op, c: u.c, wpKey: u.wpKey, lineIdx: u.lineIdx, branchId: u.branchId, weak: u.weak };
    if (conn) conn.send(payload);

    if (isHost) {
      hostDone = true;
      if (!clientDone) {
        setHead('ESPERANDO A JUGADOR 2');
        $('cards').innerHTML = '<p style="font-size:20px;color:var(--gold);padding:20px;">Jugador 1 listo. Esperando a que Jugador 2 elija...</p>';
        return;
      }
    } else {
      clientDone = true;
      if (!hostDone) {
        setHead('ESPERANDO A JUGADOR 1');
        $('cards').innerHTML = '<p style="font-size:20px;color:var(--gold);padding:20px;">Jugador 2 listo. Esperando a que Jugador 1 elija...</p>';
        return;
      }
    }
  }

  if(pending.length){modo==='line'?chooseLine():showCards();return}

  if (isOnline) {
    if (isHost && hostDone && clientDone) {
      if (modo === 'line') {
        if (conn) conn.send({ type: 'trigger_evo', stage: 5 });
        $('up').style.display = 'none';
        startEvo(5);
      } else {
        $('up').style.display = 'none';
        paused = false; last = performance.now();
        if (conn) conn.send({ type: 'resume_game' });
      }
    }
  } else {
    $('up').style.display = 'none';
    if (modo === 'line') startEvo(5);
    else { paused = false; last = performance.now(); }
  }
}

function spawn(ti){const a=Math.random()*6.283,d=Math.hypot(W,H)/2+40;
 const q=Math.random(),k=t>25&&q<.15?2:t>10&&q<.4?1:0,b=2+Math.floor(t/40);
 // sk: sprite de ENEMY_LINE. Etapa = tier; los tanques van una etapa arriba (en el tope, una de las ramas finales al azar)
 const es=ti+(k===2?1:0),sk=es<5?'stage_'+es:'branch_6_'+(1+Math.floor(Math.random()*3));
 const HM=[1,1.5,2.2,3,4,5.5][ti],T=[{hp:b,sp:1,r:12,v:3},{hp:Math.max(1,Math.ceil(b/2)),sp:1.9,r:9,v:4},{hp:b*4,sp:.55,r:21,v:10}][k];
 en.push({x:cam.x+Math.cos(a)*d,y:cam.y+Math.sin(a)*d,k,ti,sk,hp:T.hp*HM,sp:(55+Math.random()*25+t*.4)*T.sp*(1+.05*ti),r:T.r*(1+.12*ti),v:T.v*(1+.5*ti),dm:[1,1.2,1.4,1.7,2,2.4][ti],fl:0,ang:0,el:Math.floor(Math.random()*3),gun:k!==1&&t>15&&Math.random()<Math.min(.4,(t-15)/150)+.08*ti,cd:1+Math.random()*2})}
function burst(x,y,c){for(let i=0;i<8;i++){const a=Math.random()*6.283,s=60+Math.random()*120;pt.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:.4,c})}}

function update(dt){
 t+=dt;SkillSys.renderBar(P);
 if (isOnline) {
   if (!isHost && conn) {
     conn.send({ type: 'input', keys: { w: keys.w, a: keys.a, s: keys.s, d: keys.d, arrowup: keys.arrowup, arrowleft: keys.arrowleft, arrowdown: keys.arrowdown, arrowright: keys.arrowright } });
   } else if (isHost && conn) {
     conn.send({
       type: 'sync',
       P: P.map(q => ({ x: q.x, y: q.y, hp: q.hp, max: q.max, stage: q.stage, face: q.face, dead: q.dead, moving: q.moving, line: q.line, branchId: q.branchId, wp: q.wp, oa: q.oa, revP: q.revP })),
       en: en.map(e => ({ x: e.x, y: e.y, r: e.r, k: e.k, ti: e.ti, sk: e.sk, el: e.el, fl: e.fl, ang: e.ang, gun: e.gun })),
       gems: gems.map(g => ({ x: g.x, y: g.y, v: g.v })),
       sh: sh.map(s => ({ x: s.x, y: s.y, c: s.c, r: s.r })),
       eb: eb.map(b => ({ x: b.x, y: b.y, el: b.el })),
       ef: ef.map(o => ({ k: o.k, x: o.x, y: o.y, R: o.R, l: o.l, m: o.m, a: o.a, Lg: o.Lg, s: o.s, w: o.w, col: o.col })),
       t, kills, lvl, need, xp
     });
   }
 }

 for(const q of P){
  if(q.dead)continue;
  let dx=0, dy=0;
  if(mode===1){
    dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);
    dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);
  } else if(q.id===0){
    dx=(keys.d?1:0)-(keys.a?1:0);
    dy=(keys.s?1:0)-(keys.w?1:0);
  } else if(q.id===1){
    if(isOnline) {
      if(isHost) {
        dx=(remoteKeys.d||remoteKeys.arrowright?1:0)-(remoteKeys.a||remoteKeys.arrowleft?1:0);
        dy=(remoteKeys.s||remoteKeys.arrowdown?1:0)-(remoteKeys.w||remoteKeys.arrowup?1:0);
      } else {
        dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);
        dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);
      }
    } else {
      dx=(keys.arrowright?1:0)-(keys.arrowleft?1:0);
      dy=(keys.arrowdown?1:0)-(keys.arrowup?1:0);
    }
  }
  q.moving = !!(dx || dy);
  if(dx||dy){const l=Math.hypot(dx,dy);q.x+=dx/l*q.sp*dt;q.y+=dy/l*q.sp*dt;if(dx)q.face=dx}
  q.inv-=dt;
 }

 const al=P.filter(q=>!q.dead);
 if(al.length && mode===2){
   for(const q of al){
     q.x=Math.max(cam.x-W/2+40,Math.min(cam.x+W/2-40,q.x));
     q.y=Math.max(cam.y-H/2+40,Math.min(cam.y+H/2-40,q.y));
   }
 }

 if (isOnline && !isHost) {
   $('fill').style.width=Math.max(0,P[0].hp/P[0].max*100)+'%';
   if(mode===2)$('fill2').style.width=Math.max(0,P[1].hp/P[1].max*100)+'%';$('xpf').style.width=Math.min(100,xp/need*100)+'%';
   $('tm').textContent=Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');$('info').textContent='Nv '+lvl+' · '+kills+' virus';
   return;
 }

 // revivir: si un compañero vivo está parado sobre un jugador caído, se va llenando el progreso
 for(const d of P){if(!d.dead)continue;
  let rv=0;for(const a of al)if(Math.hypot(a.x-d.x,a.y-d.y)<REVIVE_R)rv=Math.max(rv,a.revSpd||1);
  d.revP=rv?(d.revP||0)+dt*rv:Math.max(0,(d.revP||0)-dt);
  if(d.revP>=REVIVE_TIME){d.dead=false;d.hp=d.max*.5;d.inv=2;d.revP=0;for(let i=0;i<24;i++)burst(d.x,d.y,i%2?'#fff':'#ffd23f')}}
 spawnT-=dt;const iv=Math.max(.2,1.1-t*.008)/(mode===2?1.5:1),mt=Math.max(...P.map(q=>q.stage|0));
 while(spawnT<=0){for(let i=0,n=1+Math.floor(t/60);i<n&&en.length<(mode===2?340:260);i++)spawn(Math.max(0,mt-1));spawnT+=iv}
 for(const q of al){q.atkT-=dt;
  if(q.atkT<=0){let b=null,bd=420;for(const e of en){const d=Math.hypot(e.x-q.x,e.y-q.y);if(d<bd){bd=d;b=e}}
   if(b){const a0=Math.atan2(b.y-q.y,b.x-q.x),n=q.multi;for(let i=0;i<n;i++){const a=a0+(i-(n-1)/2)*.22;sh.push({x:q.x,y:q.y,vx:Math.cos(a)*460,vy:Math.sin(a)*460,l:1,pi:q.pierce,h:new Set(),d:q.dmg,el:q.el})}q.atkT=q.rate}}}
 for(const s of sh){s.x+=s.vx*dt;s.y+=s.vy*dt;s.l-=dt;
  for(const e of en)if(s.l>0&&!s.h.has(e)&&Math.hypot(e.x-s.x,e.y-s.y)<e.r+6){hit(e,s.d,s.el);s.h.add(e);if(s.pi>0)s.pi--;else s.l=0;if(s.ex)SkillSys.explode(s,e);burst(s.x,s.y,'#ffd23f')}}
 sh=sh.filter(s=>s.l>0);
 for(const q of al)SkillSys.update(q,dt);
 for(const e of en){let tg=null,dd=1e9;for(const q of al){if(q.dead)continue;const d=Math.hypot(q.x-e.x,q.y-e.y);if(d<dd){dd=d;tg=q}}
  if(!tg)break;const a=Math.atan2(tg.y-e.y,tg.x-e.x);e.ang=a;
  if(!(e.gun&&dd<230)){e.x+=Math.cos(a)*e.sp*dt;e.y+=Math.sin(a)*e.sp*dt}e.fl-=dt;
  if(e.gun){e.cd-=dt;if(e.cd<=0&&dd<520){e.cd=2.2+Math.random();{const n=e.ti>=3?5:e.ti>=2?3:1,vb=230+25*e.ti;for(let j=0;j<n;j++){const aa=a+(j-(n-1)/2)*.28;eb.push({x:e.x,y:e.y,vx:Math.cos(aa)*vb,vy:Math.sin(aa)*vb,l:3,el:e.el,dm:e.dm})}}}}
  for(const q of al)if(!q.dead&&q.inv<=0&&Math.hypot(e.x-q.x,e.y-q.y)<e.r+q.r-4)hurt(q,[7,5,12][e.k]*e.dm,e.el)}
 for(const b of eb){b.x+=b.vx*dt;b.y+=b.vy*dt;b.l-=dt;for(const q of al)if(b.l>0&&!q.dead&&q.inv<=0&&Math.hypot(b.x-q.x,b.y-q.y)<q.r+4){hurt(q,6*b.dm,b.el);b.l=0}}eb=eb.filter(b=>b.l>0);
 for(let i=0;i<en.length;i++)for(let j=i+1;j<en.length;j++){const a=en[i],b=en[j],d=Math.hypot(a.x-b.x,a.y-b.y);
  if(d>0&&d<a.r*1.6){const k=(a.r*1.6-d)/2/d;a.x+=(a.x-b.x)*k;a.y+=(a.y-b.y)*k;b.x-=(a.x-b.x)*k;b.y-=(a.y-b.y)*k}}
 for(const e of en)if(e.hp<=0){kills++;gems.push({x:e.x,y:e.y,v:e.v});burst(e.x,e.y,ELC[e.el])}
 en=en.filter(e=>e.hp>0);
 const al2=P.filter(q=>!q.dead);
 for(const g of gems){let tg=null,td=1e9;for(const q of al2){const d=Math.hypot(q.x-g.x,q.y-g.y);if(d<td){td=d;tg=q}}
  if(tg){if(td<tg.mag){const a=Math.atan2(tg.y-g.y,tg.x-g.x);g.x+=Math.cos(a)*380*dt;g.y+=Math.sin(a)*380*dt}if(td<tg.r+8){xp+=g.v*tg.xpm;g.dead=1}}}
 gems=gems.filter(g=>!g.dead);
 if(xp>=need)levelUp();
 for(const f of fx){f.y-=45*dt;f.l-=dt}fx=fx.filter(f=>f.l>0);for(const o of ef)o.l-=dt;ef=ef.filter(o=>o.l>0);
 for(const q of pt){q.x+=q.vx*dt;q.y+=q.vy*dt;q.l-=dt}pt=pt.filter(q=>q.l>0);
 if(P.every(q=>q.dead))endRun('Fuiste borrado');
 $('fill').style.width=Math.max(0,P[0].hp/P[0].max*100)+'%';
 if(mode===2)$('fill2').style.width=Math.max(0,P[1].hp/P[1].max*100)+'%';
 $('xpf').style.width=Math.min(100,xp/need*100)+'%';$('tm').textContent=Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
 if($('tr')&&CR(P[0])){const EC=CreatureLoader.cache[ENEMY_LINE],M=(EC||CR(P[0])).meta;$('tr').textContent='Enemigos: '+(M.stages[Math.max(0,Math.max(...P.map(q=>q.stage|0))-1)]||M.stages[4]).name}
 $('info').textContent='Nv '+lvl+' · '+kills+' virus';$('pst').textContent=P.map(q=>(mode===2?'J'+(q.id+1)+' · ':'')+'FUE '+tot(q,'FUE')+' VEL '+tot(q,'VEL')+' INT '+tot(q,'INT')+' VIT '+tot(q,'VIT')).join('\n');
}

function draw(){
 const al=P.filter(q=>!q.dead);
 if(al.length){
   cam.x=al.reduce((a,q)=>a+q.x,0)/al.length;
   cam.y=al.reduce((a,q)=>a+q.y,0)/al.length;
 }

 cx.fillStyle='#050b1a';cx.fillRect(0,0,W,H);
 const ox=W/2-cam.x,oy=H/2-cam.y;
 cx.strokeStyle='#0e2a4a';cx.lineWidth=1;cx.beginPath();
 for(let x=-((cam.x%64)+64)%64;x<W;x+=64){cx.moveTo(x,0);cx.lineTo(x,H)}
 for(let y=-((cam.y%64)+64)%64;y<H;y+=64){cx.moveTo(0,y);cx.lineTo(W,y)}
 cx.stroke();
 cx.save();cx.translate(ox,oy);
 for(const q of pt){cx.globalAlpha=q.l*2.5;cx.fillStyle=q.c;cx.fillRect(q.x-2,q.y-2,4,4)}cx.globalAlpha=1;
 for(const g of gems){cx.fillStyle=g.v>5?'#ffd23f':'#5cf2ff';const s=g.v>5?7:4;cx.beginPath();cx.arc(g.x,g.y,s,0,6.283);cx.fill()}
 for(const e of en){const C=e.fl>0?'#fff':ELC[e.el],D='#050b1a';cx.fillStyle=C;
  if(drawEnemy(e)){}
  else if(e.k===1){cx.save();cx.translate(e.x,e.y);cx.rotate(e.ang);cx.beginPath();cx.moveTo(e.r*1.4,0);cx.lineTo(-e.r,-e.r);cx.lineTo(-e.r*.5,0);cx.lineTo(-e.r,e.r);cx.fill();cx.restore()}
  else if(e.k===2){cx.fillRect(e.x-e.r,e.y-e.r,e.r*2,e.r*2);cx.fillStyle=D;cx.fillRect(e.x-e.r+4,e.y-e.r+4,e.r*2-8,e.r*2-8);cx.fillStyle=C;cx.fillRect(e.x-8,e.y-7,5,6);cx.fillRect(e.x+3,e.y-7,5,6);cx.fillRect(e.x-8,e.y+4,16,3)}
  else{cx.fillRect(e.x-e.r,e.y-e.r,e.r*2,e.r*2);cx.fillStyle=D;cx.fillRect(e.x-7,e.y-4,5,5);cx.fillRect(e.x+2,e.y-4,5,5);cx.fillRect(e.x-6,e.y+4,12,3)}
  for(let i=0;i<e.ti;i++){cx.fillStyle='#ffd23f';cx.fillRect(e.x-(e.ti*5-1)+i*10,e.y-enTop(e)-10,7,5)}
  if(e.gun){cx.strokeStyle='rgba(255,255,255,.75)';cx.lineWidth=2;cx.beginPath();cx.arc(e.x,e.y,e.r+5,0,6.283);cx.stroke()}}
 for(const s of sh){cx.fillStyle=s.c||'#ffd23f';cx.beginPath();cx.arc(s.x,s.y,s.r||5,0,6.283);cx.fill()}
 for(const b of eb){cx.fillStyle=ELC[b.el];cx.strokeStyle='#fff';cx.lineWidth=2;cx.beginPath();cx.arc(b.x,b.y,6,0,6.283);cx.fill();cx.stroke()}
 for(const o of ef)SkillSys.drawFx(o);
 for(const q of P)if(!q.dead)SkillSys.drawOrbits(q);
 for(const q of P){const s=q.stage|0,hh=96;
  if(q.dead)drawBuddy(q,s,q.x,q.y,q.face,.25);
  else if(!evo&&(q.inv<=0||Math.floor(t*20)%2))drawBuddy(q,s,q.x,q.y,q.face,1);
  if(mode===2){cx.textAlign='center';cx.font='bold 13px Chakra Petch,system-ui,sans-serif';cx.fillStyle=PC[q.id];cx.fillText(q.dead?'J'+(q.id+1)+' ✝ (pararse encima para revivir)':'J'+(q.id+1),q.x,q.y-hh/2-8)}
  if(q.dead&&mode===2){const pr=Math.min(1,(q.revP||0)/REVIVE_TIME);cx.lineWidth=3;cx.strokeStyle='rgba(255,210,63,.35)';cx.beginPath();cx.arc(q.x,q.y,REVIVE_R,0,6.283);cx.stroke();if(pr>0){cx.strokeStyle='#ffd23f';cx.lineWidth=6;cx.beginPath();cx.arc(q.x,q.y,REVIVE_R,-Math.PI/2,-Math.PI/2+6.283*pr);cx.stroke()}}}
 if(evo){const e0=evo.t,sw=e0>=1.3,pul=Math.sin(e0*Math.PI/2.8);
  for(const q of P){
   drawBuddy(q,sw?evo.s:evo.s-1,q.x,q.y,q.face,sw?Math.min(1,(e0-1.3)*2):Math.max(0,1-e0*.9));
   cx.fillStyle='rgba(255,255,255,'+(.25+pul*.7)+')';cx.beginPath();cx.arc(q.x,q.y,18+pul*34,0,6.283);cx.fill();
   cx.strokeStyle='#ffd23f';cx.lineWidth=3;for(let i=0;i<3;i++){const r=(e0*1.2+i/3)%1;cx.globalAlpha=1-r;cx.beginPath();cx.arc(q.x,q.y,10+r*110,0,6.283);cx.stroke()}cx.globalAlpha=1}}
 cx.textAlign='center';cx.lineJoin='round';for(const f of fx){cx.globalAlpha=Math.min(1,f.l*2);cx.font='bold '+f.sz+'px Chakra Petch,system-ui,sans-serif';cx.lineWidth=4;cx.strokeStyle='#000';cx.strokeText(f.txt,f.x,f.y);cx.fillStyle=f.col;cx.fillText(f.txt,f.x,f.y)}cx.globalAlpha=1;
 cx.restore();
}

function loop(n){const dt=Math.min(.05,(n-last)/1000);last=n;if(evo)stepEvo(dt);else if(!paused)update(dt);draw();if(running)requestAnimationFrame(loop)}
P=[np(0,'001_guilmon')];p=P[0];
if($('party-panel'))$('party-panel').style.display='none';   // reemplazado por la ventana Amigos / Party (social.js)
buildMenuSel();
(async()=>{
  try{await SkillSys.load();await Promise.all(CREATURES.map(c=>CreatureLoader.load(c.id).catch(e=>console.error(e))))}catch(e){console.error(e)}
  if(selected&&!CreatureLoader.cache[selected])selected=null;
  renderSel();wal();draw();
})();

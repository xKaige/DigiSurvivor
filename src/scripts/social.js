// Nick único, Amigos y Party. Lo inicia firebase.js al iniciar sesión (initSocial) y lo apaga al cerrarla (stopSocial).
// No importa nada: firebase.js le pasa las funciones de Firestore ("fb"). La conexión entre jugadores está en game.js (window.Lobby).
//
// Datos en Firestore:
//   nicks/{nick en minúsculas}        { uid, nick }                       se crea una sola vez; así el nick es único
//   profiles/{uid}                    { nick, nickLower, peerId, seen }   perfil público; "seen" es la señal de "en línea"
//   users/{uid}/friends/{amigoUid}    { at }                              la amistad es mutua: se escribe en las dos listas
const NICK_RE = /^[A-Za-z0-9_]{3,16}$/;
const ONLINE_MS = 100000;   // un amigo cuenta como "en línea" si su "seen" es más reciente que esto
const BEAT_MS = 40000;      // cada cuánto avisamos que seguimos en línea
const POLL_MS = 20000;      // refresco de la lista mientras la ventana está abierta

let S = null;               // sesión activa
const $$ = id => document.getElementById(id);

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const k in props) {
    if (k === 'class') e.className = props[k];
    else if (k === 'text') e.textContent = props[k];
    else if (k.slice(0, 2) === 'on') e[k] = props[k];
    else e.setAttribute(k, props[k]);
  }
  kids.forEach(x => { if (x) e.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
  return e;
}

function injectStyles() {
  if ($$('soc-style')) return;
  const st = document.createElement('style'); st.id = 'soc-style';
  st.textContent = [
    '#social{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(5,11,26,.88);z-index:20;text-align:left}',
    '#social .box{width:min(580px,94vw);max-height:88vh;overflow:auto;background:#0a1a33;border:2px solid var(--teal);padding:16px;display:flex;flex-direction:column;gap:12px}',
    '#social .head{display:flex;align-items:center;justify-content:space-between;gap:10px}',
    '#social h2{margin:0;font-size:26px;color:var(--teal)}',
    '#social .tabs{display:flex;gap:8px}',
    '#social button,#nickbox button,#invbox button{font:inherit;font-weight:700;cursor:pointer;padding:8px 14px;border:2px solid var(--teal);background:transparent;color:var(--teal);margin:0}',
    '#social button.on,#nickbox button.main,#invbox button.main{background:var(--gold);color:var(--bg);border-color:var(--gold)}',
    '#social button:disabled,#nickbox button:disabled{opacity:.4;cursor:not-allowed}',
    '#social .row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid #123259;flex-wrap:wrap}',
    '#social .grow{flex:1;min-width:120px;font-weight:700;font-size:18px}',
    '#social input,#nickbox input{font:inherit;padding:8px 10px;background:#050b1a;color:var(--ink);border:2px solid var(--teal);min-width:0;flex:1}',
    '#social .add{display:flex;gap:8px}',
    '#social .dim{color:#7fa0b8;font-size:14px}',
    '#social .msg{color:var(--gold);font-size:15px;min-height:18px}',
    '#social .dot{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:6px;background:#516a80}',
    '#social .dot.on{background:#43ff7a}',
    '#social .chip{display:flex;align-items:center;gap:8px;font-size:15px}',
    '#social .chip img{height:48px;image-rendering:pixelated}',
    '#invbox{position:fixed;top:12px;right:12px;display:flex;flex-direction:column;gap:8px;z-index:40;text-align:left}',
    '#invbox .inv{background:#0a1a33;border:2px solid var(--gold);padding:10px 12px;display:flex;flex-direction:column;gap:8px;max-width:300px}',
    '#invbox .inv div{display:flex;gap:8px}',
    '#nickbox{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(5,11,26,.96);z-index:50;text-align:left}',
    '#nickbox .box{width:min(440px,92vw);background:#0a1a33;border:2px solid var(--gold);padding:18px;display:flex;flex-direction:column;gap:12px}',
    '#nickbox h2{margin:0;color:var(--gold)}',
    '#nickbox .err{color:#ff6b6b;min-height:20px;font-size:15px}',
    '#nickbox .row{display:flex;gap:8px}',
    '#soc-btn{position:relative}',
    '#soc-btn .bd{position:absolute;top:-6px;right:-6px;background:#ff3d81;color:#fff;border-radius:10px;padding:0 6px;font-size:13px;line-height:18px}'
  ].join('');
  document.head.appendChild(st);
}

// ---------- Armado de la interfaz (una sola vez) ----------
function buildUI() {
  if (!$$('soc-btn')) {
    const b = el('button', { id: 'soc-btn', text: 'Amigos / Party' });
    b.style.display = 'none';
    b.onclick = () => openPanel('friends');
    const acc = $$('acc'); if (acc) acc.appendChild(b); else document.body.appendChild(b);
  }
  if (!$$('social')) {
    const panel = el('div', { id: 'social' },
      el('div', { class: 'box' },
        el('div', { class: 'head' }, el('h2', { text: 'Amigos' }), el('button', { id: 'soc-x', text: 'X', onclick: () => closePanel() })),
        el('div', { class: 'tabs' },
          el('button', { id: 'tab-friends', text: 'Amigos', onclick: () => setTab('friends') }),
          el('button', { id: 'tab-party', text: 'Party', onclick: () => setTab('party') })),
        el('div', { id: 'soc-body' })));
    document.body.appendChild(panel);
  }
  if (!$$('invbox')) document.body.appendChild(el('div', { id: 'invbox' }));
}

function openPanel(tab) {
  if (!S) return;
  const p = $$('social'); if (!p) return;
  p.style.display = 'flex'; S.open = true;
  setTab(tab || S.tab);
  clearInterval(S.poll); S.poll = setInterval(loadFriends, POLL_MS);
}
function closePanel() {
  const p = $$('social'); if (p) p.style.display = 'none';
  if (S) { S.open = false; clearInterval(S.poll); }
}
function setTab(tab) {
  if (!S) return;
  S.tab = tab; S.msg = '';
  render();
  if (tab === 'friends') loadFriends();   // al entrar a Amigos se actualiza quién está en línea
}

// ---------- Nick único ----------
function askNick(cancelable) {
  return new Promise(resolve => {
    const input = el('input', { id: 'nick-input', maxlength: '16', placeholder: 'Tu Nick (3 a 16: letras, números o _)' });
    const err = el('div', { class: 'err', id: 'nick-err' });
    const ok = el('button', { class: 'main', id: 'nick-ok', text: 'Confirmar' });
    const no = el('button', { id: 'nick-no', text: 'Cerrar sesión' });
    const box = el('div', { id: 'nickbox' }, el('div', { class: 'box' },
      el('h2', { text: 'Elegí tu Nick' }),
      el('div', { class: 'dim', text: 'Es único y tus amigos te van a agregar con él. Por ahora no se puede cambiar.' }),
      input, err, el('div', { class: 'row' }, ok, cancelable === false ? null : no)));
    document.body.appendChild(box);
    const finish = v => { box.remove(); resolve(v); };
    ok.onclick = async () => {
      const v = input.value.trim();
      if (!NICK_RE.test(v)) { err.textContent = 'Usá de 3 a 16 caracteres: letras sin tilde, números o _'; return; }
      ok.disabled = true; err.textContent = 'Guardando...';
      try { await claimNick(v); finish(v); }
      catch (e) { err.textContent = e && e.message === 'taken' ? 'Ese nick ya está en uso, probá con otro' : 'No se pudo guardar: ' + (e && e.message || e); ok.disabled = false; }
    };
    input.onkeydown = e => { if (e.key === 'Enter') ok.onclick(); e.stopPropagation(); };
    input.onkeyup = e => e.stopPropagation();
    no.onclick = () => { finish(null); const lo = $$('logout'); if (lo) lo.click(); };
    setTimeout(() => input.focus(), 0);
  });
}

// Reserva el nick y crea el perfil en una sola operación: si el nick ya existe, falla ('taken')
async function claimNick(nick) {
  const { db, fb, uid } = S, lower = nick.toLowerCase();
  await fb.runTransaction(db, async tx => {
    const ref = fb.doc(db, 'nicks', lower);
    const snap = await tx.get(ref);
    if (snap.exists()) throw new Error('taken');
    tx.set(ref, { uid, nick });
    tx.set(fb.doc(db, 'profiles', uid), { nick, nickLower: lower, peerId: '', seen: Date.now() });
  });
}

// ---------- Amigos ----------
const profileRef = () => S.fb.doc(S.db, 'profiles', S.uid);

async function loadFriends() {
  const s = S; if (!s) return;
  try {
    const snap = await s.fb.getDocs(s.fb.collection(s.db, 'users', s.uid, 'friends'));
    const ids = snap.docs.map(d => d.id);
    const profs = await Promise.all(ids.map(id => s.fb.getDoc(s.fb.doc(s.db, 'profiles', id))));
    if (S !== s) return;
    s.friends = profs.map((p, i) => {
      const d = p.exists() ? p.data() : {};
      return { uid: ids[i], nick: d.nick || '(sin nick)', peerId: d.peerId || '', online: !!d.peerId && Date.now() - (d.seen || 0) < ONLINE_MS };
    }).sort((a, b) => (b.online - a.online) || a.nick.localeCompare(b.nick));
  } catch (e) { console.error(e); if (S === s) s.msg = 'No se pudo cargar la lista de amigos'; }
  if (S === s) render();
}

async function addFriend(raw) {
  const s = S, lower = String(raw || '').trim().toLowerCase();
  if (!NICK_RE.test(lower)) { s.msg = 'Escribí un nick válido (3 a 16: letras, números o _)'; return render(); }
  try {
    const n = await s.fb.getDoc(s.fb.doc(s.db, 'nicks', lower));
    if (!n.exists()) { s.msg = 'No existe ningún jugador con ese nick'; return render(); }
    const fid = n.data().uid;
    if (fid === s.uid) { s.msg = 'Ese nick es el tuyo'; return render(); }
    if (s.friends.some(f => f.uid === fid)) { s.msg = 'Ya es tu amigo'; return render(); }
    const b = s.fb.writeBatch(s.db);
    b.set(s.fb.doc(s.db, 'users', s.uid, 'friends', fid), { at: Date.now() });
    b.set(s.fb.doc(s.db, 'users', fid, 'friends', s.uid), { at: Date.now() });
    await b.commit();
    s.msg = '¡' + n.data().nick + ' agregado a tus amigos!';
    await loadFriends();
  } catch (e) { console.error(e); s.msg = 'No se pudo agregar: ' + (e && e.message || e); render(); }
}

async function removeFriend(f) {
  const s = S;
  try {
    const b = s.fb.writeBatch(s.db);
    b.delete(s.fb.doc(s.db, 'users', s.uid, 'friends', f.uid));
    b.delete(s.fb.doc(s.db, 'users', f.uid, 'friends', s.uid));
    await b.commit();
    s.msg = f.nick + ' ya no está en tus amigos';
    await loadFriends();
  } catch (e) { console.error(e); s.msg = 'No se pudo eliminar: ' + (e && e.message || e); render(); }
}

// Antes de invitar se vuelve a leer su perfil para tener su conexión actual
async function inviteFriend(f) {
  const s = S;
  try {
    const p = await s.fb.getDoc(s.fb.doc(s.db, 'profiles', f.uid));
    const d = p.exists() ? p.data() : {};
    if (!d.peerId || Date.now() - (d.seen || 0) >= ONLINE_MS) { s.msg = f.nick + ' no está en línea'; return render(); }
    s.msg = '';
    window.Lobby.invite({ uid: f.uid, nick: d.nick || f.nick, peerId: d.peerId });
  } catch (e) { console.error(e); s.msg = 'No se pudo invitar: ' + (e && e.message || e); render(); }
}

// ---------- Dibujo ----------
function chip(id) {
  const i = id && window.Lobby.info(id);
  const c = el('span', { class: 'chip' });
  if (!i) { c.appendChild(el('span', { class: 'dim', text: 'Sin elegir' })); return c; }
  const im = el('span'); im.innerHTML = i.img; c.appendChild(im);
  const t = el('span', { text: i.name + ' ' }); const a = el('span', { text: '● ' + i.attr }); a.style.color = i.color; t.appendChild(a);
  c.appendChild(t); return c;
}

function renderFriends(body) {
  const st = window.Lobby.state();
  const inp = el('input', { id: 'friend-nick', maxlength: '16', placeholder: 'Nick de tu amigo' });
  inp.onkeydown = e => { if (e.key === 'Enter') addFriend(inp.value); e.stopPropagation(); };
  inp.onkeyup = e => e.stopPropagation();
  body.appendChild(el('div', { class: 'add' }, inp, el('button', { id: 'friend-add', class: 'on', text: 'Agregar', onclick: () => addFriend(inp.value) })));
  body.appendChild(el('div', { class: 'msg', id: 'soc-msg', text: S.msg || st.note || '' }));
  if (!S.friends.length) body.appendChild(el('div', { class: 'dim', text: 'Todavía no tenés amigos. Agregá a alguien con su Nick.' }));
  S.friends.forEach(f => {
    const row = el('div', { class: 'row', 'data-uid': f.uid },
      el('span', { class: 'dot' + (f.online ? ' on' : '') }),
      el('span', { class: 'grow', text: f.nick }),
      el('span', { class: 'dim', text: f.online ? 'En línea' : 'Desconectado' }));
    const inv = el('button', { class: 'inv-btn', text: 'Invitar', onclick: () => inviteFriend(f) });
    inv.disabled = !f.online || !!st.role || !st.ready;
    row.appendChild(inv);
    const del = el('button', { class: 'del-btn', text: 'Eliminar' });
    del.onclick = () => {
      if (del.dataset.sure) return removeFriend(f);
      del.dataset.sure = '1'; del.textContent = '¿Seguro?';
      setTimeout(() => { if (del.isConnected) { delete del.dataset.sure; del.textContent = 'Eliminar'; } }, 3000);
    };
    row.appendChild(del);
    body.appendChild(row);
  });
}

function renderParty(body) {
  const st = window.Lobby.state();
  if (!st.role) {
    body.appendChild(el('div', { class: 'dim', text: 'No estás en ningún party. Invitá a un amigo desde la pestaña Amigos, o aceptá una invitación.' }));
    body.appendChild(el('div', { class: 'msg', id: 'soc-msg', text: S.msg || st.note || '' }));
    return;
  }
  const host = st.role === 'host', other = st.party || {};
  const mine = el('div', { class: 'row', id: 'pm-me' }, el('span', { class: 'grow', text: S.nick + (host ? ' (líder)' : '') }), chip(st.selected),
    el('button', { id: 'pm-pick', text: 'Elegir Digimon', onclick: () => window.Lobby.pick() }));
  const theirs = el('div', { class: 'row', id: 'pm-other' }, el('span', { class: 'grow', text: (other.nick || '...') + (host ? '' : ' (líder)') }), chip(other.c));
  body.appendChild(mine); body.appendChild(theirs);
  const ready = !!st.selected && !!other.c;
  if (host) {
    const go = el('button', { id: 'pm-start', class: 'on', text: 'Iniciar partida', onclick: () => window.Lobby.startOnline() });
    go.disabled = !ready || st.running;
    body.appendChild(go);
    if (!ready) body.appendChild(el('div', { class: 'dim', text: 'Los dos tienen que elegir su Digimon para iniciar.' }));
  } else {
    body.appendChild(el('div', { class: 'dim', text: ready ? 'Esperando a que el líder inicie la partida...' : 'Elegí tu Digimon y esperá al líder.' }));
  }
  body.appendChild(el('button', { id: 'pm-leave', text: 'Salir del party', onclick: () => window.Lobby.leave() }));
  body.appendChild(el('div', { class: 'msg', id: 'soc-msg', text: S.msg || st.note || '' }));
}

function render() {
  if (!S) return;
  const body = $$('soc-body'); if (!body) return;
  $$('tab-friends').className = S.tab === 'friends' ? 'on' : '';
  $$('tab-party').className = S.tab === 'party' ? 'on' : '';
  body.innerHTML = '';
  if (S.tab === 'party') renderParty(body); else renderFriends(body);
}

// Invitaciones recibidas (aviso arriba a la derecha, solo fuera de partida) + aviso en el botón del menú
function renderToasts() {
  const box = $$('invbox'); if (!box) return;
  const st = window.Lobby.state();
  box.innerHTML = '';
  if (!st.running) st.inbox.forEach(i => {
    const t = el('div', { class: 'inv', 'data-id': i.id }, el('b', { text: i.nick + ' te invita a jugar' }),
      el('div', null,
        el('button', { class: 'main acc-btn', text: 'Aceptar', onclick: () => { window.Lobby.accept(i.id); } }),
        el('button', { class: 'dec-btn', text: 'Rechazar', onclick: () => window.Lobby.decline(i.id) })));
    box.appendChild(t);
  });
  const b = $$('soc-btn');
  if (b) { const old = b.querySelector('.bd'); if (old) old.remove(); const n = st.inbox.length; if (n) b.appendChild(el('span', { class: 'bd', text: String(n) })); }
}

// Se llama cada vez que cambia algo en la conexión (invitaciones, party, elección de Digimon...)
function onLobby() {
  if (!S) return;
  const st = window.Lobby.state();
  if (st.role && !S.prevRole && !st.running) openPanel('party');   // se armó un party: mostrar la pestaña Party
  S.prevRole = st.role;
  renderToasts();
  if (S.open) render();
}

// ---------- Inicio / fin ----------
async function initSocial(ctx) {
  if (S && S.uid === ctx.user.uid) return;
  stopSocial();
  const s = S = { db: ctx.db, fb: ctx.fb, uid: ctx.user.uid, nick: null, friends: [], tab: 'friends', msg: '', open: false, timers: [], poll: null, prevRole: null };
  injectStyles(); buildUI();
  const ps = await s.fb.getDoc(profileRef());
  let nick = ps.exists() ? ps.data().nick : null;
  if (S !== s) return;
  if (!nick) nick = await askNick();
  if (!nick || S !== s) return;
  s.nick = nick;
  const who = $$('who'); if (who) who.textContent = nick;
  // ¿es amigo? Se consulta a Firestore cada vez (no se usa la lista en memoria, que puede estar vieja)
  window.isFriendUid = async uid => {
    if (S !== s) return false;
    try { return (await s.fb.getDoc(s.fb.doc(s.db, 'users', s.uid, 'friends', uid))).exists(); } catch (e) { return false; }
  };
  window.onLobby = onLobby;
  window.onRunStart = closePanel;
  window.onPeerOpen = id => { if (S === s) s.fb.setDoc(profileRef(), { peerId: id, seen: Date.now() }, { merge: true }).catch(e => console.error(e)); };
  window.Lobby.setSelf(s.uid, nick);
  await loadFriends();                       // para saber quiénes son amigos antes de recibir invitaciones
  if (S !== s) return;
  window.initPeer();
  s.timers.push(setInterval(() => { s.fb.setDoc(profileRef(), { seen: Date.now() }, { merge: true }).catch(() => {}); }, BEAT_MS));
  const b = $$('soc-btn'); if (b) b.style.display = 'inline-block';
  onLobby();
}

function stopSocial() {
  if (!S) return;
  const s = S; S = null;
  s.timers.forEach(clearInterval); clearInterval(s.poll);
  try { s.fb.setDoc(s.fb.doc(s.db, 'profiles', s.uid), { seen: 0, peerId: '' }, { merge: true }).catch(() => {}); } catch (e) {}
  const p = $$('social'); if (p) p.style.display = 'none';
  const b = $$('soc-btn'); if (b) b.style.display = 'none';
  const nb = $$('nickbox'); if (nb) nb.remove();
  const ib = $$('invbox'); if (ib) ib.innerHTML = '';
  window.isFriendUid = null; window.onLobby = null; window.onPeerOpen = null; window.onRunStart = null;
  if (window.Lobby) window.Lobby.leave();
  if (window.stopPeer) window.stopPeer();
  const who = $$('who'); if (who) who.textContent = '';
}

export { initSocial, stopSocial };

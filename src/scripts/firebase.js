import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, writeBatch, runTransaction, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

import { firebaseConfig } from './firebase-config.js';
import { initSocial, stopSocial } from './social.js';

const $ = id => document.getElementById(id);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// funciones de Firestore que usa social.js (nick, amigos, perfil)
const fb = { doc, getDoc, setDoc, collection, getDocs, writeBatch, runTransaction, query, orderBy, limit };
let uid = null;

async function saveToCloud(saveData) {
  if (!uid) return;
  try {
    // merge: no pisa el campo "prog" (progreso de progress.js) que se guarda aparte
    await setDoc(doc(db, 'users', uid), {
      coins: saveData.coins,
      lv: saveData.lv || {},
      // 0.6: datos de cada atributo, Chips de Reformateo, árboles y vínculo (trees.js)
      ac: saveData.ac || [0, 0, 0],
      rc: saveData.rc | 0,
      tr: saveData.tr || {},
      bond: saveData.bond || {},
      v: saveData.v || 2,
      updated: Date.now()
    }, { merge: true });
  } catch (err) {
    console.error('Error al guardar en Firestore:', err);
  }
}

// Progreso de progress.js (Rango de Tamer, Digimon desbloqueados, Digitamas, Analyzer): users/{uid}.prog
// Se guarda con un pequeño retraso para no escribir en cada cambio del Analyzer.
let progTimer = null;
function saveProgToCloud(st) {
  if (!uid) return;
  clearTimeout(progTimer);
  progTimer = setTimeout(() => {
    setDoc(doc(db, 'users', uid), { prog: st, updated: Date.now() }, { mergeFields: ['prog', 'updated'] })   // mergeFields: reemplaza 'prog' entero (con merge quedaban Digitamas ya eclosionados)
      .catch(err => console.error('Error al guardar el progreso en Firestore:', err));
  }, 1500);
}
window.onProgSave = st => saveProgToCloud(st);

if ($('login')) {
  $('login').onclick = () => signInWithPopup(auth, new GoogleAuthProvider())
    .catch(e => alert('No se pudo iniciar sesión: ' + e.message));
}

if ($('logout')) {
  $('logout').onclick = () => {
    signOut(auth).then(() => {
      localStorage.removeItem('digisurvivor');
      localStorage.removeItem('digisurvivor_prog');
      if (window.loadSave) window.loadSave({ coins: 0, lv: {}, ac: [0, 0, 0], rc: 0, tr: {}, bond: {} });
      if (window.loadProg) window.loadProg(null);   // el rango y los desbloqueos son de la cuenta: se vuelve a cero
    });
  };
}

window.onSave = s => {
  if (uid) saveToCloud(s);
};

onAuthStateChanged(auth, async u => {
  uid = u ? u.uid : null;
  if ($('login')) $('login').style.display = u ? 'none' : 'inline-block';
  if ($('logout')) $('logout').style.display = u ? 'inline-block' : 'none';
  if ($('who')) $('who').textContent = u ? (u.displayName || u.email) : '';
  // el panel viejo de "código de amigo" ya no se usa: ahora está la ventana Amigos / Party
  if ($('party-panel')) $('party-panel').style.display = 'none';

  if (!u) { stopSocial(); return; }

  try {
    const snap = await getDoc(doc(db, 'users', u.uid));
    if (snap.exists()) {
      const d = snap.data();
      const loadedSave = { coins: d.coins | 0, lv: d.lv || {}, ac: d.ac, rc: d.rc | 0, tr: d.tr, bond: d.bond, v: d.v, updated: Number(d.updated) || 0 };   // updated: lo usa el reinicio de progreso (RESET_BEFORE en game.js)
      const wiped = window.loadSave ? window.loadSave(loadedSave) : false;
      // progreso de la cuenta; si la cuenta todavía no tiene, se sube el del navegador.
      // Si el guardado era de antes del reinicio (RESET_BEFORE en game.js), el progreso también vuelve a cero.
      if (wiped) { if (window.loadProg) window.loadProg(null); if (window.getProg) saveProgToCloud(window.getProg()); }
      else if (d.prog && window.loadProg) window.loadProg(d.prog);
      else if (window.getProg) saveProgToCloud(window.getProg());
    } else if (window.getSave) {
      await saveToCloud(window.getSave());
      if (window.getProg) saveProgToCloud(window.getProg());
    }
  } catch (e) {
    console.error('Error al cargar progreso de Firestore:', e);
  }

  // Nick único, amigos y party
  initSocial({ db, user: u, fb }).catch(e => console.error('Error en Amigos / Party:', e));
});

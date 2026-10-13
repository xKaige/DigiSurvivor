import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';


import { firebaseConfig } from './firebase-config.js';

const $ = id => document.getElementById(id);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let uid = null;

async function saveToCloud(saveData) {
  if (!uid) return;
  try {
    await setDoc(doc(db, 'users', uid), {
      coins: saveData.coins,
      lv: saveData.lv || {},
      updated: Date.now()
    });
  } catch (err) {
    console.error('Error al guardar en Firestore:', err);
  }
}

if ($('login')) {
  $('login').onclick = () => signInWithPopup(auth, new GoogleAuthProvider())
    .catch(e => alert('No se pudo iniciar sesión: ' + e.message));
}

if ($('logout')) {
  $('logout').onclick = () => {
    signOut(auth).then(() => {
      localStorage.removeItem('digisurvivor');
      if (window.loadSave) window.loadSave({ coins: 0, lv: {} });
      if ($('party-panel')) $('party-panel').style.display = 'none';
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
  if ($('party-panel')) $('party-panel').style.display = u ? 'flex' : 'none';

  if (!u) return;

  if (window.initPeer) window.initPeer(u.displayName || u.email || u.uid);

  try {
    const snap = await getDoc(doc(db, 'users', u.uid));
    if (snap.exists()) {
      const d = snap.data();
      const loadedSave = { coins: d.coins | 0, lv: d.lv || {} };
      if (window.loadSave) window.loadSave(loadedSave);
    } else if (window.getSave) {
      await saveToCloud(window.getSave());
    }
  } catch (e) {
    console.error('Error al cargar progreso de Firestore:', e);
  }
});

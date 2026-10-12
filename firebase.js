import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const $ = id => document.getElementById(id);
const configurado = firebaseConfig && firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith('REEMPLAZAR');

if (!configurado) {
  if ($('acc')) $('acc').style.display = 'none';
  console.warn('Firebase sin configurar: el progreso se guarda solo en este navegador.');
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  let uid = null, timer = null;

  if ($('login')) {
    $('login').onclick = () => signInWithPopup(auth, new GoogleAuthProvider())
      .catch(e => alert('No se pudo iniciar sesión: ' + e.message));
  }

  if ($('logout')) {
    $('logout').onclick = () => signOut(auth);
  }

  window.onSave = s => {
    if (!uid) return;
    clearTimeout(timer);
    timer = setTimeout(() => setDoc(doc(db, 'users', uid), { coins: s.coins, lv: s.lv, updated: Date.now() })
      .catch(console.error), 400);
  };

  onAuthStateChanged(auth, async u => {
    uid = u ? u.uid : null;
    if ($('login')) $('login').style.display = u ? 'none' : 'inline-block';
    if ($('logout')) $('logout').style.display = u ? 'inline-block' : 'none';
    if ($('who')) $('who').textContent = u ? (u.displayName || u.email) : '';
    if (!u) return;
    try {
      const snap = await getDoc(doc(db, 'users', u.uid));
      if (snap.exists()) {
        const d = snap.data();
        if (window.loadSave) window.loadSave({ coins: d.coins | 0, lv: d.lv || {} });
      } else if (window.onSave && window.getSave) {
        window.onSave(window.getSave());
      }
    } catch (e) {
      console.error(e);
    }
  });
}

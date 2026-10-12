import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Configuración integrada de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBoPF0edlZUgwvihWcODdbBW2gsG3hON-o",
  authDomain: "digisurvivor-5ecb6.firebaseapp.com",
  projectId: "digisurvivor-5ecb6",
  storageBucket: "digisurvivor-5ecb6.firebasestorage.app",
  messagingSenderId: "661076871942",
  appId: "1:661076871942:web:d997b535c7d11c174aec87",
  measurementId: "G-NQ1ETSNF5S"
};

const $ = id => document.getElementById(id);

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

<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyBoPF0edlZUgwvihWcODdbBW2gsG3hON-o",
    authDomain: "digisurvivor-5ecb6.firebaseapp.com",
    projectId: "digisurvivor-5ecb6",
    storageBucket: "digisurvivor-5ecb6.firebasestorage.app",
    messagingSenderId: "661076871942",
    appId: "1:661076871942:web:d997b535c7d11c174aec87",
    measurementId: "G-NQ1ETSNF5S"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
</script>
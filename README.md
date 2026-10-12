# DigiSurvivor (versión web)

Sitio estático: no necesita compilar nada. Funciona en Vercel tal cual.
Sin Firebase configurado, el juego anda igual y guarda monedas y mejoras en el navegador.

## Archivos
- `index.html`, `styles.css`: la página.
- `game.js`: todo el juego (1 jugador y coop local).
- `sprites.js`: los sprites incrustados.
- `firebase.js` y `firebase-config.js`: login con Google y guardado en la nube.

## 1. Crear el proyecto de Firebase (gratis)
1. Entrá a https://console.firebase.google.com y creá un proyecto (podés desactivar Analytics).
2. **Build > Authentication > Comenzar > Google** → activalo y elegí tu mail de soporte.
3. **Build > Firestore Database > Crear base de datos** (modo producción, la región que prefieras).
4. En Firestore, pestaña **Reglas**, pegá esto y publicá:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```
5. **Configuración del proyecto (engranaje) > Tus apps > </> (Web)**: registrá una app y copiá el objeto `firebaseConfig`. Pegalo en `firebase-config.js`.

## 2. Subir a GitHub
Creá un repositorio nuevo y subí todos estos archivos (en GitHub: Add file > Upload files).

## 3. Publicar en Vercel
1. En https://vercel.com: **Add New > Project** e importá el repositorio.
2. Framework Preset: **Other**. Dejá vacíos Build Command y Output Directory. **Deploy**.
3. Cada vez que cambies algo en GitHub, Vercel republica solo.

## 4. Autorizar el dominio (paso que más se olvida)
En Firebase: **Authentication > Configuración > Dominios autorizados > Agregar dominio**
y agregá el de Vercel (por ejemplo `tu-proyecto.vercel.app`). Sin esto, el login falla.

## Probar en tu PC (opcional)
Abrí una terminal en la carpeta y corré `npx serve`. Los módulos no andan abriendo el archivo con doble clic.
`localhost` ya viene autorizado en Firebase.

## Cómo se guarda el progreso
- Sin sesión: en el navegador (localStorage).
- Con sesión: en Firestore, documento `users/<tu uid>`. Al iniciar sesión por primera vez se sube lo que
  tenías en el navegador; si ya existe progreso en la nube, se usa ese.

## Pendiente para más adelante
- Un jugador puede editar su guardado desde el navegador; si hace falta ranking o competencia, hay que validar en un servidor.
- Coop online (requiere Realtime Database o similar).

# DigiSurvivor

Juego web tipo "survivor" (hordas de virus, subís de nivel, elegís mejoras) con Digimon. Se juega en un `<canvas>`, en JavaScript puro, **sin build ni dependencias**. Sprites sacados de Stream Avatar. Se publica en Vercel desde GitHub.

## Cómo trabajar con el usuario

- Responder en **español rioplatense**, claro y sin jerga. El usuario no es programador y usa **Windows**.
- Los tokens son limitados: cambios chicos y puntuales, sin reescribir archivos enteros si no hace falta.
- Después de cambiar algo, decir cómo probarlo y qué se tendría que ver.
- No inventar skills ni datos de Digimon: tienen que ser **reales**. Fuentes: https://dsrworldwiki.com/en/digimon/ (skills, Digimon Super Rumble) y https://humulos.com/digimon/vbdm/ex/ (líneas evolutivas). Si no se puede verificar algo, marcarlo `"verified": false` y avisar.

## Cómo correrlo

```
py -m http.server 8000
```
y abrir `http://localhost:8000` (recargar con `Ctrl + F5`). **No abrir `index.html` con doble clic**: el navegador bloquea los JSON y los módulos de Firebase.

## Estructura

```
index.html                      HUD y menú (ids que usa game.js; no renombrarlos)
src/styles/style.css
src/scripts/loader.js           CreatureLoader: carga el JSON + sprites de una criatura
src/scripts/skills.js           SkillSys: motor de skills (cartas, disparo, dibujo, barra)
src/scripts/game.js             el juego (bucle, jugadores, enemigos, evolución, online)
src/scripts/social.js           Nick único, Amigos, invitaciones y ventana Party (lo importa firebase.js)
src/scripts/firebase.js         login con Google + guardado en la nube (type="module")
src/scripts/firebase-config.js  config pública de Firebase (la importa firebase.js)
src/data/skills.json            catálogo de skills + reglas globales
firestore.rules                 reglas de seguridad de Firestore (se pegan en la consola de Firebase)
src/data/creatures/<id>.json    una criatura por archivo
assets/sprites/creatures/<id>/  sprite sheets PNG de esa criatura
```
Orden de carga en `index.html`: `loader.js` → `skills.js` → `game.js` (scripts clásicos) y `firebase.js` como `type="module"` (que importa `social.js`). `skills.js` usa variables globales de `game.js` (`en`, `sh`, `ef`, `hit`, `cx`, `t`, `CR`) en tiempo de ejecución.

## Criaturas

- Hoy: `001_guilmon` (Virus), `002_renamon` (Dato), `003_terriermon` (Vacuna). La lista está en `CREATURES` al inicio de `game.js`.
- Cada una tiene 5 etapas (`stages`, índices 0-4) y 1 a 3 ramas finales (`branches`, etapa 5). Los sprites son hojas de **2 columnas × 6 filas**; el juego usa fila 0 idle, 1 caminar, 2 muerte y 5 ataque. El blanco (>240 RGB) se vuelve transparente.
- Campos del JSON: `id`, `name`, `attribute` (`Vacuna` | `Virus` | `Dato`), `anySkill`, `stages[]` y `branches[]` (con `file`, `cols`, `rows`, `skills`; las ramas además `id`, `req`, `desc`).
- **Los nombres de archivo del JSON tienen que coincidir exactamente (mayúsculas incluidas) con los PNG**: Vercel distingue mayúsculas.
- El efecto de cada rama depende de su **posición** en `branches`: 0 = pesado (+daño, +vida, perfora), 1 = veloz (+proyectiles, +velocidad), 2 = poderoso (+daño).
- Evolución por nivel: `FAST = true` en `game.js` usa niveles bajos de prueba (2,3,4,5 y rama en 6). Con `false` son 3,6,9,12 y rama en 15. `?test` en la URL desbloquea todas las ramas.

### Agregar un Digimon nuevo
1. Carpeta `assets/sprites/creatures/<id>/` con los PNG 2×6.
2. `src/data/creatures/<id>.json` (copiar uno existente).
3. Agregar `{ id: '<id>' }` a `CREATURES` en `game.js`.
Si falta el JSON, simplemente no aparece en la selección.

## Menú y selección

- El menú tiene "Elegir Digimon". Hasta elegir uno, **Jugar, 2 Jugadores, Conectarse e Iniciar Online están bloqueados**. La elección se guarda en `localStorage` (`digisurvivor_pick`).
- 1 jugador: usa el elegido. 2 jugadores local: J1 usa el del menú y J2 elige al empezar. Online: cada uno usa el de su menú.
- La selección reutiliza la pantalla `#up` (la misma de subir de nivel).

## Atributos

Índices: 0 Vacuna, 1 Virus, 2 Dato. Cada uno es fuerte contra el siguiente: **Vacuna > Virus > Dato > Vacuna** (x1.5 de daño; x0.5 al revés), tanto atacando como recibiendo. El del jugador sale de `attribute` (`elOf`). Los enemigos tienen atributo al azar.

## Skills

- Catálogo en `skills.json`: `maxLevel` 5, `maxActive` 4, `levelBonus` (cada nivel suma **lo mismo a todas**: +30% daño, +10% área, -5% recarga). Tipos: `melee_arc`, `cone`, `projectile`, `beam`, `orbit`. Los efectos se dibujan por código, no con sprites.
- `anySkill: true` en el JSON de una criatura = puede aprender cualquier skill. Sin eso, solo las de su etapa/rama actual (`skills` por etapa).
- Máximo 4 skills activas por jugador. Con el cupo lleno solo salen mejoras de las que ya tenés (también se valida al aplicar elecciones online con `SkillSys.canTake`).
- Cada nivel de subida ofrece hasta 2 cartas de skills (nuevas y mejoras intercaladas) y el resto stats (`dmg`, `sp`, `hp`, `mag`). Hay una barra fija abajo con las skills y su nivel.
- Skills verificadas: Hot Bite (Gigimon), Rock Breaker y Fireball (Guilmon, wiki DSR), Plasma Blade y Exhaust Flame (Growmon), Atomic Blaster y Assault Balancer (WarGrowlmon). **Sin verificar**: Lightning Joust y Shield of the Just (Dukemon). Los valores de daño/recarga/rango son estimaciones a ajustar jugando.

## Revivir

Un jugador caído revive si un compañero vivo se queda sobre su sprite `REVIVE_TIME` (5 s, en `game.js`) dentro de `REVIVE_R`. Revive con 50% de vida. Cada jugador tiene `revSpd` (1 = normal) para futuras pasivas. Subir de nivel **no** revive. Si caen todos, termina la partida.

## Nick, amigos y party

- Al iniciar sesión por primera vez hay que elegir un **Nick único** (3 a 16: letras sin tilde, números o `_`; no distingue mayúsculas y por ahora no se puede cambiar). Se reserva en `nicks/{nick}` con una transacción, así no se repite.
- El botón **Amigos / Party** del menú abre la ventana (solo con sesión y nick):
  - **Amigos**: agregar por Nick, ver quién está en línea, **Invitar** y **Eliminar** (pide confirmación). La amistad es **mutua e inmediata** (no hay solicitud que aceptar): se escribe en las dos listas.
  - **Party**: muestra a los dos jugadores con el Digimon que eligió cada uno (y su atributo). Cada uno puede elegir Digimon desde ahí. Solo el **líder** (quien invitó) ve "Iniciar partida", que se habilita cuando los dos eligieron. El party es de 2 jugadores.
- Las invitaciones llegan como aviso arriba a la derecha y solo se aceptan de **amigos** (se consulta a Firestore en el momento). Se ignoran durante una partida.
- Datos en Firestore: `nicks/{nick en minúsculas}` `{uid,nick}`, `profiles/{uid}` `{nick,nickLower,peerId,seen}` (perfil público; "en línea" = `seen` de hace menos de 100 s, se renueva cada 40 s), `users/{uid}/friends/{amigoUid}` `{at}`. Las reglas están en `firestore.rules`: **si se agregan colecciones nuevas hay que actualizar las reglas y pegarlas en la consola de Firebase**.

## Multijugador online (PeerJS)

- La conexión vive en `game.js` y la usa `social.js` mediante `window.Lobby` (`state`, `info`, `pick`, `invite`, `accept`, `decline`, `leave`, `startOnline`) y los avisos `window.onLobby`, `window.onPeerOpen`, `window.onRunStart`, `window.isFriendUid`.
- Cada sesión tiene un Peer `ds-xxxxxxxxxx` que se publica en `profiles/{uid}.peerId`. Una invitación viaja por una conexión de control (`metadata.kind = 'ctl'`); si el invitado acepta, **él se conecta** al que invitó (`kind = 'game'`), que pasa a ser el anfitrión. El anfitrión solo acepta conexiones de gente a la que invitó (`pendingInv`).
- El anfitrión **simula todo** y manda `sync` (jugadores, enemigos, gemas, disparos, efectos, tiempo, xp); el invitado manda sus teclas (`input`) y solo dibuja.
- Mensajes: `hello`/`pick` (nick y Digimon elegido), `start` (con la criatura del líder), `ready` (con la del invitado), `input`, `sync`, `trigger_levelup`, `trigger_line`, `trigger_evo`, `host_choice`, `client_choice`, `resume_game`, `end`.
- Si se agrega un campo que el invitado tenga que dibujar, **hay que incluirlo en el `sync` y en `applyOnlineSync`**.
- El panel viejo de "código de amigo" (`#party-panel`) quedó oculto y sin uso.

## Guardado

Monedas y mejoras permanentes en `localStorage` (`digisurvivor`) y, con sesión, en Firestore (`users/<uid>`). Reglas de Firestore: `firestore.rules`. Dominio autorizado de Vercel: ver `README.md`. Un jugador puede editar su guardado; si hace falta ranking hay que validar en un servidor.

## Despliegue

Subir a GitHub y Vercel republica solo (preset "Other", sin build). No subir copias de respaldo (`*.bak*`, `src_backup/`) ni scripts de parche.

## Pendiente / ideas

- **Evolución de skills**: al maxear una skill (nivel 5) y evolucionar, se transforma en una versión superior de la etapa siguiente (ej. Fireball → Exhaust Flame; Rock Breaker → Hammer Edge o Double Edge). Faltan definir: cuándo se ofrece, cómo se elige entre varias salidas, con qué nivel arranca la nueva y de dónde salen las skills base. Hammer Edge y Double Edge **no están verificadas**.
- Completar skills reales de MedievalDukemon y ChaosDukemon (hoy vacías), y de Renamon y Terriermon (hoy todas pueden aprender cualquiera).
- Terriermon tiene una sola rama final (SaintGalgomon).
- Posible: que el atributo de los enemigos dependa de la zona o del Digimon.
- Amigos: solicitudes con aceptación (hoy es inmediato y mutuo), poder cambiar el Nick, party de más de 2 jugadores y estado "en partida" de los amigos.
- Las invitaciones no se pueden autenticar entre jugadores (PeerJS es directo): se filtran por amistad, pero alguien que conozca el uid de un amigo podría intentar suplantarlo.

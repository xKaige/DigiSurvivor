# CLAUDE.md — DigiSurvivor

Juego web tipo "Vampire Survivors" con temática Digimon. Elegís un compañero que ataca solo, juntás XP de los virus que matás, subís de nivel, elegís mejoras y skills, y tu compañero digievoluciona. Hay 1 jugador, 2 jugadores local (mismo teclado) y 2 jugadores online (PeerJS, invitando amigos).

## Idioma y estilo
- **Todo el texto visible del juego y los comentarios del código están en español rioplatense (voseo):** "Elegí", "Sobreviví", "iniciás". Mantené ese tono.
- Respondeme en español.
- El código de `game.js` está escrito muy compacto (nombres de 1–3 letras, muchas sentencias por línea). Al editar, respetá el estilo de la zona que tocás; si refactorizás algo grande, avisame antes. Las partes más nuevas (online/lobby, `skills.js`, `social.js`) están escritas en estilo más legible.

## Stack y cómo correrlo
- **Sitio estático, sin build, sin bundler, sin npm.** JS vanilla + Canvas 2D.
- Probar en local: `npx serve` en la raíz (con doble clic no andan los `fetch` ni los módulos ES). En esta PC no hay Node: usar `py -m http.server 3000` (es lo que tiene `.claude/launch.json`).
- Probar con el navegador integrado: si el panel está oculto, `requestAnimationFrame` se frena y las capturas salen viejas → avanzar la simulación a mano (`update(0.02)` en un for) y verificar con JS. Después de editar, forzar recarga: `fetch(url,{cache:'reload'})` + `location.reload()`.
- Fuentes: Chakra Petch (todo) y Orbitron (títulos), desde Google Fonts en `index.html`.
- Agregar `?test` a la URL (`TEST`) hace que **todas las ramas finales cumplan los requisitos**. No cambia los niveles de evolución (eso es `FAST`); el comentario en `game.js:20` lo explica mal.
- Deploy: GitHub → Vercel (preset "Other", sin build command). Cada push republica. Ojo: se publica todo lo que esté en el repo (incluidos los `.bak`).
- Dependencias externas por CDN: PeerJS 1.5.2 (unpkg) y Firebase 10.14.1 (gstatic).

## Estructura real
```
index.html                      # página + HUD + overlays (ids usados por game.js)
src/styles/style.css            # estilos
src/scripts/loader.js           # CreatureLoader: carga JSON + sprites de una criatura (cache por id)
src/scripts/skills.js           # SkillSys: motor de skills (cartas, niveles, barra de skills)
src/scripts/game.js             # el juego + conexión online/lobby (script clásico, globals)
src/scripts/firebase.js         # login Google + guardado en Firestore (type="module")
src/scripts/firebase-config.js  # config pública de Firebase (la importa firebase.js)
src/scripts/social.js           # nick único, amigos, party e invitaciones (lo importa firebase.js)
src/scripts/bosses.js           # Bosses: jefes canon cada 2 min (se carga antes que game.js)
src/scripts/missions.js         # Misiones diarias (se carga después de game.js)
src/scripts/progress.js         # Progress: Digimon bloqueados, Digitamas, eclosión y Digimon Analyzer (después de missions.js)
src/scripts/map.js              # mapa de tiles (MAP_COLS/ROWS, mapData) — HOY NO SE CARGA en index.html
src/data/creatures/<id>.json    # definición de cada línea evolutiva
src/data/skills.json            # catálogo de skills, elementos, maxLevel, maxActive, levelBonus
src/data/missions.json          # catálogo de misiones diarias (tipos, metas, recompensas)
src/data/unlocks.json           # huevo de cada Digimon + misiones permanentes de desbloqueo
src/data/bosses.json            # jefes: vida, atributo, técnicas (ring/fan/charge/summon), monedas
assets/sprites/creatures/<id>/  # spritesheets PNG de cada etapa/rama
assets/sprites/eggs/egg_NN.png  # Digitamas: tira de 20 cuadros de 24×29 (Digital Tamers, spr_egg01..17)
assets/sprites/bosses/          # jefes en hojas 2×6 (Workshop; las de 7 filas sin la fila de baile)
```
El `README.md` está desactualizado (habla de la estructura vieja, sin `src/`); si lo tocás, que refleje esta. Hay copias viejas `game.js.bak*` y `style.css.bak3` en `src/`: no se usan.

Orden de carga en `index.html`: `loader.js` → `skills.js` → `bosses.js` → `game.js` → `missions.js` → `progress.js` → `firebase.js` (módulo, que importa `firebase-config.js` y `social.js`). Los scripts clásicos y los módulos se comunican solo por globals en `window` (ver abajo).

## Arquitectura de game.js

### Estado global
- `P` = array de jugadores (1 o 2), `p` = jugador "actual" (lo usan las cartas de mejora vía closures `f:()=>p.dmg++`).
- `en` enemigos, `sh` disparos del jugador, `eb` balas enemigas, `gems` XP, `pt` partículas, `fx` números de daño, `ef` efectos (anillo/rayo/skills).
- `t` tiempo de partida, `lvl`, `xp`, `need`, `kills`, `running`, `paused`, `evo` (animación de digievolución en curso), `mode` (1 o 2).
- `CREATURES` = lista de criaturas disponibles (15: `001_guilmon` … `016_commandramon`; `004_impmon` no es jugable, es la línea de enemigos). Cada jugador tiene la suya en `q.cid`; `CR(q)` devuelve su entrada de `CreatureLoader.cache`: `{ meta: <json>, canvases: { stage_0..stage_4, branch_6_1.. } }`.

### Pausa y HUD
- **Escape pausa** (`togglePause`, flag `menuPause`): menú con Continuar / Abandonar partida. Nunca termina la partida directo. En online no frena la simulación (solo abre el menú). Con cartas o digievolución en pantalla, Escape no hace nada.
- El HUD (barras, reloj, leyenda, skills) solo se ve con `body.ingame`, que pone `start()` y saca `endRun()`.

### Loop
`loop()` → si `evo` corre `stepEvo`, si no y no está en pausa corre `update(dt)` → siempre `draw()`. `dt` está topeado a 0.05.

### Jugador (`np(i, cid)`)
Campos clave: `cid, el (atributo), hp/max, sp, dmg, rate (seg entre disparos), multi, pierce, mag, arm, xpm, coin, stage (0–5), line (índice de rama), branchId, weak, st {FUE,VEL,VIT,INT}, wp {skillKey: nivel} (skills activas), wt (timers de skills), revP/revSpd (revivir)`.

### Progresión
- `FAST = true` en `game.js` → evoluciones en niveles 2,3,4,5 (`EVO_LEVELS`) y rama final en nivel 6 (`LINE_LEVEL`), con requisitos al 40% (`REQ_FACTOR`). **Está en modo prueba; para la versión real va `false`** (niveles 3,6,9,12 y 15).
- Al subir de nivel (`levelUp`): si es nivel de evolución → `startEvo(etapa)`; si es `LINE_LEVEL` → `chooseLine()` (elegir rama final) → `startEvo(5)`; si no → cartas (`startCards`/`showCards`).
- Cartas: mejoras de stat en `UP` (cada una suma 1 punto a FUE/VEL/VIT/INT) + cartas de skills de `SkillSys.cards(q)`. Se muestran 3 al azar.
- Ramas finales: requisitos en `branches[].req` del JSON, comparados contra `tot(q, stat)` = puntos permanentes del árbol + puntos de la partida. Si no cumplís ninguna, todas quedan disponibles pero "inestables" (`weak`, bonos a la mitad).
- **Los bonos de cada rama están hardcodeados por índice en `stepEvo`** (`line 0/1/2`), no en el JSON. Con 15 criaturas conviene pasarlo a datos (ej. un campo `bonus` en cada branch).
- `cardsAt` + 800 ms: protección contra clicks/teclas accidentales cuando aparecen cartas encadenadas.

### Skills (`skills.js` + `skills.json`)
- `SkillSys` usa globals de `game.js` (`en, sh, ef, hit, cx, t, CR`) en tiempo de ejecución; se carga antes que `game.js`.
- Skills **nuevas**: solo las de la etapa actual (`stages[s].skills`) o de la rama elegida (`branches[].skills`). `meta.anySkill: true` habilita todas (modo prueba; todas las criaturas lo tienen en `false`).
- Tipos de skill (`type` en `skills.json`, implementados en `skills.js`): `melee_arc`, `cone`, `projectile` (con `count`/`spread` para abanicos, `pierce`, `explode`), `beam`, `orbit`, `nova` (pulso alrededor; `guard` = segundos de invulnerabilidad). Tipo nuevo = método nuevo en `SkillSys` con el mismo nombre.
- Fuente de datos: las skills salen de https://dsrworldwiki.com/en/digimon/<slug> (Digimon Super Rumble). Cada etapa/rama guarda `wiki` (slug o `null`), `verified` y `note`; cada skill guarda `source`. Nombres en inglés como en la wiki; descripciones propias en español (no copiar textos de la wiki). Nombres que cambian: Growmon=Growlmon, Galgomon=Gargomon, Dukemon=Gallantmon, SaintGalgomon=MegaGargomon, Pokomon=Viximon (los nombres del juego son los japoneses; la wiki usa los de occidente). Las etapas bebé solo tienen ataque básico en la wiki.
- Skills que ya tenés: se pueden seguir mejorando aunque cambies de etapa. Tope de nivel `maxLevel` (5) y de skills activas `maxActive` (4).
- El escalado por nivel es igual para todas (`levelBonus`: daño, área, recarga). La barra de skills se dibuja con `SkillSys.renderBar(P)`.

### Combate
- Triángulo elemental `mult(atacante, defensor)`: 0 Vacuna › 1 Virus › 2 Dato › 0 Vacuna. ×1.5 ventaja, ×0.5 desventaja. El atributo del jugador sale de `attribute` en el JSON de su criatura (`elOf(cid)`; si falta, Vacuna).
- Enemigos: 3 tipos `k` (normal, rápido, tanque), tier `ti` según la etapa máxima de los jugadores, algunos con arma (`gun`).
- **Se dibujan con los sprites de `ENEMY_LINE` (`004_impmon`)** en `drawEnemy`. Cada enemigo guarda `sk` (clave de canvas: `stage_<ti>`; los tanques una etapa más, y desde el tope una rama `branch_6_N` al azar). `sk` va en el `sync`. Tamaño = `enH(e)` (a partir de `e.r`). El atributo se ve en el aro de color bajo los pies y el golpe recibido con `brightness`. Si la línea no carga, vuelve a las formas geométricas viejas.
- HUD: `hudBars()` actualiza vida (con rastro de daño), experiencia (NV y XP actual / necesaria) y virus eliminados, en host y cliente online. La leyenda de atributos (`renderLegend`) es un triángulo SVG. Ya no se muestra "Enemigos: X" bajo el reloj.
- Revivir: un compañero vivo parado sobre el sprite de un jugador caído lo revive en `REVIVE_TIME` (5 s) dentro de `REVIVE_R`. `q.revSpd` queda para futuras pasivas.

### Misiones diarias (`missions.js` + `missions.json`)
- Cada día se sortean `perDay` (3) misiones, una por tier (fácil/media/difícil) y sin repetir tipo. El sorteo sale de la fecha: son las mismas para todos.
- El día cambia a las **00:00 de Argentina** (`utcOffsetHours: -3`).
- El progreso se cuenta al terminar cada partida: `endRun` llama a `Missions.onRunEnd({kills, secs, lvl, stage, online, local2p, attr, coins, skillMax})` con los datos de TU jugador (en online el invitado es `P[1]`). Tipos que se suman entre partidas: `Missions.ADD`; el resto guarda el mejor valor.
- Progreso en el navegador (`localStorage['digisurvivor_daily']`), **no en Firestore** (saveToCloud solo guarda coins/lv; no se tocó por las reglas). Las recompensas suman a `save.coins`. Ojo: en dos dispositivos se podría cobrar dos veces.
- Botón `#msb` en el menú con aviso de misiones para reclamar.

### Digimon bloqueados, Digitamas y Analyzer (`progress.js` + `unlocks.json`)
- Al empezar solo se usan `STARTERS` (Guilmon, Renamon, Terriermon). El resto aparece como huevo en la grilla; al tocarlo muestra su misión (`Progress.lockedDetail`). `unlocked(id)` en game.js.
- Misión cumplida (se revisa en `endRun` → `Progress.onRunEnd`) → ganás su Digitama → eclosiona al terminar `hatch` partidas más → animación `#hatch` en el menú (`showHatch`, cola `hatchQ`) con botón para elegirlo (`window.setPick`).
- Tipos de misión: `reach_stage, survive, kills_total, runs_total, kills_with, stage_with, boss, analyzer` (ver `types` en el JSON). Usan estadísticas acumuladas de toda la vida.
- Analyzer (`#anb` → `#analyzer`): registra cada forma alcanzada (`seeForm` en `start` y `stepEvo`, solo jugadores de este navegador: `mine()`) y cada jefe derrotado. Lo no visto sale como silueta.
- Guardado en `localStorage['digisurvivor_prog']` (**no en Firestore**, como las misiones). `RESET_BEFORE` también lo borra.

### Jefes (`bosses.js` + `bosses.json`)
- Cada `every` (120 s; con `?test`, `testEvery` = 25 s) aparece el siguiente: DarkTyrannomon → Etemon → Megadramon → WaruMonzaemon → MetalEtemon → Machinedramon; después repite más fuerte (`cyc`). Si hay uno vivo, espera.
- Viven en `en` con `bo` (índice), `mh`, timers `pt/at/wd/ch`. `Bosses.act` mueve y ataca (solo host/local); al morir `Bosses.onDeath` (lluvia de XP, `Bosses.down`). Monedas extra en `endRun` (`Bosses.coins()`).
- Sync: los jefes mandan `bo, cyc, hp, mh, at`; las balas `r`; y `bd` = `Bosses.down`. La barra `#bossbar` y los avisos salen de `Bosses.hud()` (host y cliente).
- Balance pensado a ojo con `FAST = true` (a los 2 min ya estás en forma final y DarkTyrannomon dura ~4 s). Con `FAST = false` hay que volver a probar la vida de los jefes.

### Árbol de mejoras permanentes
`TREE` (4 columnas). Se compra con monedas que se ganan al terminar la partida (`endRun`). Se aplica al inicio con `applyTree(q)`. Guardado en `save = {coins, lv:{clave:nivel}}`.

## Interfaz (estilo "pantalla de Digivice")
Todas las pantallas comparten el look: fondo con grilla, marcos cian/naranja con esquinas cortadas, títulos en Orbitron con brillo, etiquetas `.ovfx` (esquinas `.cn`, `.tag`, `.side`, `.data`, `.reticle`). Variables `--cy`, `--cy2`, `--or`.
- **Menú** `#ov`: `#ovl` (título `#t`, texto `#m`, Digivice SVG `#dv` con `#dvscreen`) y `#ovr` (`#wal`, botonera `#mnu`, cuenta `#acc`). `buildMenuSel` mete `#selinfo` (tu Digimon) en `#dvscreen` y `#selbtn` primero en `#mnu`. Lluvia binaria con un script inline en `index.html`. `endRun` reusa `#t`/`#m` para "Fuiste borrado".
- **Selección de Digimon** (`askCreature`, `#up.pick`): grilla `.pk-grid` de `PICK_SLOTS` (40) casillas, las que sobran en negro; panel `#pk-detail` con el sprite animado (canvas, escala entera) y chips de evoluciones/formas finales clickeables (`pickShow(i, key)`). Teclas: flechas mueven, Enter elige, 1-9 atajo (`pickKey`). Clic selecciona, segundo clic elige.
- **Subir de nivel / evolución final** (`#up` sin `.pick`): cartas `.card.lv` con etiqueta por tipo (`new`, `skup`, `stat`, `line`) y color del elemento de la skill (`--ac`).
- **Amigos** (`social.js`, estilos inyectados en `injectStyles`), **Árbol** (`#tree`, nodos `.node` con estados `buy/poor/lock/max` y barritas de nivel), **Misiones** (`#missions`, lo arma `missions.js`), **Pausa** (`#pause`).
- **HUD**: cajas de vida por jugador con número y rastro rojo de daño (`.lag`), parpadeo con <30%; barra de XP abajo con `NV` y "XP actual / necesaria"; triángulo de atributos SVG abajo a la izquierda; skills sobre la barra de XP. En <1000 px el reloj baja debajo de las barras.

## Sprites y criaturas
- JSON en `src/data/creatures/<id>.json`: `attribute`, `stages[]` (etapas 0–4, con `skills`) y `branches[]` (formas finales con `id`, `req`, `desc`, `skills`).
- Spritesheets de **2 columnas × 6 filas**. Filas que usa `drawBuddy`: **0 idle, 1 caminar, 2 muerto, 5 ataque** (3 y 4 sin usar por ahora). Pixel art sin suavizado.
- `drawBuddy` dibuja cada cuadro a **1,5 px de pantalla por píxel de la hoja** (un cuadro de 64 ocupa 96 px; uno de 192, 288 px), con los pies siempre a `q.y + 48`. Así los Digimon grandes pueden tener cuadros más grandes sin achicarse. Guarda la altura dibujada en `q.dh` (la usa la etiqueta J1/J2).
- `loader.js` vuelve transparente todo píxel con R,G,B > 240 (quita fondo blanco) **solo si la imagen no trae transparencia propia**. Hoy todos los PNG ya son transparentes, así que no se borra nada (antes se comía caras, panzas y brillos blancos). **Los nombres de archivo distinguen mayúsculas en Vercel** (hay PNGs con mayúscula inicial en renamon/terriermon: el JSON tiene que coincidir exacto).
- Para sumar una criatura: JSON + carpeta de sprites + agregarla a `CREATURES` en `game.js`. `001_guilmon` es el fallback cuando falta un id.
- `004_impmon` está cargada en datos y sprites pero **todavía no es jugable** (no está en `CREATURES`). Hoy es la línea de los enemigos (`ENEMY_LINE`).
- **Origen de los sprites: Stream Avatars (Steam Workshop).** Los packs bajados quedan en `D:\Steam\steamapps\workshop\content\665300\<idPack>\<idPack>.zip`, con `avatars/*.png` (ya vienen en 128×384 = grilla 2×6, se copian tal cual) y un `data.txt` con la config de cada avatar. Receta para importar una línea:
  1. Ver qué trae el zip y ordenar las etapas con la wiki (sección EVOLUTION de cada ficha).
  2. Extraer a `assets/sprites/creatures/<NNN_nombre>/` renombrando en minúsculas `<nombre>_<etapa+1>.png` (etapas 0–4 → `_1`…`_5`) y `<nombre>_6_<n>.png` para ramas.
  3. Crear `src/data/creatures/<NNN_nombre>.json` (con `wiki`, `verified`, `note`) y sumar sus skills a `skills.json`.
  4. Validar que todas las skills y PNG referenciados existan. Las ramas siguen el orden de bonos de `stepEvo`: 6_1 pesado, 6_2 veloz, 6_3 oscuro/poderoso.
- **Otra fuente de sprites: Digital Tamers: Reborn** (juego de PC en GameMaker; el exe está en `C:\Users\dario_lv7\OneDrive\Escritorio\rom Digi\`, fuera del repo). Es un autoextraíble IExpress: adentro hay un `.cab` con `data.win`, que tiene ~566 Digimon como sprites `d<ID>_<anim>` (idle, walk, atk01, atk02, dmg, lose, win, jump, eat). Se extrae sin ejecutar nada (sacar el CABINET del exe → `expand.exe -F:data.win`). Los nombres por ID se sacan de STRG pero **la lista se corre en IDs altos**: verificar siempre a ojo. Hojas armadas **al doble** (nearest), cuadro de 64 si entra o múltiplo de 32 más grande. Filas: 0 idle, 1 walk, 2 lose, 3 idle, 4 dmg, 5 atk01. `005_veemon` sale de acá (IDs en el campo `sprite` de cada etapa: `dtr:d<ID>`). Los packs del Workshop parecen redibujos x2 de este juego.
- Packs usados: 2944839923 (Guilmon), 2976689900 (Renamon), 2916279274 (Terriermon + Devas/Cherubimon), 2952066637 (Impmon), 2924252315 (Gammamon), 3215599434 (Pulsemon, Kudamon), 3215570196 (Dorumon), 3209711219 (Ryudamon, Commandramon), 3203454378 (Wormmon), 2929205990 (Zubamon), 2925436143 (Jellymon), 3206026992 (Loogamon, Herissmon). Sin usar: 2916848304 (Veemon, se prefirió Digital Tamers), 2935847371 (Medabots).
- **Hojas de 7 filas** (128×448, avatares con baile: idle, walk, sit, stand, jump, dance, attack): al importar se saca la fila 5 (dance) y quedan en 2×6.
- Sprites sueltos de los packs que no se usaron porque les faltan bebés o novato para armar una línea completa: Shoutmon (X4, DX, X7, Omega), Leomon/SaberLeomon, Lopmon (Turuiemon, Andiramon, Cherubimon), Tyrannomon, Agumon negro (DarkTyrannomon, MetalTyrannomon, Machinedramon), Etemon, Monzaemon, Numemon, Andromon y varios más. Sirven para líneas futuras o para enemigos.
- Líneas 006–016: evoluciones y skills del **canon (Wikimon)**, porque casi ninguno está en la wiki DSR (`source: canon:wikimon`, `verified: false`). Se leyeron con la API de Wikimon (`/api.php?action=parse&page=<nombre>&prop=wikitext&format=json&redirects=1`): ataques en la sección "Attack Techniques", atributo en `|a1=`, evoluciones en "Evolves From/To".
- Selección: en 1J/2J local desde el menú; online con `openMenuPick` y el mensaje `pick`.

## Guardado y Firebase
- Sin sesión: `localStorage['digisurvivor']`.
- Con sesión Google: Firestore `users/<uid>` con `{coins, lv, updated}`.
- `social.js` además usa: `nicks/{nick en minúsculas}` `{uid, nick}` (nick único), `profiles/{uid}` `{nick, nickLower, peerId, seen}` (perfil público; `seen` = en línea) y `users/{uid}/friends/{amigoUid}` `{at}` (amistad mutua, se escribe en las dos listas). Las reglas de Firestore tienen que contemplar todo esto.
- Puente entre módulos (globals en `window`):
  - `game.js` expone `getSave`, `loadSave`, `initPeer`, `stopPeer` y `Lobby` (acciones de la ventana Amigos/Party: `setSelf, state, info, pick, invite`, …).
  - `firebase.js` define `onSave` (lo llama `persist()`).
  - `social.js` define `isFriendUid`, `onLobby`, `onRunStart`, `onPeerOpen` (y los pone en `null` en `stopSocial`).
- La config de Firebase es pública por diseño; la seguridad está en las reglas. El guardado se puede editar desde el navegador (no hay validación en servidor).

## Multijugador online (PeerJS)
- Solo al iniciar sesión: `firebase.js` llama `initSocial` (ventana Amigos/Party de `social.js`) e `initPeer`. El viejo `#party-panel` está oculto.
- ID de peer = `ds-` + 10 caracteres al azar en el servidor público de PeerJS; si está ocupado (`unavailable-id`) se regenera. El ID se publica en `profiles/{uid}.peerId` vía `onPeerOpen`.
- Invitaciones: conexión de control (`metadata.kind: 'ctl'`) con `invite` → `accept`/`decline`; solo se aceptan de amigos (se consulta `isFriendUid` en el momento). La partida usa otra conexión (`kind: 'game'`); quien invita es el host.
- **Host autoritativo**: el host simula todo y manda `sync` **cada frame** con jugadores, enemigos, gemas, disparos, balas enemigas y efectos. El cliente solo manda `input` (teclas) y en `update` corta temprano después de actualizar el HUD.
- Mensajes de partida: `hello, pick, ready, start, input, sync, trigger_levelup, trigger_line, trigger_evo, host_choice, client_choice, resume_game, end`.
- Cartas online: cada uno elige para su jugador; se espera a que ambos elijan (`hostDone/clientDone`) y el host reanuda.
- Limitaciones conocidas: el cliente no ve partículas ni números de daño (no se sincronizan `pt`/`fx`), no hay interpolación, y mandar el estado completo cada frame es pesado.

## Cosas a tener en cuenta al cambiar código
- Los ids del HTML (`#hud`, `#hp1box/#hp2box`, `#fill`, `#fill2`, `#lag1/#lag2`, `#hpt1/#hpt2`, `#xp`, `#xpf`, `#xpl`, `#xpt`, `#tm`, `#info`, `#pst`, `#leg`, `#up`, `#cards`, `#evt`, `#ov`, `#mnu`, `#dvscreen`, `#gver`, `#msb`, `#tree`, `#pause`, `#pcont`, `#pquit`, etc.) están acoplados a `game.js`/`missions.js`. Si cambiás uno, cambialo en los dos lados. (`#tr` ya no existe.)
- `index.html` tiene un `<style id="hud-css">` de respaldo que duplica reglas de `style.css`.
- Cualquier cambio en lo que afecta la simulación tiene que pensarse para los 3 modos: 1J, 2J local y online (host vs cliente).
- Si agregás un campo nuevo al jugador (o a enemigos/efectos) que el cliente necesita ver, sumalo al payload de `sync`.
- Antes de dar por terminado un cambio de jugabilidad, probalo en local (ver arriba) en 1J y 2J local.
- **Flujo con el usuario:** mostrar cómo quedó (captura) y **preguntar antes de cada push** (publica en Vercel). Commits con el trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. El usuario prefiere respuestas cortas y que no se gasten tokens de más.

## Referencias de diseño
- Guía de evoluciones (inspiración para ramas y requisitos): https://humulos.com/digimon/vbdm/ex/#terrier_ex_anchor
- Habilidades de Digimon (inspiración para skills/ataques): https://dsrworldwiki.com/en/digimon/

## Pendientes / ideas
- Pasar `FAST` a `false` para producción.
- **Versión actual: 0.3** (`GAME_VERSION` en game.js, se ve en el menú). Para la versión final: subir `GAME_VERSION` y poner en `RESET_BEFORE` la fecha del lanzamiento → todo progreso guardado antes (navegador y cuenta, usando el `updated` que ya guarda Firestore) vuelve a 0 una sola vez. No toca nick, amigos ni Digimon elegido.
- Corregir el comentario de `?test` en `game.js:20`.
- Más líneas evolutivas en `src/data/creatures/`.
- Mover los bonos de rama de `stepEvo` al JSON.
- Decidir qué hacer con `map.js` (integrarlo o borrarlo).
- Sacar los `.bak` del repo (o sumarlos al `.gitignore`) para que no se publiquen.
- Optimizar el `sync` online (menos frecuencia, deltas, interpolación en el cliente).
- Validación del guardado en servidor si se agrega ranking.
- Actualizar el `README.md` a la estructura `src/`.
- Git: el repo es https://github.com/xKaige/DigiSurvivor (rama `main`). Git está en `C:\Program Files\Git\cmd\git.exe`. Cada push a `main` publica en Vercel. El push se hace desde la terminal de la app (`run_in_terminal`), porque la consola de Claude no es interactiva y no puede usar el login guardado de Git Credential Manager si hace falta reautenticar.
- **Evoluciones alternativas** (pendiente de analizar): los Digimon de los packs sin línea completa (Leomon, Tyrannomon, Shoutmon, Lopmon, Agumon negro…) podrían aparecer como Campeón/Perfecto alternativos de líneas existentes. Requiere que una etapa admita más de una opción (hoy cada etapa tiene un solo Digimon).
- **Hosting para la 1.0**: plan = mudarse a **Cloudflare Pages** (gratis y permite uso comercial; Vercel Hobby no permite donaciones) + agregar el dominio nuevo en Firebase → Authentication → dominios autorizados. Para el online, un VPS chico (Hetzner/DigitalOcean/Vultr) con **PeerServer propio + TURN (coturn)**. Revisar las reglas de Firestore antes de lanzar (no están en el repo).
- **Donaciones**: el botón "☕ Apoyá el proyecto" (https://cafecito.app/dreless) y el aviso "Fan game sin fines de lucro…" están en la **rama local `cafecito`** (sin subir). Mergear a `main` recién después de la mudanza a Cloudflare. El juego es 100% gratis: donar no da ninguna recompensa.
- Misiones y desbloqueos en Firestore: hoy el progreso de misiones y de `digisurvivor_prog` (Digimon desbloqueados, Analyzer) es solo local; para sincronizarlo hay que ampliar `saveToCloud` y revisar las reglas.
- Se probaron los sprites de batalla del ROM de Digimon World Dusk y **no gustaron** (se revirtió). No volver a proponerlos.

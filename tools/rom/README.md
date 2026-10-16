# Extractor de sprites del ROM (Digimon World Dawn/Dusk)

Scripts para sacar los sprites de batalla del ROM y armarlos en el formato del juego (hoja 2×6).
**El ROM no va en el repo** (usá tu propia copia, fuera del proyecto).

Requisitos: Python 3 + `py -m pip install --user ndspy pillow`.
Correr con `py -P -E script.py ...` (así no carga módulos de la carpeta actual).

## Cómo están los datos en el ROM
- `dat/BTCHR.PAK`: 415 personajes de batalla. Cada uno son 5 entradas seguidas: encabezado, NCGR (píxeles), NCLR (paleta), NCER (recortes/celdas), NANR (animación). Personaje `#g` = entradas `g*5 .. g*5+4`.
- Los `.PAK` son: `uint32 cantidad` + `cantidad × (uint32 offset, uint32 tamaño)`. Si el bit alto del tamaño está prendido, la entrada viene comprimida (RLE 0x30 de la BIOS de DS).
- Cada personaje tiene 5 celdas: 0–2 quieto (respira), 3 golpe recibido, 4 ataque/festejo.
- `SPR_*.PAK` son íconos/retratos e interfaz. `MCHR_*.PAK` (personajes del mapa) usa un formato propio, todavía sin descifrar.
- Los nombres de los Digimon no están en texto plano (no aparecen en `MSG.PAK`): por ahora se identifican a ojo con el catálogo.

## Scripts
- `dsr.py`: librería (lee PAK, descomprime y renderiza NCGR/NCLR/NCER a imagen).
- `catalog.py ROM <carpeta_de_dsr.py> <salida>`: genera `salida_0.png`, `salida_1.png`... con los 415 numerados.
- `zoom.py ROM <dsr> salida.png id id ...`: amplía personajes para identificarlos.
- `build_sheet.py ROM <dsr> <carpeta_salida> '{"guilmon_3.png":27, ...}'`: arma las hojas 2×6 de una línea.
  Todas las hojas de la línea usan el mismo tamaño de cuadro (así un bebé se ve chico y un Mega grande).
  Filas: 0 quieto, 1 caminar, 2 muerto, 3 golpe, 4 festejo, 5 ataque.
- `compare.py <carpeta_actual> <carpeta_nueva> salida.png`: comparación a escala del juego.

En el JSON de la criatura, los sprites sacados del ROM llevan `"keyWhite": false` (ya tienen transparencia;
si no, `loader.js` borra los blancos del dibujo) y `"sprite": "rom:dusk/btchr#<id>"` para saber de dónde salieron.

## IDs identificados (Dusk, BTCHR)
| Digimon | # |
|---|---|
| Gigimon | 14 |
| Guilmon | 27 |
| Growmon (Growlmon) | 113 |
| WarGrowlmon (MegaloGrowmon) | 229 |
| Dukemon (Gallantmon) | 324 |
| Jyarimon | no está |
